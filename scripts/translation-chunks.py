"""Cut a region's untranslated source units into chunks for translation.

Usage (from the repository root):
  python3 -I scripts/translation-chunks.py <lang> <region> <out_dir> <prefix> [--size 40] [--groups g1,g2] [--not-groups g3]

Writes <out_dir>/<prefix>-01.txt, -02.txt … with the units of data/translations/<lang>/_sources/<region>.json
that no batch of <lang> has translated yet (a unit translated for another region is skipped too, since the
drawer finds it in any batch). Units are ordered era → leader → states → detail → event, then by title, and
each heading names the unit's kind, its priority and its glossary name, if the glossary has one.

--groups keeps only units with a record in a column of those lane groups (<region>/_index.json "group");
--not-groups leaves out units of an earlier part, so a unit shared by two parts goes with the first one.

Each chunk is translated into <prefix>-NN.json, a draft for scripts/merge-translations.mjs (see docs/i18n.md).
"""
import glob
import json
import os
import sys

args = [a for a in sys.argv[1:]]


def option(name, default=None):
    if name in args:
        i = args.index(name)
        value = args[i + 1]
        del args[i:i + 2]
        return value
    return default


size = int(option("--size", "40"))
groups = option("--groups")
not_groups = option("--not-groups")
if len(args) != 4:
    sys.exit(__doc__)
lang, region, out_dir, prefix = args

base = os.path.join("data", "translations", lang)
src = json.load(open(os.path.join(base, "_sources", f"{region}.json")))["units"]
done = set()
for path in glob.glob(os.path.join(base, "*.json")):
    if not os.path.basename(path).startswith("_"):
        done |= set(json.load(open(path))["units"])
work = {(u["title"] + ("#" + u["section"] if u.get("section") else "")): u
        for u in json.load(open(os.path.join(base, "_worklist.json")))["units"]}
names = json.load(open(os.path.join("src", "i18n", "names", f"{lang}.json")))


def in_groups(wanted):
    index = json.load(open(os.path.join("data", region, "_index.json")))
    unknown = wanted - {lane["group"] for lane in index["lanes"]}
    if unknown:
        sys.exit(f"unknown lane groups in {region}: {', '.join(sorted(unknown))}")
    lanes = {lane["id"] for lane in index["lanes"] if lane["group"] in wanted}
    keep = set()
    for path in glob.glob(os.path.join("data", region, "*", "*.json")):
        f = json.load(open(path))
        if f.get("lane") in lanes:
            keep |= {s["id"] for s in f.get("spans", [])} | {e["id"] for e in f.get("events", [])}
    keep |= {e["id"] for e in json.load(open(os.path.join("data", region, "_eras.json")))["eras"]
             if lanes & set(e.get("lanes", []))}
    return keep


keep = in_groups(set(groups.split(","))) if groups else None
drop = in_groups(set(not_groups.split(","))) if not_groups else set()
rank = {"era": 0, "leader": 1, "states": 2, "detail": 3, "event": 4}


def gloss(unit):
    for r in unit["records"]:
        for g in ("polities", "events", "eras"):
            if r in names.get(g, {}):
                return names[g][r]
    return None


todo = []
for key, s in src.items():
    if key in done:
        continue
    unit = work[key]
    if keep is not None and not keep & set(unit["records"]):
        continue
    if drop & set(unit["records"]):
        continue
    todo.append((rank[unit["priority"]], key.lower(), key, unit, s))
todo.sort()

os.makedirs(out_dir, exist_ok=True)
n = 0
for i in range(0, len(todo), size):
    out = []
    for _, _, key, unit, s in todo[i:i + size]:
        n += 1
        g = gloss(unit)
        out.append(f"\n### {n}. {key}  [{unit['kind']}/{unit['priority']}]" + (f"  glossary: {g}" if g else ""))
        out += [f"({j}) {p}" for j, p in enumerate(s["paragraphs"], 1)]
    with open(os.path.join(out_dir, f"{prefix}-{i // size + 1:02d}.txt"), "w") as f:
        f.write("\n".join(out) + "\n")
print(f"{n} units in {(len(todo) + size - 1) // size} chunks of up to {size}: {out_dir}/{prefix}-01.txt …")
