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
// A record with no name from the snapshot takes the headline of its translated summary
// (data/translations/<lang>/<region>.json), which the translator wrote because the glossary had none.
// Only a summary about that one record counts: not one shared by several records, and not one the
// L10N-LATER list (data/translations/<lang>/_later.json, "wrong-article") says came from the wrong
// article. The headline's bracketed qualifier is dropped ("Bitka za Peking (1900)" → "Bitka za Peking")
// unless another record already uses that name under a different English name, in which case the
// qualifier stays ("Pariška pogodba (1303)"); a headline taken even so is skipped, so the rule above holds.
const seeded = { polities: 0, events: 0, eras: 0, skipped: [] };
{
  const dir = `data/translations/${lang}`;
  const laterPath = `${dir}/_later.json`;
  const wrong = new Set(existsSync(laterPath) ? JSON.parse(readFileSync(laterPath, 'utf8'))['wrong-article'].map((u) => u.title) : []);
  const groups = [['polities', p.list, polities], ['events', e.list, events], ['eras', r.list, eras]];
  // group + name → English names already carrying it; a state, an event and an era may share a name
  // (the era "Sovjetska zveza" and the state), two records of one group with different English names may not
  const used = new Map();
  const at = (key, name) => `${key}\u0000${name}`;
  for (const [key, list, english] of groups)
    for (const [id, name] of [...Object.entries(list), ...Object.entries(out.overrides?.[key] ?? {})])
      if (id !== '_note') (used.get(at(key, name)) ?? used.set(at(key, name), new Set()).get(at(key, name))).add(english[id]?.name);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_')) : [];
  for (const f of files.sort()) {
    for (const [title, unit] of Object.entries(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')).units)) {
      const recs = unit.records ?? [];
      if (!unit.headline || recs.length !== 1 || wrong.has(title)) continue;
      const id = recs[0];
      const group = groups.find(([key, list, english]) => english[id] && !(id in list) && !(id in (out.overrides?.[key] ?? {})));
      if (!group) continue;
      const [key, list, english] = group;
      const en = english[id].name;
      const free = (n) => ![...(used.get(at(key, n)) ?? [])].some((other) => other !== en);
      // the headline without its bracket when that name is free, else with it (two Treaties of Paris)
      const name = [strip(unit.headline), unit.headline].find(free);
      if (!name) {
        seeded.skipped.push(`${id} "${unit.headline}"`);
        continue;
      }
      if (name === en) continue;
      const others = used.get(at(key, name));
      list[id] = name;
      (others ?? used.set(at(key, name), new Set()).get(at(key, name))).add(en);
      seeded[key] += 1;
    }
  }
}
// Hand corrections, kept in the names file under "overrides" so a rebuild keeps them: a Wikidata label
// that names the wrong thing (the 2016 Trans-Pacific Partnership labelled as its 2005 predecessor).
const over = out.overrides ?? {};
for (const [group, list] of [['polities', p.list], ['events', e.list], ['eras', r.list]])
  for (const [id, name] of Object.entries(over[group] ?? {})) list[id] = name;
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
    `(shared names resolved in ${p.resolved + e.resolved + r.resolved} groups; retrieved ${snap.retrieved}); ` +
    `from translated headlines: ${seeded.polities} states, ${seeded.events} events, ${seeded.eras} eras` +
    (seeded.skipped.length ? `; skipped as taken: ${seeded.skipped.join(', ')}` : ''),
);
