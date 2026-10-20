"""Snapshot the names of the chart's records in another language, for the app's translations.

Usage: python3 -I fetch_names.py <data_dir> <lang>      (e.g. fetch_names.py data sl)

For every polity (by its English Wikipedia title), key event (by its English title) and era with an
article of its own, reads the title of the article in <lang> from the English article's language
links; where there is none, the Wikidata label in <lang> (polities and events, by their Wikidata
item). Writes <data_dir>/sources/names-<lang>.json:

  {"retrieved": "...", "lang": "sl", "polities": {"<id>": {"title": "...", "label": "..."}},
   "events": {"<qid>": {...}}, "eras": {"<era id>": {"title": "..."}}}

The app's names file (src/i18n/names/<lang>.json) is generated from this snapshot by
scripts/gen-names.mjs, so a rebuild never calls the live services. Titles are CC BY-SA 4.0 (Wikipedia),
labels CC0 (Wikidata).
"""
import sys, os, json, glob, datetime, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wikipedia as wp  # noqa: E402
import wikidata as wd  # noqa: E402

data, lang = sys.argv[1], sys.argv[2]
regions = ["europe", "americas", "oceania", "africa-middle-east", "asia"]

polities, events, eras = {}, {}, {}
for r in regions:
    for p in json.load(open(os.path.join(data, r, "_polities.json")))["polities"]:
        qid = (p.get("wd") or {}).get("id") or (None if p.get("wd") else p.get("wikidata"))
        polities[p["id"]] = {"en": p.get("wikipedia"), "qid": qid}
    for f in glob.glob(os.path.join(data, r, "*", "*.json")):
        for e in json.load(open(f)).get("events", []):
            events[e["id"]] = {"en": e.get("wiki"), "qid": e["id"]}
    for e in json.load(open(os.path.join(data, r, "_eras.json")))["eras"]:
        if e.get("article") and not e["article"].get("section"):
            eras[e["id"]] = {"en": e["article"]["title"], "qid": None}


def langlinks(titles):
    """{english title: title in `lang`} through the English articles' language links (redirects followed)."""
    out = {}
    titles = sorted({t for t in titles if t})
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        params = {"action": "query", "titles": "|".join(chunk), "prop": "langlinks", "lllang": lang,
                  "lllimit": "max", "redirects": 1}
        while True:
            body = wp._get(params)
            q = body.get("query", {})
            back = {}
            for n in q.get("normalized", []) + q.get("redirects", []):
                back[n["to"]] = back.get(n["from"], n["from"])
            for page in q.get("pages", []):
                for ll in page.get("langlinks", []):
                    src = page["title"]
                    while src in back and src not in chunk:
                        src = back[src]
                    out[src] = ll["title"]
                    out[page["title"]] = ll["title"]
            if "continue" not in body:
                break
            params = {**params, **body["continue"]}
        print(f"  langlinks {min(i + 50, len(titles))}/{len(titles)}", flush=True)
    return out


titles = langlinks([v["en"] for v in list(polities.values()) + list(events.values()) + list(eras.values())])
qids = sorted({v["qid"] for v in list(polities.values()) + list(events.values()) if v["qid"]})
labels = {q: e.get("labels", {}).get(lang, {}).get("value") for q, e in wd.entities(qids, props="labels", languages=lang).items()}


def entry(v):
    out = {}
    if v["en"] and titles.get(v["en"]):
        out["title"] = titles[v["en"]]
    if v["qid"] and labels.get(v["qid"]):
        out["label"] = labels[v["qid"]]
    return out


snap = {
    "retrieved": datetime.date.today().isoformat(),
    "lang": lang,
    "source": f"English Wikipedia language links to {lang}.wikipedia.org (CC BY-SA 4.0); Wikidata labels (CC0)",
    "polities": {k: e for k, v in sorted(polities.items()) if (e := entry(v))},
    "events": {k: e for k, v in sorted(events.items()) if (e := entry(v))},
    "eras": {k: e for k, v in sorted(eras.items()) if (e := entry(v))},
}
path = os.path.join(data, "sources", f"names-{lang}.json")
json.dump(snap, open(path, "w"), ensure_ascii=False, indent=1, sort_keys=False)
print(f"{path}: polities {len(snap['polities'])}/{len(polities)}, events {len(snap['events'])}/{len(events)}, eras {len(snap['eras'])}/{len(eras)}")
