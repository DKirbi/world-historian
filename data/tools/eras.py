"""The Eras level: era blocks per culture area, with the states or cultures that led each one.

Sourced areas (sources/eras-<region>.json + wikipedia-eras.json) give named periods for a set of
columns. Everywhere else, and after an area's last period (before its first one too, when the area
sets "binsBefore": its source starts late, like a country history that begins at a dynasty), the
region's period bins are used per lane group; for the Americas only from 1492 (binsFrom), because its earlier bins are Mesoamerican
names. A bin block is kept only where the data records some state or culture, so empty land stays
empty. Leaders are the records the source names for the period when the chart has them (Peru's
table lists cultures per period); otherwise they are computed from the chart's own spans: the most
lane-years, weighted by tier (3 / 2 / 1) and by Wikipedia language editions, listed while they reach
a quarter of the top weight.
"""
import re
from collections import defaultdict

TIER_WEIGHT = {1: 3, 2: 2, 3: 1}
FIRST_YEAR, LAST_YEAR = -3400, 2024
# A period bin squeezed in before an area's first period is dropped when it would be shorter than this
# (a bin ending 10 years before the first cited period would only be a sliver with a label)
MIN_EARLY_BIN_YEARS = 25


def _slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


_ARTICLE_STOP = {"period", "age", "era", "the", "of", "and", "in", "early", "late", "middle"}
_LINK = re.compile(r"\[\[([^\]|#]*)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]")


def _words(s):
    return {w for w in re.findall(r"[a-zà-ž]+", s.lower()) if w not in _ARTICLE_STOP}


def article_of(row_text, name):
    """The era's own Wikipedia article, read from the wikilink in its pinned row: {title, section?}.

    The first link is taken only when it is about the period: its title shares a significant word
    with the era's name. A list that links "Bronze Age" to "Nubia", or "Iron Age" to "Ghana Empire",
    points at an example, not at the period, so no article is given (the app then tells the story
    from the quoted row). A link to a section ("Woodland period#Early Woodland period (1000–1 BCE)")
    keeps the section heading.
    """
    m = _LINK.search(row_text or "")
    if not m:
        return None
    title, section = m.group(1).strip(), (m.group(2) or "").strip()
    if not title or title.lower().startswith(("file:", "image:", "category:")):
        return None
    # "Late Period" has no significant word of its own: then the title must start with the name
    # ("Late Period of Egypt")
    if not (_words(name) & (_words(title) | _words(section))) and not title.lower().startswith(name.lower()):
        return None
    out = {"title": title}
    if section:
        out["section"] = section
    return out


def _languages(rec):
    return (rec.get("wd") or {}).get("languages") or (rec.get("culture") or {}).get("languages") or 0


def leaders(lanes, a, b, per_lane, registry, named_qids=None, top=3):
    """Leading records of a block: those the source names for the period, if the chart has them,
    else the ones most present: lane-years x tier weight x (1 + Wikipedia languages / 50)."""
    w = defaultdict(float)
    for lid in lanes:
        for s in per_lane.get(lid, []):
            ov = min(b, s["to"]) - max(a, s["from"]) + 1
            if ov > 0:
                w[s["id"]] += ov * TIER_WEIGHT[s["tier"]] * (1 + _languages(registry[s["id"]]) / 50)
    if not w:
        return [], None
    if named_qids:
        named = set(named_qids)
        hit = [k for k in w if registry[k].get("wikidata") in named or (registry[k].get("wd") or {}).get("id") in named]
        if hit:
            hit.sort(key=lambda k: -w[k])
            return [{"id": k, "name": registry[k]["name"]} for k in hit[:top]], "source"
    best = max(w.values())
    ranked = sorted(w.items(), key=lambda kv: -kv[1])
    return [{"id": k, "name": registry[k]["name"]} for k, v in ranked[:top] if v >= best * 0.25], "data"


def build(region_id, cfg, lane_rows, per_lane, registry, eras_cfg=None, snap=None, bins_from=None, periodo=None):
    """lane_rows: [(lane id, group)] in chart order. Returns (areas, eras)."""
    order = [lid for lid, _ in lane_rows]
    present = set(order)
    areas, eras = [], []
    covered_until = {}  # lane -> last year covered by a sourced area
    covered_from = {}  # lane -> first year covered, for areas whose periodization starts late ("binsBefore")
    if eras_cfg and snap:
        for area in eras_cfg["areas"]:
            lanes = [l for l in area["lanes"] if l in present]
            if not lanes:
                continue
            pages = sorted({e["page"] for e in area["eras"]})
            before = bool(area.get("binsBefore"))
            areas.append({"id": area["id"], "label": area["label"], "lanes": lanes, "note": area["note"],
                          "sources": [{"page": p, **snap["pages"][p]} for p in pages]})
            for e in area["eras"]:
                rec = snap["eras"][f"{e['page']}|{e.get('row') or e.get('find')}"]
                a, b = max(rec["from"], FIRST_YEAR), min(rec["to"], LAST_YEAR)
                if b < FIRST_YEAR:
                    continue
                for l in lanes:
                    covered_until[l] = max(covered_until.get(l, -10_000), b)
                    if before:
                        covered_from[l] = min(covered_from.get(l, 10_000), a)
                # After contact the rows list Indigenous peoples living under colonial rule, not who
                # governed, so the leaders then come from the data.
                lead, basis = leaders(lanes, a, b, per_lane, registry, rec.get("namedQids") if a < 1492 else None)
                era = {"id": f"{area['id']}-{_slug(e['name'])}", "area": area["id"], "name": e["name"],
                       "from": a, "to": b, "lanes": lanes, "leaders": lead, "leadersBy": basis,
                       "cite": {"page": e["page"], "url": snap["pages"][e["page"]]["url"],
                                "permalink": snap["pages"][e["page"]]["permalink"], "quote": rec["quote"]}}
                if rec["from"] < FIRST_YEAR:
                    era["clippedFrom"] = rec["from"]
                if rec.get("approx"):
                    era["approx"] = True
                if rec.get("text"):
                    era["cite"]["text"] = rec["text"]
                art = article_of(e.get("row") or e.get("find"), e["name"])
                if art:
                    era["article"] = art
                other = (periodo or {}).get("eras", {}).get(
                    f"{region_id}|{area['id']}|{e['page']}|{e.get('row') or e.get('find')}")
                if other:
                    era["periodo"] = [{k: h[k] for k in ("label", "from", "to", "url")} |
                                      {"source": ", ".join(str(x) for x in (h["source"]["title"], h["source"]["year"]) if x)}
                                      for h in other[:3]]
                eras.append(era)

    # Period bins per lane group, where no sourced era covers the lane
    groups = defaultdict(list)
    for lid, g in lane_rows:
        groups[g].append(lid)
    for pid, plabel, pa, pb in cfg["periods"]:
        if bins_from is not None and pb < bins_from:
            continue
        for g, lids in groups.items():
            spans = defaultdict(list)  # (effective start, effective end) -> lanes
            for lid in lids:
                floor = bins_from if bins_from is not None else pa
                # after the lane's last sourced period (or everywhere, when it has none)
                start = max(pa, covered_until.get(lid, -10_000) + 1, floor)
                if start <= pb:
                    spans[(start, pb, False)].append(lid)
                # an area whose periodization starts late also keeps the bins before its first period
                if lid in covered_from:
                    lo, hi = max(pa, floor), min(pb, covered_from[lid] - 1)
                    if hi - lo + 1 >= MIN_EARLY_BIN_YEARS:
                        spans[(lo, hi, True)].append(lid)
            for (start, end, early), lanes in sorted(spans.items()):
                lead, basis = leaders(lanes, start, end, per_lane, registry)
                if not lead:
                    continue  # nothing recorded there in those years: leave it empty
                area_id = f"group-{g}"
                if not any(a["id"] == area_id for a in areas):
                    areas.append({"id": area_id, "label": None, "group": g, "lanes": lids, "bins": True})
                eras.append({"id": f"{area_id}-{pid}-{start}" + (f"-to-{end}" if early else ""), "area": area_id,
                             "name": plabel, "from": start, "to": end, "lanes": lanes, "leaders": lead,
                             "leadersBy": basis, "basis": "period-bin"})
    eras.sort(key=lambda e: (order.index(e["lanes"][0]), e["from"]))
    ids = [e["id"] for e in eras]
    assert len(ids) == len(set(ids)), f"duplicate era ids: {sorted({i for i in ids if ids.count(i) > 1})}"
    return areas, eras
