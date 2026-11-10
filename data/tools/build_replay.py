"""Build a replay pack: the board, the events and the minimap for one stretch of history.

    python3 build_replay.py <data_dir> <replay_id> <cliopatria.geojson> <ne_50m_land.geojson> [<ne_50m_rivers.geojson>]

Inputs (all snapshots, no live requests):
  sources/replay-<id>.json            editorial definition: years, board box, who counts as the protagonist, anchors,
                                      additions and removals with quotations
  sources/replay-<id>-wikidata.json   part of / participants / exact dates (tools/fetch_replay.py)
  sources/wikidata-events.json        the key-events snapshot: class, places, Wikipedia editions
  stories/en/*.json, translations/sl/*.json, <region>/<lane>/*.json, <region>/_polities.json
  Cliopatria v0.2.1 polygons and Natural Earth 1:50m land (and rivers, for the map only)

Writes replay/<id>.json:
  board.frames     the years at which any border in the box changes (Cliopatria's own sample years)
  board.cells      per H3 resolution, each land cell's owner as [frame index, polity index] changes (-1: no state
                   recorded); a cell belongs to the polity whose polygon contains its centre, the smallest polity
                   where polygons overlap, else the realm of a "(X)" composite row (drawn as a realm)
  board.polities   name, chart id, Slovenian name, whether it is the protagonist
  events           point events of the replay (battles, sieges, treaties, campaigns) in time order, with their exact
                   recorded date, place, war, participants and the stored Wikipedia text (en) and translation (sl)
  wars             the conflicts the events belong to, with years and their stored text
  minimap          the chart's own columns where the events happened: spans and event ids per column
Every editorial quotation is checked against the stored text or the Wikidata description; a missing one stops the build.
"""
import glob, json, math, os, re, sys
import geopandas as gpd
import h3
from shapely.geometry import box, mapping, shape, Point
from shapely.ops import unary_union

RES = [3, 4]
POINT_CLASSES = {"battle", "siege", "treaty", "invasion", "campaign", "coup"}
WAR_CLASSES = {"war", "rebellion"}


def load(p):
    return json.load(open(p))


def frac_year(d):
    """Position of a recorded date on the replay's time axis: year + share of the year elapsed. Year-only dates sit
    mid-year. BCE years are negative and still count upwards within a year (-216 + 0.58 lies before -215)."""
    y, m, dd, prec = d[0], d[1], d[2], d[3]
    if prec >= 11 and m and dd:
        doy = (m - 1) * 30.44 + dd
        return y + min(doy, 365) / 365.25
    if prec == 10 and m:
        return y + (m - 0.5) / 12
    return y + 0.5


def main(data_dir, rid, clio_path, land_path, rivers_path=None):
    cfg = load(f"{data_dir}/sources/replay-{rid}.json")
    snap = load(f"{data_dir}/sources/replay-{rid}-wikidata.json")
    items = snap["items"]
    evsnap = load(f"{data_dir}/sources/wikidata-events.json")["items"]
    lo, hi = cfg["range"]
    W, S, E, N = cfg["bbox"]
    bbox = box(W, S, E, N)
    rome = set(cfg["rome"])
    anchors = {a["id"] for a in cfg.get("anchors", [])}
    adds = {a["id"]: a for a in cfg.get("add", [])}
    drops = {a["id"]: a for a in cfg.get("drop", [])}

    # ---------------------------------------------------------------- stored texts
    regions = ["europe", "africa-middle-east", "asia", "americas", "oceania"]
    stories = {}
    for r in regions:
        p = f"{data_dir}/stories/en/{r}.json"
        if os.path.exists(p):
            for k, u in load(p)["units"].items():
                stories.setdefault(k, u)
    trans = {}
    for p in sorted(glob.glob(f"{data_dir}/translations/sl/*.json")):
        if os.path.basename(p).startswith("_"):
            continue
        b = load(p)
        for k, u in b["units"].items():
            trans.setdefault(k, {**u, "_batch": {x: b.get(x) for x in ("method", "translator", "translated", "reviewed")}})
    names_sl = load(f"{data_dir}/../src/i18n/names/sl.json")
    ev_sl = {**names_sl.get("events", {}), **names_sl.get("overrides", {}).get("events", {})}
    pol_sl = {**names_sl.get("polities", {}), **names_sl.get("overrides", {}).get("polities", {})}
    lane_sl = names_sl.get("lanes", {})

    def name_sl(q):
        """The chart's Slovenian name; else the Slovenian article's title without its bracketed disambiguation; else
        the Slovenian Wikidata label with a capital initial (labels are in dictionary form), as scripts/gen-names.mjs."""
        if q in ev_sl:
            return ev_sl[q]
        it = items.get(q, {})
        if it.get("slwiki"):
            return re.sub(r"\s*\([^)]*\)$", "", it["slwiki"])
        if it.get("labelSl"):
            return it["labelSl"][0].upper() + it["labelSl"][1:]
        return None

    def story_en(title):
        u = stories.get(title)
        if not u:
            return None
        return {k: u[k] for k in ("title", "url", "rev", "description", "paragraphs", "retrieved") if k in u}

    def story_sl(title):
        u = trans.get(title)
        if not u:
            return None
        b = u["_batch"]
        src = u.get("source", {})
        return {"paragraphs": u["paragraphs"], "title": u.get("title"), "method": b.get("method"),
                "reviewed": u.get("reviewed", b.get("reviewed")), "sourceRev": src.get("rev"),
                "sourceRetrieved": src.get("retrieved")}

    # ---------------------------------------------------------------- editorial checks
    for a in list(adds.values()) + list(drops.values()):
        it = items.get(a["id"]) or {}
        title = it.get("enwiki") or a["label"]
        basis = a.get("basis", "story")
        text = (it.get("description") or "") if basis == "wikidata-description" else " ".join((stories.get(title) or {}).get("paragraphs", []))
        if a["quote"] not in text:
            raise SystemExit(f"quotation for {a['id']} {a['label']} not found in its {basis}: {a['quote']!r}")

    # ---------------------------------------------------------------- which events are Rome's
    memo = {}

    def roman(q, seen=()):
        if q in memo:
            return memo[q]
        if q in drops:
            memo[q] = False
            return False
        it = items.get(q, {})
        r = q in adds or q in anchors or bool(rome & set(it.get("participants", {})))
        if not r:
            r = any(roman(p, seen + (q,)) for p in it.get("partOf", {}) if p not in seen)
        memo[q] = r
        return r

    def when(q):
        it = items.get(q, {})
        start = it.get("point") or it.get("start")
        end = it.get("end") or it.get("point") or it.get("start")
        if not start and q in evsnap and evsnap[q].get("start"):
            y, prec = evsnap[q]["start"]
            start = [y, 0, 0, prec, "?"]
            e2 = evsnap[q].get("end") or evsnap[q]["start"]
            end = [e2[0], 0, 0, e2[1], "?"]
        return start, end

    def place(q):
        e = evsnap.get(q, {})
        c = e.get("coord")
        by = "coordinates"
        if not c:
            for pl in e.get("places", []):
                if pl.get("coord"):
                    c, by = pl["coord"], "location"
                    break
        if c and not bbox.contains(Point(c)):
            c = None
        return (c, by) if c else (None, None)

    def cls(q):
        return evsnap.get(q, {}).get("class") or ("war" if items.get(q, {}).get("start") and items.get(q, {}).get("end") else "event")

    wars, events = {}, []
    for q, it in items.items():
        if not roman(q):
            continue
        start, end = when(q)
        if not start:
            continue
        if end[0] < lo or start[0] > hi:
            continue
        k = cls(q)
        c, by = place(q)
        is_war = k in WAR_CLASSES or (k == "campaign" and not c) or (q not in evsnap and q not in adds)
        if q in anchors:
            continue  # anchors select events; they are lists or eras, not wars to draw
        if is_war:
            wars[q] = {"id": q, "label": it["label"], "class": k, "start": start, "end": end,
                       "partOf": [p for p in it.get("partOf", {}) if roman(p)], "sitelinks": it.get("sitelinks", 0)}
        elif start[0] >= lo and start[0] <= hi:
            events.append({"id": q, "label": it["label"], "class": k, "date": start, "end": end if end != start else None,
                           "t": frac_year(start), "coord": c, "placedBy": by, "sitelinks": evsnap.get(q, {}).get("sitelinks", it.get("sitelinks", 0))})

    # A war that groups two or more wars of the replay is an umbrella (Punic Wars, Macedonian Wars); so is one that
    # outlasts the replay by far (Roman–Persian Wars, 54 BCE – 628). Umbrellas name a group on the minimap; an
    # event's war is the nearest dated conflict above it, the shortest one when several are equally near.
    span = lambda w: w["end"][0] - w["start"][0]
    for w in wars.values():
        w["umbrella"] = span(w) > 120 or sum(1 for x in wars.values() if w["id"] in x["partOf"]) >= 2

    def war_chain(q):
        out, frontier, seen = [], list(items.get(q, {}).get("partOf", {})), set()
        while frontier:
            level = sorted((p for p in frontier if p in wars and p not in seen), key=lambda p: (wars[p]["umbrella"], span(wars[p])))
            out += level
            seen |= set(frontier)
            frontier = [x for p in frontier for x in items.get(p, {}).get("partOf", {}) if x not in seen]
        return out

    for e in events:
        chain = war_chain(e["id"])
        e["war"] = next((w for w in chain if not wars[w]["umbrella"]), chain[0] if chain else None)
        e["wars"] = chain
    for w in wars.values():
        w["parent"] = next((p for p in war_chain(w["id"]) if p != w["id"]), None)

    # participants, names, stories
    def parts(q):
        return [{"id": p, "label": l, "rome": p in rome} for p, l in sorted(items.get(q, {}).get("participants", {}).items(), key=lambda x: (x[0] not in rome, x[1] or ""))]

    for e in events:
        it = items[e["id"]]
        title = it.get("enwiki")
        e.update({"wiki": title, "description": it.get("description"), "participants": parts(e["id"]),
                  "sl": name_sl(e["id"]), "story": story_en(title) if title else None,
                  "storySl": story_sl(title) if title else None})
        if e["id"] in adds:
            e["editorial"] = {k: adds[e["id"]][k] for k in ("why", "quote", "basis") if k in adds[e["id"]]}
    for w in wars.values():
        it = items[w["id"]]
        title = it.get("enwiki")
        w.update({"wiki": title, "description": it.get("description"), "participants": parts(w["id"]),
                  "sl": name_sl(w["id"]), "story": story_en(title) if title else None,
                  "storySl": story_sl(title) if title else None})
        if w["id"] in adds:
            w["editorial"] = {k: adds[w["id"]][k] for k in ("why", "quote", "basis") if k in adds[w["id"]]}
    # Where Wikidata records a day and the stored introduction names a different one, keep Wikidata's (the
    # replay's source for dates) and carry the text's, so the card can say the two disagree.
    MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
              "November", "December"]
    mre = "|".join(MONTHS)
    for e in events:
        y, m, dd, prec = e["date"][:4]
        if prec < 11 or not e.get("story"):
            continue
        txt = " ".join(e["story"]["paragraphs"])
        named = [(int(a), b) for a, b in re.findall(rf"\b(\d{{1,2}}) ({mre}) {-y} BC", txt)]
        named += [(int(b), a) for a, b in re.findall(rf"\b({mre}) (\d{{1,2}}),? {-y} BC", txt)]
        if named and (dd, MONTHS[m - 1]) not in named:
            day, month = named[0]
            e["textDate"] = [y, MONTHS.index(month) + 1, day, 11, "as written"]
    events.sort(key=lambda e: (e["t"], e["label"]))
    war_list = sorted(wars.values(), key=lambda w: (frac_year(w["start"]), -frac_year(w["end"])))
    print(f"{len(events)} events, {len(war_list)} wars; {sum(1 for e in events if e['coord'])} placed, "
          f"{sum(1 for e in events if e['story'])} with stored text, {sum(1 for e in events if e['storySl'])} translated")

    # ---------------------------------------------------------------- minimap: the chart's columns
    lane_events, lane_meta = {}, {}
    ev_ids = {e["id"] for e in events}
    for r in regions:
        ix_p = f"{data_dir}/{r}/_index.json"
        if not os.path.exists(ix_p):
            continue
        ix = load(ix_p)
        periods = [p for p in ix["periods"] if p["years"][0] <= hi and p["years"][1] >= lo]
        for order, lane in enumerate(ix["lanes"]):
            for p in periods:
                f = f"{data_dir}/{r}/{lane['id']}/{p['id']}.json"
                if not os.path.exists(f):
                    continue
                d = load(f)
                for ev in d.get("events", []):
                    if ev["id"] in ev_ids:
                        lane_events.setdefault(lane["id"], set()).add(ev["id"])
                        lane_meta[lane["id"]] = (r, order, lane["label"])
    chosen = sorted(lane_events, key=lambda l: -len(lane_events[l]))[:8]
    region_rank = {r: i for i, r in enumerate(regions)}
    chosen.sort(key=lambda l: (region_rank[lane_meta[l][0]], lane_meta[l][1]))
    minimap = []
    for l in chosen:
        r = lane_meta[l][0]
        ix = load(f"{data_dir}/{r}/_index.json")
        spans = {}
        for p in [p for p in ix["periods"] if p["years"][0] <= hi and p["years"][1] >= lo]:
            f = f"{data_dir}/{r}/{l}/{p['id']}.json"
            if os.path.exists(f):
                for s in load(f)["spans"]:
                    if s["to"] >= lo and s["from"] <= hi:
                        spans[(s["id"], s["from"])] = {k: s[k] for k in ("id", "name", "from", "to", "tier", "peak", "realm", "extent") if k in s}
        minimap.append({"lane": l, "label": lane_meta[l][2], "sl": lane_sl.get(l), "region": r,
                        "spans": sorted(spans.values(), key=lambda s: (s["from"], s["to"])),
                        "events": sorted(lane_events[l])})
    for e in events:
        e["lanes"] = [m["lane"] for m in minimap if e["id"] in m["events"]]
        # every chart column that shows the event, for the dateline (the minimap keeps only some of them)
        e["countries"] = [{"lane": l, "label": lane_meta[l][2], "sl": lane_sl.get(l)}
                          for l in sorted(lane_events, key=lambda l: (region_rank[lane_meta[l][0]], lane_meta[l][1]))
                          if e["id"] in lane_events[l]]
    print("minimap columns:", [(m["lane"], len(m["events"])) for m in minimap])

    # ---------------------------------------------------------------- the board
    registry = {}
    for r in regions:
        p = f"{data_dir}/{r}/_polities.json"
        if os.path.exists(p):
            for x in load(p)["polities"]:
                registry.setdefault(x["name"], []).append(x)

    def chart_id(name, a, b):
        for x in registry.get(name, []):
            ya, yb = x["years"]
            if ya <= b and yb >= a:
                return x["id"]
        return None

    clio = gpd.read_file(clio_path, bbox=(W, S, E, N))
    clio = clio[(clio.FromYear <= hi) & (clio.ToYear >= lo) & (clio.Type == "POLITY")]
    clio = clio[clio.geometry.notna()].copy()
    clio["geometry"] = clio.geometry.intersection(bbox)
    clio = clio[~clio.geometry.is_empty]
    print(f"{len(clio)} Cliopatria rows in the box and years")

    land = gpd.read_file(land_path, bbox=(W, S, E, N))
    land_geom = unary_union([g.intersection(bbox) for g in land.geometry])

    def cells_of(geom, res):
        out = set()
        geoms = getattr(geom, "geoms", [geom])
        for g in geoms:
            if g.geom_type == "Polygon" and g.area > 0:
                out |= set(h3.geo_to_cells(mapping(g), res))
        return out

    land_cells = {res: cells_of(land_geom, res) for res in RES}
    # Small islands lose their only cell to centre-containment at coarse resolutions; keep a cell for every
    # island that holds a placed event, so a battle on land never sits in the sea.
    for e in events:
        if e["coord"]:
            lon, lat = e["coord"]
            if land_geom.buffer(0.02).contains(Point(lon, lat)):
                for res in RES:
                    land_cells[res].add(h3.latlng_to_cell(lat, lon, res))

    # polities
    pols, pol_ix = [], {}
    rows = []
    for _, row in clio.iterrows():
        name = row.Name
        realm = name.startswith("(") and name.endswith(")")
        core = name[1:-1] if realm else name
        key = core
        if key not in pol_ix:
            cid = chart_id(core, int(row.FromYear), int(row.ToYear))
            pol_ix[key] = len(pols)
            pols.append({"name": core, "chartId": cid, "sl": pol_sl.get(cid) if cid else None,
                         "rome": core in ("Roman Republic", "Roman Empire", "Roman Kingdom"),
                         "wikipedia": row.Wikipedia or None})
        rows.append((int(row.FromYear), int(row.ToYear), pol_ix[key], realm, float(row.Area or 0), row.geometry))
    frames = sorted({lo} | {a for a, _, _, _, _, _ in rows if lo < a <= hi} | {b + 1 for _, b, _, _, _, _ in rows if lo < b + 1 <= hi})

    board = {"frames": frames, "res": RES, "cells": {}}
    for res in RES:
        row_cells = [cells_of(g, res) & land_cells[res] for *_, g in rows]
        # A polity smaller than a hexagon (Rome itself before 338 BCE, about 1,100 km²) holds no cell centre;
        # give it the land cell at its representative point, so a small state is never missing from the board.
        for k, (*_, g) in enumerate(rows):
            if not row_cells[k] and not g.is_empty:
                pt = g.representative_point()
                c = h3.latlng_to_cell(pt.y, pt.x, res)
                if c in land_cells[res]:
                    row_cells[k] = {c}
        changes = {c: [] for c in land_cells[res]}
        last = {}
        for fi, y in enumerate(frames):
            owner = {}
            for (a, b, pi, realm, area, _), cs in zip(rows, row_cells):
                if not (a <= y <= b):
                    continue
                rank = (1 if realm else 0, area)
                for c in cs:
                    cur = owner.get(c)
                    if cur is None or rank < cur[0]:
                        owner[c] = (rank, pi, realm)
            for c in land_cells[res]:
                o = owner.get(c)
                v = [o[1], 1] if o and o[2] else ([o[1]] if o else [-1])
                if last.get(c) != v:
                    changes[c].append([fi] + v)
                    last[c] = v
        board["cells"][str(res)] = dict(sorted(changes.items()))
        n = sum(len(v) for v in changes.values())
        print(f"res {res}: {len(land_cells[res])} land cells, {n} owner changes over {len(frames)} frames")
    board["polities"] = pols

    land_out = land_geom.simplify(0.03, preserve_topology=True)
    board["land"] = mapping(land_out)
    if rivers_path:
        rv = gpd.read_file(rivers_path, bbox=(W, S, E, N))
        rv = rv[rv.scalerank <= 5] if "scalerank" in rv.columns else rv
        board["rivers"] = [mapping(g.intersection(bbox).simplify(0.02)) for g in rv.geometry if not g.intersection(bbox).is_empty]

    out = {
        "id": rid,
        "title": cfg["title"],
        "range": cfg["range"],
        "bbox": cfg["bbox"],
        "built": snap["retrieved"],
        "board": board,
        "events": events,
        "wars": war_list,
        "minimap": minimap,
        "editorial": {"anchors": cfg.get("anchors", []), "add": cfg.get("add", []), "drop": cfg.get("drop", [])},
        "sources": [
            {"name": "Cliopatria v0.2.1", "by": "Seshat Global History Databank", "licence": "CC BY 4.0",
             "url": "https://github.com/Seshat-Global-History-Databank/cliopatria",
             "changes": "Polygons converted to H3 hexagons (resolutions 3 and 4) by cell centre, clipped to Natural Earth land."},
            {"name": "Natural Earth 1:50m", "licence": "Public domain", "url": "https://www.naturalearthdata.com/"},
            {"name": "Wikidata", "licence": "CC0 1.0", "retrieved": snap["retrieved"], "url": "https://www.wikidata.org/"},
            {"name": "Wikipedia (stored introductions, pinned revisions)", "licence": "CC BY-SA 4.0", "url": "https://en.wikipedia.org/"},
        ],
    }
    os.makedirs(f"{data_dir}/replay", exist_ok=True)
    path = f"{data_dir}/replay/{rid}.json"
    json.dump(out, open(path, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"{path}: {os.path.getsize(path) / 1024:.0f} KB")


if __name__ == "__main__":
    main(*sys.argv[1:])
