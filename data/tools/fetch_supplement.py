"""Snapshot Wikidata facts for the supplement states listed in supplement.json.

Usage: python3 -I fetch_supplement.py <supplement.json> <out.json>
"""
import sys, json, os, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wikidata as wd

sup_path, out = sys.argv[1:3]
qids = [x["qid"] for x in json.load(open(sup_path))["items"]]
ents = wd.entities(qids, props="labels|descriptions|claims|sitelinks")
caps = wd.entities({wd.item_value(c) for e in ents.values() for c in wd.best(e, "P36")} - {None}, props="labels|claims")
counts = wd.sitelink_counts(list(ents))


def coord(e):
    return next((wd.coord_value(c) for c in wd.best(e, "P625") if wd.coord_value(c)), None)


items = {}
for q in qids:
    e = ents[q]
    s, en = wd.years_of(e)
    cap = next((caps.get(wd.item_value(c)) for c in wd.best(e, "P36") if caps.get(wd.item_value(c))), None)
    c = coord(e)
    cc = coord(cap) if cap else None
    items[q] = {
        "label": wd.label(e),
        "description": e.get("descriptions", {}).get("en", {}).get("value"),
        "enwiki": wd.enwiki(e),
        "sitelinks": counts.get(q),
        "start": list(s) if s else None,
        "end": list(en) if en else None,
        "coord": [round(c[0], 4), round(c[1], 4)] if c else None,
        "capital": [wd.item_value(x) for x in wd.best(e, "P36")][:1] or None,
        "capitalCoord": [round(cc[0], 4), round(cc[1], 4)] if cc else None,
        "capitalCountry": [wd.item_value(x) for x in wd.best(cap, "P17") if wd.item_value(x)] if cap else [],
        "presentDay": [wd.item_value(x) for x in wd.best(e, "P3842") if wd.item_value(x)],
        "country": [wd.item_value(x) for x in wd.best(e, "P17") if wd.item_value(x)],
    }
snap = {"retrieved": datetime.date.today().isoformat(), "source": "https://www.wikidata.org", "license": "CC0 1.0",
        "fields": "start/end = [year, precision] from P571/P580 and P576/P582; coord = P625; capital = P36 with its P625 and P17 (capitalCountry); "
                  "presentDay = P3842 (located in present-day administrative territorial entity); country = P17."}
with open(out, "w") as f:
    head = json.dumps(snap, ensure_ascii=False)[:-1]
    body = ",\n".join(f'  "{k}":' + json.dumps(v, ensure_ascii=False, separators=(",", ":")) for k, v in items.items())
    f.write(f'{head},\n "items":{{\n{body}\n}}}}\n')
print("written", len(items))
for q, v in items.items():
    print(f"  {q:11s} {v['label'][:30]:30s} {v['start']} {v['end']} coord={v['coord']} cap={v['capitalCoord']} pd={v['presentDay']} c={v['country']} cc={v['capitalCountry']}")
