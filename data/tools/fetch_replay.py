"""Wikidata snapshot for a replay (data/sources/replay-<id>.json defines it).

    python3 fetch_replay.py <data_dir> <replay_id>

Reads the key-events snapshot (sources/wikidata-events.json) for the replay's years and adds what the build needs and
the chart never stored: what each event is part of (P361, followed upwards to the top conflict), who took part (P710),
and its exact recorded dates (P585 / P580 / P582 as Wikidata states them: year, month, day, precision, calendar).
Writes sources/replay-<id>-wikidata.json. Which events belong to the replay is decided by build_replay.py, so the
snapshot keeps every candidate and every ancestor.

Requests: SPARQL in batches of 150 items for the relations, then Special:EntityData per item for the dates and
descriptions (the wbgetentities API rate-limits this host). Both go through wikidata._get: cached in $WD_CACHE,
retried with backoff, polite user agent.
"""
import json, os, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(__file__))
import wikidata as wd

wd.UA = "WorldHistoryTimeline/0.2 (https://github.com/DKirbi/world-historian; replay snapshot) python-urllib"


def qid(uri):
    return uri.rsplit("/", 1)[1]


def relations(ids):
    """{qid: {'P361': {qid: label}, 'P710': {qid: label}, 'sitelinks': n}} for the given items."""
    out = {q: {"P361": {}, "P710": {}, "sitelinks": 0} for q in ids}
    ids = sorted(ids)
    for i in range(0, len(ids), 150):
        vals = " ".join("wd:" + q for q in ids[i:i + 150])
        for r in wd.sparql(f"""SELECT ?i ?prop ?o ?ol WHERE {{ VALUES ?i {{ {vals} }}
              VALUES ?prop {{ wdt:P361 wdt:P710 }} ?i ?prop ?o .
              OPTIONAL {{ ?o rdfs:label ?ol FILTER(lang(?ol) = "en") }} }}"""):
            prop = "P361" if r["prop"].endswith("P361") else "P710"
            out[qid(r["i"])][prop][qid(r["o"])] = r.get("ol")
        for r in wd.sparql(f"SELECT ?i ?n WHERE {{ VALUES ?i {{ {vals} }} ?i wikibase:sitelinks ?n . }}"):
            out[qid(r["i"])]["sitelinks"] = int(r["n"])
    return out


def entity(q):
    body = wd._get(f"https://www.wikidata.org/wiki/Special:EntityData/{q}.json")
    ents = body.get("entities", {})
    return ents.get(q) or next(iter(ents.values()), None)


CALENDARS = {"http://www.wikidata.org/entity/Q1985786": "julian", "http://www.wikidata.org/entity/Q1985727": "gregorian"}


def date_of(e, pid):
    """The statement as recorded: [year, month, day, precision, calendar]; BCE years negative (-0216 = 216 BCE)."""
    for c in wd.best(e, pid):
        v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
        if not v or "time" not in v:
            continue
        t = v["time"]
        sign = -1 if t.startswith("-") else 1
        y, m, d = t[1:].split("T")[0].split("-")
        return [sign * int(y), int(m), int(d), int(v.get("precision", 9)), CALENDARS.get(v.get("calendarmodel"), "?")]
    return None


def main(data_dir, rid):
    cfg = json.load(open(os.path.join(data_dir, "sources", f"replay-{rid}.json")))
    events = json.load(open(os.path.join(data_dir, "sources", "wikidata-events.json")))
    lo, hi = cfg["range"]
    cand = set()
    for q, e in events["items"].items():
        if not e.get("start"):
            continue
        s = e["start"][0]
        end = (e.get("end") or e["start"])[0]
        if s <= hi and end >= lo:
            cand.add(q)
    cand |= {a["id"] for a in cfg.get("add", [])}
    print(f"{len(cand)} candidate events in {lo}..{hi}")

    rel = relations(cand)
    frontier = {p for d in rel.values() for p in d["P361"]} - set(rel)
    while frontier:
        got = relations(frontier)
        rel.update(got)
        frontier = {p for d in got.values() for p in d["P361"]} - set(rel)
    print(f"{len(rel)} items with ancestors")

    items = {}
    for n, q in enumerate(sorted(rel)):
        e = entity(q)
        if not e:
            continue
        items[q] = {
            "label": wd.label(e),
            "labelSl": e.get("labels", {}).get("sl", {}).get("value"),
            "description": e.get("descriptions", {}).get("en", {}).get("value"),
            "enwiki": wd.enwiki(e),
            "slwiki": e.get("sitelinks", {}).get("slwiki", {}).get("title"),
            "sitelinks": rel[q]["sitelinks"],
            "point": date_of(e, "P585"),
            "start": date_of(e, "P580"),
            "end": date_of(e, "P582"),
            "partOf": rel[q]["P361"],
            "participants": rel[q]["P710"],
            "candidate": q in cand,
        }
        if (n + 1) % 50 == 0:
            print(f"  {n + 1} / {len(rel)}")
    out = {
        "retrieved": time.strftime("%Y-%m-%d"),
        "source": "Wikidata (query.wikidata.org SPARQL; Special:EntityData)",
        "license": "CC0 1.0",
        "replay": rid,
        "fields": "labelSl / slwiki = Slovenian label and Wikipedia title, for names the chart has none for; "
                  "point/start/end = [year, month, day, precision, calendar] as recorded (P585/P580/P582; negative years "
                  "are BCE, precision 11 = day, 10 = month, 9 = year); partOf = P361 {qid: label}; participants = P710 "
                  "{qid: label}; sitelinks = Wikipedia language editions; candidate = in the key-events snapshot for "
                  "the replay's years (else an ancestor or an editorial addition)",
        "items": items,
    }
    path = os.path.join(data_dir, "sources", f"replay-{rid}-wikidata.json")
    json.dump(out, open(path, "w"), ensure_ascii=False, indent=1, sort_keys=True)
    print(f"{path}: {len(items)} items")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
