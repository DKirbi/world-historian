"""Snapshot the Wikipedia rows behind the culture-area eras.

Usage: python3 -I fetch_eras.py <sources_dir>

Reads every sources/eras-<region>.json, fetches each cited article once (with its revision id) and
records, for every era, the text that dates it:
  row  mode: the table row whose first cell reads `row`; keeps its date cell and its culture cell
  find mode: the exact wikitext `find`, which must occur in the revision
Writes sources/wikipedia-eras.json. The build reads only this snapshot.

Incremental: pages and eras already in the snapshot keep their pinned revision and text; only new
ones are fetched. Pass --refresh to fetch everything again at today's revisions.
An era with "named": false does not take the cultures linked near its text (a heading over
prose, a list row): its leaders then come from the data.
"""
import sys, os, re, json, glob, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wikipedia as wp  # noqa: E402
import wikitext as wt  # noqa: E402

src = sys.argv[1]
refresh = "--refresh" in sys.argv
old_path = os.path.join(src, "wikipedia-eras.json")
old = json.load(open(old_path)) if os.path.exists(old_path) and not refresh else {"pages": {}, "eras": {}}
pages, eras, used = {}, dict(old["eras"]), set()
kept_pages = dict(old["pages"])
for cfg_path in sorted(glob.glob(os.path.join(src, "eras-*.json"))):
    cfg = json.load(open(cfg_path))
    for area in cfg["areas"]:
        for e in area["eras"]:
            title = e["page"]
            key = f"{title}|{e.get('row') or e.get('find')}"
            used.add(key)
            if key in eras:
                continue  # already pinned
            if title not in pages:
                pages[title] = wp.page(title, revid=kept_pages[title]["revid"]) if title in kept_pages else wp.page(title)
            p = pages[title]
            if "row" in e:
                cells = wt.find_row(p["wikitext"], e["row"])
                rec = {"label": wt.clean(cells[0]), "dates": wt.clean(cells[1]),
                       "text": wt.clean(cells[2]) if len(cells) > 2 else None}
                rec["quote"] = " | ".join(x for x in (rec["label"], rec["dates"]) if x)
                named = wt.links(cells[2]) if len(cells) > 2 else []
            else:
                text = p["wikitext"]
                assert e["find"] in text, f"{title}: text not found: {e['find']}"
                q = wt.clean(e["find"]).lstrip("* ").strip()
                rec = {"label": None, "dates": q, "text": None, "quote": q}
                # cultures the source lists under this period: following table rows up to the next
                # spanning cell, or the deeper bullets under a bullet
                i = text.index(e["find"]) + len(e["find"])
                if e["find"].lstrip().startswith("*"):
                    depth = len(e["find"].lstrip()) - len(e["find"].lstrip().lstrip("*"))
                    block = []
                    for line in text[i:].split("\n")[1:]:
                        d = len(line) - len(line.lstrip("*"))
                        if not line.startswith("*") or d <= depth:
                            break
                        block.append(line)
                    block = "\n".join(block)
                else:
                    nxt = text.find("rowspan", i)
                    block = text[i: nxt if nxt > 0 else i + 3000]
                named = wt.links(block)
            if e.get("named") is False:
                named = []
            rec["named"] = [t for t, _ in named]
            # a name with a dash of its own ("Azuchi–Momoyama period (1568–1600)"): the years are the last bracket
            bracket = re.search(r"\(([^()]*\d[^()]*)\)\s*$", rec["dates"])
            y = wt.parse_years(bracket.group(1) if bracket else rec["dates"])
            assert y, f"{key}: no years in {rec['dates']!r}"
            assert e["name"].split(" (")[0].lower() in (rec["label"] or rec["quote"]).lower() or \
                e["name"].split("/")[0].lower() in rec["quote"].lower(), f"{key}: name {e['name']!r} not in {rec}"
            rec.update({"page": title, "from": y[0], "to": y[1], "approx": y[2]})
            eras[key] = rec

# eras that no config row asks for any more (a corrected `find`) do not stay in the snapshot
eras = {k: v for k, v in eras.items() if k in used}
kept_pages = {t: v for t, v in kept_pages.items() if any(r["page"] == t for r in eras.values())}

# Wikidata items of the named cultures (redirects followed), so the build can match them to chart records
titles = sorted({t for r in eras.values() if "namedQids" not in r for t in r["named"]})
qid_of = {}
for i in range(0, len(titles), 50):
    body = wp._get({"action": "query", "titles": "|".join(titles[i:i + 50]), "redirects": 1,
                    "prop": "pageprops", "ppprop": "wikibase_item"})
    qq = body["query"]
    norm = {n["from"]: n["to"] for n in qq.get("normalized", [])}
    redir = {r["from"]: r["to"] for r in qq.get("redirects", [])}
    by_title = {pg["title"]: pg for pg in qq.get("pages", [])}
    for t in titles[i:i + 50]:
        final = redir.get(norm.get(t, t), norm.get(t, t))
        qid = by_title.get(final, {}).get("pageprops", {}).get("wikibase_item")
        if qid:
            qid_of[t] = qid
for r in eras.values():
    if "namedQids" not in r:
        r["namedQids"] = list(dict.fromkeys(qid_of[t] for t in r["named"] if t in qid_of))

snap = {"retrieved": datetime.date.today().isoformat(), "source": "https://en.wikipedia.org", "license": "CC BY-SA 4.0",
        "pages": dict(sorted({**kept_pages, **{t: {"revid": p["revid"], "url": p["url"], "permalink": p["permalink"]}
                             for t, p in pages.items()}}.items())),
        "eras": eras}
with open(os.path.join(src, "wikipedia-eras.json"), "w") as f:
    json.dump(snap, f, ensure_ascii=False, indent=1)
    f.write("\n")
print(f"pages {len(pages)} eras {len(eras)}")
for k, v in eras.items():
    print(f"  {v['from']:>6} {v['to']:>6} {'~' if v['approx'] else ' '} {k[:60]} named={len(v['named'])}/{len(v['namedQids'])}")
