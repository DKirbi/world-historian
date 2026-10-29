/**
 * Stored story summaries: the Wikipedia text the drawer shows, snapshotted with the data
 * (data/tools/fetch_stories.py → data/stories/<lang>/<region>.json) and served next to the page as
 * stories/<lang>/<region>.json (vite.config.ts, storyPacks). The drawer reads them instead of asking
 * Wikipedia; one pack per region, loaded when a story of that region first opens.
 */
import { storyLangs } from 'virtual:story-packs';
import type { ArticleRef, ImageCredit, WikiArticle } from './wiki';

export interface StoredSummary {
  title: string;
  url: string;
  rev?: number;
  description?: string;
  /** The section read, when not the introduction. */
  section?: string;
  paragraphs: string[];
  image?: { file?: string; src: string; width: number; height: number; credit?: ImageCredit & { free?: boolean; repo?: string } };
  /** Day the text was read from Wikipedia. */
  retrieved?: string;
}

type Pack = Map<string, StoredSummary>;
type Fetch = typeof fetch;

let fetcher: Fetch | null = null;
/** Tests and the screenshot harness swap the network for fixtures. */
export const setStoredFetch = (f: Fetch | null) => {
  fetcher = f;
  files.clear();
  packs.clear();
  for (const reset of resets) reset();
};
const resets: Array<() => void> = [];
/** Lets another pack cache (translations.ts) be cleared with this one. */
export const onStoredReset = (reset: () => void) => resets.push(reset);

const files = new Map<string, Promise<unknown>>();

/**
 * A pack served next to the page (vite.config.ts, storyPacks), parsed; null when there is none (404) or it
 * could not be read. A failed read is not remembered, so it is tried again.
 */
export function loadPackFile<T>(path: string): Promise<T | null> {
  let p = files.get(path) as Promise<T | null> | undefined;
  if (!p) {
    const f = fetcher ?? (typeof document !== 'undefined' ? (...a: Parameters<Fetch>) => fetch(...a) : null);
    if (!f) return Promise.resolve(null); // no page to serve the packs (unit tests)
    p = (async () => {
      const base = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/';
      const res = await f(new URL(path, base).toString());
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${path}: ${res.status}`);
      return (await res.json()) as T;
    })();
    files.set(path, p);
    p.catch(() => files.delete(path));
  }
  return p.catch(() => null);
}

const packs = new Map<string, Promise<Pack | null>>();

/** The stored summaries of one region in `lang`, by story key; null when that language has no pack. */
export function loadStoredPack(lang: string, region: string): Promise<Pack | null> {
  // only languages with packs are asked for (tests that swap the network serve any language)
  if (!fetcher && !storyLangs.includes(lang)) return Promise.resolve(null);
  const id = `${lang}/${region}`;
  let p = packs.get(id);
  if (!p) {
    p = loadPackFile<{ units: Record<string, StoredSummary> }>(`stories/${id}.json`).then((b) =>
      b ? new Map(Object.entries(b.units)) : null,
    );
    packs.set(id, p);
    // an unreadable pack resolves null and is forgotten, so the next story asks again
    p.then((v) => v === null && packs.delete(id));
  }
  return p;
}

/**
 * The key a story's text and translation are stored under: the English title, or "<title>#<section>" for a
 * section (an exact heading, or the cited row of an era read by a resembling heading).
 */
export function storyKey(ref: ArticleRef | null | undefined): string | undefined {
  if (!ref?.enTitle) return undefined;
  const section = ref.section ?? ref.sectionLike;
  return section ? `${ref.enTitle}#${section}` : ref.enTitle;
}

const credit = (c: (ImageCredit & { free?: boolean; repo?: string }) | undefined): ImageCredit | undefined =>
  c && { artist: c.artist, licence: c.licence, licenceUrl: c.licenceUrl, page: c.page };

/** A stored summary in the shape the drawer renders. */
export function storedArticle(s: StoredSummary, lang: string, fallback: boolean): WikiArticle {
  return {
    lang,
    title: s.title,
    url: s.url,
    revision: s.rev,
    description: s.description,
    paragraphs: s.paragraphs,
    image: s.image ? { src: s.image.src, width: s.image.width, height: s.image.height, file: s.image.file, credit: credit(s.image.credit) } : undefined,
    fallback,
    section: s.section,
    retrieved: s.retrieved,
  };
}
