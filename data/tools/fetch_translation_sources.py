"""Snapshot the English summaries to translate for one region, from the translation worklist.

Usage: python3 -I fetch_translation_sources.py <data_dir> <lang> <region>
       (after `node scripts/translation-worklist.mjs <lang>` has written <data_dir>/translations/<lang>/_worklist.json)

1. Checks again, through the English articles' language links, that <lang> has no article of its own
   (the names snapshot can be out of date). Articles that do have one are listed under "inLanguage" and
   are not translated: the drawer shows the reader's own article.
2. For the rest, reads the article's introduction as plain text with its revision id, cleans it the way
   the drawer does (src/features/story/wiki.ts, paragraphs) and keeps what the side drawer prints
   (src/features/story/Story.tsx, excerpt: up to 3 paragraphs and 1,100 characters).

Writes <data_dir>/translations/<lang>/_sources/<region>.json. The text is CC BY-SA 4.0 (Wikipedia).
Sections of articles (eras that are a heading of a "History of …" article) are not handled yet.
"""
import sys, os, re, json, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wikipedia as wp  # noqa: E402

data, lang, region = sys.argv[1], sys.argv[2], sys.argv[3]
MAX_PARAGRAPHS, MAX_CHARS = 3, 1100

work = json.load(open(os.path.join(data, "translations", lang, "_worklist.json")))
units = [u for u in work["units"] if region in u["regions"]]
skipped = [u["title"] for u in units if u.get("section")]
units = [u for u in units if not u.get("section")]


def chunks(xs, n):
    for i in range(0, len(xs), n):
        yield xs[i:i + n]


def resolve(q, chunk):
    """{page title as returned: title as asked} through normalisation and redirects."""
    back = {}
    for n in q.get("normalized", []) + q.get("redirects", []):
        back[n["to"]] = back.get(n["from"], n["from"])
    out = {}
    for page in q.get("pages", []):
        src = page["title"]
        while src in back and src not in chunk:
            src = back[src]
        out[page["title"]] = src
    return out


# 1. does <lang> have an article after all?
in_lang = {}
for chunk in chunks([u["title"] for u in units], 50):
    params = {"action": "query", "titles": "|".join(chunk), "prop": "langlinks", "lllang": lang, "lllimit": "max", "redirects": 1}
    while True:
        body = wp._get(params)
        q = body.get("query", {})
        asked = resolve(q, chunk)
        for page in q.get("pages", []):
            for ll in page.get("langlinks", []):
                in_lang[asked[page["title"]]] = ll["title"]
        if "continue" not in body:
            break
        params = {**params, **body["continue"]}


def clean(extract):
    out = []
    for p in re.split(r"\n+", extract or ""):
        p = re.sub(r"\(\s*listen\s*\)", "", p, flags=re.I)
        p = re.sub(r"\(\s*[;,]\s*", "(", p)
        p = re.sub(r"\s*[;,]\s*\)", ")", p)
        p = re.sub(r"\(\s*\)", "", p)
        p = re.sub(r"\s+([,.;:])", r"\1", p)
        p = re.sub(r"\s{2,}", " ", p).strip()
        if len(p) > 1:
            out.append(p)
    return out


def excerpt(paragraphs):
    shown, chars = [], 0
    for p in paragraphs:
        if len(shown) >= MAX_PARAGRAPHS or (shown and chars + len(p) > MAX_CHARS):
            break
        shown.append(p)
        chars += len(p)
    return shown


# 2. the English introductions
todo = [u for u in units if u["title"] not in in_lang]
sources = {}
for chunk in chunks([u["title"] for u in todo], 20):
    params = {"action": "query", "titles": "|".join(chunk), "prop": "extracts|info", "exintro": 1, "explaintext": 1,
              "exlimit": "max", "inprop": "url", "redirects": 1}
    while True:
        body = wp._get(params)
        q = body.get("query", {})
        asked = resolve(q, chunk)
        for page in q.get("pages", []):
            if page.get("missing") or "extract" not in page:
                continue
            title = asked[page["title"]]
            sources[title] = {"article": page["title"], "rev": page.get("lastrevid"), "url": page.get("fullurl"),
                              "paragraphs": excerpt(clean(page["extract"]))}
        if "continue" not in body:
            break
        params = {**params, **body["continue"]}

by_title = {u["title"]: u for u in todo}
out = {
    "lang": lang,
    "region": region,
    "retrieved": datetime.date.today().isoformat(),
    "source": "English Wikipedia, introduction of each article as plain text (CC BY-SA 4.0)",
    "excerpt": {"paragraphs": MAX_PARAGRAPHS, "characters": MAX_CHARS},
    "units": {t: {"kind": by_title[t]["kind"], "priority": by_title[t]["priority"], "records": by_title[t]["records"], **s}
              for t, s in sorted(sources.items(), key=lambda kv: kv[0])},
    "inLanguage": dict(sorted(in_lang.items())),
    "missing": sorted(t for t in by_title if t not in sources),
    "sectionsNotHandled": skipped,
}
path = os.path.join(data, "translations", lang, "_sources", f"{region}.json")
os.makedirs(os.path.dirname(path), exist_ok=True)
json.dump(out, open(path, "w"), ensure_ascii=False, indent=1)
words = sum(len(" ".join(s["paragraphs"]).split()) for s in sources.values())
print(f"{path}: {len(sources)} summaries ({words} words); {len(in_lang)} already in {lang}; "
      f"{len(out['missing'])} missing; {len(skipped)} sections not handled")
