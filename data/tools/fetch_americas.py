"""Snapshot the Americas era chronologies and the dated pre-Columbian cultures from Wikipedia.

Usage: python3 -I fetch_americas.py <out_dir>   (writes americas-eras.json and americas-cultures.json)

Every era and culture keeps the article title, the revision id that was read and the table row or
list line it came from, so each value can be checked at
https://en.wikipedia.org/w/index.php?oldid=<revid>.

Editorial choices (all in this file):
  * which chronology serves which culture area, and which columns each area covers (AREAS);
  * eras end at European contact; after it the chart shows the colonial and national states;
  * the culture index is "List of pre-Columbian cultures", plus three Arctic cultures from
    "List of archaeological periods (North America)", because the list has no Arctic section;
  * list entries that are periods rather than cultures, living peoples ("…–present") and entries
    without a start date are skipped and reported;
  * place names in the list are mapped to columns with PLACE_LANES.
"""
import sys, os, re, json, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wikipedia as wp
import wikidata as wd

FIRST, LAST = -3400, 2024

# ------------------------------------------------------------------------------------------ dates
DASH = r"\s*(?:–|—|-|−|&ndash;|&mdash;|{{snd}}|{{ndash}}|to)\s*"


def _num(s):
    return int(s.replace(",", ""))


def parse_range(text):
    """'2000 BCE–250 CE' -> (-2000, 250, approx). Handles BC/BCE/AD/CE on either side, 'c.',
    '1800/1500 BC' (widest reading), 'present' and 'European contact'. None when no start."""
    t = re.sub(r"{{(?:nowrap|nobreak)\|(.*?)}}", r"\1", text)
    t = re.sub(r"{{circa\|([^}]*)}}", r"c. \1", t, flags=re.I)
    t = re.sub(r"{{(?:nbsp)}}|&nbsp;", " ", t).replace("<br />", " ").replace("<br/>", " ")
    approx = bool(re.search(r"\bc\.|\?|/|circa", t))
    t = re.sub(r"\bc\.\s*", "", t)
    m = re.search(
        r"(?P<a>(?:AD|BC|BCE|CE)?\s*[\d,]+(?:/[\d,]+)?)\s*(?P<ea>BCE|BC|CE|AD)?" + DASH +
        r"(?P<b>(?:AD|BC|BCE|CE)?\s*[\d,]+(?:/[\d,]+)?|present|European contact)\s*(?P<eb>BCE|BC|CE|AD)?", t)
    if not m:
        return None

    def side(v, era_after):
        v = v.strip()
        era = era_after
        pre = re.match(r"(AD|BC|BCE|CE)\s*(.*)", v)
        if pre:
            era, v = pre.group(1), pre.group(2)
        nums = [_num(x) for x in v.split("/")]
        return nums, era

    a_nums, ea = side(m.group("a"), m.group("ea"))
    if m.group("b") in ("present", "European contact"):
        b_nums, eb = None, None
    else:
        b_nums, eb = side(m.group("b"), m.group("eb"))
    bce = lambda e: e in ("BC", "BCE")
    # an era written once at the end applies to both sides ("1000–200 BC"); one written only on
    # the start side ("800 AD–1730") applies to the end too
    if ea is None:
        ea = eb
    if eb is None and b_nums is not None:
        eb = ea if bce(ea) else None
    a = -max(a_nums) if bce(ea) else min(a_nums)
    if b_nums is None:
        b = LAST if m.group("b") == "present" else 1500
        approx = approx or m.group("b") == "European contact"
    else:
        b = -min(b_nums) if bce(eb) else max(b_nums)
    return a, b, approx


# ------------------------------------------------------------------------------------------ areas
AREAS = [
    {"id": "eastern-north-america", "label": "Eastern North America", "lanes": ["canada", "united-states"],
     "area": ("Indigenous peoples of the Eastern Woodlands", "which is now part of the Eastern United States and Canada")},
    {"id": "southwest", "label": "American Southwest", "lanes": ["united-states"],
     "area": ("List of archaeological periods (North America)", "in Southwest<br />and by [[Pecos Classification]]")},
    {"id": "mesoamerica", "label": "Mesoamerica",
     "lanes": ["mexico", "guatemala", "belize", "el-salvador", "honduras", "nicaragua", "costa-rica"],
     "area": ("Mesoamerica", "comprising the modern-day lands of central and southern [[Mexico]], all of [[Belize]], [[Guatemala]], [[El Salvador]], western [[Honduras]], and the [[:es: Gran Nicoya|Greater Nicoya]] region of [[Nicaragua]] and [[Costa Rica]]")},
    {"id": "caribbean", "label": "Caribbean",
     "lanes": ["bahamas", "cuba", "jamaica", "haiti", "dominican-republic", "puerto-rico", "lesser-antilles", "trinidad-and-tobago"],
     "area": ("List of pre-Columbian cultures", "==Caribbean==")},
    {"id": "andes", "label": "Andes", "lanes": ["colombia", "ecuador", "peru", "bolivia", "chile", "argentina"],
     "area": ("Andean civilizations", "They stretched down the spine of the [[Andes]] for {{cvt|4000|km|mile}} from southern [[Colombia]], to [[Ecuador]] and [[Peru]], including the deserts of coastal Peru, to north [[Chile]] and northwest [[Argentina]].")},
]

# Which rows of which table become the eras of each area (leaf periods, before European contact).
ERA_ROWS = {
    "mesoamerica": ("Mesoamerican chronology", "table", ["Archaic", "Early Preclassic", "Middle Preclassic", "Late Preclassic",
                                                         "Early Classic", "Late Classic", "Early Postclassic", "Late Postclassic"]),
    "andes": ("Periodization of pre-Columbian Peru", "table", ["Period V", "Period VI", "Initial Period", "Early Horizon",
                                                               "Early Intermediate", "Middle Horizon", "Late Intermediate", "Late Horizon"]),
    "eastern-north-america": ("List of archaeological periods (North America)", "cells",
                              ["Middle Archaic", "Late Archaic", "Early Woodland Period", "Middle Woodland Period",
                               "Late Woodland Period", "Mississippian culture"]),
    "southwest": ("List of archaeological periods (North America)", "rows",
                  ["Archaic–Early Basketmaker period", "Early Basketmaker II period", "Late Basketmaker II period",
                   "Basketmaker III period", "Pueblo I period", "Pueblo II period", "Pueblo III period", "Pueblo IV period"]),
    "caribbean": ("List of pre-Columbian cultures", "bullets", ["Lithic/Archaic Age", "Early Ceramic Age", "Late Ceramic Age"]),
}


def strip(w):
    """Wikitext -> plain text (links, refs, bold, templates)."""
    w = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", w, flags=re.S)
    w = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", w)
    w = re.sub(r"{{(?:nowrap|nobreak|Lang\|es)\|(.*?)}}", r"\1", w)
    w = re.sub(r"{{nbsp}}|&nbsp;", " ", w)
    w = re.sub(r"'''?|<br\s*/?>", " ", w)
    return re.sub(r"\s+", " ", w).strip()


def table_rows(wikitext, start=0):
    """Rows of the first wikitable at/after `start`: list of (raw row text, [cells])."""
    i = wikitext.index("{|", start)
    j = wikitext.index("\n|}", i)
    rows = []
    for raw in re.split(r"\n\|-[^\n]*", wikitext[i:j]):
        cells = [c.strip() for c in re.split(r"\n\||\|\||<td>", "\n" + raw.split("\n", 1)[-1] if raw.startswith("{|") else "\n" + raw)
                 if c.strip() and not c.strip().startswith("!") and not c.strip().startswith("+")]
        rows.append((raw.strip(), cells))
    return rows


def eras_for(area_id, pages):
    title, kind, names = ERA_ROWS[area_id]
    p = pages[title]
    text = p["wikitext"]
    out = []
    for name in names:
        quote, rng = None, None
        if kind == "table":  # rows: name | dates | cultures
            for raw, cells in table_rows(text):
                if len(cells) >= 2 and strip(cells[0]).split(" (")[0].strip() == name:
                    quote, rng, cult = raw, parse_range(strip(cells[1])), strip(cells[2]) if len(cells) > 2 else ""
                    break
        elif kind == "cells":  # "[[...|Early Woodland Period]]<br />1000 BCE – 1 CE" inside a row-spanning cell
            m = re.search(r"\[\[[^\]]*?\|?" + re.escape(name) + r"\]\]<br />([^|\n]*?)(?:<br />|\n)", text) or \
                re.search(r"\[\[" + re.escape(name) + r"\]\]<br />([^|\n]*?)(?:<br />|\n)", text)
            if m:
                quote, rng, cult = m.group(0).strip(), parse_range(m.group(1)), ""
        elif kind == "rows":  # "| [[Pueblo I period]]\n| 750 CE – 900 CE"
            m = re.search(r"\[\[" + re.escape(name) + r"(?:\|[^\]]*)?\]\][^\n]*\n\|\s*([^\n]*)", text)
            if m:
                quote, rng, cult = m.group(0).strip(), parse_range(m.group(1)), ""
        elif kind == "bullets":  # "* Lithic/Archaic Age, c. 5500—200 BC"
            m = re.search(r"^\*\s*" + re.escape(name) + r",\s*([^<\n]*)", text, flags=re.M)
            if m:
                quote, rng, cult = m.group(0).strip(), parse_range(m.group(1)), ""
        if not rng:
            raise SystemExit(f"{area_id}: era {name!r} not found in {title}")
        a, b, approx = rng
        rec = {"id": re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"), "label": name, "from": a, "to": b,
               "source": {"title": p["title"], "revid": p["revid"], "quote": strip(quote)[:400]}}
        if approx: rec["approx"] = True
        if cult: rec["cultures"] = cult[:300]
        out.append(rec)
    return out


# ------------------------------------------------------------------------------------------ cultures
US = ["Utah", "Arizona", "Colorado", "New Mexico", "Nevada", "Idaho", "Ohio", "Indiana", "West Virginia", "Kentucky",
      "Pennsylvania", "New York", "Louisiana", "Mississippi", "Arkansas", "Oklahoma", "Texas", "Florida", "Iowa",
      "Michigan", "Minnesota", "Missouri", "Alabama", "Georgia", "Alaska", "United States", "Lower Mississippi Valley"]
MX = ["Veracruz", "Tabasco", "Oaxaca", "Guerrero", "Michoacán", "Michoacan", "Jalisco", "Colima", "Nayarit", "Hidalgo",
      "San Luis Potosí", "Tamaulipas", "Chiapas", "Campeche", "Yucatán", "Mexico", "Mexican"]
PLACE_LANES = {**{k: ["united-states"] for k in US}, **{k: ["mexico"] for k in MX},
               "Canada": ["canada"], "Yukon": ["canada"], "Greenland": ["greenland"],
               "Belize": ["belize"], "Guatemala": ["guatemala"], "El Salvador": ["el-salvador"], "Honduras": ["honduras"],
               "Nicaragua": ["nicaragua"], "Costa Rica": ["costa-rica"], "Panama": ["panama"],
               "Cuba": ["cuba"], "Puerto Rico": ["puerto-rico"], "Vieques": ["puerto-rico"], "Bahamas": ["bahamas"],
               "Greater Antilles": ["cuba", "jamaica", "haiti", "dominican-republic", "puerto-rico"],
               "Lesser Antilles": ["lesser-antilles"], "Virgin Islands": ["lesser-antilles"], "Trinidad": ["trinidad-and-tobago"],
               "Colombia": ["colombia"], "Venezuela": ["venezuela"], "Ecuador": ["ecuador"], "Peru": ["peru"],
               "Bolivia": ["bolivia"], "Chile": ["chile"], "Argentina": ["argentina"], "Brazil": ["brazil"]}
# List entries that name a period or stage, not a culture; they are eras or containers.
NOT_CULTURES = {"Paleo-Indians", "Archaic period in the Americas", "Woodland period", "Formative Period",
                "Upper Mississippian culture", "Greater Antilles", "Lesser Antilles", "Ortoiroid people"}


def lanes_in(text):
    """Columns named by a place phrase, in a stable order."""
    out = []
    for name, ls in sorted(PLACE_LANES.items(), key=lambda kv: -len(kv[0])):
        if re.search(r"(?<![A-Za-z])" + re.escape(name) + r"(?![a-z])", text):
            text = text.replace(name, " ")
            out += [l for l in ls if l not in out]
    return out


def bullet_cultures(page, section, area):
    """Bulleted list entries '*** [[Link|Name]], 1000–200 BC, Place' with inheritance of dates and
    places from parent bullets (Caribbean entries carry their island group on the parent line)."""
    text = page["wikitext"]
    i = text.index(section)
    j = text.index("\n==", i + len(section))
    stack, out = [], []
    for line in text[i:j].split("\n"):
        m = re.match(r"^(\*+)\s*(.*)$", line)
        if not m:
            continue
        depth, body = len(m.group(1)), m.group(2)
        link = re.match(r"\[\[([^|\]]+)(?:\|([^\]]+))?\]\]", body)
        rest = strip(body)
        rng = parse_range(re.sub(r"\[\[[^\]]*\]\]", "", body))
        places = lanes_in(re.sub(r"\[\[([^|\]]*\|)?", "", body).replace("]]", ""))
        while stack and stack[-1]["depth"] >= depth:
            stack.pop()
        node = {"depth": depth, "title": link.group(1).strip() if link else None, "name": (link.group(2) or link.group(1)).strip() if link else rest.split(",")[0],
                "range": rng, "places": places, "line": rest}
        inherited_rng = next((s["range"] for s in reversed(stack) if s["range"]), None)
        inherited_places = next((s["places"] for s in reversed(stack) if s["places"]), [])
        stack.append(node)
        out.append({**node, "inheritedRange": inherited_rng, "inheritedPlaces": inherited_places,
                    "parentLines": [s["line"] for s in stack[:-1]], "area": area})
    return out


def table_cultures(page):
    """South America table: period | dates | '''Country''': [[culture]], ... (one row per period)."""
    out = []
    for raw, cells in table_rows(page["wikitext"], page["wikitext"].index("==South America==")):
        if len(cells) < 3:
            continue
        period, dates, cell = strip(cells[0]), cells[1], cells[2]
        rng = parse_range(strip(dates))
        if not rng:
            continue
        cell = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", cell, flags=re.S)
        cell = re.sub(r"\(the \[\[[^\]]*\]\]\)", "", cell)
        for seg in re.split(r"(?='''[^']+''')", cell):
            head = re.match(r"'''([^']+)'''\s*(?:,\s*and\s*'''([^']+)''')?", seg)
            if not head:
                continue
            countries = lanes_in((head.group(1) or "") + " " + (head.group(2) or ""))
            for lm in re.finditer(r"\[\[([^|\]]+)(?:\|([^\]]+))?\]\]\s*(\([^)]*\)|,\s*[\d,]+\s*–\s*[\d,]+\s*BC)?", seg):
                title, name, own = lm.group(1).strip(), (lm.group(2) or lm.group(1)).strip(), lm.group(3)
                if title in ("Upano River", "Cumbe Mayo", "aqueduct (water supply)"):
                    continue
                own_rng = parse_range(own) if own else None
                out.append({"title": title, "name": name, "period": period, "periodRange": rng, "ownRange": own_rng,
                            "places": countries, "line": f"{period} | {strip(dates)} | {strip(head.group(0))} {name}" + (f" {own.strip()}" if own else "")})
    return out


def main(out_dir):
    titles = sorted({t for t, _, _ in ERA_ROWS.values()} | {a["area"][0] for a in AREAS} | {"List of pre-Columbian cultures"})
    pages = {t: wp.page(t) for t in titles}
    for t, p in pages.items():
        print(f"  {t}: revid {p['revid']}")
    today = datetime.date.today().isoformat()

    # eras
    areas = []
    for a in AREAS:
        t, quote = a["area"]
        assert quote in pages[t]["wikitext"], f"area quote not found: {a['id']}"
        rec = {"id": a["id"], "label": a["label"], "lanes": a["lanes"],
               "source": {"title": pages[t]["title"], "revid": pages[t]["revid"], "quote": strip(quote)}}
        rec["eras"] = eras_for(a["id"], pages)
        areas.append(rec)
    eras_doc = {"retrieved": today, "source": "https://en.wikipedia.org", "license": "CC BY-SA 4.0",
                "note": "Eras per culture area, before European contact, read from the cited revision of each article. "
                        "Years: negative = BCE. 'approx' marks dates given as c., '?' or a choice ('1800/1500').",
                "areas": areas}
    with open(os.path.join(out_dir, "americas-eras.json"), "w") as f:
        json.dump(eras_doc, f, ensure_ascii=False, indent=1)
        f.write("\n")
    for a in areas:
        print(a["id"], [(e["label"], e["from"], e["to"]) for e in a["eras"]])

    # cultures
    lst = pages["List of pre-Columbian cultures"]
    raw = []
    for section, area in (("==Northern America==", "north-america"), ("==Caribbean==", "caribbean"),
                          ("== Mesoamerica ==", "mesoamerica"), ("== Isthmo-Colombian area ==", "isthmo-colombian")):
        raw += bullet_cultures(lst, section, area)
    skipped, cultures = [], {}
    for r in raw:
        title = r["title"]
        if not title or title in NOT_CULTURES:
            continue
        rng = r["range"] or (r["inheritedRange"] if r["area"] == "caribbean" else None)
        places = r["places"] or r["inheritedPlaces"]
        if "present" in r["line"]:
            skipped.append((r["name"], "living people (dates run to the present)")); continue
        if not rng:
            skipped.append((r["name"], "no start date in the list")); continue
        if not places:
            skipped.append((r["name"], "no place in the list")); continue
        a, b, approx = rng
        if b < FIRST:
            skipped.append((r["name"], "ends before 3400 BCE")); continue
        quote = r["line"] if r["range"] else " / ".join(r["parentLines"] + [r["line"]])
        cultures.setdefault(title, {"title": title, "name": r["name"], "from": a, "to": b, "approx": approx,
                                    "lanes": places, "source": {"title": lst["title"], "revid": lst["revid"], "quote": quote[:300]}})
    for r in table_cultures(lst):
        rng = r["ownRange"] or r["periodRange"]
        a, b, approx = rng
        if not r["ownRange"]:
            approx = True  # dated only by the period it is listed under
        if b < FIRST:
            continue
        c = cultures.get(r["title"])
        if c and c["source"]["quote"].split(" | ")[0] in ("Late Horizon", "Late Intermediate", "Middle Horizon", "Early Intermediate",
                                                            "Early Horizon", "Initial Period", "Period VI", "Period V", "Period IV",
                                                            "Period III", "Period II", "Period I") and not r["ownRange"]:
            # listed under several periods: the span runs from the earliest to the latest
            c["from"], c["to"] = min(c["from"], a), max(c["to"], b)
            c["lanes"] += [l for l in r["places"] if l not in c["lanes"]]
            c["source"]["quote"] = (c["source"]["quote"] + " ; " + r["line"])[:600]
            c["periods"].append(r["period"])
        elif not c:
            cultures[r["title"]] = {"title": r["title"], "name": r["name"], "from": a, "to": b, "approx": approx,
                                    "lanes": list(r["places"]), "periods": [r["period"]],
                                    "source": {"title": lst["title"], "revid": lst["revid"], "quote": r["line"][:300]}}

    # Arctic: the list has no Arctic section; these rows come from the North American periods table
    na = pages["List of archaeological periods (North America)"]
    arctic = {"Dorset culture": ["canada", "greenland"], "Thule people": ["canada", "greenland", "united-states"],
              "Arctic Small Tool tradition": ["canada", "greenland", "united-states"]}
    for title, ls in arctic.items():
        m = re.search(r"\[\[" + re.escape(title) + r"\]\][^\n]*\n\|\s*([^\n]*)", na["wikitext"])
        a, b, approx = parse_range(m.group(1))
        cultures[title] = {"title": title, "name": title.replace(" people", ""), "from": a, "to": b, "approx": approx,
                           "lanes": ls, "lanesNote": "North American Arctic: Alaska (United States), Northern Canada and Greenland",
                           "source": {"title": na["title"], "revid": na["revid"], "quote": strip(m.group(0))[:300]}}

    # Wikidata ids and language-edition counts (importance, used for the zoom level)
    ents = wd.by_enwiki_titles(list(cultures))
    resolved = {}
    for t, e in ents.items():
        resolved[t] = e["id"]
    # titles that redirect resolve under their target title: match case-insensitively on both
    lower = {k.lower(): v for k, v in resolved.items()}
    for t, c in cultures.items():
        q = resolved.get(t) or lower.get(t.lower())
        if not q:
            # follow the Wikipedia redirect to the article title
            q = next((e["id"] for tt, e in wd.by_enwiki_titles([t]).items()), None)
        c["wikidata"] = q
    counts = wd.sitelink_counts([c["wikidata"] for c in cultures.values() if c["wikidata"]])
    for c in cultures.values():
        c["sitelinks"] = counts.get(c["wikidata"], 0) if c["wikidata"] else 0
    doc = {"retrieved": today, "source": "https://en.wikipedia.org", "license": "CC BY-SA 4.0 (quotes); Wikidata CC0",
           "note": "Dated cultures from 'List of pre-Columbian cultures' (and three Arctic cultures from the North American "
                   "periods table). Dates are the list's; a culture listed only under South American periods takes the "
                   "range of those periods (approx). Columns come from the place names in the list. sitelinks = number of "
                   "Wikipedia language editions of the culture's Wikidata item.",
           "skipped": [{"name": n, "reason": r} for n, r in skipped],
           "cultures": sorted(cultures.values(), key=lambda c: (c["from"], c["name"]))}
    with open(os.path.join(out_dir, "americas-cultures.json"), "w") as f:
        f.write(json.dumps({k: v for k, v in doc.items() if k != "cultures"}, ensure_ascii=False)[:-1] + ',\n "cultures":[\n' +
                ",\n".join("  " + json.dumps(c, ensure_ascii=False) for c in doc["cultures"]) + "\n]}\n")
    print("cultures", len(cultures), "skipped", len(skipped))
    for n, r in skipped:
        print("   skip", n, "-", r)


if __name__ == "__main__":
    for c in ["parse_range"]:
        pass
    main(sys.argv[1])
