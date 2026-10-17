"""Snapshot candidate historical events from Wikidata.

Usage: python3 -I fetch_events.py <out.json> [min_sitelinks]

Candidates are items that are an instance of (a subclass of) one of EVENT_CLASSES and have at
least MIN_SITELINKS Wikipedia language editions, a common proxy for how widely an event is known.
For each candidate the snapshot keeps: English label and Wikipedia title, the number of
language editions, its class, dates (point in time P585, or start P580 / end P582, with precision),
its own coordinates (P625), each of its locations (P276) with coordinates and country (only
locations that themselves have a country, so continents and seas are skipped), and its country (P17).
Start and end come from P580 / P582, else the point in time P585; a treaty is dated by its
signing (P585, else inception P571, else P580) and has no end.
The build decides which events are shown and in which country column.
"""
import sys, json, os, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wikidata as wd

# Order matters: an item matching several classes takes the first one listed.
EVENT_CLASSES = [
    ("siege", "Q188055"),
    ("battle", "Q178561"),
    ("invasion", "Q467011"),
    ("campaign", "Q831663"),
    ("coup", "Q45382"),
    ("revolution", "Q10931"),
    ("rebellion", "Q124734"),
    ("war", "Q198"),
    ("treaty", "Q131569"),
    ("pandemic", "Q12184"),
]

out = sys.argv[1]
min_links = int(sys.argv[2]) if len(sys.argv) > 2 else 12

cls_of, links = {}, {}
for name, q in EVENT_CLASSES:
    rows = wd.sparql(f"""SELECT DISTINCT ?e ?s WHERE {{
      ?e wdt:P31/wdt:P279* wd:{q} ; wikibase:sitelinks ?s .
      FILTER(?s >= {min_links})
    }}""")
    for r in rows:
        e = r["e"].rsplit("/", 1)[1]
        links[e] = int(r["s"])
        cls_of.setdefault(e, name)
    print(f"{name:10s} {len(rows):>5}")
print("candidates", len(cls_of))

ents = wd.entities(list(cls_of), props="labels|claims|sitelinks")
loc_ids = {wd.item_value(c) for e in ents.values() for c in wd.claims(e, "P276")} - {None}
locs = wd.entities(sorted(loc_ids), props="labels|claims")


def tv(e, pid):
    for c in wd.best(e, pid):
        v = wd.time_value(c)
        if v:
            return list(v)
    return None


items = {}
for q in sorted(cls_of, key=lambda x: int(x[1:])):
    e = ents.get(q)
    if not e:
        continue
    # Start / end time (P580 / P582) win over point in time (P585): several wars carry a P585 that
    # repeats their end date (World War I has P585 = 1918 beside P580 = 1914). A treaty is dated by
    # its signing: point in time (P585), else inception (P571), else start time (P580), which on a
    # treaty is usually when it came into force; its end time is the end of validity, not part of
    # the event, so it is not kept.
    if cls_of[q] == "treaty":
        start, end = tv(e, "P585") or tv(e, "P571") or tv(e, "P580"), None
    else:
        start, end = tv(e, "P580"), tv(e, "P582")
        if not start:
            start, end = tv(e, "P585"), None
    coord = next((wd.coord_value(c) for c in wd.best(e, "P625") if wd.coord_value(c)), None)
    places = []
    for c in wd.best(e, "P276"):
        le = locs.get(wd.item_value(c) or "")
        # Only places inside a country (a city, a battlefield, a country itself) count; a continent,
        # sea or broad region such as "Central Europe" has no country (P17) and would pin a
        # region-wide event to whichever column holds its centre point.
        if not le or not wd.best(le, "P17"):
            continue
        countries = sorted({wd.item_value(x) for x in wd.best(le, "P17") if wd.item_value(x)})
        if not countries:  # "no value" statements, e.g. on oceans
            continue
        lc = next((wd.coord_value(x) for x in wd.best(le, "P625") if wd.coord_value(x)), None)
        places.append({"id": le["id"], "coord": [round(lc[0], 4), round(lc[1], 4)] if lc else None,
                       "countries": countries})
    items[e["id"]] = {
        "label": wd.label(e),
        "enwiki": wd.enwiki(e),
        "sitelinks": links.get(q),
        "class": cls_of[q],
        "start": start,
        "end": end,
        "coord": [round(coord[0], 4), round(coord[1], 4)] if coord else None,
        "places": places,
        "countries": sorted({wd.item_value(c) for c in wd.best(e, "P17") if wd.item_value(c)}),
    }

snap = {"retrieved": datetime.date.today().isoformat(), "source": "https://www.wikidata.org", "license": "CC0 1.0",
        "minSitelinks": min_links, "classes": {n: q for n, q in EVENT_CLASSES},
        "fields": "sitelinks = number of Wikipedia language editions; start/end = [year, precision] "
                  "(P580/P582, else P585 point in time; treaties: P585, else P571, else P580, no end); coord = P625; places = locations (P276) that have a country (P17), "
                  "with their coordinates and countries; countries = P17. Negative years are BCE."}
with open(out, "w") as f:
    head = json.dumps(snap, ensure_ascii=False)[:-1]
    body = ",\n".join(f'  "{k}":' + json.dumps(v, ensure_ascii=False, separators=(",", ":")) for k, v in items.items())
    f.write(f'{head},\n "items":{{\n{body}\n}}}}\n')
print("written", len(items))
