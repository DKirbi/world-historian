"""Snapshot Wikidata facts for every Wikidata id used by Cliopatria polities.

Usage: python3 -I fetch_polities.py <cliopatria.geojson> <out.json>
"""
import sys, json, os, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import geopandas as gpd
import wikidata as wd

clio_path, out = sys.argv[1:3]
g = gpd.read_file(clio_path, columns=["Wikidata", "Type"], ignore_geometry=True)
qids = sorted({q.strip() for q in g[g.Type == "POLITY"].Wikidata.dropna() if q.strip().startswith("Q")})
print("qids", len(qids))
ents = wd.entities(qids, props="labels|claims|sitelinks")
counts = wd.sitelink_counts(list(ents))
p31_ids = {wd.item_value(c) for e in ents.values() for c in wd.claims(e, "P31")} - {None}
p31 = wd.entities(sorted(p31_ids), props="labels")
recs = {}
for q in qids:
    e = ents.get(q)
    if not e:
        recs[q] = {"missing": True}
        continue
    (s, e_) = wd.years_of(e)
    recs[q] = {
        "id": e["id"],  # differs from q when q is a redirect
        "label": wd.label(e),
        "enwiki": wd.enwiki(e),
        "sitelinks": counts.get(e["id"]),
        "instanceOf": [[v, wd.label(p31.get(v, {})) or v] for v in (wd.item_value(c) for c in wd.claims(e, "P31")) if v],
        "start": list(s) if s else None,
        "end": list(e_) if e_ else None,
    }
snap = {"retrieved": datetime.date.today().isoformat(), "source": "https://www.wikidata.org", "license": "CC0 1.0",
        "fields": "start/end = [year, precision] from inception P571 or start time P580, dissolved P576 or end time P582; "
                  "precision 9 = year, 8 = decade, 7 = century, 6 = millennium. Negative years are BCE.",
        "items": recs}
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w") as f:
    head = json.dumps({k: v for k, v in snap.items() if k != "items"}, ensure_ascii=False)[:-1]
    body = ",\n".join(f'  "{k}":' + json.dumps(v, ensure_ascii=False, separators=(",", ":")) for k, v in recs.items())
    f.write(f'{head},\n "items":{{\n{body}\n}}}}\n')
print("written", len(recs), "missing", sum(1 for v in recs.values() if v.get("missing")))
