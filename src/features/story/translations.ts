/**
 * Stored translations of Wikipedia summaries, for stories whose article has no version in the reader's
 * language. The batches are data/translations/<lang>/<region>.json, written by scripts/merge-translations.mjs;
 * the app reads them as one pack per region of the stories it opens, served next to the page.
 */
import { translationLangs } from 'virtual:story-packs';
import { loadPackFile, onStoredReset } from './stored';

export interface StoredTranslation {
  /** English title, the lookup key. */
  title: string;
  /** The record's name in the reader's language, for stories whose name the glossary lacks. */
  headline?: string;
  paragraphs: string[];
  notes?: string[];
  /** The English text it was made from; `section` when the unit is one section of the article. */
  source: { wiki: string; title: string; section?: string; rev: number; retrieved: string; paragraphs: string[] };
  /** The batch's metadata, repeated so a story needs nothing else. */
  lang: string;
  method: 'machine' | 'human';
  translator: string;
  translated: string;
  reviewed: false | { by: string; date: string };
}

const packs = new Map<string, Promise<Map<string, StoredTranslation>>>();
onStoredReset(() => packs.clear());

/**
 * The stored translations in `lang` that the stories of `region` can show, by story key: the region's pack
 * (translations/<lang>/<region>.json, cut by vite.config.ts from data/translations/<lang>/*.json), loaded
 * once per region. Empty when the pack cannot be read; that is tried again next time.
 */
export function loadTranslations(lang: string, region: string): Promise<Map<string, StoredTranslation>> {
  const id = `${lang}/${region}`;
  let p = packs.get(id);
  if (!p) {
    p = loadPackFile<{ units: Record<string, Omit<StoredTranslation, 'title'>> }>(`translations/${id}.json`).then((b) => {
      if (!b) packs.delete(id);
      return new Map(Object.entries(b?.units ?? {}).map(([title, u]) => [title, { ...u, title }]));
    });
    packs.set(id, p);
  }
  return p;
}

/** Languages with stored translations, so English readers never load anything. */
export const hasTranslations = (lang: string) => translationLangs.includes(lang);
