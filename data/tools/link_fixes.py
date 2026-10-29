"""Hand corrections to the English Wikipedia article a record links to (sources/link-fixes.json).

build_region.py applies them to every build (apply_polity, apply_event). Run as a script, the same
functions patch an existing data folder in place, line by line, so the files stay as the build writes them
and only the corrected records change:

  python3 -I link_fixes.py <data_dir>

A corrected record keeps its link in "wikipedia" (polities) or "wiki" (events), gains "wikipediaSection" /
"wikiSection" when the article is a section of a longer page, and "linkFix" with the link it replaced. The
app then reads that article (and section) and no longer falls back to the record's Wikidata item for a
polity, whose item was chosen for the old link.
"""
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FIXES = os.path.join(HERE, "..", "sources", "link-fixes.json")


def load(path=FIXES):
    return json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {"polities": {}, "events": {}}


def apply_polity(pid, rec, fixes):
    """Correct one polity record in place; True if it changed."""
    fix = fixes.get("polities", {}).get(pid)
    if not fix or rec.get("wikipedia") not in (fix["was"], fix["wikipedia"]):
        return False
    new = dict(rec)
    new["wikipedia"] = fix["wikipedia"]
    new.pop("wikipediaSection", None)
    if fix.get("section"):
        new["wikipediaSection"] = fix["section"]
    new["linkFix"] = fix["was"]
    if new == rec:
        return False
    rec.clear()
    rec.update(new)
    return True


def apply_event(rec, fixes):
    """Correct one event record in place; True if it changed."""
    fix = fixes.get("events", {}).get(rec.get("id"))
    if not fix or rec.get("wiki") not in (fix["was"], fix["wiki"]):
        return False
    new = dict(rec)
    new["wiki"] = fix["wiki"]
    new.pop("wikiSection", None)
    if fix.get("section"):
        new["wikiSection"] = fix["section"]
    new["linkFix"] = fix["was"]
    if new == rec:
        return False
    rec.clear()
    rec.update(new)
    return True


def _dump(item):
    return "  " + json.dumps(item, ensure_ascii=False, separators=(",", ":"))


def patch(data_dir):
    """Apply the fixes to the files of a built data folder; returns the number of records changed."""
    fixes = load()
    changed = 0
    regions = [os.path.dirname(p) for p in glob.glob(os.path.join(data_dir, "*", "_index.json"))]
    paths = [os.path.join(r, "_polities.json") for r in regions] + \
        [p for r in regions for p in glob.glob(os.path.join(r, "*", "*.json"))]
    for path in sorted(paths):
        lines = open(path, encoding="utf-8").read().split("\n")
        polities = path.endswith("_polities.json")
        section = "polities" if polities else None
        out, n = [], 0
        for line in lines:
            if line.startswith(' "'):
                section = line.strip().split('"')[1]
            if line.startswith("  {"):
                body = line[2:].rstrip(",")
                comma = line.endswith(",")
                item = json.loads(body)
                hit = apply_polity(item["id"], item, fixes) if section == "polities" else \
                    apply_event(item, fixes) if section == "events" else False
                if hit:
                    line = _dump(item) + ("," if comma else "")
                    n += 1
            out.append(line)
        if n:
            open(path, "w", encoding="utf-8").write("\n".join(out))
            changed += n
    return changed


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    print(f"link fixes applied to {patch(sys.argv[1])} records")
