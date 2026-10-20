// Builds src/i18n/names/<lang>.json from the data snapshot data/sources/names-<lang>.json
// (written by data/tools/fetch_names.py). Keeps the file's country-column names as they are.
//
//   node scripts/gen-names.mjs sl
//
// A record's name in <lang> is its article title there, without a disambiguation in brackets
// ("Kranjska (vojvodina)" → "Kranjska"); without an article, its Wikidata label with a capital
// initial (labels are in dictionary form: "bitka pri Nanchangu").
//
// Two records with different English names must not end up with one name. That happens when the
// source links a state to a broader article (Cliopatria links "Carolingian Empire" to West Francia)
// or when one article in <lang> covers two states (Córdoba's emirate and caliphate). The shared
// title then stays with the record whose English name is its own article's title; each other record
// takes its Wikidata label if no other record of the group has it, else keeps its English name.
// Names that equal the English data name are left out, so the app falls back to the data.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';

const lang = process.argv[2];
if (!lang) throw new Error('usage: node scripts/gen-names.mjs <lang>');
const snapPath = `data/sources/names-${lang}.json`;
if (!existsSync(snapPath)) throw new Error(`${snapPath} is missing: run data/tools/fetch_names.py first`);
const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
const outPath = `src/i18n/names/${lang}.json`;
const out = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { lanes: {} };

const regions = ['europe', 'americas', 'oceania', 'africa-middle-east', 'asia'];
/** id → { name, wiki } in English, from the data */
const polities = {};
const events = {};
const eras = {};
for (const r of regions) {
  for (const p of JSON.parse(readFileSync(`data/${r}/_polities.json`, 'utf8')).polities)
    polities[p.id] = { name: p.name, wiki: p.wikipedia };
  for (const e of JSON.parse(readFileSync(`data/${r}/_eras.json`, 'utf8')).eras)
    eras[e.id] = { name: e.name, wiki: e.article?.title };
  for (const lane of readdirSync(`data/${r}`, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const f of readdirSync(`data/${r}/${lane.name}`)) {
      for (const ev of JSON.parse(readFileSync(`data/${r}/${lane.name}/${f}`, 'utf8')).events ?? [])
        events[ev.id] = { name: ev.name, wiki: ev.wiki };
    }
  }
}

const strip = (s) => s.replace(/\s*\([^)]*\)\s*$/, '').trim();
const capital = (s) => s.charAt(0).toLocaleUpperCase(lang) + s.slice(1);
const fromLabel = (rec) => (rec.label ? capital(strip(rec.label)) : null);
const fromTitle = (rec) => (rec.title ? strip(rec.title) : null);
const same = (a, b) => a && b && strip(a).toLocaleLowerCase('en') === strip(b).toLocaleLowerCase('en');

function names(records, english) {
  const chosen = {};
  for (const [id, rec] of Object.entries(records)) chosen[id] = fromTitle(rec) ?? fromLabel(rec);
  let resolved = 0;
  // Repeat until no two records with different English names share a name: a label taken in one
  // round can meet another record's title in the next. Later rounds only drop names, so it ends.
  for (let round = 0; round < 6; round++) {
    const byName = new Map();
    for (const [id, name] of Object.entries(chosen)) {
      if (!name || !english[id]) continue;
      (byName.get(name) ?? byName.set(name, []).get(name)).push(id);
    }
    let changed = false;
    for (const [name, ids] of byName) {
      if (new Set(ids.map((id) => english[id].name)).size < 2) continue;
      changed = true;
      resolved += 1;
      // the keeper: its English name is its own article's title, and (when several are) its own
      // Wikidata label confirms the shared name
      const owners = ids.filter((id) => same(english[id].name, english[id].wiki));
      const confirmed = owners.filter((id) => fromLabel(records[id]) === name);
      const keeperName = (confirmed.length ? confirmed : owners).map((id) => english[id].name);
      const keep = new Set(keeperName.length && new Set(keeperName).size === 1 ? keeperName : []);
      for (const id of ids) {
        if (keep.has(english[id].name)) continue;
        const label = fromLabel(records[id]);
        chosen[id] = round === 0 && label && label !== name ? label : null;
      }
    }
    if (!changed) break;
  }
  const list = Object.fromEntries(
    Object.entries(chosen)
      .filter(([id, name]) => name && english[id] && name !== english[id].name)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return { list, resolved };
}

const p = names(snap.polities, polities);
const e = names(snap.events, events);
const r = names(snap.eras ?? {}, eras);
out._note =
  out._note ??
  `Names in ${lang}: country columns from CLDR with hand overrides; states, events and eras from ${snapPath}.`;
out.polities = p.list;
out.events = e.list;
out.eras = r.list;
out.retrieved = snap.retrieved;
writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
console.log(
  `${outPath}: ${Object.keys(out.polities).length} states, ${Object.keys(out.events).length} events, ${Object.keys(out.eras).length} eras ` +
    `(shared names resolved in ${p.resolved + e.resolved + r.resolved} groups; retrieved ${snap.retrieved})`,
);
