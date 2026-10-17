"""World coverage audit: land and polities that no region's lanes show.

Usage: python3 -I audit_coverage.py <cliopatria.geojson> <ne_countries.geojson> <data_dir> [--json out.json]

Part 1, land. For every Natural Earth admin-0 unit, the area not inside any lane of
any region (all lanes in build_region.REGIONS, clipped exactly as the build clips
them). For each uncovered piece of at least MIN_KM2, the test that decides whether
it was missed: does Cliopatria model a state *specific* to it, i.e. a polity with at
least half of its own territory inside the piece and at least INSIDE_MIN_KM2 / 10 of
overlap? If yes, the source has data the chart does not show. If no, any state there
is a larger neighbour or empire that already appears elsewhere.

Part 2, polities. Every Cliopatria polity (core rows) that is in no region's
_polities.json, with the Natural Earth unit holding most of its largest extent.
"""
import sys, json, os
from collections import defaultdict
import geopandas as gpd, shapely
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_region import REGIONS, EXCLUDED, lane_geometry, load_cliopatria, assign_ids, INSIDE_FRAC  # noqa: E402

MIN_KM2 = 100
args = [a for a in sys.argv[1:] if not a.startswith("--")]
clio_path, ne_path, data_dir = args[:3]
out_json = sys.argv[sys.argv.index("--json") + 1] if "--json" in sys.argv else None

ne = gpd.read_file(ne_path)
lane_parts = []
for rid, cfg in REGIONS.items():
    for lid, admins, label, group, opt in cfg["lanes"]:
        lane_parts.append(lane_geometry(ne, admins, cfg["box"], opt))
covered = gpd.GeoSeries([shapely.union_all(lane_parts)], crs=4326).to_crs(6933).make_valid().iloc[0]

ne_eq = ne.to_crs(6933)
ne_eq["geometry"] = shapely.make_valid(ne_eq.geometry.values)
clio = assign_ids(load_cliopatria(clio_path)).to_crs(6933)
clio["geometry"] = shapely.make_valid(clio.geometry.values)
clio["km2"] = shapely.area(clio.geometry.values) / 1e6
tree = shapely.STRtree(clio.geometry.values)
land_parts = ne_eq.geometry.values
land_tree = shapely.STRtree(land_parts)


def land_km2(g):
    hits = land_tree.query(g, predicate="intersects")
    return float(shapely.area(shapely.intersection(land_parts[hits], g)).sum()) / 1e6 if len(hits) else 0.0


excluded = {n.replace(" (part)", ""): x["label"] for xs in EXCLUDED.values() for x in xs for n in x["naturalEarth"]}
excluded_whole = {n for xs in EXCLUDED.values() for x in xs for n in x["naturalEarth"] if not n.endswith("(part)")}
excluded_reason = {n.replace(" (part)", ""): x["reason"] for xs in EXCLUDED.values() for x in xs for n in x["naturalEarth"]}
lane_admins = {a if isinstance(a, str) else a[0] for c in REGIONS.values() for l in c["lanes"] for a in l[1]}
laneless_qids = set(ne.loc[~ne.ADMIN.isin(lane_admins), "WIKIDATAID"].dropna())

report = {"land": [], "polities": []}
print(f"== Land in no lane (pieces >= {MIN_KM2} km2) ==")
for _, r in ne_eq.sort_values(["CONTINENT", "ADMIN"]).iterrows():
    rest = shapely.difference(r.geometry, covered)
    km2 = shapely.area(rest) / 1e6
    if km2 < MIN_KM2:
        continue
    idx = tree.query(rest, predicate="intersects")
    ov = shapely.area(shapely.intersection(clio.geometry.values[idx], rest)) / 1e6
    specific, any_state = {}, {}
    for i, o in zip(idx, ov):
        if o <= 0:
            continue
        c = clio.iloc[i]
        any_state[c.base] = max(any_state.get(c.base, 0), o / km2)
        if not c.realm and o >= 100 and o / max(land_km2(c.geometry), 1e-9) >= INSIDE_FRAC:
            f, t = specific.get(c.base, (9999, -9999))
            specific[c.base] = (min(f, int(c.FromYear)), max(t, int(c.ToYear)))
    whole = km2 / (shapely.area(r.geometry) / 1e6) > 0.98
    if r.ADMIN in excluded:
        reason = "excluded: " + excluded_reason[r.ADMIN]
    elif specific:
        reason = "MISSED: the source has a state specific to this land"
    elif any_state:
        reason = "only wider states, already shown in other columns"
    else:
        reason = "no state in the source"
    item = {"continent": r.CONTINENT, "admin": r.ADMIN, "sovereign": r.SOVEREIGNT, "km2": int(round(km2)), "reason": reason,
            "whole": bool(whole), "specific": {k: list(v) for k, v in sorted(specific.items(), key=lambda x: x[1])},
            "states": len(any_state)}
    report["land"].append(item)
    tag = ("excluded, see omittedLanes" if r.ADMIN in excluded else "MISSED") if specific else \
        ("no state" if not any_state else "only wider states")
    print(f"  {r.CONTINENT[:13]:13s} {r.ADMIN[:34]:34s} {'whole' if whole else 'part ':5s} {km2:>10.0f} km2  {tag}")
    for name, (f, t) in list(specific.items())[:8]:
        print(f"        specific: {name} {f}..{t}")

used = set()
for rid in REGIONS:
    p = os.path.join(data_dir, rid, "_polities.json")
    if os.path.exists(p):
        used |= {x["id"] for x in json.load(open(p))["polities"]}
missing = clio[~clio.eid.isin(used) & ~clio.realm]
big = missing.loc[missing.groupby("eid").km2.idxmax()]
ne_tree = shapely.STRtree(ne_eq.geometry.values)
by_cont = defaultdict(list)
for _, r in big.iterrows():
    idx = ne_tree.query(r.geometry, predicate="intersects")
    if not len(idx):
        admin, cont = "?", "?"
    else:
        ov = shapely.area(shapely.intersection(ne_eq.geometry.values[idx], r.geometry))
        j = idx[ov.argmax()]
        admin, cont = ne_eq.ADMIN.values[j], ne_eq.CONTINENT.values[j]
    span = missing[missing.eid == r.eid]
    years = [int(span.FromYear.min()), int(span.ToYear.max())]
    if r.Wikidata in laneless_qids or admin in excluded_whole:
        reason = "micro-state or excluded territory without a column"
    elif years[1] - years[0] + 1 < 10:
        reason = "shorter than 10 years and under 100,000 km² in any country"
    else:
        reason = "below the share and inside thresholds in every country"
    rec = {"id": r.eid, "name": r.base, "years": years, "maxKm2": int(round(r.km2)), "mostlyIn": admin,
           "continent": cont, "reason": reason}
    by_cont[cont].append(rec)
    report["polities"].append(rec)
print(f"\n== Cliopatria polities in no region: {len(report['polities'])} ==")
for c in sorted(by_cont):
    xs = sorted(by_cont[c], key=lambda x: x["years"][0])
    print(f"-- {c}: {len(xs)}")
    if c != "Asia":
        for x in xs:
            print(f"     {x['years'][0]:>6} {x['years'][1]:>6} {x['maxKm2']:>9} km2  {x['name']}  [mostly in {x['mostlyIn']}]")
if out_json:
    from build_region import GENERATED, SOURCE
    summary = {
        "generated": GENERATED,
        "source": f"{SOURCE['id']}@{SOURCE['version']}",
        "note": "Land and polities that no column shows, with the reason. Regenerate with tools/audit_coverage.py.",
        "landMissed": sum(x["reason"].startswith("MISSED") for x in report["land"]),
        "politiesNotShown": len(report["polities"]),
        "politiesByReason": {k: sum(p["reason"] == k for p in report["polities"])
                             for k in sorted({p["reason"] for p in report["polities"]})},
    }
    with open(out_json, "w") as f:
        head = json.dumps(summary, ensure_ascii=False)[:-1]
        land = ",\n".join("  " + json.dumps(x, ensure_ascii=False, separators=(",", ":")) for x in report["land"])
        pol = ",\n".join("  " + json.dumps(x, ensure_ascii=False, separators=(",", ":"))
                         for x in sorted(report["polities"], key=lambda p: (p["reason"], p["years"][0])))
        f.write(f'{head},\n "land":[\n{land}\n],\n "polities":[\n{pol}\n]}}\n')
