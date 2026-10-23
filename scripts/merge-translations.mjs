// Joins translations with their English sources, checks them, and adds them to a region's batch.
//
//   node scripts/merge-translations.mjs <lang> <region> <draft.json> [<draft.json> …] [--partial] [--translator "…"]
//
// A draft is { "<key>": { "headline"?: "…", "paragraphs": ["…"], "notes"?: ["…"], "allowNumbers"?: ["…"] } }; a key
// is a unit of data/translations/<lang>/_sources/<region>.json (an English title, or "<title>#<section>" for an
// era that is a section of an article). Units already in data/translations/<lang>/<region>.json are kept, and a
// draft entry for one of them replaces it. Without --partial, every source unit must be translated by the end.
//
// Checks (any failure stops the merge):
//   - every draft key is a source unit (and, without --partial, every source unit is translated)
//   - one translated paragraph per English paragraph
//   - every number in the English is in the translation (thousands separators and ordinal dots aside);
//     a number written out as a word is allowed with an "allowNumbers" entry
//   - none of the calques the style sheet bans (docs/research/slovenian-newspaper-style.md)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const translator = option('--translator') ?? 'unknown';
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--translator');
const [lang, region, ...draftPaths] = positional;
if (!draftPaths.length)
  throw new Error('usage: node scripts/merge-translations.mjs <lang> <region> <draft.json> [<draft.json> …] [--partial] [--translator "…"]');

const src = JSON.parse(readFileSync(`data/translations/${lang}/_sources/${region}.json`, 'utf8'));
const outPath = `data/translations/${lang}/${region}.json`;
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : null;
const draft = Object.assign({}, ...draftPaths.map((p) => JSON.parse(readFileSync(p, 'utf8'))));

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
const today = new Date().toISOString().slice(0, 10);
const units = { ...(prev?.units ?? {}) };
for (const [key, d] of Object.entries(draft)) {
  const s = src.units[key];
  if (!s) {
    errors.push(`${key}: not in the sources`);
    continue;
  }
  if (d.paragraphs.length !== s.paragraphs.length) errors.push(`${key}: ${d.paragraphs.length} paragraphs for ${s.paragraphs.length}`);
  const en = numbers(s.paragraphs.join(' '));
  const tr = numbers(d.paragraphs.join(' '));
  const lost = [...en].filter((n) => !tr.has(n) && !(d.allowNumbers ?? []).includes(n));
  if (lost.length) errors.push(`${key}: numbers missing: ${lost.join(', ')}`);
  for (const re of BANNED[lang] ?? []) for (const p of d.paragraphs) if (re.test(p)) errors.push(`${key}: banned phrase ${re}`);
  units[key] = {
    ...(d.headline ? { headline: d.headline } : {}),
    paragraphs: d.paragraphs,
    ...(d.notes?.length ? { notes: d.notes } : {}),
    source: {
      wiki: 'en',
      title: s.article,
      ...(s.section ? { section: s.section } : {}),
      rev: s.rev,
      retrieved: s.retrieved ?? src.retrieved,
      paragraphs: s.paragraphs,
    },
    records: s.records,
    translated: today,
  };
}
const missing = Object.keys(src.units).filter((k) => !units[k]);
if (missing.length && !flag('--partial')) errors.push(`not translated (${missing.length}): ${missing.slice(0, 10).join('; ')}…`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const out = {
  lang,
  region,
  method: 'machine',
  translator: prev && prev.translator !== translator && translator === 'unknown' ? prev.translator : translator,
  translated: today,
  reviewed: false,
  licence: 'CC BY-SA 4.0: translations of English Wikipedia text, attributed to each article and revision',
  units: Object.fromEntries(Object.entries(units).sort(([a], [b]) => a.localeCompare(b))),
};
writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
const words = Object.values(units).reduce((n, u) => n + u.paragraphs.join(' ').split(/\s+/).length, 0);
console.log(`${outPath}: ${Object.keys(units).length} of ${Object.keys(src.units).length} units, ${words} words${missing.length ? `; ${missing.length} still to translate` : ''}`);
