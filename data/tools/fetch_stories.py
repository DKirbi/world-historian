"""Snapshot the Wikipedia text the story drawer shows, so the app reads it from the data instead of asking Wikipedia.

Usage: python3 -I fetch_stories.py <data_dir> <lang> [--regions r1,r2] [--refresh | --check]

Every record a story can open is listed the way scripts/translation-worklist.mjs lists it: a state's article
(`wikipedia`, or `wikipediaSection` of it), an event's (`wiki` / `wikiSection`), an era's (`article`, or for a
cited era the section whose heading resembles its row). For each, the text is read as src/features/story/wiki.ts
reads it: the introduction as plain text (TextExtracts), or the section's HTML paragraphs, with the lead image,
revision, URL and short description. Introductions go 20 titles to a request (TextExtracts' limit), serially,
through the cached, polite client in wikipedia.py.

<lang> "en" stores the English article of every record. Another language stores the article in that language
where the English one links to it (sections exist only in the English article, so section records are skipped:
their stories use the stored translation); this needs a host that can reach that Wikipedia.

Writes <data_dir>/stories/<lang>/<region>.json, one file per region with every unit a story of that region can
open (a unit shared by two regions is in both, so a region loads one file). Keys are the translation keys: the
English title, or "<title>#<section>" (exact heading or cited row). Existing units are kept and only re-read
with --refresh; the text is CC BY-SA 4.0 (Wikipedia).

--check is the monthly revision check: it asks for the current revision of every stored article (50 titles to a
request), re-reads only the units whose article has a newer revision, and writes <data_dir>/stories/<lang>/_changes.json:
the units whose text changed, and the stored translations whose English text is no longer the stored one (to
re-translate; the new translation is unreviewed).
"""
import datetime
import glob
import html
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wikipedia as wp  # noqa: E402
import wptext as wpt  # noqa: E402

REGIONS = ["europe", "americas", "oceania", "africa-middle-east", "asia"]
MAX_PARAGRAPHS, MAX_CHARS = 5, 2200  # the full-width drawer (Story.tsx); the side drawer cuts further
IMAGE_SIZE = 960                      # pithumbsize, as wiki.ts asks for
TRANSLATED_PARAGRAPHS, TRANSLATED_CHARS = 3, 1100  # the excerpt the translations were made from

args = sys.argv[1:]
refresh = "--refresh" in args
check = "--check" in args
regions = REGIONS
if "--regions" in args:
    regions = args[args.index("--regions") + 1].split(",")
pos = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or args[i - 1] != "--regions")]
if len(pos) != 2:
    sys.exit(__doc__)
data, lang = pos
get = wp.getter(lang)
if check or refresh:
    # read today's Wikipedia, not the cache; responses from earlier today are reused, so a rerun resumes
    wp.fresh_since(datetime.datetime.combine(datetime.date.today(), datetime.time()).timestamp())


def load(path):
    return json.load(open(path, encoding="utf-8"))


# 1. the units a story can open, per region (as translation-worklist.mjs)
units = {}  # key -> {title, section?, loose?, kind, regions, records}


def unit(key, **init):
    u = units.setdefault(key, {**init, "regions": set(), "records": set()})
    return u


for region in REGIONS:
    pol = {p["id"]: p for p in load(os.path.join(data, region, "_polities.json"))["polities"]}
    spans, events = set(), {}
    for path in glob.glob(os.path.join(data, region, "*", "*.json")):
        f = load(path)
        spans |= {s["id"] for s in f.get("spans", [])}
        for e in f.get("events", []):
            events[e["id"]] = e
    for pid in spans:
        p = pol.get(pid)
        if not p or not p.get("wikipedia"):
            continue
        sec = p.get("wikipediaSection")
        u = unit(f"{p['wikipedia']}#{sec}" if sec else p["wikipedia"], kind="state", title=p["wikipedia"],
                 **({"section": sec} if sec else {}))
        u["regions"].add(region)
        u["records"].add(pid)
    for e in events.values():
        if not e.get("wiki"):
            continue
        sec = e.get("wikiSection")
        u = unit(f"{e['wiki']}#{sec}" if sec else e["wiki"], kind="event", title=e["wiki"],
                 **({"section": sec} if sec else {}))
        u["regions"].add(region)
        u["records"].add(e["id"])
    for era in load(os.path.join(data, region, "_eras.json"))["eras"]:
        if era.get("article"):
            title, sec, loose = era["article"]["title"], era["article"].get("section"), False
        elif era.get("cite") and era.get("basis") != "period-bin":
            title, sec, loose = era["cite"]["page"], era["cite"]["quote"], True
        else:
            continue
        u = unit(f"{title}#{sec}" if sec else title, kind="era", title=title,
                 **({"section": sec} if sec else {}), **({"loose": True} if loose else {}))
        u["regions"].add(region)
        u["records"].add(era["id"])

wanted = {k: u for k, u in units.items() if u["regions"] & set(regions)}
if lang != "en":
    wanted = {k: u for k, u in wanted.items() if not u.get("section")}

out_dir = os.path.join(data, "stories", lang)
old = {}
for region in regions:
    path = os.path.join(out_dir, f"{region}.json")
    if os.path.exists(path):
        old.update(load(path)["units"])


def chunks(xs, n):
    for i in range(0, len(xs), n):
        yield xs[i:i + n]


def current_revisions(titles):
    """{title: lastrevid} for stored page titles, 50 to a request (no redirects: stored titles are the targets)."""
    revs = {}
    for chunk in chunks(sorted(titles), 50):
        body = get({"action": "query", "titles": "|".join(chunk), "prop": "info"})
        q = body.get("query", {})
        back = {n["to"]: n["from"] for n in q.get("normalized", [])}
        for page in q.get("pages", []):
            if "lastrevid" in page:
                revs[back.get(page["title"], page["title"])] = page["lastrevid"]
    return revs


stale = set()
if check:
    held = {k: old[k] for k in wanted if k in old}
    now = current_revisions({r["title"] for r in held.values()})
    stale = {k for k, r in held.items() if now.get(r["title"]) not in (None, r.get("rev"))}
    print(f"revision check: {len(held)} stored units, {len(stale)} with a newer revision", flush=True)
todo = {k: u for k, u in wanted.items() if refresh or k not in old or k in stale}
print(f"{len(wanted)} units in {', '.join(regions)}; {len(todo)} to read", flush=True)


def resolve(q, chunk):
    """{page title as returned: title as asked} through normalisation and redirects."""
    back = {}
    for n in q.get("normalized", []) + q.get("redirects", []):
        back[n["to"]] = back.get(n["from"], n["from"])
    found = {}
    for page in q.get("pages", []):
        src = page["title"]
        while src in back and src not in chunk:
            src = back[src]
        found[page["title"]] = src
    return found


# 2. titles in <lang>: the English title, or its language link
titles = {}  # English title -> title in <lang>
intro_units = [u for u in todo.values() if not u.get("section")]
if lang == "en":
    titles = {u["title"]: u["title"] for u in intro_units}
else:
    en = wp.getter("en")
    for chunk in chunks(sorted({u["title"] for u in intro_units}), 50):
        params = {"action": "query", "titles": "|".join(chunk), "prop": "langlinks", "lllang": lang,
                  "lllimit": "max", "redirects": 1}
        while True:
            body = en(params)
            q = body.get("query", {})
            asked = resolve(q, chunk)
            for page in q.get("pages", []):
                for ll in page.get("langlinks", []):
                    titles[asked[page["title"]]] = ll["title"]
            if "continue" not in body:
                break
            params = {**params, **body["continue"]}

# 3. introductions, 20 to a request
today = datetime.date.today().isoformat()
read, to_section = {}, {}
by_lang_title = {}
for en_title, t in titles.items():
    by_lang_title.setdefault(t, []).append(en_title)
done = 0
for chunk in chunks(sorted(by_lang_title), 20):
    params = {"action": "query", "titles": "|".join(chunk), "redirects": 1,
              "prop": "extracts|pageimages|info|description", "exintro": 1, "explaintext": 1,
              "exsectionformat": "plain", "exlimit": "max", "piprop": "thumbnail|name",
              "pithumbsize": IMAGE_SIZE, "pilimit": "max", "inprop": "url"}
    pages = {}
    while True:
        body = get(params)
        q = body.get("query", {})
        asked = resolve(q, chunk)
        # a title that redirects to a section of another article is that section, as for the translations
        for r in q.get("redirects", []):
            if r.get("tofragment") and r["from"] in chunk:
                to_section[r["from"]] = (r["to"], r["tofragment"])
        for page in q.get("pages", []):
            cur = pages.setdefault(page["title"], {})
            for k, v in page.items():
                if v not in (None, "", [], {}):
                    cur.setdefault(k, v)
            cur["_asked"] = asked.get(page["title"], page["title"])
        if "continue" not in body:
            break
        params = {**params, **body["continue"]}
    for page in pages.values():
        if page.get("missing") or page.get("invalid") or page["_asked"] in to_section or "extract" not in page:
            continue
        rec = {"title": page["title"], "url": page.get("fullurl"), "rev": page.get("lastrevid"),
               **({"description": page["description"]} if page.get("description") else {}),
               "paragraphs": wpt.excerpt(wpt.clean(page["extract"]), MAX_PARAGRAPHS, MAX_CHARS)}
        thumb = page.get("thumbnail")
        if thumb:
            rec["image"] = {"file": page.get("pageimage"), "src": thumb["source"],
                            "width": thumb["width"], "height": thumb["height"]}
        if rec["paragraphs"]:
            for en_title in by_lang_title[page["_asked"]]:
                read[en_title] = rec
    done += len(chunk)
    if done % 400 < 20:
        print(f"  introductions: {done} of {len(by_lang_title)}", flush=True)

# 4. sections: section records, and titles that redirect to a section
for key, u in todo.items():
    if u.get("section"):
        got = wpt.section(get, lang, u["title"], u["section"], u.get("loose", False))
        if got and got["paragraphs"]:
            read[key] = {"title": got["article"], "url": got["url"], "rev": got["rev"], "section": got["section"],
                         "paragraphs": wpt.excerpt(got["paragraphs"], MAX_PARAGRAPHS, MAX_CHARS)}
for asked_title, (target, fragment) in to_section.items():
    got = wpt.section(get, lang, target, fragment)
    if got and got["paragraphs"]:
        for en_title in by_lang_title.get(asked_title, [asked_title]):
            read[en_title] = {"title": got["article"], "url": got["url"], "rev": got["rev"], "section": got["section"],
                              "paragraphs": wpt.excerpt(got["paragraphs"], MAX_PARAGRAPHS, MAX_CHARS)}

# 5. the lead images' credits (author, licence, Commons page), 50 files to a request, for every stored image without
#    one, as src/features/story/wiki.ts fetchImageCredit reads them; `free` marks the freely licensed files the image packs may store (English Wikipedia's local
#    copies are often fair use, marked NonFree; some are protected copies of free Commons files)
def strip_tags(markup):
    return " ".join(html.unescape(wpt.strip_tags(markup or "")).split())


def image_credits(files):
    out = {}
    for chunk in chunks(sorted(files), 50):
        body = get({"action": "query", "titles": "|".join(f"File:{f}" for f in chunk), "prop": "imageinfo",
                    "iiprop": "extmetadata|url",
                    "iiextmetadatafilter": "Artist|LicenseShortName|LicenseUrl|AttributionRequired|NonFree"})
        q = body.get("query", {})
        back = {n["to"]: n["from"] for n in q.get("normalized", [])}
        for page in q.get("pages", []):
            info = (page.get("imageinfo") or [None])[0]
            if not info:
                continue
            meta = {k: v.get("value") for k, v in (info.get("extmetadata") or {}).items()}
            name = back.get(page["title"], page["title"]).removeprefix("File:")
            licence = strip_tags(meta.get("LicenseShortName")) or None
            nonfree = str(meta.get("NonFree", "")).lower() in ("true", "1") or (licence or "").lower().startswith(("fair use", "non-free"))
            credit = {"page": info.get("descriptionurl") or f"https://commons.wikimedia.org/wiki/File:{name.replace(' ', '_')}",
                      "repo": "commons" if page.get("imagerepository") == "shared" else "local",
                      "free": bool(licence) and not nonfree}
            artist = strip_tags(meta.get("Artist"))[:160]
            if artist:
                credit["artist"] = artist
            if licence:
                credit["licence"] = licence
            if meta.get("LicenseUrl"):
                credit["licenceUrl"] = meta["LicenseUrl"]
            out[name] = credit
    return out


fresh_images = [r["image"] for r in read.values() if r.get("image", {}).get("file")]
held_images = fresh_images + [r["image"] for r in old.values() if r.get("image", {}).get("file")]
need = {i["file"] for i in fresh_images} | {i["file"] for i in held_images if "credit" not in i}
credits = image_credits(need) if need else {}
for img in held_images:
    if img["file"] in credits:
        img["credit"] = credits[img["file"]]
print(f"image credits: {len(credits)} of {len(need)} files read", flush=True)

# 6. one file per region
os.makedirs(out_dir, exist_ok=True)
missing = sorted(k for k in todo if k not in read and (lang == "en" or k in titles or units[k].get("section")))
for region in regions:
    path = os.path.join(out_dir, f"{region}.json")
    prev = load(path)["units"] if os.path.exists(path) else {}
    mine = {}
    for key, u in wanted.items():
        if region not in u["regions"]:
            continue
        rec = read.get(key) if key in read else old.get(key) or prev.get(key)
        if not rec:
            continue
        if key in read:
            rec = {**rec, "retrieved": today}
        mine[key] = {**rec, "records": sorted(u["records"])}
    body = {
        "lang": lang,
        "region": region,
        "source": f"{lang}.wikipedia.org: the text the story drawer shows (introduction as plain text, or a section's "
                  f"paragraphs), up to {MAX_PARAGRAPHS} paragraphs and {MAX_CHARS} characters, with revision and lead image",
        "licence": "CC BY-SA 4.0",
        "units": dict(sorted(mine.items())),
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(body, f, ensure_ascii=False, indent=1)
        f.write("\n")
    words = sum(len(" ".join(r["paragraphs"]).split()) for r in mine.values())
    print(f"{path}: {len(mine)} units, {words} words", flush=True)
print(f"read {len(read)} of {len(todo)}; missing {len(missing)}: {missing[:30]}")

if check:
    # what the new revisions changed: the text, and so the translations made from the old English text
    changed = sorted(k for k in stale if k in read and read[k]["paragraphs"] != old[k]["paragraphs"])
    translations = {}
    for path in glob.glob(os.path.join(data, "translations", "*", "*.json")):
        if os.path.basename(path).startswith("_"):
            continue
        tl = os.path.basename(os.path.dirname(path))
        for k, t in load(path).get("units", {}).items():
            # translations were made from a shorter excerpt (fetch_translation_sources.py): compare like with like
            # (every stored unit, so a translation made before the snapshot is caught too)
            cur = read.get(k) or old.get(k)
            if lang == "en" and cur and t["source"].get("paragraphs") \
                    != wpt.excerpt(cur["paragraphs"], TRANSLATED_PARAGRAPHS, TRANSLATED_CHARS):
                translations.setdefault(tl, []).append(k)
    report = {"lang": lang, "checked": today, "regions": regions, "newer_revision": len(stale),
              "text_changed": changed, "translations_to_redo": {tl: sorted(ks) for tl, ks in translations.items()}}
    with open(os.path.join(out_dir, "_changes.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"text changed in {len(changed)}; translations to redo: "
          f"{ {tl: len(ks) for tl, ks in translations.items()} }")
