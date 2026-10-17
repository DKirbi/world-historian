"""Small, polite Wikidata client with an on-disk cache.

- wbgetentities in batches of 50 ids, maxlag=30, retries with backoff on 429/5xx/maxlag.
- SPARQL against query.wikidata.org, same retry policy.
Responses are cached by request (directory $WD_CACHE, default ./.wd_cache) so reruns do not hit Wikidata again; the build reads
snapshots written from these responses, never the live service.
"""
import json, os, time, hashlib, urllib.parse, urllib.request, urllib.error

UA = "WorldHistoryTimeline/0.1 (non-commercial educational timeline; data snapshot build) python-urllib"
CACHE = os.environ.get("WD_CACHE", os.path.join(os.getcwd(), ".wd_cache"))


def _get(url, accept="application/json", data=None, tries=12):
    os.makedirs(CACHE, exist_ok=True)
    key = hashlib.sha1((url + (data or "")).encode()).hexdigest()
    path = os.path.join(CACHE, key + ".json")
    if os.path.exists(path):
        return json.load(open(path))
    delay = 2.0
    for attempt in range(tries):
        req = urllib.request.Request(url, data=data.encode() if data else None,
                                     headers={"User-Agent": UA, "Accept": accept,
                                              **({"Content-Type": "application/x-www-form-urlencoded"} if data else {})})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                body = json.loads(r.read().decode())
            if isinstance(body, dict) and body.get("error", {}).get("code") == "maxlag":
                raise urllib.error.HTTPError(url, 503, "maxlag", {}, None)
            if isinstance(body, dict) and "error" in body:
                raise RuntimeError(f"Wikidata API error: {body['error']}")
            json.dump(body, open(path, "w"))
            time.sleep(0.4)
            return body
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < tries - 1:
                retry = e.headers.get("Retry-After") if e.headers else None
                time.sleep(float(retry) if retry and retry.isdigit() else delay)
                delay = min(delay * 2, 60)
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            if attempt < tries - 1:
                time.sleep(delay); delay = min(delay * 2, 60); continue
            raise


def entities(ids, props="labels|claims|sitelinks", languages="en"):
    """Return {qid: entity} for the given ids (redirects resolved, missing ids skipped)."""
    out = {}
    ids = sorted(set(i for i in ids if i))
    for i in range(0, len(ids), 50):
        chunk = ids[i:i + 50]
        url = ("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({
            "action": "wbgetentities", "ids": "|".join(chunk), "props": props, "languages": languages,
            "sitefilter": "enwiki" if "sitelinks" in props else "", "format": "json", "maxlag": 30}))
        body = _get(url)
        for q, e in body.get("entities", {}).items():
            if "missing" in e:
                continue
            out[q] = e
            if e.get("id") and e["id"] != q:  # redirect: keep both keys
                out[e["id"]] = e
    return out


def sitelink_counts(ids):
    """Number of Wikipedia language editions per item (a common importance proxy)."""
    out = {}
    ids = sorted(set(ids))
    for i in range(0, len(ids), 200):
        vals = " ".join(f"wd:{q}" for q in ids[i:i + 200])
        rows = sparql(f"SELECT ?i ?n WHERE {{ VALUES ?i {{ {vals} }} ?i wikibase:sitelinks ?n . }}")
        for r in rows:
            out[r["i"].rsplit("/", 1)[1]] = int(r["n"])
    return out


def sparql(query):
    body = _get("https://query.wikidata.org/sparql", accept="application/sparql-results+json",
                data=urllib.parse.urlencode({"query": query, "format": "json"}))
    return [{k: v["value"] for k, v in b.items()} for b in body["results"]["bindings"]]


# ---------------------------------------------------------------- claim helpers
def claims(e, pid):
    return [c for c in e.get("claims", {}).get(pid, []) if c.get("rank") != "deprecated"]


def best(e, pid):
    """Preferred-rank statements if any, else normal-rank ones."""
    cs = claims(e, pid)
    pref = [c for c in cs if c.get("rank") == "preferred"]
    return pref or cs


def time_value(c):
    """(year, precision) from a time statement; precision 9 = year, 8 = decade, 7 = century."""
    v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
    if not v or "time" not in v:
        return None
    t = v["time"]
    sign = -1 if t.startswith("-") else 1
    year = int(t[1:].split("-")[0]) * sign
    if sign < 0:
        year = year  # Wikidata stores BCE as negative proleptic years (1 BCE = -1 in display, -0001)
    return year, int(v.get("precision", 9))


def year_range(year, prec):
    """First and last year a Wikidata date can mean, following Wikidata's own display rules:
    precision 9+ is that year; 8 (decade) is the ten years starting at the round year; 7 (century)
    and 6 (millennium) are the century / millennium containing the year as Wikidata numbers them,
    so +1600 at century precision is the 16th century, 1501-1600, and -3500 is 3500-3401 BCE."""
    if prec >= 9:
        return year, year
    if prec == 8:
        first = year - year % 10
        return first, first + 9
    size = 100 if prec == 7 else 1000 if prec == 6 else 10 ** (9 - prec)
    n = (abs(year) - 1) // size + 1  # ordinal century / millennium
    if year > 0:
        return (n - 1) * size + 1, n * size
    return -(n * size), -((n - 1) * size + 1)


def item_value(c):
    v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
    return v.get("id") if isinstance(v, dict) else None


def coord_value(c):
    v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
    if isinstance(v, dict) and "latitude" in v and (v.get("globe", "").endswith("Q2")):
        return v["longitude"], v["latitude"]
    return None


def label(e):
    return e.get("labels", {}).get("en", {}).get("value")


def enwiki(e):
    return e.get("sitelinks", {}).get("enwiki", {}).get("title")


def years_of(e):
    """Start and end from inception/dissolved, else start/end time, with precision."""
    def first(pids):
        for p in pids:
            for c in best(e, p):
                tv = time_value(c)
                if tv:
                    return tv
        return None
    return first(["P571", "P580"]), first(["P576", "P582"])


def by_enwiki_titles(titles, props="labels|claims|sitelinks"):
    """Map English Wikipedia titles to Wikidata entities (redirects followed). Returns {title: entity}."""
    out = {}
    titles = sorted(set(t for t in titles if t))
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        url = ("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({
            "action": "wbgetentities", "sites": "enwiki", "titles": "|".join(chunk), "props": props,
            "languages": "en", "sitefilter": "enwiki", "redirects": "yes", "format": "json", "maxlag": 30}))
        body = _get(url)
        for e in body.get("entities", {}).values():
            if "missing" in e:
                continue
            t = e.get("sitelinks", {}).get("enwiki", {}).get("title")
            if t:
                out[t] = e
    return out
