"""Small, polite English Wikipedia client with an on-disk cache.

Reads article wikitext through the MediaWiki API (action=parse) together with the revision id,
so every citation can point at the exact revision that was read:
https://en.wikipedia.org/w/index.php?oldid=<revid>
Responses are cached (directory $WP_CACHE, default ./.wp_cache); the build reads snapshots
written from them, never the live site.
"""
import json, os, time, hashlib, urllib.parse, urllib.request, urllib.error

UA = "WorldHistoryTimeline/0.1 (non-commercial educational timeline; data snapshot build) python-urllib"
CACHE = os.environ.get("WP_CACHE", os.path.join(os.getcwd(), ".wp_cache"))
API = "https://en.wikipedia.org/w/api.php"
_fresh_since = 0.0


def fresh_since(epoch):
    """Ignore cached responses older than `epoch` (seconds), so a revision check sees today's Wikipedia."""
    global _fresh_since
    _fresh_since = epoch


def _get(params, tries=8, api=API):
    os.makedirs(CACHE, exist_ok=True)
    url = api + "?" + urllib.parse.urlencode({**params, "format": "json", "formatversion": 2, "maxlag": 5})
    path = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest() + ".json")
    if os.path.exists(path) and os.path.getmtime(path) >= _fresh_since:
        return json.load(open(path))
    delay = 2.0
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                body = json.loads(r.read().decode())
            if "error" in body:
                if body["error"].get("code") == "maxlag" and attempt < tries - 1:
                    time.sleep(delay); delay = min(delay * 2, 60); continue
                raise RuntimeError(f"Wikipedia API error: {body['error']}")
            json.dump(body, open(path, "w"))
            time.sleep(0.5)
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


def getter(lang):
    """_get for another language edition of Wikipedia."""
    api = API if lang == "en" else f"https://{lang}.wikipedia.org/w/api.php"
    return lambda params, tries=8: _get(params, tries, api)


def page(title, revid=None):
    """{'title', 'revid', 'wikitext', 'url', 'permalink'} for an article (redirects followed), at the
    given revision when `revid` is set."""
    ask = {"oldid": revid} if revid else {"page": title}
    body = _get({"action": "parse", **ask, "prop": "wikitext|revid", "redirects": 1})
    p = body["parse"]
    t = p["title"]
    return {"title": t, "revid": p["revid"], "wikitext": p["wikitext"],
            "url": "https://en.wikipedia.org/wiki/" + urllib.parse.quote(t.replace(" ", "_")),
            "permalink": f"https://en.wikipedia.org/w/index.php?oldid={p['revid']}"}
