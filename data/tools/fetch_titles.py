"""Add Wikidata items for the English Wikipedia articles that Cliopatria links (second opinion on its ids).

Usage: python3 -I fetch_titles.py <cliopatria.geojson> <snapshot.json>   (updates the snapshot in place)
"""
import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import geopandas as gpd
import wikidata as wd

clio_path, snap_path = sys.argv[1:3]
g = gpd.read_file(clio_path, columns=["Wikipedia", "Type"], ignore_geometry=True)
titles = sorted({t.strip() for t in g[g.Type == "POLITY"].Wikipedia.dropna() if t.strip()})
print("titles", len(titles))
by_title = wd.by_enwiki_titles(titles)
# Wikipedia titles in Cliopatria are spelled with spaces; the API returns the canonical title
canon = {t.replace("_", " "): e for t, e in by_title.items()}
snap = json.load(open(snap_path))
items = snap["items"]
new_ids = {e["id"] for e in canon.values()} - set(items)
counts = wd.sitelink_counts(list(new_ids))
p31_ids = {wd.item_value(c) for e in canon.values() for c in wd.claims(e, "P31")} - {None}
p31 = wd.entities(sorted(p31_ids), props="labels")
for e in canon.values():
    if e["id"] in items:
        continue
    s, e_ = wd.years_of(e)
    items[e["id"]] = {"id": e["id"], "label": wd.label(e), "enwiki": wd.enwiki(e), "sitelinks": counts.get(e["id"]),
                      "instanceOf": [[v, wd.label(p31.get(v, {})) or v] for v in (wd.item_value(c) for c in wd.claims(e, "P31")) if v],
                      "start": list(s) if s else None, "end": list(e_) if e_ else None}
# title -> qid for every title we could resolve (case-insensitive fallback for the first letter)
resolved = {}
lower = {k.lower(): v for k, v in canon.items()}
for t in titles:
    e = canon.get(t) or lower.get(t.lower())
    if e:
        resolved[t] = e["id"]
snap["titles"] = dict(sorted(resolved.items()))
with open(snap_path, "w") as f:
    head = json.dumps({k: v for k, v in snap.items() if k not in ("items", "titles")}, ensure_ascii=False)[:-1]
    body = ",\n".join(f'  "{k}":' + json.dumps(v, ensure_ascii=False, separators=(",", ":")) for k, v in items.items())
    tb = ",\n".join(f'  {json.dumps(k, ensure_ascii=False)}:"{v}"' for k, v in snap["titles"].items())
    f.write(f'{head},\n "titles":{{\n{tb}\n}},\n "items":{{\n{body}\n}}}}\n')
print("resolved titles", len(resolved), "of", len(titles), "new items", len(new_ids))
