/**
 * Reads story summaries from Wikipedia, in the reader's language where an article exists.
 *
 * Uses the MediaWiki Action API (TextExtracts + PageImages + Wikibase), which has been stable for a
 * decade and answers anonymous cross-origin requests with `origin=*`. One query returns the intro,
 * the lead image, the revision id and the canonical URL; a second, lazy one reads the image's
 * author and licence from Wikimedia Commons for the caption.
 *
 * Wikimedia asks browser clients to identify themselves with the Api-User-Agent header.
 */

export interface ArticleRef {
  /** English Wikipedia title (the data's own link). */
  enTitle?: string;
  /** Wikidata item, used when the English article has no link to the reader's language. */
  qid?: string;
  /** Read one section of the article instead of its intro. */
  section?: string;
  /** Read the section of `enTitle` whose heading matches this text, when there is one ("History of Japan" → "Edo period (1600–1868)"). */
  sectionLike?: string;
}

export interface WikiImage {
  src: string;
  width: number;
  height: number;
  /** File name without the "File:" prefix. */
  file?: string;
  /** Author and licence, when stored with the text (no request to Commons). */
  credit?: ImageCredit;
}

export interface WikiArticle {
  lang: string;
  title: string;
  url: string;
  revision?: number;
  /** Short description from Wikidata, shown under the headline when the template has none. */
  description?: string;
  paragraphs: string[];
  image?: WikiImage;
  /** True when the reader's language had no article and this is the English one. */
  fallback: boolean;
  /** True when the fallback is because the reader's Wikipedia could not be reached, not because it lacks the article. */
  unreachable?: boolean;
  /** Day the text was read, when it comes from the stored snapshot rather than a live request. */
  retrieved?: string;
  /** The section read, when not the intro. */
  section?: string;
}

export interface ImageCredit {
  artist?: string;
  licence?: string;
  licenceUrl?: string;
  page: string;
}

import { loadStoredPack, storedArticle, storyKey } from './stored';
import { hasTranslations, loadTranslations } from './translations';

export const API_USER_AGENT = 'WorldHistoryTimeline/0.2 (https://github.com/DKirbi/world-historian)';

export class WikiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;
let fetcher: Fetch = (...args) => fetch(...args);
/** Tests and the screenshot harness swap the network for fixtures. */
export const setWikiFetch = (f: Fetch) => {
  fetcher = f;
  memo.clear();
};

const memo = new Map<string, Promise<unknown>>();

/** `p` for one caller: rejects with an AbortError as soon as that caller's `signal` aborts. */
function abortable<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  const aborted = () => new DOMException('The request was cancelled', 'AbortError');
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(aborted());
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

async function api<T>(host: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const url = new URL(`https://${host}/w/api.php`);
  const all = { action: 'query', format: 'json', formatversion: '2', origin: '*', ...params };
  for (const [k, v] of Object.entries(all).sort(([a], [b]) => a.localeCompare(b))) url.searchParams.set(k, v);
  const key = url.toString();
  // One request per URL, shared by every caller, so it is not tied to any caller's signal: a story closed
  // and reopened (or mounted twice by React's StrictMode) gets the pending request, and the first
  // caller's cancellation must not fail it for the second. Each caller still stops waiting when it cancels.
  let p = memo.get(key) as Promise<T> | undefined;
  if (!p) {
    p = (async () => {
      const res = await fetcher(key, { headers: { 'Api-User-Agent': API_USER_AGENT } });
      if (!res.ok) throw new WikiError(`Wikipedia answered ${res.status}`, res.status);
      const body = (await res.json()) as T & { error?: { info?: string } };
      if (body.error) throw new WikiError(body.error.info ?? 'Wikipedia returned an error');
      return body as T;
    })();
    memo.set(key, p);
    // a failed request is not remembered, so "Try again" really tries again
    p.catch(() => memo.delete(key));
  }
  return abortable(p, signal);
}

const wiki = (lang: string) => `${lang}.wikipedia.org`;

interface QueryPage {
  title: string;
  missing?: boolean;
  invalid?: boolean;
  extract?: string;
  description?: string;
  fullurl?: string;
  lastrevid?: number;
  pageimage?: string;
  thumbnail?: { source: string; width: number; height: number };
  langlinks?: Array<{ lang: string; title: string }>;
}
interface QueryResult {
  query?: { pages?: QueryPage[] };
}

/** The article's title in `lang`: the English article's language link, else the Wikidata sitelink. */
export async function resolveTitle(ref: ArticleRef, lang: string, signal?: AbortSignal): Promise<string | null> {
  if (lang === 'en') return ref.enTitle ?? (ref.qid ? sitelink(ref.qid, 'en', signal) : null);
  if (ref.enTitle) {
    const r = await api<QueryResult>(
      wiki('en'),
      { titles: ref.enTitle, prop: 'langlinks', lllang: lang, redirects: '1' },
      signal,
    );
    const title = r.query?.pages?.[0]?.langlinks?.[0]?.title;
    if (title) return title;
  }
  return ref.qid ? sitelink(ref.qid, lang, signal) : null;
}

async function sitelink(qid: string, lang: string, signal?: AbortSignal): Promise<string | null> {
  const site = `${lang}wiki`;
  const r = await api<{ entities?: Record<string, { sitelinks?: Record<string, { title: string }> }> }>(
    'www.wikidata.org',
    { action: 'wbgetentities', ids: qid, props: 'sitelinks', sitefilter: site },
    signal,
  );
  return r.entities?.[qid]?.sitelinks?.[site]?.title ?? null;
}

/** Intro of an article: plain-text paragraphs, lead image, revision and URL. */
export async function fetchIntro(lang: string, title: string, signal?: AbortSignal): Promise<Omit<WikiArticle, 'fallback'> | null> {
  const r = await api<QueryResult>(
    wiki(lang),
    {
      titles: title,
      redirects: '1',
      prop: 'extracts|pageimages|info|description',
      exintro: '1',
      explaintext: '1',
      exsectionformat: 'plain',
      piprop: 'thumbnail|name',
      pithumbsize: '960',
      inprop: 'url',
    },
    signal,
  );
  const page = r.query?.pages?.[0];
  if (!page || page.missing || page.invalid) return null;
  return {
    lang,
    title: page.title,
    url: page.fullurl ?? articleUrl(lang, page.title),
    revision: page.lastrevid,
    description: page.description,
    paragraphs: paragraphs(page.extract ?? ''),
    image: page.thumbnail ? { ...page.thumbnail, src: page.thumbnail.source, file: page.pageimage } : undefined,
  };
}

interface ParseSections {
  parse?: { title: string; revid?: number; sections?: Array<{ index: string; line: string; anchor: string }> };
}
interface ParseText {
  parse?: { title: string; revid?: number; text?: string };
}

/** One section of an article as paragraphs. `heading` matches the section's anchor or its text. */
export async function fetchSection(
  lang: string,
  title: string,
  heading: string,
  signal?: AbortSignal,
  loose = false,
): Promise<Omit<WikiArticle, 'fallback'> | null> {
  const s = await api<ParseSections>(wiki(lang), { action: 'parse', page: title, prop: 'sections', redirects: '1' }, signal);
  const want = norm(heading);
  const stem = (h: string) => h.replace(/\s*\(.*$/, '');
  const sections = s.parse?.sections ?? [];
  // The exact heading; else the same period whose dates in brackets were edited since the data was built
  // ("Early Woodland period (1000–1 BCE)" → "Early Woodland period (1000–200 BCE)"); else, when loose,
  // a heading that starts with the name.
  const found =
    sections.find((x) => norm(x.anchor.replace(/_/g, ' ')) === want || norm(stripTags(x.line)) === want) ??
    sections.find((x) => stem(norm(stripTags(x.line))) === stem(want)) ??
    (loose ? sections.find((x) => norm(stripTags(x.line)).startsWith(stem(want))) : undefined);
  if (!found || !s.parse) return null;
  const p = await api<ParseText>(
    wiki(lang),
    { action: 'parse', page: s.parse.title, section: found.index, prop: 'text|revid', disableeditsection: '1', disabletoc: '1' },
    signal,
  );
  const html = p.parse?.text ?? '';
  return {
    lang,
    title: s.parse.title,
    url: `${articleUrl(lang, s.parse.title)}#${encodeURIComponent(found.anchor)}`,
    revision: p.parse?.revid ?? s.parse.revid,
    paragraphs: htmlParagraphs(html),
    section: stripTags(found.line),
  };
}

/**
 * The story's article in the reader's language, or the English one when that language has none.
 * Resolves null when no article is linked or none can be found.
 *
 * The stored packs come first (stored.ts): with `region`, the reader's-language summary when that language
 * is snapshotted, else the English one, which also stands under a stored translation. Wikipedia is asked only
 * for what is not stored: an article in the reader's language when that language has no pack yet and the
 * story has no translation (so it may have an article of its own), or a record missing from the packs.
 */
export async function loadArticle(
  ref: ArticleRef,
  lang: string,
  signal?: AbortSignal,
  region?: string,
): Promise<WikiArticle | null> {
  if (!ref.enTitle && !ref.qid) return null;
  const key = storyKey(ref);
  let storedEn: WikiArticle | null = null;
  if (region && key) {
    const [ownPack, enPack] = await Promise.all([lang === 'en' ? null : loadStoredPack(lang, region), loadStoredPack('en', region)]);
    const own = ownPack?.get(key);
    if (own) return storedArticle(own, lang, false);
    const en = enPack?.get(key);
    if (en) {
      storedEn = storedArticle(en, 'en', lang !== 'en');
      // English readers, readers of a snapshotted language without an article here, and stories with a
      // stored translation (made because the language had no article) need nothing live
      if (lang === 'en' || ownPack || (hasTranslations(lang) && (await loadTranslations(lang, region)).has(key))) return storedEn;
    }
  }
  try {
    return await loadLive(ref, lang, signal);
  } catch (e) {
    if (storedEn && (e as Error).name !== 'AbortError') return { ...storedEn, unreachable: lang !== 'en' };
    throw e;
  }
}

async function loadLive(ref: ArticleRef, lang: string, signal?: AbortSignal): Promise<WikiArticle | null> {
  const read = async (l: string, title: string) => {
    if (ref.section) return fetchSection(l, title, ref.section, signal);
    if (ref.sectionLike) return fetchSection(l, title, ref.sectionLike, signal, true);
    return fetchIntro(l, title, signal);
  };
  if (lang !== 'en') {
    // L10N-LATER: an article in the reader's language is read live until that language is snapshotted
    // (data/tools/fetch_stories.py <lang>; "own-article" in data/translations/<lang>/_later.json).
    const title = await resolveTitle(ref, lang, signal);
    // a section heading only exists in the English article; another language's intro would be about the whole page
    if (title && !ref.section && !ref.sectionLike) {
      const own = await read(lang, title);
      if (own && own.paragraphs.length) return { ...own, fallback: false };
    }
  }
  const enTitle = ref.enTitle ?? (await resolveTitle(ref, 'en', signal));
  if (!enTitle) return null;
  const en = await read('en', enTitle);
  return en && en.paragraphs.length ? { ...en, fallback: lang !== 'en' } : null;
}

/** Author and licence of a Commons file, for the image caption. */
export async function fetchImageCredit(lang: string, file: string, signal?: AbortSignal): Promise<ImageCredit | null> {
  const r = await api<{
    query?: {
      pages?: Array<{
        imageinfo?: Array<{
          descriptionurl?: string;
          extmetadata?: Record<string, { value?: string }>;
        }>;
      }>;
    };
  }>(
    wiki(lang),
    {
      titles: `File:${file}`,
      prop: 'imageinfo',
      iiprop: 'extmetadata|url',
      iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|AttributionRequired',
    },
    signal,
  );
  const info = r.query?.pages?.[0]?.imageinfo?.[0];
  if (!info) return null;
  const meta = info.extmetadata ?? {};
  return {
    artist: meta.Artist?.value ? stripTags(meta.Artist.value).slice(0, 160) || undefined : undefined,
    licence: meta.LicenseShortName?.value ? stripTags(meta.LicenseShortName.value) : undefined,
    licenceUrl: meta.LicenseUrl?.value,
    page: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`,
  };
}

export const articleUrl = (lang: string, title: string) =>
  `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

/** Headline from an article title: "Kranjska (vojvodina)" → "Kranjska". */
export const headlineFromTitle = (title: string) => title.replace(/\s*\([^)]*\)\s*$/, '');

const norm = (s: string) =>
  s
    .normalize('NFKC')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

function stripTags(html: string): string {
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  }
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Plain-text extract → paragraphs. TextExtracts leaves traces of removed templates behind
 * ("( ; Slovene: …)", "( listen)", "()"), which are tidied here.
 */
export function paragraphs(extract: string): string[] {
  return extract
    .split(/\n+/)
    .map((p) =>
      p
        .replace(/\(\s*listen\s*\)/gi, '')
        .replace(/\(\s*[;,]\s*/g, '(')
        .replace(/\s*[;,]\s*\)/g, ')')
        .replace(/\(\s*\)/g, '')
        .replace(/\s+([,.;:])/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .trim(),
    )
    .filter((p) => p.length > 1);
}

/** Paragraphs of a parsed section's HTML, without reference marks, tables and figures. */
export function htmlParagraphs(html: string): string[] {
  if (typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('sup, .mw-ref, .reference, style, table, figure, .thumb, .hatnote, .navbox, .mw-empty-elt').forEach((n) => n.remove());
  return [...doc.querySelectorAll('p')]
    .map((p) => (p.textContent ?? '').replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 1);
}
