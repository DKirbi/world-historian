"""The text the story drawer shows from a Wikipedia article, read the way src/features/story/wiki.ts reads it.

Shared by fetch_translation_sources.py (the English text to translate) and fetch_stories.py (the stored
summaries): an introduction as plain text (TextExtracts, then `paragraphs` in wiki.ts), or one section as
HTML paragraphs (`htmlParagraphs`), found by its heading as `fetchSection` finds it.
"""
import re
import unicodedata
from html.parser import HTMLParser


def clean(extract):
    """Plain-text extract → paragraphs, tidied as `paragraphs` in wiki.ts."""
    out = []
    for p in re.split(r"\n+", extract or ""):
        p = re.sub(r"\(\s*listen\s*\)", "", p, flags=re.I)
        p = re.sub(r"\(\s*[;,]\s*", "(", p)
        p = re.sub(r"\s*[;,]\s*\)", ")", p)
        p = re.sub(r"\(\s*\)", "", p)
        p = re.sub(r"\s+([,.;:])", r"\1", p)
        p = re.sub(r"\s{2,}", " ", p).strip()
        # template residue left in the extract, such as "|campaignbox = campaignbox =" (Battle of Clavijo)
        if len(p) > 1 and not p.startswith("|"):
            out.append(p)
    return out


def excerpt(paragraphs, max_paragraphs, max_chars):
    """The paragraphs the drawer prints (Story.tsx, excerpt): whole paragraphs up to both limits."""
    shown, chars = [], 0
    for p in paragraphs:
        if len(shown) >= max_paragraphs or (shown and chars + len(p) > max_chars):
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


def find_section(sections, heading, loose=False):
    """The section whose heading matches, as fetchSection in wiki.ts: the exact heading or anchor; else the same
    period whose dates in brackets were edited since the data was built ("Early Woodland period (1000–1 BCE)" →
    "Early Woodland period (1000–200 BCE)"); else, when loose (an era read by a heading that resembles its row),
    a heading that starts with the name."""
    want = norm(heading)
    stem = re.sub(r"\s*\(.*$", "", want)
    return next((x for x in sections
                 if norm(x["anchor"].replace("_", " ")) == want or norm(strip_tags(x["line"])) == want), None) or \
        next((x for x in sections if re.sub(r"\s*\(.*$", "", norm(strip_tags(x["line"]))) == stem), None) or \
        (next((x for x in sections if norm(strip_tags(x["line"])).startswith(stem)), None) if loose else None)


def section(get, lang, title, heading, loose=False):
    """One section of `title` as {article, section, rev, url, paragraphs}, or None. `get` is wikipedia._get
    (or the same for another language)."""
    s = get({"action": "parse", "page": title, "prop": "sections", "redirects": 1}).get("parse", {})
    found = find_section(s.get("sections", []), heading, loose)
    if not found:
        return None
    p = get({"action": "parse", "page": s["title"], "section": found["index"], "prop": "text|revid",
             "disableeditsection": 1, "disabletoc": 1}).get("parse", {})
    html = p.get("text", "")
    html = html.get("*", "") if isinstance(html, dict) else html
    parser = Paragraphs()
    parser.feed(html)
    return {"article": s["title"], "section": strip_tags(found["line"]), "rev": p.get("revid") or s.get("revid"),
            "url": f"https://{lang}.wikipedia.org/wiki/" + s["title"].replace(" ", "_") + "#" + found["anchor"],
            "paragraphs": parser.out}
