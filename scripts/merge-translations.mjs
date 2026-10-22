// Joins a batch of translations with its English sources and checks it before it goes into the app.
//
//   node scripts/merge-translations.mjs <lang> <region> <draft.json> [--translator "…"]
//
// The draft is { "<English title>": { "headline"?: "…", "paragraphs": ["…"], "notes"?: ["…"] } }, one entry
// per unit of data/translations/<lang>/_sources/<region>.json. Writes data/translations/<lang>/<region>.json.
//
// Checks (any failure stops the merge):
//   - every source unit is translated, and nothing else
//   - one translated paragraph per English paragraph
//   - every number in the English is in the translation (thousands separators and ordinal dots aside);
//     a number written out as a word is allowed with an "allowNumbers" entry
//   - none of the calques the style sheet bans (docs/research/slovenian-newspaper-style.md)
import { readFileSync, writeFileSync } from 'node:fs';

const [lang, region, draftPath, ...rest] = process.argv.slice(2);
if (!draftPath) throw new Error('usage: node scripts/merge-translations.mjs <lang> <region> <draft.json> [--translator "…"]');
const translator = rest[rest.indexOf('--translator') + 1] ?? 'unknown';
const src = JSON.parse(readFileSync(`data/translations/${lang}/_sources/${region}.json`, 'utf8'));
const draft = JSON.parse(readFileSync(draftPath, 'utf8'));

const BANNED = {
  sl: [/\bs strani\b/i, /\bse nahaja/i, /\bv kolikor\b/i, /\ble-t[aoie]/i, /\bpreko\b/i, /\bkot rezultat\b/i, /\bvečina od njih\b/i, /\bpozno v dnevu\b/i, /\beventualn/i, /\baktualn/i],
};
const numbers = (s) =>
  new Set(
    (s.match(/\d[\d,.]*\d|\d/g) ?? [])
      .map((n) => n.replace(/[.,](?=\d{3}\b)/g, '').replace(/[.,]$/, ''))
      .flatMap((n) => n.split(/[.,]/))
      .filter(Boolean),
  );

const errors = [];
const units = {};
for (const [title, s] of Object.entries(src.units)) {
  const d = draft[title];
  if (!d) {
    errors.push(`${title}: not translated`);
    continue;
  }
  if (d.paragraphs.length !== s.paragraphs.length) errors.push(`${title}: ${d.paragraphs.length} paragraphs for ${s.paragraphs.length}`);
  const en = numbers(s.paragraphs.join(' '));
  const tr = numbers(d.paragraphs.join(' '));
  const lost = [...en].filter((n) => !tr.has(n) && !(d.allowNumbers ?? []).includes(n));
  if (lost.length) errors.push(`${title}: numbers missing: ${lost.join(', ')}`);
  for (const re of BANNED[lang] ?? []) for (const p of d.paragraphs) if (re.test(p)) errors.push(`${title}: banned phrase ${re}`);
  units[title] = {
    ...(d.headline ? { headline: d.headline } : {}),
    paragraphs: d.paragraphs,
    ...(d.notes?.length ? { notes: d.notes } : {}),
    source: { wiki: 'en', title: s.article, rev: s.rev, retrieved: src.retrieved, paragraphs: s.paragraphs },
    records: s.records,
  };
}
for (const title of Object.keys(draft)) if (!src.units[title]) errors.push(`${title}: not in the sources`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const out = {
  lang,
  region,
  method: 'machine',
  translator,
  translated: new Date().toISOString().slice(0, 10),
  reviewed: false,
  licence: 'CC BY-SA 4.0: translations of English Wikipedia text, attributed to each article and revision',
  units: Object.fromEntries(Object.entries(units).sort(([a], [b]) => a.localeCompare(b))),
};
writeFileSync(`data/translations/${lang}/${region}.json`, JSON.stringify(out, null, 1) + '\n');
const words = Object.values(units).reduce((n, u) => n + u.paragraphs.join(' ').split(/\s+/).length, 0);
console.log(`data/translations/${lang}/${region}.json: ${Object.keys(units).length} units, ${words} words`);
