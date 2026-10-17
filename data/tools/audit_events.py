"""Which key events from the Wikidata snapshot no region shows, and why.

Usage: python3 -I audit_events.py <ne_countries.geojson> <data_dir> [--json <coverage.json to update>]

Runs the build's own placement (enrich.events) for every region and reports, for the events
placed in no lane at all, the reason, with the most widely documented ones listed by name.
"""
import sys, os, json
from collections import Counter, defaultdict
import geopandas as gpd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_region import REGIONS, load_lanes  # noqa: E402
import enrich  # noqa: E402
import wikidata  # noqa: E402

args = [a for a in sys.argv[1:] if not a.startswith("--")]
ne_path, data_dir = args[:2]
out_json = sys.argv[sys.argv.index("--json") + 1] if "--json" in sys.argv else None

snap = json.load(open(os.path.join(data_dir, "sources", "wikidata-events.json")))
ne_all = gpd.read_file(ne_path)
MODERN = set(ne_all.WIKIDATAID.dropna())
placed = defaultdict(set)
for rid, cfg in REGIONS.items():
    lanes = load_lanes(ne_path, cfg)
    per_lane, stats = enrich.events(snap, enrich.Placer(lanes, cfg["lanes"], ne_all))
    for lid, evs in per_lane.items():
        for e in evs:
            placed[e["id"]].add(f"{rid}/{lid}")
    print(rid, dict(stats))


def reason(e):
    if not e.get("label") or not e.get("start"):
        return "no date or English label on Wikidata"
    if e["start"][1] < 8:
        return "date coarser than a decade"
    y = wikidata.year_range(*e["start"])[0]
    if not enrich.FIRST_YEAR <= y <= enrich.LAST_YEAR:
        return "outside the chart's years"
    if e.get("end") and e["end"][1] >= 8 and wikidata.year_range(*e["end"])[1] < y:
        return "end before start on Wikidata"
    if e.get("coord"):
        return "its coordinates are in no column (at sea, or a territory without a column)"
    places = [pl for pl in e.get("places") or [] if pl.get("coord") or set(pl["countries"]) & MODERN]
    if places:
        if len({c for pl in places for c in pl["countries"]}) > enrich.MAX_EVENT_LANES:
            return f"places in more than {enrich.MAX_EVENT_LANES} countries"
        return "its places are in no column"
    if len(e.get("countries") or []) > enrich.MAX_EVENT_LANES:
        return f"no place, and more than {enrich.MAX_EVENT_LANES} countries"
    if e.get("countries"):
        return "its countries have no whole-country column"
    return "no coordinates, location or country on Wikidata"


missing = [(q, e) for q, e in snap["items"].items() if q not in placed]
by_reason = defaultdict(list)
for q, e in missing:
    by_reason[reason(e)].append((e.get("sitelinks") or 0, q, e.get("label") or q))
total = len(snap["items"])
print(f"events in snapshot {total}, shown in at least one lane {len(placed)}, not shown {len(missing)}")
summary = {"snapshot": total, "shown": len(placed), "notShown": len(missing), "reasons": {}}
for r, rows in sorted(by_reason.items(), key=lambda kv: -len(kv[1])):
    rows.sort(reverse=True)
    print(f"  {len(rows):5d}  {r}: " + "; ".join(f"{n} ({s})" for s, q, n in rows[:8]))
    summary["reasons"][r] = {"count": len(rows), "mostKnown": [{"id": q, "name": n, "languages": s} for s, q, n in rows[:15]]}
lanes_per = Counter(len(v) for v in placed.values())
summary["lanesPerEvent"] = {str(k): v for k, v in sorted(lanes_per.items())}
print("lanes per shown event:", summary["lanesPerEvent"])

if out_json:
    cov = json.load(open(out_json)) if os.path.exists(out_json) else {}
    cov["events"] = {"note": "Key events from data/sources/wikidata-events.json that no lane shows, by reason "
                             "(placement as in tools/enrich.py).", **summary}
    with open(out_json, "w") as f:
        json.dump(cov, f, ensure_ascii=False, indent=1)
        f.write("\n")
