import sys, json, os, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wikidata as wd
names = json.load(open(sys.argv[1]))
for region, qs in names.items():
    print("#####", region)
    for q in qs:
        url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({"action": "wbsearchentities", "search": q, "language": "en", "type": "item", "limit": 4, "format": "json"})
        res = wd._get(url).get("search", [])
        ids = [r["id"] for r in res]
        ents = wd.entities(ids, props="labels|claims|sitelinks")
        print(f"-- {q}")
        for r in res:
            e = ents.get(r["id"], {})
            s, en = wd.years_of(e) if e else (None, None)
            p3842 = [wd.item_value(c) for c in wd.claims(e, "P3842")] if e else []
            p17 = [wd.item_value(c) for c in wd.claims(e, "P17")] if e else []
            coord = next((wd.coord_value(c) for c in wd.claims(e, "P625") if wd.coord_value(c)), None) if e else None
            cap = [wd.item_value(c) for c in wd.claims(e, "P36")] if e else []
            print(f"   {r['id']:10s} {r.get('label','')[:40]:40s} | {r.get('description','')[:60]:60s} | {s} {en} | 3842={p3842[:4]} 17={p17[:3]} coord={coord} cap={cap[:2]}")
