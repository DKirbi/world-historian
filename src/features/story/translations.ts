/**
 * Stored translations of Wikipedia summaries, for stories whose article has no version in the reader's
 * language. Each batch is data/translations/<lang>/<region>.json, written by scripts/merge-translations.mjs
 * and loaded on demand (one chunk per batch); a unit is found by the English article's title, so one
 * translation serves every region the article appears in.
 */

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

interface Batch {
  lang: string;
  region: string;
  method: StoredTranslation['method'];
  translator: string;
  translated: string;
  reviewed: StoredTranslation['reviewed'];
  units: Record<
    string,
    Omit<StoredTranslation, 'title' | 'lang' | 'method' | 'translator' | 'translated' | 'reviewed'> & {
      reviewed?: StoredTranslation['reviewed'];
      translated?: string;
    }
  >;
}

const BATCHES = import.meta.glob<Batch>(['/data/translations/*/*.json', '!/data/translations/*/_*.json'], {
  import: 'default',
});

const byLang = new Map<string, Promise<Map<string, StoredTranslation>>>();

/** Every stored translation in `lang`, by English title. Loaded once per language. */
export function loadTranslations(lang: string): Promise<Map<string, StoredTranslation>> {
  let p = byLang.get(lang);
  if (!p) {
    const paths = Object.keys(BATCHES).filter((k) => k.startsWith(`/data/translations/${lang}/`));
    p = Promise.all(paths.map((k) => BATCHES[k]())).then((batches) => {
      const out = new Map<string, StoredTranslation>();
      for (const b of batches)
        for (const [title, u] of Object.entries(b.units))
          out.set(title, {
            ...u,
            title,
            lang: b.lang,
            method: b.method,
            translator: b.translator,
            translated: u.translated ?? b.translated,
            reviewed: u.reviewed ?? b.reviewed,
          });
      return out;
    });
    p.catch(() => byLang.delete(lang)); // a failed load is tried again next time
    byLang.set(lang, p);
  }
  return p;
}

/** Languages with at least one stored batch, so English readers never load anything. */
export const hasTranslations = (lang: string) => Object.keys(BATCHES).some((k) => k.startsWith(`/data/translations/${lang}/`));
