"""List what a language still shows untranslated, flagged L10N-LATER for the end of the localisation.

Usage (from the repository root):
  python3 -I scripts/l10n-later.py <lang>

Writes data/translations/<lang>/_later.json. Every entry carries the tag "L10N-LATER", so one search
(`grep -rn L10N-LATER`, or the project search) finds the list, this script, the code that falls back to
English and the docs. Run it again after each localisation step: entries that have been dealt with drop
out on their own.

What it flags:
  no-source       worklist units with no English text to translate (no article, another Wikipedia only)
  own-article     worklist units that have since got an article in <lang>; the drawer reads it live, so
                  they need the <lang> snapshot of the stored-stories track, not a translation
  wrong-article   translated units whose record links to the wrong English article (a disambiguation page,
                  the modern place, a person); retranslate once the link is fixed
  section-eras    eras read by a section heading that only resembles their name (sectionLike); they have no
                  translation key, so the drawer shows the English section in every language
  wikidata-only   records linked by Wikidata alone; no English title, so nothing in the worklist
  chart-labels    events and states with no <lang> name in the glossary; the chart and the drawer's lists
                  show their English name. `seed` is the headline of the record's translated summary, when
                  there is one, ready to become the glossary name
"""
import datetime
import glob
import json
import os
import re
import sys

TAG = "L10N-LATER"
REGIONS = ["oceania", "americas", "africa-middle-east", "europe", "asia"]

if len(sys.argv) != 2:
    sys.exit(__doc__)
lang = sys.argv[1]
base = os.path.join("data", "translations", lang)

# Why a worklist unit has no translation. Anything not listed here is reported as "not translated yet".
NO_SOURCE = {
    "Late Archaic": "No English article; the drawer tells the era's story from the data.",
    "Dutch Cape Coast": "No English article.",
    "Uryankhay Republic": "The English article the record links to does not exist.",
    "Cambodia Middle Period": "No English article.",
    "id.wikipedia.org/wiki/Kesultanan_Sambaliung": "Linked to the Indonesian Wikipedia only.",
    "Battle of Konotop (2022)": "The English article no longer exists.",
}
OWN_ARTICLE = {
    "Mississippian culture", "Early Dynastic Period (Egypt)", "Western Liang (555–587)",
    "Minsk II", "Sulla's first civil war",
}
# Records linked to the wrong English article, found while translating (see data/README.md, Changes).
WRONG_ARTICLE = {
    "Battle of Ivankiv": "Redirects to the northern front of the 2022 invasion.",
    "Battle of Okhtyrka": "Redirects to the northern front of the 2022 invasion.",
    "Battle of Trostianets": "Redirects to the northern front of the 2022 invasion.",
    "Battle of Vasylkiv": "Redirects to a section of the northern front article; the fetch tool can now take that section.",
    "Battle of Kreminna": "Redirects to the Battle of Donbas (2022).",
    "Portuguese Africa": "Disambiguation page.",
    "Zululand": "Disambiguation page.",
    "Omanis": "The article on the people, for the Omani slave coast.",
    "Kastamonu": "The modern city.",
    "Berga": "The modern town, for the medieval county.",
    "Pallars Jussà": "The modern comarca, for the medieval county.",
    "Pallars Sobirà": "The modern comarca, for the medieval county.",
    "Strathclyde": "The modern council area, for the medieval kingdom.",
    "Earl of Desmond": "The title, for the earldom.",
    "Angevin": "Disambiguation page.",
    "Angles": "Disambiguation page.",
    "Bretons": "The article on the people, for the Breton kingdoms.",
    "Frisia": "The modern region, for the Frisian kingdom.",
    "Basina of Thuringia": "A person, for the Kingdom of Thuringia.",
    "Free City of Frankfurt": "The earlier imperial city.",
    "Duchy of Wrocław": "Redirects to the Duchy of Silesia.",
}
# Notes written while translating that say the same (Slovenian wording of the drafts).
WRONG_NOTE = re.compile(r"razločitven|povezan (pa )?je s člankom|je povezan s člankom", re.I)


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def polities(region):
    out = {}
    with open(os.path.join("data", region, "_polities.json"), encoding="utf-8") as f:
        for line in f:
            line = line.strip().rstrip(",")
            if line.startswith('{"id"'):
                o = json.loads(line)
                out[o["id"]] = o
    return out


units = {}
for region in REGIONS:
    path = os.path.join(base, f"{region}.json")
    if os.path.exists(path):
        for title, unit in load(path)["units"].items():
            units[title] = (region, unit)

later = {"no-source": [], "own-article": [], "wrong-article": [], "section-eras": [],
         "wikidata-only": [], "chart-labels": []}

worklist = load(os.path.join(base, "_worklist.json"))["units"]
for w in worklist:
    key = f"{w['title']}#{w['section']}" if w.get("section") else w["title"]
    if key in units:
        continue
    entry = {"tag": TAG, "title": w["title"], "kind": w["kind"], "regions": w["regions"], "records": w["records"]}
    if w["title"] in OWN_ARTICLE:
        later["own-article"].append({**entry, "why": f"Has a {lang} article now; store it with the {lang} snapshot."})
    else:
        later["no-source"].append({**entry, "why": NO_SOURCE.get(w["title"], "Not translated yet.")})

for title, (region, unit) in sorted(units.items()):
    why = WRONG_ARTICLE.get(title)
    if not why:
        note = next((n for n in unit.get("notes", []) if WRONG_NOTE.search(n)), None)
        why = note and f"Translator's note: {note}"
    if why:
        later["wrong-article"].append({"tag": TAG, "title": title, "region": region, "records": unit.get("records", []),
                                       "source": unit["source"]["title"], "why": why})

# headline of a record's translated summary, used only when the summary is about that one record
seeds = {}
for title, (region, unit) in units.items():
    recs = unit.get("records", [])
    if unit.get("headline") and len(recs) == 1 and title not in WRONG_ARTICLE and not any(WRONG_NOTE.search(n) for n in unit.get("notes", [])):
        seeds[recs[0]] = unit["headline"]

names = load(os.path.join("src", "i18n", "names", f"{lang}.json"))
for region in REGIONS:
    eras = load(os.path.join("data", region, "_eras.json"))
    for era in eras.get("eras") or [e for area in eras.get("areas", []) for e in area.get("eras", [])]:
        if era.get("basis") != "period-bin" and era.get("cite") and not era.get("article"):
            later["section-eras"].append({"tag": TAG, "id": era["id"], "region": region, "name": era.get("name"),
                                          "page": era["cite"]["page"], "heading": era["cite"].get("quote")})
    P = polities(region)
    events, spans = {}, set()
    for f in glob.glob(os.path.join("data", region, "*", "*.json")):
        d = load(f)
        for e in d.get("events", []):
            events[e["id"]] = e
        for s in d.get("spans", []):
            spans.add(s["id"])
    for qid, e in sorted(events.items()):
        if not e.get("wiki"):
            later["wikidata-only"].append({"tag": TAG, "kind": "event", "id": qid, "region": region, "name": e["name"]})
        if qid not in names["events"]:
            later["chart-labels"].append({"tag": TAG, "kind": "event", "id": qid, "region": region, "name": e["name"],
                                          "seed": seeds.get(qid)})
    for pid in sorted(spans):
        p = P.get(pid)
        if not p:
            continue
        if not p.get("wikipedia") and (p.get("wd") or {}).get("id"):
            later["wikidata-only"].append({"tag": TAG, "kind": "state", "id": pid, "region": region, "name": p["name"]})
        if names["polities"].get(pid) is None:
            later["chart-labels"].append({"tag": TAG, "kind": "state", "id": pid, "region": region, "name": p["name"],
                                          "seed": seeds.get(pid)})

counts = {k: len(v) for k, v in later.items()}
counts["chart-labels with a seed"] = sum(1 for e in later["chart-labels"] if e["seed"])
out = {
    "tag": TAG,
    "lang": lang,
    "generated": datetime.date.today().isoformat(),
    "note": "What still shows untranslated, to settle at the end of the localisation. Made by scripts/l10n-later.py; "
            "run it again after each step. See docs/i18n.md, 'Flagged for later'.",
    "counts": counts,
    **later,
}
with open(os.path.join(base, "_later.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
    f.write("\n")
print(json.dumps(counts))
