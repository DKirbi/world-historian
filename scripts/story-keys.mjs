// The keys under which the stories of each region find their stored text and translation, as the app makes
// them (src/features/story/stored.ts, storyKey; templates.ts): a state's `wikipedia` (+ `wikipediaSection`),
// an event's `wiki` (+ `wikiSection`), an era's `article` (+ section) or, for a cited era, its page and row.
// Used by vite.config.ts to cut the translation packs per region; mirrors data/tools/fetch_stories.py.
import { readFileSync, readdirSync } from 'node:fs';

export const REGIONS = ['europe', 'americas', 'oceania', 'africa-middle-east', 'asia'];

const key = (title, section) => (section ? `${title}#${section}` : title);

/** region → Set of story keys */
export function regionKeys(dataDir) {
  const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const out = {};
  for (const region of REGIONS) {
    const keys = new Set();
    const polities = Object.fromEntries(J(`${dataDir}/${region}/_polities.json`).polities.map((p) => [p.id, p]));
    for (const lane of readdirSync(`${dataDir}/${region}`, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      for (const f of readdirSync(`${dataDir}/${region}/${lane.name}`)) {
        const file = J(`${dataDir}/${region}/${lane.name}/${f}`);
        for (const s of file.spans ?? []) {
          const p = polities[s.id];
          if (p?.wikipedia) keys.add(key(p.wikipedia, p.wikipediaSection));
        }
        for (const e of file.events ?? []) if (e.wiki) keys.add(key(e.wiki, e.wikiSection));
      }
    }
    for (const e of J(`${dataDir}/${region}/_eras.json`).eras) {
      if (e.article) keys.add(key(e.article.title, e.article.section));
      else if (e.cite && e.basis !== 'period-bin') keys.add(key(e.cite.page, e.cite.quote));
    }
    out[region] = keys;
  }
  return out;
}
