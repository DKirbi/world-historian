"""Cited layers on top of the Cliopatria lanes, read from the Wikidata snapshots in data/sources/.

  link_check   picks a trustworthy Wikidata item per polity (wdcheck.choose) and records its dates.
  supplement   adds states Cliopatria does not map (supplement.json + wikidata-supplement.json) as
               spans whose extent is unknown; placed in one lane by a cited override, present-day
               country (P3842), own coordinates (P625), capital's coordinates, country (P17) or
               capital's country, in that order.
  events       places key events (wikidata-events.json) in lanes by their own coordinates, else
               their locations (P276; one marker per lane, at most MAX_EVENT_LANES lanes), else their
               country (P17, same limit); the rest are left out and counted. Dates coarser than a
               decade are left out.

Nothing here hand-enters a date or a name: every value is copied from a snapshot or from a quote
recorded in supplement.json.
"""
import json, os
from collections import defaultdict, Counter
import shapely
from pyproj import Transformer
import wdcheck
import wikidata

FIRST_YEAR, LAST_YEAR = -3400, 2024
NEAR_KM = 30            # a coastal point within this distance of a lane counts as in it
COUNTRY_INSIDE = 0.9    # P17 maps to a lane only if the lane holds this share of the country
MAX_EVENT_LANES = 3     # an event placed only by country appears in at most this many lanes
EVENT_TYPES = ("battle", "siege", "invasion", "campaign", "war", "revolution", "rebellion", "coup", "treaty", "pandemic")

_to_eq = Transformer.from_crs(4326, 6933, always_xy=True)


def load_json(path):
    return json.load(open(path)) if os.path.exists(path) else None


class Placer:
    """Point-in-lane and country-to-lane lookups for one region's lanes (EPSG:6933)."""

    def __init__(self, lanes, cfg_lanes, ne_all):
        self.ids = list(lanes.lane)
        self.labels = list(lanes.label)
        self.groups = dict(zip(lanes.lane, lanes.group))
        self.geoms = list(lanes.geometry.values)
        self.tree = shapely.STRtree(self.geoms)
        ne_eq = ne_all.to_crs(6933)
        area = dict(zip(ne_all.ADMIN, shapely.area(shapely.make_valid(ne_eq.geometry.values)) / 1e6))
        qid = dict(zip(ne_all.ADMIN, ne_all.WIKIDATAID))
        self.modern = set(ne_all.WIKIDATAID.dropna())  # every Natural Earth unit, in any region
        km2 = dict(zip(lanes.lane, lanes.km2))
        self.by_country = defaultdict(list)
        for lid, admins, *_ in cfg_lanes:
            for a in admins:
                if isinstance(a, str) and qid.get(a):
                    # whole-country member only when the lane keeps nearly all of it (region box / clips)
                    inter = shapely.area(shapely.intersection(
                        self.geoms[self.ids.index(lid)],
                        shapely.make_valid(ne_eq.loc[ne_all.ADMIN == a].geometry.values[0]))) / 1e6
                    if area[a] and inter / area[a] >= COUNTRY_INSIDE:
                        self.by_country[qid[a]].append(lid)
        self.km2 = km2

    def at(self, lonlat):
        if not lonlat:
            return None
        x, y = _to_eq.transform(*lonlat)
        p = shapely.Point(x, y)
        hit = self.tree.query(p, predicate="within")
        if len(hit):
            return self.ids[int(hit[0])]
        near = self.tree.query_nearest(p, max_distance=NEAR_KM * 1000)
        return self.ids[int(near[0])] if len(near) else None

    def countries(self, qids):
        out = []
        for q in qids or []:
            for lid in self.by_country.get(q, []):
                if lid not in out:
                    out.append(lid)
        return out


def _date(v, edge):
    """Wikidata [year, precision] -> date record. A coarse date covers a range of years; a start
    takes its first year and an end its last, so the span covers every year the date can mean."""
    first, last = wikidata.year_range(*v)
    rec = {"year": first if edge == "start" else last, "prec": v[1], "source": "wikidata"}
    if v[1] < 9:  # decade (8), century (7) or coarser
        rec["approx"] = True
        rec["wd"] = list(v)
    return rec


# ----------------------------------------------------------------------------- link check
def link_check(registry, snap):
    """Adds rec['wd'] to each polity; returns review flags {eid: [flag, ...]}."""
    flags = defaultdict(list)
    counts = Counter()
    for eid, rec in registry.items():
        q, status = wdcheck.choose(rec, snap)
        counts[status] += 1
        src_q = rec.get("wikidata")
        if q:
            it = snap["items"][q]
            wd = {"id": it.get("id", q), "status": status}
            if it.get("label"): wd["label"] = it["label"]
            if it.get("sitelinks"): wd["languages"] = it["sitelinks"]
            if it.get("start"): wd["start"] = it["start"]
            if it.get("end"): wd["end"] = it["end"]
            if status == "corrected":
                wd["sourceId"] = src_q
                src = snap["items"].get(src_q or "", {})
                if src.get("label"): wd["sourceLabel"] = src["label"]
                flags[eid].append(f"wikidata-link-corrected:{src_q or 'none'}:{wd['id']}")
            rec["wd"] = wd
        elif status == "mismatch":
            src = snap["items"].get(src_q, {})
            wd = {"status": "mismatch", "sourceId": src_q}
            if src.get("label"): wd["sourceLabel"] = src["label"]
            if src.get("start"): wd["start"] = src["start"]
            if src.get("end"): wd["end"] = src["end"]
            rec["wd"] = wd
            flags[eid].append(f"wikidata-link-mismatch:{src_q}")
    return flags, counts


# ----------------------------------------------------------------------------- supplement
def _place_state(item, s, placer):
    if item.get("lane"):
        return item["lane"], {"by": "cited", **item["laneSource"]}
    for q in s.get("presentDay") or []:
        ls = placer.countries([q])
        if len(ls) == 1:
            return ls[0], {"by": "present-day", "wikidata": q}
    for key, by in (("coord", "coordinates"), ("capitalCoord", "capital")):
        lid = placer.at(s.get(key))
        if lid:
            return lid, {"by": by, "coord": s[key]}
    for key, by in (("country", "country"), ("capitalCountry", "capital-country")):
        ls = placer.countries(s.get(key))
        if len(ls) == 1:
            return ls[0], {"by": by, "wikidata": s[key][0]}
    return None, None


def supplement(sup, snap, placer, taken_ids, mapped_qids, slugify):
    """-> (per_lane spans, registry records, review items, skipped notes) for lanes of this region."""
    per_lane, registry, review, skipped = defaultdict(list), {}, [], []
    for item in sup["items"]:
        q = item["qid"]
        s = snap["items"][q]
        if q in mapped_qids:
            skipped.append(f"{q} {s['label']}: already in Cliopatria")
            continue
        lid, place = _place_state(item, s, placer)
        if lid is None:
            continue
        if lid not in placer.ids:  # cited lane belongs to another region
            continue
        start = ({"year": item["start"]["year"], "source": item["start"]["url"], "quote": item["start"]["quote"],
                  **({"approx": True} if item["start"].get("approx") else {})}
                 if "start" in item else _date(s["start"], "start") if s.get("start") else None)
        end = ({"year": item["end"]["year"], "source": item["end"]["url"], "quote": item["end"]["quote"],
                **({"approx": True} if item["end"].get("approx") else {})}
               if "end" in item else _date(s["end"], "end") if s.get("end") else None)
        assert start, f"{q}: no start date in Wikidata or supplement.json"
        a, b = start["year"], end["year"] if end else LAST_YEAR
        eid = slugify(s["label"])
        if eid in taken_ids:
            eid = f"{eid}-{q.lower()}"
        cited = "wikipedia" if ("start" in item or "end" in item) else "wikidata"
        span = {"id": eid, "from": max(a, FIRST_YEAR), "to": min(b, LAST_YEAR), "tier": 2,
                "extent": "unknown", "cited": cited}
        if start.get("approx") or (end or {}).get("approx"):
            span["approx"] = True
        per_lane[lid].append(span)
        rec = {"name": s["label"], "years": [a, b], "wikidata": q}
        if s.get("enwiki"): rec["wikipedia"] = s["enwiki"]
        rec["supplement"] = {"start": start, "end": end or {"ongoing": True}, "place": {"lane": lid, **place}}
        if item.get("dateNote"):
            rec["supplement"]["dateNote"] = item["dateNote"]
        rec["wd"] = {"id": q, "status": "ok", "label": s["label"], **({"languages": s["sitelinks"]} if s.get("sitelinks") else {}),
                     **({"start": s["start"]} if s.get("start") else {}), **({"end": s["end"]} if s.get("end") else {})}
        registry[eid] = rec
        fl = ["supplement:extent-unknown"]
        if cited == "wikipedia": fl.append("dates-from-wikipedia")
        if span.get("approx"): fl.append("dates-approximate")
        if place["by"] in ("capital", "country", "capital-country"): fl.append(f"placed-by:{place['by']}")
        review.append({"id": eid, "name": s["label"], "years": [a, b], "severity": "info", "flags": fl})
    return per_lane, registry, review, skipped


# ----------------------------------------------------------------------------- events
def events(snap, placer):
    """-> ({lane: [event, ...]}, Counter of outcomes)."""
    per_lane, stats = defaultdict(list), Counter()
    for q, e in snap["items"].items():
        if not e.get("label") or not e.get("start"):
            stats["no date or label"] += 1
            continue
        if e["start"][1] < 8:
            stats["date coarser than a decade"] += 1
            continue
        y = wikidata.year_range(*e["start"])[0]
        to = wikidata.year_range(*e["end"])[1] if e.get("end") and e["end"][1] >= 8 else None
        if not FIRST_YEAR <= y <= LAST_YEAR:
            stats["outside chart years"] += 1
            continue
        if to is not None and to < y:
            stats["end before start"] += 1
            continue
        # A location counts when it has coordinates or lies in a modern country; one known only by a
        # former state (a district of British India) falls back to the event's own country.
        places = [pl for pl in e.get("places") or [] if pl.get("coord") or set(pl["countries"]) & placer.modern]
        if e.get("coord"):
            lid = placer.at(e["coord"])
            lanes, by = ([lid] if lid else []), "coordinates"
        elif places:
            # The limit counts countries over all places, not lanes of this region, so an event is
            # either shown in every region it touches or in none.
            if len({c for pl in places for c in pl["countries"]}) > MAX_EVENT_LANES:
                stats["too many places"] += 1
                continue
            lanes, by = [], "location"
            for pl in places:
                found = [placer.at(pl["coord"])] if pl.get("coord") else placer.countries(pl["countries"])
                lanes += [x for x in found if x and x not in lanes]
        else:
            if len(e.get("countries") or []) > MAX_EVENT_LANES:
                stats["too many countries"] += 1
                continue
            if not e.get("countries"):
                stats["no place"] += 1
                continue
            lanes, by = placer.countries(e["countries"]), "country"
        if not lanes:
            stats["not in this region"] += 1
            continue
        stats["placed"] += 1
        rec = {"id": q, "name": e["label"], "year": y, "type": e["class"], "links": e["sitelinks"], "by": by}
        if e["start"][1] < 9: rec["prec"] = e["start"][1]
        if to is not None and to != y: rec["to"] = to
        if e.get("enwiki"): rec["wiki"] = e["enwiki"]
        for lid in lanes:
            per_lane[lid].append(rec)
    for v in per_lane.values():
        v.sort(key=lambda r: (r["year"], -r["links"]))
    return per_lane, stats
