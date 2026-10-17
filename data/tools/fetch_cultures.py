"""Snapshot dated pre-Columbian cultures of the Americas from Wikipedia lists, with Wikidata facts.

Usage: python3 -I fetch_cultures.py <sources_dir>

Index (every linked culture with a date or a period):
  List of pre-Columbian cultures                    bullets: name, dates and places as written;
                                                    South America table: period rows by country
  List of archaeological periods (North America)    table rows: culture | dates
  Periodization of pre-Columbian Peru               table rows: period | dates | cultures
Each linked article is resolved to its Wikidata item through Wikipedia's page properties, then the
item's dates, coordinates, country and number of Wikipedia language editions are recorded.
A gazetteer of US states, Canadian provinces and territories, Mexican states and country names
(from Wikidata) lets the build read places such as "Ohio, Indiana" as countries.
Writes sources/wikipedia-cultures.json. The build decides what is shown.
"""
import sys, os, re, json, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wikipedia as wp  # noqa: E402
import wikitext as wt  # noqa: E402
import wikidata as wd  # noqa: E402

src = sys.argv[1]
LIST, NA, PERU = "List of pre-Columbian cultures", "List of archaeological periods (North America)", "Periodization of pre-Columbian Peru"
pages = {t: wp.page(t) for t in (LIST, NA, PERU)}
entries = []

DATE_RE = re.compile(
    r"(?:c\.\s*)?(?:(?:AD|BC|BCE|CE)\s*)?\d[\d,]*(?:/\d[\d,]*)?\s*(?:BCE|BC|AD|CE)?\s*[–—-]\s*"
    r"(?:(?:AD|BC|BCE|CE)\s*)?(?:\d[\d,]*(?:/\d[\d,]*)?|present)\s*(?:BCE|BC|AD|CE)?")


def split_date_place(text):
    """'1000–200 BC, Ohio, Indiana' -> ('1000–200 BC', 'Ohio, Indiana')"""
    m = DATE_RE.search(text)
    if not m:
        return None, text.strip(" ,;–-")
    place = (text[:m.start()] + " " + text[m.end():]).strip(" ,;–-.")
    return m.group(0).strip(), re.sub(r"\s+", " ", place).strip(" ,;")


# 1. bullets of the list (North America, Caribbean, Mesoamerica, Isthmo-Colombian area)
section, stack = None, []  # stack: (depth, cleaned text without dates) of enclosing bullets
for line in pages[LIST]["wikitext"].split("\n"):
    h = re.match(r"^==\s*([^=]+?)\s*==$", line)
    if h:
        section, stack = h.group(1), []
        continue
    if section not in ("Northern America", "Caribbean", "Mesoamerica", "Isthmo-Colombian area") or not line.startswith("*"):
        continue
    depth = len(line) - len(line.lstrip("*"))
    while stack and stack[-1][0] >= depth:
        stack.pop()
    parent = stack[-1][1] if stack else None
    stack.append((depth, split_date_place(wt.clean(line.lstrip("* ")))[1]))
    ls = wt.links(line)
    if not ls:
        continue
    target, shown = ls[0]
    after = line[line.index("]]") + 2:]
    dates, place = split_date_place(wt.clean(after))
    entries.append({"source": LIST, "section": section, "title": target, "name": shown,
                    "quote": wt.clean(line).lstrip("* ").strip(), "dates": dates, "place": place, "parent": parent})

# 2. the list's South America table: period rows, cultures grouped by country
for row in wt.table_rows(pages[LIST]["wikitext"]):
    if len(row) < 3 or not wt.parse_years(row[1]):
        continue
    period, pdates = wt.clean(row[0]), wt.clean(row[1])
    cell = row[2].replace("'''Peru, Chile'''", "'''Peru''', '''Chile'''")
    # a few country labels are not in bold ("; Colombia: [[Muisca Confederation]]")
    cell = re.sub(r";\s*([A-Z][a-z]+):", r"; '''\1''':", cell)
    # "'''Ecuador''': [[A]], [[B]]; '''Peru''': ..." ; a run of bold names before a colon is one group
    for m in re.finditer(r"((?:'''[^']+'''[\s,]*(?:and\s*)?)+):\s*(.*?)(?=(?:'''[^']+'''[\s,]*(?:and\s*)?)+:|$)", cell, flags=re.S):
        countries = [c.strip() for c in re.findall(r"'''([^']+)'''", m.group(1))]
        countries = [x.strip() for c in countries for x in re.split(r",|\band\b", c) if x.strip()]
        group = m.group(2)
        for lm in re.finditer(r"\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]([^\[;]*)", group):
            target, shown, tail = lm.group(1).strip(), (lm.group(2) or lm.group(1)).strip(), wt.clean(lm.group(3))
            dates, _ = split_date_place(tail)
            entries.append({"source": LIST, "section": "South America", "title": target, "name": shown,
                            "period": period, "periodDates": pdates, "countries": countries, "dates": dates,
                            "quote": f"{period} ({pdates}) – {', '.join(countries)}: {shown}" + (f" {tail.strip()}" if dates else "")})

# 3. North American table: rows ending in [culture] | dates
for row in wt.table_rows(pages[NA]["wikitext"]):
    if len(row) < 2:
        continue
    ls = wt.links(row[-2])
    dates_text = wt.clean(row[-1])
    if not ls or not dates_text:
        continue
    dates, place = split_date_place(dates_text)
    if not dates:
        continue
    target, shown = ls[0]
    entries.append({"source": NA, "section": "Table of archaeological periods", "title": target, "name": shown,
                    "dates": dates, "place": place or None, "quote": f"{wt.clean(row[-2])} | {dates_text}"})

# 4. Peru periodization: period rows, cultures without their own dates
for row in wt.table_rows(pages[PERU]["wikitext"]):
    if len(row) < 3 or not wt.parse_years(row[1]):
        continue
    period, pdates = wt.clean(row[0]), wt.clean(row[1])
    for target, shown in wt.links(row[2]):
        entries.append({"source": PERU, "section": "Periods", "title": target, "name": shown, "period": period,
                        "periodDates": pdates, "quote": f"{period} ({pdates}): {shown}"})

# Resolve every linked article to its Wikidata item (redirects followed)
titles = sorted({e["title"] for e in entries})
resolved = {}
for i in range(0, len(titles), 50):
    body = wp._get({"action": "query", "titles": "|".join(titles[i:i + 50]), "redirects": 1,
                    "prop": "pageprops", "ppprop": "wikibase_item"})
    q = body["query"]
    norm = {n["from"]: n["to"] for n in q.get("normalized", [])}
    redir = {r["from"]: r["to"] for r in q.get("redirects", [])}
    by_title = {p["title"]: p for p in q.get("pages", [])}
    for t in titles[i:i + 50]:
        final = redir.get(norm.get(t, t), norm.get(t, t))
        p = by_title.get(final, {})
        resolved[t] = {"article": final, "qid": p.get("pageprops", {}).get("wikibase_item"), "missing": p.get("missing", False)}

qids = sorted({r["qid"] for r in resolved.values() if r["qid"]})
ents = wd.entities(qids, props="labels|claims|sitelinks")
counts = wd.sitelink_counts(qids)
locs = wd.entities({wd.item_value(c) for e in ents.values() for c in wd.best(e, "P276")} - {None}, props="labels|claims")


def coord(e):
    return next((wd.coord_value(c) for c in wd.best(e, "P625") if wd.coord_value(c)), None)


items = {}
for q in qids:
    e = ents.get(q)
    if not e:
        continue
    s, en = wd.years_of(e)
    c = coord(e)
    loc_c = next((coord(locs[wd.item_value(x)]) for x in wd.best(e, "P276") if locs.get(wd.item_value(x) or "") and coord(locs[wd.item_value(x)])), None)
    items[q] = {"label": wd.label(e), "enwiki": wd.enwiki(e), "sitelinks": counts.get(q),
                "instanceOf": [wd.item_value(x) for x in wd.best(e, "P31") if wd.item_value(x)],
                "start": list(s) if s else None, "end": list(en) if en else None,
                "coord": [round(c[0], 4), round(c[1], 4)] if c else None,
                "locCoord": [round(loc_c[0], 4), round(loc_c[1], 4)] if loc_c else None,
                "countries": [wd.item_value(x) for x in wd.best(e, "P17") if wd.item_value(x)]}

# Lead paragraph of each culture's own article (used to place cultures that rows and Wikidata leave unplaced)
arts = sorted({r["article"] for r in resolved.values() if r["qid"] in items})
leads = {}
for i in range(0, len(arts), 20):
    body = wp._get({"action": "query", "titles": "|".join(arts[i:i + 20]), "prop": "extracts|revisions",
                    "exintro": 1, "explaintext": 1, "exlimit": 20, "rvprop": "ids"})
    for pg in body["query"].get("pages", []):
        if pg.get("extract"):
            rev = pg.get("revisions", [{}])[0].get("revid")
            leads[pg["title"]] = {"text": pg["extract"].split("\n")[0][:900], "revid": rev,
                                  "permalink": f"https://en.wikipedia.org/w/index.php?oldid={rev}" if rev else None}
for r in resolved.values():
    if r["qid"] in items and r["article"] in leads:
        items[r["qid"]]["lead"] = {"article": r["article"], **leads[r["article"]]}

# Gazetteer: first-level divisions of the three North American countries, with their country
gaz = {}
for cls, country in (("Q35657", "Q30"), ("Q11828004", "Q16"), ("Q9357527", "Q16"), ("Q15149663", "Q96")):
    for r in wd.sparql(f"SELECT ?i ?l WHERE {{ ?i wdt:P31 wd:{cls} ; rdfs:label ?l . FILTER(lang(?l)='en') }}"):
        gaz[r["l"]] = country
gaz["Mexico City"] = "Q96"

snap = {"retrieved": datetime.date.today().isoformat(),
        "sources": {t: {"revid": p["revid"], "url": p["url"], "permalink": p["permalink"], "license": "CC BY-SA 4.0"}
                    for t, p in pages.items()},
        "wikidata": {"source": "https://www.wikidata.org", "license": "CC0 1.0"},
        "entries": entries, "resolved": resolved, "items": items, "gazetteer": dict(sorted(gaz.items()))}
with open(os.path.join(src, "wikipedia-cultures.json"), "w") as f:
    json.dump(snap, f, ensure_ascii=False, indent=0)
    f.write("\n")
print(f"entries {len(entries)} titles {len(titles)} items {len(items)} gazetteer {len(gaz)}")
