"""Snapshot the English summaries to translate for one region, from the translation worklist.

Usage: python3 -I fetch_translation_sources.py <data_dir> <lang> <region> [--priority era,leader,...]
       (after `node scripts/translation-worklist.mjs <lang>` has written <data_dir>/translations/<lang>/_worklist.json)

Takes every worklist unit that appears in <region> and is not yet translated in any batch of <lang> (an article
shared with a region done earlier is translated once, there); with --priority, only those priorities.

1. Checks again, through the English articles' language links, that <lang> has no article of its own
   (the names snapshot can be out of date). Articles that do have one are listed under "inLanguage" and
   are not translated: the drawer shows the reader's own article.
2. For the rest, reads the text the drawer would show in English, with its revision id: the article's
   introduction as plain text (src/features/story/wiki.ts, fetchIntro + paragraphs), or, for an era that is
   a section of an article, that section's paragraphs (fetchSection + htmlParagraphs). Keeps what the side
   drawer prints (src/features/story/Story.tsx, excerpt: up to 3 paragraphs and 1,100 characters).

Adds to <data_dir>/translations/<lang>/_sources/<region>.json (units already there are kept). A section unit
is keyed "<title>#<section>". The text is CC BY-SA 4.0 (Wikipedia).
"""
import sys, os, re, json, glob, datetime, unicodedata
from html.parser import HTMLParser
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wikipedia as wp  # noqa: E402

data, lang, region = sys.argv[1], sys.argv[2], sys.argv[3]
priorities = None
if "--priority" in sys.argv:
    priorities = set(sys.argv[sys.argv.index("--priority") + 1].split(","))
MAX_PARAGRAPHS, MAX_CHARS = 3, 1100
base = os.path.join(data, "translations", lang)


def key(u):
    return f"{u['title']}#{u['section']}" if u.get("section") else u["title"]


done = set()
for path in glob.glob(os.path.join(base, "*.json")):
    if not os.path.basename(path).startswith("_"):
        done |= set(json.load(open(path))["units"])

work = json.load(open(os.path.join(base, "_worklist.json")))
units = [u for u in work["units"]
         if region in u["regions"]
         and (priorities is None or u["priority"] in priorities)
         and key(u) not in done]


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


# 1. does <lang> have an article after all? (sections are parts of an article that has none)
in_lang = {}
for chunk in chunks(sorted({u["title"] for u in units if not u.get("section")}), 50):
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


class Paragraphs(HTMLParser):
    """Text of each <p>, without reference marks, tables and figures (as htmlParagraphs in wiki.ts)."""
    SKIP = {"sup", "style", "table", "figure"}
    SKIP_CLASSES = {"mw-ref", "reference", "thumb", "hatnote", "navbox", "mw-empty-elt"}
    VOID = {"br", "img", "wbr", "hr", "input", "meta", "link"}

    def __init__(self):
        super().__init__()
        self.out, self.buf, self.in_p, self.skip = [], [], 0, []

    def handle_starttag(self, tag, attrs):
        if tag in self.VOID:
            return
        classes = set((dict(attrs).get("class") or "").split())
        if self.skip or tag in self.SKIP or classes & self.SKIP_CLASSES:
            self.skip.append(tag)
            return
        if tag == "p":
            self.in_p += 1

    def handle_endtag(self, tag):
        if self.skip:
            if self.skip[-1] == tag:
                self.skip.pop()
            return
        if tag == "p" and self.in_p:
            self.in_p -= 1
            text = re.sub(r"\[\d+\]", "", re.sub(r"\s+", " ", "".join(self.buf))).strip()
            if len(text) > 1:
                self.out.append(text)
            self.buf = []

    def handle_data(self, d):
        if self.in_p and not self.skip:
            self.buf.append(d)


def norm(s):
    s = unicodedata.normalize("NFKC", s)
    s = re.sub(r"[‐-―]", "-", s)
    return re.sub(r"\s+", " ", s).strip().lower()


def strip_tags(html):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html)).strip()


sources = {}
# 2a. introductions
intros = [u for u in units if not u.get("section") and u["title"] not in in_lang]
for chunk in chunks([u["title"] for u in intros], 20):
    params = {"action": "query", "titles": "|".join(chunk), "prop": "extracts|info", "exintro": 1, "explaintext": 1,
              "exlimit": "max", "inprop": "url", "redirects": 1}
    while True:
        body = wp._get(params)
        q = body.get("query", {})
        asked = resolve(q, chunk)
        for page in q.get("pages", []):
            if page.get("missing") or "extract" not in page:
                continue
            sources[asked[page["title"]]] = {"article": page["title"], "rev": page.get("lastrevid"), "url": page.get("fullurl"),
                                             "paragraphs": excerpt(clean(page["extract"]))}
        if "continue" not in body:
            break
        params = {**params, **body["continue"]}

# 2b. sections
for u in [u for u in units if u.get("section")]:
    s = wp._get({"action": "parse", "page": u["title"], "prop": "sections", "redirects": 1}).get("parse", {})
    want = norm(u["section"])
    # the exact heading, else the same period whose dates in brackets were edited since the data was built
    # ("Early Woodland period (1000–1 BCE)" → "Early Woodland period (1000–200 BCE)"), as fetchSection does
    stem = re.sub(r"\s*\(.*$", "", want)
    found = next((x for x in s.get("sections", [])
                  if norm(x["anchor"].replace("_", " ")) == want or norm(strip_tags(x["line"])) == want), None) or \
        next((x for x in s.get("sections", []) if re.sub(r"\s*\(.*$", "", norm(strip_tags(x["line"]))) == stem), None)
    if not found:
        continue
    p = wp._get({"action": "parse", "page": s["title"], "section": found["index"], "prop": "text|revid",
                 "disableeditsection": 1, "disabletoc": 1}).get("parse", {})
    html = p.get("text", "")
    html = html.get("*", "") if isinstance(html, dict) else html
    parser = Paragraphs()
    parser.feed(html)
    sources[key(u)] = {"article": s["title"], "section": strip_tags(found["line"]), "rev": p.get("revid") or s.get("revid"),
                       "url": "https://en.wikipedia.org/wiki/" + s["title"].replace(" ", "_") + "#" + found["anchor"],
                       "paragraphs": excerpt(parser.out)}

by_key = {key(u): u for u in units}
path = os.path.join(base, "_sources", f"{region}.json")
old = json.load(open(path)) if os.path.exists(path) else {"units": {}, "inLanguage": {}}
today = datetime.date.today().isoformat()
for u in old["units"].values():
    u.setdefault("retrieved", old.get("retrieved"))
new_units = {k: {"kind": by_key[k]["kind"], "priority": by_key[k]["priority"], "records": by_key[k]["records"],
                 "retrieved": today, **s} for k, s in sources.items()}
out = {
    "lang": lang,
    "region": region,
    "source": "English Wikipedia, the text the drawer prints: the introduction as plain text, or an era's section (CC BY-SA 4.0)",
    "excerpt": {"paragraphs": MAX_PARAGRAPHS, "characters": MAX_CHARS},
    "units": dict(sorted({**old["units"], **new_units}.items())),
    "inLanguage": dict(sorted({**old.get("inLanguage", {}), **in_lang}.items())),
    "missing": sorted(k for k in by_key if k not in sources and by_key[k]["title"] not in in_lang),
}
os.makedirs(os.path.dirname(path), exist_ok=True)
json.dump(out, open(path, "w"), ensure_ascii=False, indent=1)
words = sum(len(" ".join(s["paragraphs"]).split()) for s in sources.values())
print(f"{path}: +{len(sources)} summaries ({words} words) of {len(units)} asked; "
      f"{len(in_lang)} already in {lang}: {sorted(in_lang)}; missing: {out['missing']}")
