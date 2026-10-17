"""Helpers to read facts out of Wikipedia wikitext without hand-copying them.

clean(text)          wikitext -> plain text as shown to readers (links, templates, refs, markup)
links(text)          the link targets and shown texts in a piece of wikitext
table_rows(text)     every row of every wikitable, as lists of raw cell wikitext
find_row(text, label)  the first table row whose first cell reads `label`
parse_years(text)    "400 BCE–250 CE" -> (-400, 250, approx); "c. 5500—200 BC" -> (-5500, -200, True)
"""
import re

LAST_YEAR = 2024


def _strip_templates(t):
    # simple templates that carry visible text
    t = re.sub(r"\{\{\s*(?:nbsp|snd|spaced ndash)\s*\}\}", lambda m: " – " if "nd" in m.group(0) else " ", t, flags=re.I)
    t = re.sub(r"\{\{\s*(?:nowrap|nobreak|nobr)\s*\|([^{}]*)\}\}", r"\1", t, flags=re.I)
    t = re.sub(r"\{\{\s*circa\s*\|([^{}]*)\}\}", r"c. \1", t, flags=re.I)
    t = re.sub(r"\{\{\s*(?:BCE|BC)\s*\|([^{}|]*)[^{}]*\}\}", r"\1 BCE", t)
    t = re.sub(r"\{\{\s*(?:CE|AD)\s*\|([^{}|]*)[^{}]*\}\}", r"\1 CE", t)
    t = re.sub(r"\{\{\s*lang\s*\|[^|{}]*\|((?:[^{}|\[]|\[\[[^\]]*\]\])*)[^{}]*\}\}", r"\1", t, flags=re.I)
    for _ in range(4):  # remaining templates (citations, maintenance tags) are not shown text
        t2 = re.sub(r"\{\{[^{}]*\}\}", "", t)
        if t2 == t:
            break
        t = t2
    return t


def clean(t):
    t = re.sub(r"<ref[^>]*/>", "", t)
    t = re.sub(r"<ref[^>]*>.*?</ref>", "", t, flags=re.S)
    t = re.sub(r"<!--.*?-->", "", t, flags=re.S)
    t = _strip_templates(t)
    t = re.sub(r"\[\[(?:File|Image):[^\]]*\]\]", "", t)
    t = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\[\[([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\[https?://\S+ ([^\]]*)\]", r"\1", t)
    t = re.sub(r"<br\s*/?>", " ", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = t.replace("'''", "").replace("''", "").replace("&ndash;", "–").replace("&mdash;", "—").replace("&nbsp;", " ")
    return re.sub(r"\s+", " ", t).strip()


def links(t):
    """[(target, shown)] for every wikilink."""
    out = []
    for m in re.finditer(r"\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]", t):
        target = m.group(1).strip()
        if target.lower().startswith(("file:", "image:", "category:")):
            continue
        out.append((target, (m.group(2) or m.group(1)).strip()))
    return out


def _split_cells(line):
    """One table line (without its leading | or !) -> cells; '||' and '!!' separate cells."""
    parts, depth, cur, i = [], 0, "", 0
    while i < len(line):
        two = line[i:i + 2]
        if two in ("[[", "{{"):
            depth += 1; cur += two; i += 2; continue
        if two in ("]]", "}}"):
            depth = max(0, depth - 1); cur += two; i += 2; continue
        if depth == 0 and two in ("||", "!!"):
            parts.append(cur); cur = ""; i += 2; continue
        cur += line[i]; i += 1
    parts.append(cur)
    out = []
    for p in parts:
        # "style=... | content": the attribute part has no link or template before its single pipe
        m = re.match(r"^([^|\[\]{}]*=[^|\[\]{}]*)\|(?!\|)(.*)$", p, flags=re.S)
        out.append(m.group(2) if m else p)
    return out


def table_rows(text):
    rows = []
    for table in re.findall(r"\{\|.*?\n\|\}", text, flags=re.S):
        for raw in re.split(r"\n\|-[^\n]*", table):
            cells = []
            for line in raw.split("\n"):
                if line.startswith(("{|", "|}", "|+")) or not line.startswith(("|", "!")):
                    if cells and line and not line.startswith(("{|", "|}", "|+", "|", "!")):
                        cells[-1] += "\n" + line  # continuation of the previous cell
                    continue
                for c in _split_cells(line[1:]):
                    cells += re.split(r"<td[^>]*>", c)
            if cells:
                rows.append([c.strip() for c in cells])
    return rows


def find_row(text, label):
    for r in table_rows(text):
        if r and clean(r[0]) == label:
            return r
    raise KeyError(f"no table row labelled {label!r}")


_NUM = r"(\d{1,3}(?:,\d{3})+|\d+)"
_ERA_BEFORE = r"(BCE|BC|CE|AD)"


_CENTURY = re.compile(r"\b(?:(early|mid|late)\s+)?(\d+)(?:st|nd|rd|th)\s+centur(?:y|ies)\b(?:\s*(BCE|BC|CE|AD)\b)?", re.I)


def _century(part, n, bc, is_start):
    """A century as signed years; "early"/"mid"/"late" narrow it to a third. The start of a range takes
    the earliest year of what is written, the end the latest (as for "1800/1500 BC")."""
    lo, hi = (-100 * n, -(100 * (n - 1) + 1)) if bc else (100 * (n - 1) + 1, 100 * n)
    a, b = {"early": (0, 1 / 3), "mid": (1 / 3, 2 / 3), "late": (2 / 3, 1)}.get((part or "").lower(), (0, 1))
    return round(lo + (a if is_start else b) * (hi - lo))


def _side(s, is_start=True):
    """'1800/1500 BC' -> ([1800, 1500], 'BC', None); 'present' -> (None, None, 'present');
    '11th century BCE' -> its earliest year (start of a range) or latest year (end)"""
    s = s.strip()
    if re.search(r"present|today", s, flags=re.I):
        return None, None, "present"
    cm = _CENTURY.search(s)
    if cm:
        era = (cm.group(3) or "").upper() or None
        bc = era in ("BC", "BCE")
        y = _century(cm.group(1), int(cm.group(2)), bc, is_start)
        return [abs(y)], era, None
    era = None
    m = re.search(r"\b" + _ERA_BEFORE + r"\b", s)
    if m:
        era = m.group(1)
    nums = [int(n.replace(",", "")) for n in re.findall(_NUM, s)]
    return nums, era, None


def parse_years(text):
    """(start, end, approx) from a date range as written; BCE years are negative. None if unparseable."""
    t = clean(text)
    approx = bool(re.search(r"\bc\.|circa|\?|/|\bcentur(?:y|ies)\b", t, flags=re.I))  # a century is a range
    t = re.sub(r"\bc\.\s*", "", t, flags=re.I)
    t = t.replace("—", "–").replace(" to ", "–")
    t = re.sub(r"(\d+(?:st|nd|rd|th))(?=\s*[–-]\s*(?:early |mid |late )?\d+(?:st|nd|rd|th)\s+centur(?:y|ies))", r"\1 century", t)
    t = re.sub(r"(?<=\d)\s*-\s*(?=\d|[A-Z])", "–", t)  # hyphen used as a range dash
    t = re.sub(r"(?<=[A-Z])\s*-\s*(?=\d|[A-Z])", "–", t)
    t = re.sub(r"(?<=[a-z?])\s*-\s*(?=\d)", "–", t)  # "unknown-1539 AD"
    if re.match(r"^\s*[–-]\s*\d", t):
        return None  # "-1700 AD": no start given
    if "–" not in t:
        nums, era, special = _side(t, True)
        if not nums:
            return None
        y = -nums[0] if era in ("BC", "BCE") else nums[0]
        return y, y, approx
    a, b = t.split("–", 1)
    if re.search(r"unknown|\?", a, flags=re.I) and not re.search(r"\d", a):
        return None  # start not known
    na, ea, sa = _side(a, True)
    nb, eb, sb = _side(b, False)
    if not na:
        return None
    if sb == "present":
        eb, nb, end_present = "CE", [LAST_YEAR], True
    else:
        end_present = False
        if not nb:
            return None
    # an era written on one side only applies to both ("2000–1000 BCE", "AD 600-1500")
    if ea is None and eb is not None and not end_present:
        ea = eb
    if eb is None:
        eb = ea
    sign = lambda era: -1 if era in ("BC", "BCE") else 1
    start = min(n * sign(ea) for n in na)  # "1800/1500 BC": the earliest reading
    end = max(n * sign(eb) for n in nb)    # "900/1000": the latest reading
    return start, end, approx
