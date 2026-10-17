"""Independent checks of one generated region against the raw sources.

Usage: python3 -I verify_region.py <region> <data_dir> <cliopatria.geojson> <ne_countries.geojson>
"""
import sys, os, json, random, glob
from collections import Counter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wikidata  # noqa: E402
import wikitext as wt  # noqa: E402
import re
import geopandas as gpd, shapely
from shapely.geometry import box

region_id, data, clio_path, ne_path = sys.argv[1:5]
d = os.path.join(data, region_id)
errors = []
idx = json.load(open(os.path.join(d, "_index.json")))
reg = {p["id"]: p for p in json.load(open(os.path.join(d, "_polities.json")))["polities"]}
review = json.load(open(os.path.join(d, "_review.json")))["items"]
periods = {p["id"]: p["years"] for p in idx["periods"]}
tier2_km2 = idx["params"]["tier2Km2"]

sources = os.path.join(data, "sources")
ev_snap = json.load(open(os.path.join(sources, "wikidata-events.json"))) if os.path.exists(os.path.join(sources, "wikidata-events.json")) else None
sup_snap = json.load(open(os.path.join(sources, "wikidata-supplement.json"))) if os.path.exists(os.path.join(sources, "wikidata-supplement.json")) else None
EVENT_TYPES = {"battle", "siege", "invasion", "campaign", "war", "revolution", "rebellion", "coup", "treaty", "pandemic"}

# 1. structure
spans, files, events = [], 0, []
for lane in idx["lanes"]:
    for pid in lane["periods"]:
        f = os.path.join(d, lane["id"], pid + ".json")
        doc = json.load(open(f)); files += 1
        a, b = periods[pid]
        for e in doc.get("events", []):
            if not a <= e["year"] <= b: errors.append(f"{f}: event outside period {e['id']}")
            if e["type"] not in EVENT_TYPES: errors.append(f"{f}: event type {e}")
            if e.get("to") is not None and e["to"] < e["year"]: errors.append(f"{f}: event to<year {e['id']}")
            src = (ev_snap or {}).get("items", {}).get(e["id"])
            if not src: errors.append(f"{f}: event not in snapshot {e['id']}")
            elif src["label"] != e["name"] or wikidata.year_range(*src["start"])[0] != e["year"] or src["sitelinks"] != e["links"]:
                errors.append(f"{f}: event differs from snapshot {e['id']}")
            elif e["links"] < ev_snap["minSitelinks"]: errors.append(f"{f}: event below min sitelinks {e['id']}")
            events.append((lane["id"], e))
        for s in doc["spans"]:
            if s["id"] not in reg: errors.append(f"{f}: unknown id {s['id']}")
            if not s["from"] <= s["to"]: errors.append(f"{f}: from>to {s}")
            if not (s["from"] <= b and s["to"] >= a): errors.append(f"{f}: outside period {s}")
            if s.get("extent") == "unknown" and s.get("kind") == "culture":
                r = reg.get(s["id"], {})
                cul = r.get("culture")
                if not cul: errors.append(f"{f}: culture span without culture record {s['id']}"); continue
                if lane["id"] not in cul["place"]["lanes"]: errors.append(f"{f}: culture in a lane it was not placed in {s['id']}")
                if (s["from"], s["to"]) != (max(r["years"][0], -3400), min(r["years"][1], 2024)):
                    errors.append(f"{f}: culture span years {s} vs {r['years']}")
                if cul["dates"]["by"] in ("list", "period") and not cul["dates"].get("cite"):
                    errors.append(f"{f}: culture dated by a list without a citation {s['id']}")
                for c in cul.get("listed", []) + cul["dates"].get("cite", []):
                    if "oldid=" not in c.get("permalink", ""): errors.append(f"{f}: citation without a revision link {s['id']}")
                if cul["dates"]["by"] == "list":
                    # the stated years must be readable from the quoted rows themselves
                    # the row's own dates are the last range in its quote (a South America row
                    # starts with its period's dates)
                    rng = r"(?:c\.\s*)?(?:AD\s*)?[\d,]+\s*(?:BCE?|AD|CE)?\s*[–—-]\s*(?:AD\s*)?[\d,]+\s*(?:BCE?|AD|CE)?"
                    ys = [wt.parse_years(ms[-1]) for c in cul["dates"]["cite"] for ms in [re.findall(rng, c["quote"])] if ms]
                    ys = [y for y in ys if y]
                    if not ys or (min(y[0] for y in ys), max(y[1] for y in ys)) != tuple(r["years"]):
                        errors.append(f"{f}: culture years {r['years']} not read from its quotes {s['id']}")
                spans.append((lane["id"], s))
                continue
            if s.get("extent") == "unknown":
                r = reg.get(s["id"], {})
                sup = r.get("supplement")
                if not sup: errors.append(f"{f}: unmapped span without supplement record {s['id']}"); continue
                if sup["place"]["lane"] != lane["id"]: errors.append(f"{f}: unmapped span in wrong lane {s['id']}")
                if (s["from"], s["to"]) != (max(r["years"][0], -3400), min(r["years"][1], 2024)):
                    errors.append(f"{f}: unmapped span years {s} vs {r['years']}")
                snap_it = (sup_snap or {}).get("items", {}).get(r["wikidata"])
                if not snap_it or snap_it["label"] != s["name"]: errors.append(f"{f}: unmapped span not in snapshot {s['id']}")
                for k in ("start", "end"):
                    cd = sup[k]
                    want = wikidata.year_range(*snap_it[k])[0 if k == "start" else 1] if snap_it and snap_it.get(k) else None
                    if cd.get("source") == "wikidata" and want != cd.get("year"):
                        errors.append(f"{f}: {k} differs from Wikidata snapshot {s['id']}")
                    if cd.get("source", "").startswith("http") and not cd.get("quote"):
                        errors.append(f"{f}: {k} cited without a quote {s['id']}")
                spans.append((lane["id"], s))
                continue
            if not 0 <= s["peak"] <= 1: errors.append(f"{f}: peak {s}")
            exp = 1 if s["peak"] >= 0.5 else 2 if (s["peak"] >= 0.2 or s["km2"] >= tier2_km2) else 3
            # km2 is rounded for display; allow the tier-2 cut to sit inside the rounding
            if s["tier"] != exp and not abs(s["km2"] - tier2_km2) <= 1000:
                errors.append(f"{f}: tier {s}")
            if s["name"] != reg[s["id"]]["name"]: errors.append(f"{f}: name mismatch {s}")
            if s["peak"] < lane["minShare"] and not (s.get("inside") or s.get("large")):
                errors.append(f"{f}: peak below minShare without inside/large flag {s}")
            if s.get("large") and s["km2"] < tier2_km2 - 1000:
                errors.append(f"{f}: large flag below {tier2_km2} km2 {s}")
            spans.append((lane["id"], s))
    on_disk = {os.path.basename(p)[:-5] for p in glob.glob(os.path.join(d, lane["id"], "*.json"))}
    if on_disk != set(lane["periods"]): errors.append(f"{lane['id']}: index/files mismatch")
missing_qid = [k for k, v in reg.items() if "wikidata" not in v]
if [k for k in missing_qid if k not in {r["id"] for r in review}]:
    errors.append("polities without wikidata and not flagged")

# 2. registry vs raw Cliopatria rows
raw = gpd.read_file(clio_path)
raw = raw[raw.Type == "POLITY"]
raw["base"] = raw.Name.str.replace(r"^\((.*)\)$", r"\1", regex=True).str.strip()
for k, v in reg.items():
    if "supplement" in v or "culture" in v:
        continue
    m = raw[(raw.base == v["name"]) & (raw.Wikidata.fillna("") == v.get("wikidata", ""))]
    m = m[(m.FromYear <= v["years"][1]) & (m.ToYear >= v["years"][0])]
    if not len(m):
        errors.append(f"registry {k}: no raw rows in {v['years']}")
    elif not (m.FromYear.min() <= v["years"][0] and m.ToYear.max() >= v["years"][1]):
        errors.append(f"registry {k}: raw rows do not reach {v['years']}")

# 3. recompute share and overlap for random spans through geopandas overlay
ne = gpd.read_file(ne_path)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_region import REGIONS, lane_geometry  # noqa: E402  (lane definitions only)
cfg = REGIONS[region_id]
lane_defs = {l[0]: l for l in cfg["lanes"]}
random.seed(11)
mapped = [x for x in spans if x[1].get("extent") != "unknown"]
sample = random.sample(mapped, min(40, len(mapped)))
checked = []
for lane_id, s in sample:
    _, admins, _, _, opt = lane_defs[lane_id]
    geom = lane_geometry(ne, admins, cfg["box"], opt)
    lane_g = gpd.GeoDataFrame(geometry=[geom], crs=4326).to_crs(6933)
    lane_g["geometry"] = shapely.make_valid(lane_g.geometry.values)
    v = reg[s["id"]]
    year = (s["from"] + s["to"]) // 2
    rows = raw[(raw.base == v["name"]) & (raw.Wikidata.fillna("") == v.get("wikidata", "")) &
               (raw.FromYear <= year) & (raw.ToYear >= year)].to_crs(6933)
    if not len(rows):
        checked.append((lane_id, s["id"], year, None, s["peak"])); continue
    rows["geometry"] = shapely.make_valid(rows.geometry.values)
    inter = gpd.overlay(rows[["geometry"]], lane_g, how="intersection", keep_geom_type=True)
    km2 = (inter.union_all().area if len(inter) else 0) / 1e6
    share = km2 * 1e6 / lane_g.area.iloc[0]
    checked.append((lane_id, s["id"], year, round(share, 3), s["peak"]))
    if share > s["peak"] + 0.02:
        errors.append(f"share check {lane_id}/{s['id']}@{year}: recomputed {share:.3f} > peak {s['peak']}")
    if km2 > s["km2"] * 1.05 + 1000:
        errors.append(f"km2 check {lane_id}/{s['id']}@{year}: recomputed {km2:.0f} > stored {s['km2']}")

# 4. event placement: events placed by coordinates must lie in (or within 30 km of) their lane
if events and ev_snap:
    from shapely.geometry import Point
    lane_eq = {}
    for lid in {l for l, e in events if e["by"] in ("coordinates", "location")}:
        _, admins, _, _, opt = lane_defs[lid]
        lane_eq[lid] = gpd.GeoSeries([lane_geometry(ne, admins, cfg["box"], opt)], crs=4326).to_crs(6933).make_valid().iloc[0]
    bad = 0
    for lid, e in events:
        if e["by"] not in ("coordinates", "location"): continue
        it = ev_snap["items"][e["id"]]
        if e["by"] == "location":
            # a location without coordinates places the event by its country: accept the lane when one
            # of its Natural Earth members has that country's Wikidata id
            lane_qids = set(ne.loc[ne.ADMIN.isin([a for a in lane_defs[lid][1] if isinstance(a, str)]), "WIKIDATAID"])
            if any(not pl.get("coord") and set(pl["countries"]) & lane_qids for pl in it["places"]):
                continue
        pts = [it["coord"]] if e["by"] == "coordinates" else [pl["coord"] for pl in it["places"] if pl.get("coord")]
        if not pts:
            errors.append(f"event {e['id']} {e['name']}: placed by location without a usable place"); continue
        dist = min(lane_eq[lid].distance(gpd.GeoSeries([Point(*xy)], crs=4326).to_crs(6933).iloc[0]) for xy in pts)
        if dist > 30_000 + 1:
            bad += 1; errors.append(f"event {e['id']} {e['name']}: nearest place is {dist/1000:.0f} km from {lid}")
    dup = Counter((l, e["id"]) for l, e in events)
    errors += [f"event listed twice in {k[0]}: {k[1]}" for k, n in dup.items() if n > 1]

# 5. eras: lanes exist, years match the cited row, leaders are records of the region
eras_path = os.path.join(d, "_eras.json")
n_eras = 0
if os.path.exists(eras_path):
    ed = json.load(open(eras_path))
    lane_ids = {l["id"] for l in idx["lanes"]}
    wp_eras = json.load(open(os.path.join(sources, "wikipedia-eras.json")))["eras"] if os.path.exists(os.path.join(sources, "wikipedia-eras.json")) else {}
    by_quote = {}
    for k, r in wp_eras.items():
        by_quote.setdefault((r["page"], r["quote"]), r)
    for e in ed["eras"]:
        n_eras += 1
        if not set(e["lanes"]) <= lane_ids: errors.append(f"era {e['id']}: unknown lanes")
        if not e["from"] <= e["to"]: errors.append(f"era {e['id']}: from>to")
        for l in e["leaders"]:
            if l["id"] not in reg or reg[l["id"]]["name"] != l["name"]: errors.append(f"era {e['id']}: leader {l}")
        if "cite" in e:
            r = by_quote.get((e["cite"]["page"], e["cite"]["quote"]))
            if not r: errors.append(f"era {e['id']}: cited row not in the snapshot")
            elif (max(r["from"], -3400), min(r["to"], 2024)) != (e["from"], e["to"]): errors.append(f"era {e['id']}: years differ from the cited row")
            if "oldid=" not in e["cite"]["permalink"]: errors.append(f"era {e['id']}: no revision link")
        elif e.get("basis") != "period-bin":
            errors.append(f"era {e['id']}: neither cited nor a period bin")
        elif not e["leaders"]:
            errors.append(f"era {e['id']}: period bin without any recorded state")

print(f"{region_id}: files={files} span-rows={len(spans)} polities={len(reg)} review={len(review)} eras={n_eras} "
      f"missing_wikidata={len(missing_qid)} events={len(events)} unmapped-spans={len(spans) - len(mapped)}")
print("sample (lane, id, mid-year, recomputed share, stored peak):")
for c in checked[:12]:
    print("  ", c)
print("ERRORS:", len(errors))
for e in errors[:30]:
    print("  ", e)
