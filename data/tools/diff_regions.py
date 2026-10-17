"""Compare two builds lane by lane: python3 -I diff_regions.py <old_dir> <new_dir> [region ...]"""
import json, sys, os
old_dir, new_dir = sys.argv[1:3]
regions = sys.argv[3:] or ["europe", "americas", "oceania", "africa-middle-east"]

def lanespans(base, lane):
    seen, out = set(), []
    for p in lane["periods"]:
        for s in json.load(open(f"{base}/{lane['id']}/{p}.json"))["spans"]:
            k = (s["id"], s["from"])
            if k not in seen:
                seen.add(k); out.append(s)
    return sorted(out, key=lambda s: s["from"])

for r in regions:
    oi = f"{old_dir}/{r}/_index.json"
    old = {l["id"]: l for l in json.load(open(oi))["lanes"]} if os.path.exists(oi) else {}
    new = json.load(open(f"{new_dir}/{r}/_index.json"))
    print(f"##### {r}  omitted/excluded: {[x['label'] for x in new.get('omittedLanes', [])]}")
    tot_add = tot_rem = tier_up = 0
    for l in new["lanes"]:
        ns = lanespans(f"{new_dir}/{r}", l)
        if l["id"] not in old:
            print(f"  == NEW {l['id']} ({l['km2']} km2, minShare {l['minShare']}): {len(ns)} spans")
            for s in ns:
                print(f"       {s['from']:>6} {s['to']:>6} {s['peak']:.2f} t{s['tier']} {'I' if s.get('inside') else ' '}{'R' if s.get('realm') else ' '} {s['name']}")
            continue
        o = {(s["id"], s["from"], s["to"], s["tier"]) for s in lanespans(f"{old_dir}/{r}", old[l["id"]])}
        n = {(s["id"], s["from"], s["to"], s["tier"]) for s in ns}
        add, rem = sorted(n - o, key=lambda a: a[1]), sorted(o - n, key=lambda a: a[1])
        tot_add += len(add); tot_rem += len(rem)
        tier_up += sum(1 for a in add if a[3] <= 2)
        if add or rem:
            print(f"  {l['id']}: +{len(add)} -{len(rem)}")
            for a in add: print(f"       + {a[1]:>6}..{a[2]:<6} t{a[3]} {a[0]}")
            for a in rem: print(f"       - {a[1]:>6}..{a[2]:<6} t{a[3]} {a[0]}")
    print(f"  TOTAL existing lanes: +{tot_add} -{tot_rem}  (added tier 1-2: {tier_up})")
