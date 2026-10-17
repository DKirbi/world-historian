"""Cross-check the culture-area eras against PeriodO, a gazetteer of scholarly period definitions.

Usage: python3 -I fetch_periodo.py <sources_dir> <ne_countries.geojson> [periodo d.json]

For every era in sources/eras-<region>.json, PeriodO periods are matched when their label names the
era (the same words, ignoring case and a trailing "period") and their spatial coverage includes a
country of the era's columns. Each match keeps its label, dates, citation and permanent link.
Writes sources/periodo-eras.json (CC0, https://perio.do), keyed "region|area|page|row" because one row can serve several areas. The build reads only this snapshot.
"""
import sys, os, re, json, glob, gzip, datetime, urllib.request
import geopandas as gpd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_region import REGIONS  # noqa: E402

src, ne_path = sys.argv[1:3]
dump = sys.argv[3] if len(sys.argv) > 3 else None
UA = "WorldHistoryTimeline/0.1 (non-commercial educational timeline; data snapshot build) python-urllib"
if dump and os.path.exists(dump):
    d = json.load(open(dump))
else:
    req = urllib.request.Request("https://data.perio.do/d.json", headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=600) as r:
        raw = r.read()
        d = json.loads(gzip.decompress(raw) if raw[:2] == b"\x1f\x8b" else raw)

ne = gpd.read_file(ne_path)
qid_of = dict(zip(ne.ADMIN, ne.WIKIDATAID))
lane_qids = {}
for cfg in REGIONS.values():
    for lid, admins, *_ in cfg["lanes"]:
        lane_qids.setdefault(lid, set()).update(qid_of[a] for a in admins if isinstance(a, str) and qid_of.get(a))


def year(t):
    """PeriodO years are astronomical (0 = 1 BCE); the chart uses -1 for 1 BCE."""
    if not t:
        return None
    i = t.get("in", {})
    v = i.get("year", i.get("earliestYear", i.get("latestYear")))
    if v is None:
        return None
    v = int(v)
    return v - 1 if v <= 0 else v


def norm(s):
    s = re.sub(r"\(.*?\)", "", s.lower())
    s = re.sub(r"\b(period|age|culture)\b", "", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def cite(a):
    s = a.get("source", {})
    part = s.get("partOf", {})
    title = s.get("title") or part.get("title")
    yearp = s.get("yearPublished") or part.get("yearPublished")
    who = s.get("creators") or part.get("creators") or []
    names = "; ".join(c.get("name", "") for c in who[:3])
    return {"title": title, "year": yearp, "creators": names or None, "locator": s.get("locator")}


periods = [(ak, a, pk, p) for ak, a in d["authorities"].items() for pk, p in a.get("periods", {}).items()]
out = {}
for cfg_path in sorted(glob.glob(os.path.join(src, "eras-*.json"))):
    cfg = json.load(open(cfg_path))
    for area in cfg["areas"]:
        qids = set().union(*(lane_qids.get(l, set()) for l in area["lanes"]))
        for e in area["eras"]:
            # per area: a row shared by several areas (sub-Saharan Africa's Iron Age) has its own matches in each
            key = f"{cfg['region']}|{area['id']}|{e['page']}|{e.get('row') or e.get('find')}"
            want = norm(e["name"].split(" (")[0])
            hits = []
            for ak, a, pk, p in periods:
                cov = {c["id"].rsplit("/", 1)[-1] for c in p.get("spatialCoverage", [])}
                if not cov & qids or norm(p.get("label", "")) != want:
                    continue
                hits.append({"id": pk, "label": p.get("label"), "from": year(p.get("start")), "to": year(p.get("stop")),
                             "startLabel": p.get("start", {}).get("label"), "stopLabel": p.get("stop", {}).get("label"),
                             "url": f"https://n2t.net/ark:/99152/{pk}", "source": cite(a)})
            out[key] = sorted(hits, key=lambda h: str(h["source"]["year"] or ""), reverse=True)

snap = {"retrieved": datetime.date.today().isoformat(), "source": "https://perio.do", "license": "CC0 1.0",
        "note": "PeriodO period definitions whose label names an era and whose spatial coverage includes one of the era's countries.",
        "eras": out}
with open(os.path.join(src, "periodo-eras.json"), "w") as f:
    json.dump(snap, f, ensure_ascii=False, indent=1)
    f.write("\n")
print(f"eras {len(out)} with matches {sum(1 for v in out.values() if v)}")
for k, v in out.items():
    if v:
        print(" ", k[:60], [(h['label'], h['from'], h['to'], (h['source']['title'] or '')[:40]) for h in v[:3]])
