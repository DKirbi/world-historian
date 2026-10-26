// The stories whose Wikipedia article has no version in <lang>, as a prioritised worklist for translation.
//
//   node scripts/translation-worklist.mjs sl      → data/translations/sl/_worklist.json
//
// A unit is one English article (or article section: eras, and records whose link was corrected to a section
// in data/sources/link-fixes.json): translated once, used in every region.
// Whether <lang> has an article comes from the names snapshot (data/sources/names-<lang>.json); the fetch
// step (data/tools/fetch_translation_sources.py) checks again before anything is translated.
//
// Priority, by what a reader sees first:
//   era      the Eras level
//   leader   states that lead a column at the Empires level somewhere
//   states   other states of the States level (tier 1–2)
//   detail   states shown only at the Detail level
//   event    key events, ranked by their number of Wikipedia editions
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const lang = process.argv[2];
if (!lang) throw new Error('usage: node scripts/translation-worklist.mjs <lang>');
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const snap = J(`data/sources/names-${lang}.json`);
const REGIONS = ['europe', 'americas', 'oceania', 'africa-middle-east', 'asia'];
const ORDER = { era: 0, leader: 1, states: 2, detail: 3, event: 4 };

// the Empires level's leader of a column at each year (same ranking as src/lib/levels.ts)
const rank = (s) => [s.tier, s.peak === undefined ? 1 : 0, -(s.peak ?? 0), -(s.to - s.from)];
const better = (a, b) => {
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] < rb[i];
  return false;
};
function leaders(spans) {
  const ids = new Set();
  const pts = [...new Set(spans.flatMap((s) => [s.from, s.to + 1]))].sort((a, b) => a - b);
  for (let i = 0; i < pts.length - 1; i++) {
    let lead = null;
    for (const s of spans) if (s.from <= pts[i] && s.to >= pts[i] && (!lead || better(s, lead))) lead = s;
    if (lead) ids.add(lead.id);
  }
  return ids;
}

const units = new Map();
const unit = (key, init) => units.get(key) ?? units.set(key, { ...init, regions: new Set(), records: new Set(), has: null }).get(key);

for (const r of REGIONS) {
  const polities = Object.fromEntries(J(`data/${r}/_polities.json`).polities.map((p) => [p.id, p]));
  const best = {};
  const events = {};
  for (const lane of readdirSync(`data/${r}`, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const spans = [];
    for (const f of readdirSync(`data/${r}/${lane.name}`)) {
      const file = J(`data/${r}/${lane.name}/${f}`);
      spans.push(...file.spans);
      for (const e of file.events ?? []) events[e.id] = e;
    }
    const lead = leaders(spans);
    for (const s of spans) {
      const cls = lead.has(s.id) ? 'leader' : s.tier <= 2 ? 'states' : 'detail';
      if (!best[s.id] || ORDER[cls] < ORDER[best[s.id]]) best[s.id] = cls;
    }
  }
  for (const [id, cls] of Object.entries(best)) {
    const p = polities[id];
    if (!p?.wikipedia) continue;
    const sec = p.wikipediaSection;
    const u = unit(`state:${p.wikipedia}#${sec ?? ''}`, {
      kind: 'state',
      title: p.wikipedia,
      ...(sec ? { section: sec } : {}),
      priority: cls,
      editions: p.linkFix ? 0 : (p.wd?.languages ?? 0),
    });
    if (ORDER[cls] < ORDER[u.priority]) u.priority = cls;
    // a corrected link (data/sources/link-fixes.json) makes the snapshot's title, found through the old link, moot
    if (!p.linkFix && !sec) u.has ||= snap.polities[id]?.title ?? null;
    u.regions.add(r);
    u.records.add(id);
  }
  for (const e of Object.values(events)) {
    if (!e.wiki) continue;
    const u = unit(`event:${e.wiki}#${e.wikiSection ?? ''}`, {
      kind: 'event',
      title: e.wiki,
      ...(e.wikiSection ? { section: e.wikiSection } : {}),
      priority: 'event',
      editions: e.links ?? 0,
    });
    // a section exists only in the English article, so a section unit is always translated
    if (!e.wikiSection && !e.linkFix) u.has ||= snap.events[e.id]?.title ?? null;
    u.regions.add(r);
    u.records.add(e.id);
  }
  for (const e of J(`data/${r}/_eras.json`).eras) {
    if (!e.article) continue;
    const u = unit(`era:${e.article.title}#${e.article.section ?? ''}`, {
      kind: 'era',
      title: e.article.title,
      ...(e.article.section ? { section: e.article.section } : {}),
      priority: 'era',
      editions: 0,
    });
    u.has ||= snap.eras?.[e.id]?.title ?? null;
    u.regions.add(r);
    u.records.add(e.id);
  }
}

const all = [...units.values()];
const todo = all
  .filter((u) => !u.has)
  .map(({ has, regions, records, ...u }) => ({ ...u, regions: [...regions], records: [...records].sort() }))
  .sort((a, b) => ORDER[a.priority] - ORDER[b.priority] || b.editions - a.editions || a.title.localeCompare(b.title));

const summary = Object.fromEntries(
  REGIONS.map((r) => {
    const mine = all.filter((u) => u.regions.has(r));
    const need = todo.filter((u) => u.regions.includes(r));
    return [r, { articles: mine.length, inLanguage: mine.length - need.length, toTranslate: need.length }];
  }),
);
mkdirSync(`data/translations/${lang}`, { recursive: true });
writeFileSync(
  `data/translations/${lang}/_worklist.json`,
  JSON.stringify({ lang, from: snap.retrieved, summary, units: todo }, null, 1) + '\n',
);
console.log(`data/translations/${lang}/_worklist.json: ${todo.length} of ${all.length} articles to translate`);
for (const [r, s] of Object.entries(summary)) console.log(`  ${r.padEnd(20)} ${String(s.toTranslate).padStart(5)} of ${s.articles}`);
