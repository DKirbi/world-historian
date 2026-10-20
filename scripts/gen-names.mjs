// Builds src/i18n/names/<lang>.json from the data snapshot data/sources/names-<lang>.json
// (written by data/tools/fetch_names.py). Keeps the file's country-column names as they are.
//
//   node scripts/gen-names.mjs sl
//
// A record's name in <lang> is its article title there, without a disambiguation in brackets
// ("Kranjska (vojvodina)" → "Kranjska"); without an article, its Wikidata label. Names that are the
// same as the English data name are left out, so the app falls back to the data.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';

const lang = process.argv[2];
if (!lang) throw new Error('usage: node scripts/gen-names.mjs <lang>');
const snapPath = `data/sources/names-${lang}.json`;
if (!existsSync(snapPath)) throw new Error(`${snapPath} is missing: run data/tools/fetch_names.py first`);
const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
const outPath = `src/i18n/names/${lang}.json`;
const out = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { lanes: {} };

const regions = ['europe', 'americas', 'oceania', 'africa-middle-east', 'asia'];
const englishPolity = {};
const englishEra = {};
const englishEvent = {};
for (const r of regions) {
  for (const p of JSON.parse(readFileSync(`data/${r}/_polities.json`, 'utf8')).polities) englishPolity[p.id] = p.name;
  for (const e of JSON.parse(readFileSync(`data/${r}/_eras.json`, 'utf8')).eras) englishEra[e.id] = e.name;
  for (const lane of readdirSync(`data/${r}`, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const f of readdirSync(`data/${r}/${lane.name}`)) {
      for (const ev of JSON.parse(readFileSync(`data/${r}/${lane.name}/${f}`, 'utf8')).events ?? []) englishEvent[ev.id] = ev.name;
    }
  }
}

const display = (rec) => (rec.title ? rec.title.replace(/\s*\([^)]*\)\s*$/, '') : rec.label);
const pick = (records, english) =>
  Object.fromEntries(
    Object.entries(records)
      .map(([id, rec]) => [id, display(rec)])
      .filter(([id, name]) => name && name !== english[id])
      .sort(([a], [b]) => a.localeCompare(b)),
  );

out._note =
  out._note ??
  `Names in ${lang}: country columns from CLDR with hand overrides; states, events and eras from ${snapPath}.`;
out.polities = pick(snap.polities, englishPolity);
out.events = pick(snap.events, englishEvent);
out.eras = pick(snap.eras ?? {}, englishEra);
out.retrieved = snap.retrieved;
writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
console.log(
  `${outPath}: ${Object.keys(out.polities).length} states, ${Object.keys(out.events).length} events, ${Object.keys(out.eras).length} eras (retrieved ${snap.retrieved})`,
);
