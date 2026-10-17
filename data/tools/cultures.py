"""Dated cultures from Wikipedia's culture lists (sources/wikipedia-cultures.json), as chart records.

Rules live in sources/cultures-<region>.json and are explained in its "note". Every record keeps
the exact source rows that list it (page, revision link, quote) so the app can cite them.
"""
import re
from collections import defaultdict
import wikidata
import wikitext as wt

FIRST_YEAR, LAST_YEAR = -3400, 2024
SOURCE_RANK = {"List of pre-Columbian cultures": 0, "List of archaeological periods (North America)": 1}


def _gazetteer(snap, placer, ne_all):
    """name -> ('lanes', [lane ids]) or ('countries', [qids]), longest names first."""
    gaz = {name: ("countries", [q]) for name, q in snap["gazetteer"].items()}
    for col in ("ADMIN", "NAME", "NAME_LONG"):
        if col in ne_all:
            for n, q in zip(ne_all[col], ne_all.WIKIDATAID):
                if isinstance(n, str) and isinstance(q, str):
                    gaz.setdefault(n, ("countries", [q]))
    for lid, label in zip(placer.ids, placer.labels):
        gaz.setdefault(label, ("lanes", [lid]))
    return dict(sorted(gaz.items(), key=lambda kv: -len(kv[0])))


def _lanes_in_text(text, gaz, aliases, placer):
    if not text:
        return [], []
    masked, lanes, hits = " " + text + " ", [], []
    for name in list(aliases) + list(gaz):
        pat = r"(?<![\w-])" + re.escape(name) + r"(?![\w-])"
        if not re.search(pat, masked):
            continue
        masked = re.sub(pat, " " * len(name), masked)
        if name in aliases:
            found = [x for x in aliases[name]["lanes"] if x in placer.ids]
        else:
            kind, vals = gaz[name]
            found = vals if kind == "lanes" else placer.countries(vals)
        hits.append(name)
        lanes += [x for x in found if x not in lanes]
    return lanes, hits


def build(snap, rules, placer, ne_all, skip_qids, taken_ids, slugify):
    """-> (per_lane spans, registry, review, report)"""
    items, resolved = snap["items"], snap["resolved"]
    pages = snap["sources"]
    gaz = _gazetteer(snap, placer, ne_all)
    aliases = rules.get("aliases", {})
    keep = set(rules["keepClasses"])
    words = re.compile(r"\b(" + "|".join(rules["cultureWords"]) + r")\b", re.I)

    by_q = defaultdict(list)
    for e in snap["entries"]:
        q = resolved.get(e["title"], {}).get("qid")
        if q:
            by_q[q].append(e)

    per_lane, registry, review = defaultdict(list), {}, []
    report = {"kept": 0, "notCulture": [], "undated": [], "outside": [], "living": [], "onChart": [], "excluded": [],
              "unplaced": [], "otherRegion": 0}
    for q, es in sorted(by_q.items()):
        it = items.get(q)
        if not it:
            continue
        article = resolved[es[0]["title"]]["article"]
        if q in rules["exclude"]:
            report["excluded"].append(f"{article}: {rules['exclude'][q]}")
            continue
        if q in skip_qids:
            report["onChart"].append(article)
            continue
        classed = bool(set(it["instanceOf"]) & keep)
        not_culture_words = re.compile(r"\b(period|era|stage|horizon|site|religious|district|canton|river|caves?)\b", re.I)
        culturey = lambda n: bool(words.search(n)) and not not_culture_words.search(n)
        dated_rows = sorted([e for e in es if e["source"] in SOURCE_RANK and e.get("dates")],
                            key=lambda e: SOURCE_RANK[e["source"]])
        row_names = [e["name"] for e in dated_rows]
        is_culture = (classed or any(culturey(n) for n in row_names)
                      or (not it["instanceOf"] and dated_rows and not any(not_culture_words.search(n) for n in row_names + [article]))
                      or (not it["instanceOf"] and culturey(article)))
        # The article title names the record, unless the list linked through a redirect or to an article
        # about something else (a site): then the list's own wording ("Malabar culture", "Lamar culture").
        name = re.sub(r"\s*\((?:culture|archaeology|people|peruvian culture)\)$", "", article)
        redirected = any(resolved[e["title"]]["article"] != e["title"] for e in dated_rows[:1])
        if (redirected or not classed) and any(culturey(n) for n in row_names):
            name = re.sub(r"^[–-]\s*", "", next(n for n in row_names if culturey(n))).strip()
        if not is_culture:
            report["notCulture"].append(name)
            continue

        # Dates: the row's own, else Wikidata's, else the periods it is listed under
        explicit = []
        for e in sorted(es, key=lambda e: SOURCE_RANK.get(e["source"], 9)):
            if e.get("dates") and wt.parse_years(e["dates"]):
                explicit.append(e)
        living = any(re.search(r"present", e.get("dates") or "", re.I) for e in es)
        if living:
            report["living"].append(name)
            continue
        dating = None
        if explicit:
            best_src = explicit[0]["source"]
            rows = [e for e in explicit if e["source"] == best_src]  # several rows of one list: their union
            ys = [wt.parse_years(e["dates"]) for e in rows]
            a, b, approx = min(y[0] for y in ys), max(y[1] for y in ys), any(y[2] for y in ys)
            if a != b:
                dating = {"by": "list", "from": a, "to": b, "approx": approx, "rows": rows}
        if not dating and it.get("start") and it.get("end"):
            a = wikidata.year_range(*it["start"])[0]
            b = wikidata.year_range(*it["end"])[1]
            if a < b:
                dating = {"by": "wikidata", "from": a, "to": b, "approx": it["start"][1] < 9 or it["end"][1] < 9,
                          "wd": [it["start"], it["end"]]}
        if not dating:
            per = [e for e in es if e.get("periodDates")]
            peru = [e for e in per if e["source"] == "Periodization of pre-Columbian Peru"]
            per = peru or per
            ys = [wt.parse_years(e["periodDates"]) for e in per]
            ys = [y for y in ys if y]
            if ys:
                dating = {"by": "period", "from": min(y[0] for y in ys), "to": max(y[1] for y in ys), "approx": True,
                          "rows": per}
        if not dating:
            report["undated"].append(name)
            continue
        a, b = dating["from"], dating["to"]
        if b < FIRST_YEAR or a > rules["lastStart"]:
            report["outside"].append(name)
            continue

        # Column: the row's place, its parent line, the source's country, Wikidata, a default per source
        lanes, place = [], None
        for e in sorted(es, key=lambda e: SOURCE_RANK.get(e["source"], 9)):
            for field in ("place", "parent"):
                ls, hits = _lanes_in_text(e.get(field), gaz, aliases, placer)
                if ls or hits:
                    lanes, place = ls, {"by": "list", "text": e.get(field), "matched": hits, "page": e["source"]}
                    break
            if place:
                break
        if not place:
            countries = sorted({c for e in es for c in e.get("countries") or []})
            if countries:
                ls = [x for c in countries for x in _lanes_in_text(c, gaz, aliases, placer)[0]]
                lanes, place = list(dict.fromkeys(ls)), {"by": "list-country", "text": ", ".join(countries)}
        if not place and (it.get("coord") or it.get("locCoord")):
            key = "coord" if it.get("coord") else "locCoord"
            lid = placer.at(it[key])
            lanes, place = ([lid] if lid else []), {"by": "coordinates", "coord": it[key]}
        if not place and it.get("countries"):
            lanes, place = placer.countries(it["countries"]), {"by": "country", "wikidata": it["countries"]}
        if not place and it.get("lead"):
            ls, hits = _lanes_in_text(it["lead"]["text"], gaz, aliases, placer)
            if hits:
                first = it["lead"]["text"]
                lanes, place = ls, {"by": "article", "matched": hits, "article": it["lead"]["article"],
                                    "permalink": it["lead"].get("permalink"),
                                    "quote": next((sen.strip() for sen in re.split(r"(?<=\.)\s", first)
                                                   if any(h in sen for h in hits)), first[:300])}
        if not place:
            d = next((rules["defaultLane"][e["source"]] for e in es if e["source"] in rules.get("defaultLane", {})), None)
            if d:
                lanes, place = [d], {"by": "source-page", "page": next(e["source"] for e in es if e["source"] in rules["defaultLane"])}
        if not place:
            report["unplaced"].append(name)
            continue
        lanes = [x for x in lanes if x in placer.ids][: rules["maxLanes"]]
        if not lanes:
            report["otherRegion"] += 1
            continue

        eid = slugify(name)
        if eid in taken_ids or eid in registry:
            eid = f"{eid}-{q.lower()}"
        tier = 2 if (it.get("sitelinks") or 0) >= rules["tier2Languages"] else 3
        span = {"id": eid, "from": max(a, FIRST_YEAR), "to": min(b, LAST_YEAR), "tier": tier, "extent": "unknown",
                "kind": "culture", "cited": "wikidata" if dating["by"] == "wikidata" else "wikipedia"}
        if dating["approx"]:
            span["approx"] = True
        for lid in lanes:
            per_lane[lid].append(dict(span))

        def cite(e):
            return {"page": e["source"], "url": pages[e["source"]]["url"], "permalink": pages[e["source"]]["permalink"],
                    "quote": e["quote"]}
        rec = {"name": name, "years": [a, b], "wikidata": q}
        if it.get("enwiki"):
            rec["wikipedia"] = it["enwiki"]
        rec["culture"] = {
            "dates": {"by": dating["by"], "approx": dating["approx"],
                      **({"cite": [cite(e) for e in dating["rows"]]} if "rows" in dating else {}),
                      **({"wd": dating["wd"]} if "wd" in dating else {})},
            "place": {"lanes": lanes, **{k: v for k, v in place.items() if k != "page"},
                      **({"cite": cite(next(e for e in es if e["source"] == place["page"]))} if place.get("page") and place["by"] == "list" else {})},
            "listed": [cite(e) for e in es],
            "languages": it.get("sitelinks"),
        }
        rec["wd"] = {"id": q, "status": "ok", "label": it.get("label"), **({"languages": it["sitelinks"]} if it.get("sitelinks") else {}),
                     **({"start": it["start"]} if it.get("start") else {}), **({"end": it["end"]} if it.get("end") else {})}
        registry[eid] = rec
        flags = [f"culture:dated-by-{dating['by']}"]
        if place["by"] not in ("list", "list-country", "article"):
            flags.append(f"placed-by:{place['by']}")
        review.append({"id": eid, "name": name, "years": [a, b], "severity": "info", "flags": flags})
        report["kept"] += 1
    return per_lane, registry, review, report
