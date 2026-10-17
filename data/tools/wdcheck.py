"""Choose a trustworthy Wikidata item per polity and compare its years with the chart's.

Shared by build_region.py (writes the result into _polities.json and _review.json) and ad-hoc analysis.
"""

def _tol(prec):
    return {6: 1000, 7: 150, 8: 60}.get(prec, 50)


def overlaps(item, years):
    """True / False / None (unknown) — do the item's dates plausibly cover the polity's years?"""
    a, b = years
    s, e = item.get("start"), item.get("end")
    if s and e and s[0] > e[0]:
        return None  # inconsistent dates on Wikidata (start after end): nothing to compare
    if not s and not e:
        return None
    lo = s[0] - _tol(s[1]) if s else -10_000
    hi = e[0] + _tol(e[1]) if e else 10_000
    return lo <= b and a <= hi


def choose(polity, snap):
    """Return (qid or None, status) with status ok | unknown | corrected | mismatch | none."""
    items, titles = snap["items"], snap.get("titles", {})
    q = polity.get("wikidata")
    q = items.get(q, {}).get("id", q) if q else None
    qt = titles.get(polity.get("wikipedia") or "")
    cand = items.get(q) if q else None
    if cand and not cand.get("missing"):
        ov = overlaps(cand, polity["years"])
        if ov or ov is None:
            return q, ("ok" if ov else "unknown")
    if qt and qt != q and qt in items:
        ov = overlaps(items[qt], polity["years"])
        if ov:
            return qt, "corrected"
    if cand:
        return None, "mismatch"
    return None, "none"
