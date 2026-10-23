import { describe, expect, it } from 'vitest';

interface Unit {
  headline?: string;
  paragraphs: string[];
  source: { wiki: string; title: string; rev: number; retrieved: string; paragraphs: string[] };
  records: string[];
}
interface Batch {
  lang: string;
  region: string;
  method: string;
  translator: string;
  translated: string;
  reviewed: false | { by: string; date: string };
  units: Record<string, Unit>;
}

const batches = import.meta.glob<Batch>(['/data/translations/*/*.json', '!/data/translations/*/_*.json'], {
  eager: true,
  import: 'default',
});
const polities = import.meta.glob<{ polities: Array<{ id: string; wikipedia?: string }> }>('/data/*/_polities.json', {
  eager: true,
  import: 'default',
});
const laneFiles = import.meta.glob<{ events?: Array<{ id: string; wiki?: string }> }>('/data/*/*/*.json', {
  eager: true,
  import: 'default',
});

/** English article title of every record the stories can open. */
const eraFiles = import.meta.glob<{ eras: Array<{ id: string; article?: { title: string; section?: string } }> }>(
  '/data/*/_eras.json',
  { eager: true, import: 'default' },
);

/** The key a record's story looks its translation up by: the English title, or "<title>#<section>" for an era. */
const titleOf = new Map<string, string>();
for (const f of Object.values(polities)) for (const p of f.polities) if (p.wikipedia) titleOf.set(p.id, p.wikipedia);
for (const f of Object.values(laneFiles)) for (const e of f.events ?? []) if (e.wiki) titleOf.set(e.id, e.wiki);
for (const f of Object.values(eraFiles))
  for (const e of f.eras)
    if (e.article) titleOf.set(e.id, e.article.section ? `${e.article.title}#${e.article.section}` : e.article.title);

// the calques the Slovenian style sheet bans (docs/research/slovenian-newspaper-style.md)
const BANNED: Record<string, RegExp[]> = {
  sl: [/\bs strani\b/i, /\bse nahaja/i, /\bv kolikor\b/i, /\ble-t[aoie]\b/i, /\bpreko\b/i, /\bkot rezultat\b/i, /\bvečina od njih\b/i, /\bpozno v dnevu\b/i, /\beventualn/i, /\baktualn/i],
};

describe('stored translations', () => {
  const entries = Object.entries(batches);
  it('exist for Slovenian', () => {
    expect(entries.some(([path]) => path.startsWith('/data/translations/sl/'))).toBe(true);
  });
  for (const [path, b] of entries)
    describe(path, () => {
      it('is marked as a machine translation until reviewed', () => {
        expect(b.lang).toBe(path.split('/')[3]);
        expect(['machine', 'human']).toContain(b.method);
        expect(b.translator.length).toBeGreaterThan(0);
        expect(b.translated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        if (b.method === 'machine' && b.reviewed) expect(b.reviewed.by.length).toBeGreaterThan(0);
      });
      it('keeps one paragraph per English paragraph and cites the revision', () => {
        for (const [title, u] of Object.entries(b.units)) {
          expect(u.paragraphs.length, title).toBe(u.source.paragraphs.length);
          expect(u.paragraphs.every((p) => p.trim().length > 0), title).toBe(true);
          expect(u.source.rev, title).toBeGreaterThan(0);
          expect(u.source.wiki, title).toBe('en');
        }
      });
      it('is keyed by the English title its records link to', () => {
        for (const [title, u] of Object.entries(b.units))
          for (const id of u.records) expect(titleOf.get(id), `${title} / ${id}`).toBe(title);
      });
      it('avoids the banned calques', () => {
        const hits = Object.entries(b.units).flatMap(([title, u]) =>
          (BANNED[b.lang] ?? []).filter((re) => u.paragraphs.some((p) => re.test(p))).map((re) => `${title}: ${re}`),
        );
        expect(hits).toEqual([]);
      });
    });
});
