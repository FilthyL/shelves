#!/usr/bin/env python3
"""Find the published cover for everything on the shelves.

Free sources, no keys needed, all shelves looked up at the same time:
  anime   AniList
  manga   MangaDex, a cover for every owned volume (AniList for a series MangaDex lacks)
  music   MusicBrainz with the Cover Art Archive (Deezer for a record it lacks)
  books   Open Library (by isbn when the item has one)
  movies  IMDb's public title suggestions

Nothing is stored in the repo: data/covers.json records each cover's link, and
the site loads it from there. Each image is read once into memory to check the
link works and, when Pillow is installed, to take the spine colours from it.
Items already in covers.json are skipped, so after the first run only new
items are looked up. A site that cannot be reached is skipped for the rest of
the run instead of being retried for every item.

Usage
  python3 tools/covers.py                  find whatever is missing
  python3 tools/covers.py --room music     only one room
  python3 tools/covers.py --only kid-a     only one item (by id)
  python3 tools/covers.py --refresh        look everything up again
  python3 tools/covers.py --retry-misses   retry items that matched nothing last time
  python3 tools/covers.py --dry-run        print the matches, write nothing
  python3 tools/covers.py --prune          drop entries for items no longer in the data

To pin a cover yourself, give the item "cover": "<image link>". To keep the
generated art instead, give it "cover": false.
"""
import argparse
import datetime as dt
import functools
import io
import json
import re
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from shelflib import DATA, load_house, load_json, parse_owned  # noqa: E402

COVERS_JSON = DATA / 'covers.json'
UA = 'FilthManor-shelves/1.0 (+https://github.com/FilthyL/shelves)'
THRESHOLD = 0.72
LOG = functools.partial(print, flush=True)  # show progress live in CI logs

# minimum seconds between requests to each host, from each API's published limits
PACE = {'graphql.anilist.co': 2.1, 'api.mangadex.org': 0.3, 'musicbrainz.org': 1.1, 'api.deezer.com': 0.2,
        'openlibrary.org': 1.0, 'v3.sg.media-imdb.com': 0.4}
_last = {}
_locks = defaultdict(threading.Lock)
_dead = set()  # hosts that could not be reached; not tried again this run


class Unreachable(urllib.error.URLError):
    pass


# ------------------------------------------------------------------ http
def http(url, data=None, headers=None, tries=2, timeout=15):
    host = urllib.parse.urlparse(url).netloc
    if host in _dead:
        raise Unreachable(f'{host} could not be reached earlier in this run')
    for attempt in range(tries):
        with _locks[host]:  # one request at a time per host, spaced by its limit
            gap = PACE.get(host, 0.1) - (time.monotonic() - _last.get(host, 0))
            if gap > 0:
                time.sleep(gap)
            _last[host] = time.monotonic()
        req = urllib.request.Request(url, data=data, headers={'User-Agent': UA, 'Accept': '*/*', **(headers or {})})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read(), r.headers.get('Content-Type', '')
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < tries - 1:
                time.sleep(3)
                continue
            raise
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            if attempt < tries - 1:
                time.sleep(1)
                continue
            _dead.add(host)
            raise Unreachable(f'{host}: {e}') from e


def get_json(url, **kw):
    body, _ = http(url, **kw)
    return json.loads(body.decode('utf-8'))


def post_json(url, payload):
    body, _ = http(url, data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
    return json.loads(body.decode('utf-8'))


# ------------------------------------------------------------------ matching
_DROP = re.compile(r'\b(remaster(ed)?|deluxe|edition|expanded|anniversary|version|special|collector\'?s|original motion picture soundtrack|ost)\b')
# releases that share a title with the one you own but are not it
VARIANTS = re.compile(r'\b(ep|b-sides?|remix(es)?|instrumentals?|live|demos?|karaoke|tribute|acoustic|commentary|'
                      r'notes|study guide|summary|sparknotes|cliffsnotes|analysis|workbook|malayalam|telugu|hindi|kannada|'
                      r'dubbed|sampler|single|making of)\b')


def norm(s):
    s = unicodedata.normalize('NFKD', str(s or ''))
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r'\(.*?\)|\[.*?\]', ' ', s)
    s = s.replace('&', ' and ')
    s = _DROP.sub(' ', s)
    s = re.sub(r'[^\w]+', ' ', s)
    s = re.sub(r'\b(the|a|an)\b', ' ', s)
    return ' '.join(s.split())


def sim(a, b):
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    ratio = SequenceMatcher(None, a, b).ratio()
    ta, tb = set(a.split()), set(b.split())
    tokens = len(ta & tb) / max(len(ta | tb), 1)
    contained = 0.9 if (a in b or b in a) and min(len(a), len(b)) >= 4 else 0.0
    return max(ratio, tokens, contained)


def best_sim(a, options):
    return max([sim(a, o) for o in options if o] or [0.0])


def year_score(y, other):
    try:
        d = abs(int(y) - int(str(other)[:4]))
    except (TypeError, ValueError):
        return 0.5
    return 1.0 if d == 0 else 0.8 if d <= 1 else 0.4 if d <= 3 else 0.0


def variant_penalty(own, cand):
    mine = set(VARIANTS.findall(str(own or '').lower()))
    theirs = set(VARIANTS.findall(str(cand or '').lower()))
    return 0.3 if theirs - mine else 0.0


def pick(cands, score):
    best, top = None, 0.0
    for c in cands:
        s = score(c)
        if s > top:
            best, top = c, s
    return (best, round(top, 3)) if best is not None else (None, 0.0)


def short(name, res, s, log):
    log(f'{name}: {len(res)} candidates, best score {s}')


# ------------------------------------------------------------------ anime + manga series: AniList
ANILIST_Q = '''query ($q: String, $type: MediaType) { Page(perPage: 8) { media(search: $q, type: $type, sort: SEARCH_MATCH) {
  title { romaji english native } startDate { year } coverImage { extraLarge large }
  studios(isMain: true) { nodes { name } } staff(perPage: 4) { nodes { name { full } } } } } }'''


def anilist(it, kind, log):
    data = post_json('https://graphql.anilist.co', {'query': ANILIST_Q, 'variables': {'q': it['title'], 'type': 'MANGA' if kind == 'manga' else 'ANIME'}})
    res = ((data.get('data') or {}).get('Page') or {}).get('media') or []
    hit = choose_anilist(it, res)
    if not hit:
        short('AniList', res, 0, log)
    return hit


def choose_anilist(it, res):
    def score(m):
        t = m.get('title') or {}
        s = 0.65 * best_sim(it['title'], [t.get('english'), t.get('romaji')])
        if it.get('original') and t.get('native') and it['original'].strip() == t['native'].strip():
            s = max(s, 0.65)
        s += 0.2 * year_score(it.get('year'), (m.get('startDate') or {}).get('year'))
        people = [n.get('name') for n in ((m.get('studios') or {}).get('nodes') or [])]
        people += [(n.get('name') or {}).get('full') for n in ((m.get('staff') or {}).get('nodes') or [])]
        return s + 0.15 * best_sim(it.get('creator'), people)
    best, s = pick(res, score)
    img = (best or {}).get('coverImage') or {}
    if best and s >= THRESHOLD - 0.05 and (img.get('extraLarge') or img.get('large')):
        t = best.get('title') or {}
        return {'from': 'AniList', 'url': img.get('extraLarge') or img.get('large'), 'match': t.get('english') or t.get('romaji'), 'score': s}
    return None


# ------------------------------------------------------------------ manga volumes: MangaDex
MD = 'https://api.mangadex.org'


def manga_mangadex(it, kind, log):
    q = urllib.parse.urlencode([('title', it['title']), ('limit', 10), ('includes[]', 'author'),
                                ('contentRating[]', 'safe'), ('contentRating[]', 'suggestive'), ('contentRating[]', 'erotica')])
    res = get_json(f'{MD}/manga?{q}').get('data', [])
    best, s = pick(res, lambda m: score_mangadex(it, m))
    if not best or s < THRESHOLD:
        short('MangaDex', res, s, log)
        return None
    covers, offset = [], 0
    while True:
        q = urllib.parse.urlencode([('manga[]', best['id']), ('limit', 100), ('offset', offset), ('order[volume]', 'asc')])
        page = get_json(f'{MD}/cover?{q}')
        covers += page.get('data', [])
        offset += 100
        if offset >= page.get('total', 0):
            break
    vols = choose_volume_covers(covers, set(it['_vols']), it.get('cover_locale'))
    if not vols:
        log('MangaDex: no covers for the owned volumes')
        return None
    titles = (best.get('attributes') or {}).get('title') or {}
    return {'from': 'MangaDex', 'match': next(iter(titles.values()), it['title']), 'score': s,
            'vols': {v: f"https://uploads.mangadex.org/covers/{best['id']}/{fn}.512.jpg" for v, fn in vols.items()}}


def score_mangadex(it, m):
    a = m.get('attributes') or {}
    names = list((a.get('title') or {}).values()) + [t for d in a.get('altTitles') or [] for t in d.values()]
    s = 0.7 * best_sim(it['title'], names)
    if it.get('original') and it['original'] in names:
        s = max(s, 0.7)
    authors = [(r.get('attributes') or {}).get('name') for r in m.get('relationships') or [] if r.get('type') == 'author']
    return s + 0.15 * best_sim(it.get('creator'), authors) + 0.15 * year_score(it.get('year'), a.get('year'))


def choose_volume_covers(covers, owned, prefer=None):
    """One cover per owned volume, preferring the original Japanese printing."""
    order = [prefer] if prefer else []
    order += [loc for loc in ('ja', 'en') if loc not in order]
    best = {}
    for c in covers:
        a = c.get('attributes') or {}
        try:
            v = int(float(a.get('volume')))
        except (TypeError, ValueError):
            continue
        if v not in owned or not a.get('fileName'):
            continue
        rank = order.index(a.get('locale')) if a.get('locale') in order else len(order)
        if v not in best or rank < best[v][0]:
            best[v] = (rank, a['fileName'])
    return {str(v): fn for v, (_, fn) in sorted(best.items())}


# ------------------------------------------------------------------ music: MusicBrainz + Cover Art Archive, then Deezer
ODD_TYPES = {'Live', 'Remix', 'Compilation', 'DJ-mix', 'Demo', 'Interview', 'Mixtape/Street'}


def _lucene(s):
    return str(s or '').replace('\\', '\\\\').replace('"', '\\"')


def music_musicbrainz(it, kind, log):
    query = f'releasegroup:"{_lucene(it["title"])}"'
    if it.get('creator'):
        query += f' AND artist:"{_lucene(it["creator"])}"'
    q = urllib.parse.urlencode({'query': query, 'fmt': 'json', 'limit': 15})
    res = get_json(f'https://musicbrainz.org/ws/2/release-group/?{q}', headers={'Accept': 'application/json'}).get('release-groups', [])
    hit = choose_musicbrainz(it, res)
    if not hit:
        short('MusicBrainz', res, 0, log)
    return hit


def _credit(g):
    return ''.join((c.get('name') or '') + (c.get('joinphrase') or '') for c in g.get('artist-credit') or [])


def choose_musicbrainz(it, res):
    def score(g):
        s = 0.6 * sim(it['title'], g.get('title')) + 0.3 * sim(it.get('creator'), _credit(g)) + 0.1 * year_score(it.get('year'), g.get('first-release-date'))
        s -= variant_penalty(it['title'], g.get('title'))
        if g.get('primary-type') not in (None, 'Album') and g.get('primary-type', '').lower() not in str(it['title']).lower():
            s -= 0.2
        if ODD_TYPES & set(g.get('secondary-types') or []):
            s -= 0.2
        return s
    best, s = pick(res, score)
    if best and s >= THRESHOLD:
        return {'from': 'MusicBrainz', 'url': f"https://coverartarchive.org/release-group/{best['id']}/front-500",
                'match': f"{best.get('title')} by {_credit(best)}", 'score': s}
    return None


def music_deezer(it, kind, log):
    q = urllib.parse.urlencode({'q': f'artist:"{it.get("creator", "")}" album:"{it["title"]}"', 'limit': 15})
    res = get_json(f'https://api.deezer.com/search/album?{q}').get('data', [])
    best, s = pick(res, lambda r: 0.65 * sim(it['title'], r.get('title')) + 0.35 * sim(it.get('creator'), (r.get('artist') or {}).get('name'))
                   - variant_penalty(it['title'], r.get('title')))
    if best and s >= THRESHOLD and best.get('cover_xl'):
        return {'from': 'Deezer', 'url': best['cover_xl'], 'match': f"{best.get('title')} by {(best.get('artist') or {}).get('name')}", 'score': s}
    short('Deezer', res, s, log)
    return None


# ------------------------------------------------------------------ books: Open Library
def book_openlibrary(it, kind, log):
    isbn = re.sub(r'[^0-9Xx]', '', str(it.get('isbn') or ''))
    if isbn:  # an isbn pins the exact edition
        return {'from': 'Open Library', 'url': f'https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg?default=false', 'match': f'ISBN {isbn}', 'score': 1.0}
    res, s = [], 0.0
    for params in ({'title': it['title'], 'author': it.get('creator', '')}, {'q': f"{it['title']} {it.get('creator', '')}".strip()}):
        q = urllib.parse.urlencode({**params, 'limit': 20, 'fields': 'title,author_name,first_publish_year,cover_i'})
        res = [d for d in get_json(f'https://openlibrary.org/search.json?{q}').get('docs', []) if d.get('cover_i')]
        best, s = pick(res, lambda d: 0.65 * sim(it['title'], d.get('title')) + 0.35 * best_sim(it.get('creator'), d.get('author_name') or [])
                       - variant_penalty(it['title'], d.get('title')))
        if best and s >= THRESHOLD:
            return {'from': 'Open Library', 'url': f"https://covers.openlibrary.org/b/id/{best['cover_i']}-L.jpg?default=false",
                    'match': f"{best.get('title')} by {', '.join(best.get('author_name') or [])}", 'score': s}
    short('Open Library', res, s, log)
    return None


# ------------------------------------------------------------------ movies: IMDb
def movie_imdb(it, kind, log):
    q = re.sub(r'\s+', ' ', str(it['title']).lower()).strip()
    url = f"https://v3.sg.media-imdb.com/suggestion/{urllib.parse.quote(q[:1] or 'x')}/{urllib.parse.quote(q)}.json"
    res = [r for r in get_json(url).get('d', []) if (r.get('i') or {}).get('imageUrl')]
    hit = choose_imdb(it, res)
    if not hit:
        short('IMDb', res, 0, log)
    return hit


def choose_imdb(it, res):
    def score(r):
        kind = 0.0 if r.get('qid') in ('movie', 'tvMovie', 'video', None) or r.get('q') == 'feature' else 0.25
        return 0.7 * sim(it['title'], r.get('l')) + 0.3 * year_score(it.get('year'), r.get('y')) - kind - variant_penalty(it['title'], r.get('l'))
    best, s = pick(res, score)
    if best and s >= THRESHOLD:
        img = re.sub(r'\._V1_.*\.jpg$', '._V1_SX800.jpg', best['i']['imageUrl'])
        return {'from': 'IMDb', 'url': img, 'match': f"{best.get('l')} ({best.get('y')})", 'score': s}
    return None


SOURCES = {
    'anime': [anilist],
    'manga': [manga_mangadex, anilist],
    'music': [music_musicbrainz, music_deezer],
    'books': [book_openlibrary],
    'movies': [movie_imdb],
}


# ------------------------------------------------------------------ images
def check(url, log):
    """Read the image into memory to make sure the link serves a real cover. Nothing is written.

    A link that answers with an error is rejected. A host that is merely slow keeps its link,
    just without spine colours, since a visitor's browser will still load it."""
    try:
        body, ctype = http(url, tries=1, timeout=12)
    except urllib.error.HTTPError:
        raise
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        log(f'slow image host, keeping the link without colours ({e})')
        return None
    if not ctype.startswith('image/') or len(body) < 2000:
        raise ValueError(f'not an image ({ctype}, {len(body)} bytes)')
    return body


def palette(image):
    """[ground, ink, accent, extra] from the cover, the same recipe the site uses."""
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(image)).convert('RGB').resize((28, 28))
    except Exception:
        return None
    bins = {}
    for px in (im.get_flattened_data() if hasattr(im, 'get_flattened_data') else im.getdata()):
        b = bins.setdefault((px[0] >> 4, px[1] >> 4, px[2] >> 4), [0, 0, 0, 0])
        b[0] += 1; b[1] += px[0]; b[2] += px[1]; b[3] += px[2]
    cols = sorted(([b[0], (b[1] / b[0], b[2] / b[0], b[3] / b[0])] for b in bins.values()), key=lambda x: -x[0])
    bg = cols[0][1]

    def dist(a, b):
        return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5

    def lum(c):
        f = lambda v: (v / 255) / 12.92 if v / 255 <= 0.03928 else ((v / 255 + 0.055) / 1.055) ** 2.4  # noqa: E731
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])

    def contrast(a, b):
        x, y = lum(a), lum(b)
        return (max(x, y) + 0.05) / (min(x, y) + 0.05)

    def sat(c):
        return (max(c) - min(c)) / max(c) if max(c) else 0

    far = [c for c in cols if dist(c[1], bg) > 90]
    accent = max(far, key=lambda c: sat(c[1]) * c[0] ** 0.5)[1] if far else ((20, 20, 20) if lum(bg) > 0.5 else (240, 236, 226))
    ink = next((c[1] for c in far if contrast(c[1], bg) >= 4.5), (22, 20, 18) if lum(bg) > 0.45 else (244, 240, 230))
    extra = next((c[1] for c in far if dist(c[1], accent) > 70), accent)
    hx = lambda c: '#' + ''.join(f'{round(v):02x}' for v in c)  # noqa: E731
    return [hx(bg), hx(ink), hx(accent if contrast(accent, bg) > 1.6 else ink), hx(extra)]


# ------------------------------------------------------------------ lookup
def lookup(kind, it, log):
    """Try the shelf's sources in order; the first whose cover link works wins."""
    for src in SOURCES[kind]:
        try:
            hit = src(it, kind, log)
            if not hit:
                continue
            entry = {'from': hit['from'], 'match': hit['match']}
            if 'vols' in hit:
                entry['vols'] = {}
                for v, url in hit['vols'].items():
                    try:
                        img = check(url, log)
                    except Exception as e:
                        log(f'volume {v}: {e}')
                        continue
                    entry['vols'][v] = {'src': url, **({'pal': p} if img and (p := palette(img)) else {})}
                if not entry['vols']:
                    continue
                first = entry['vols'][min(entry['vols'], key=int)]
                entry.update({k: first[k] for k in ('src', 'pal') if k in first})
            else:
                img = check(hit['url'], log)
                entry['src'] = hit['url']
                if img and (p := palette(img)):
                    entry['pal'] = p
            return entry
        except Exception as e:  # one source failing should not stop the next
            log(f'{src.__name__} failed: {e}')
    return None


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--room')
    ap.add_argument('--only')
    ap.add_argument('--refresh', action='store_true')
    ap.add_argument('--retry-misses', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--prune', action='store_true')
    args = ap.parse_args(argv)

    covers = load_json(COVERS_JSON) if COVERS_JSON.exists() else {}
    _, rooms = load_house()
    today = dt.date.today().isoformat()
    lock = threading.Lock()
    stats = {'found': 0, 'missed': 0, 'skipped': 0}
    live = {f"{room['id']}/{it['_id']}" for room, items in rooms for it in items}

    def save():
        if not args.dry_run:
            COVERS_JSON.write_text(json.dumps(dict(sorted(covers.items())), indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    def todo(room, items):
        kind = room.get('kind', room['id'])
        out = []
        for it in items:
            key = f"{room['id']}/{it['_id']}"
            if (args.room and room['id'] != args.room) or (args.only and it['_id'] != args.only):
                continue
            prev = covers.get(key)
            if 'cover' in it or kind not in SOURCES or (prev and not args.refresh and not (prev.get('miss') and args.retry_misses)):
                stats['skipped'] += 1
                continue
            it['_vols'] = parse_owned(it.get('owned'), it.get('total')) if kind == 'manga' else []
            out.append((key, it))
        return kind, out

    def run_room(room, items):
        kind, work = todo(room, items)
        for key, it in work:
            log = lambda m, key=key: LOG(f'  {key}: {m}')  # noqa: E731
            entry = lookup(kind, it, log)
            with lock:
                if entry:
                    entry['fetched'] = today
                    covers[key] = entry
                    stats['found'] += 1
                    log(f"{entry['from']}, {entry['match']}")
                else:
                    covers[key] = {'miss': True, 'tried': today}
                    stats['missed'] += 1
                    log('no cover found')
                save()

    # every shelf asks different sites, so the rooms run side by side
    with ThreadPoolExecutor(max_workers=max(1, len(rooms))) as pool:
        for f in [pool.submit(run_room, room, items) for room, items in rooms]:
            f.result()

    if args.prune:
        for key in [k for k in covers if k not in live]:
            LOG(f'  pruning {key}')
            covers.pop(key)
        save()

    LOG(f"covers: {stats['found']} found, {stats['missed']} without a match, {stats['skipped']} already done")
    return 0


if __name__ == '__main__':
    sys.exit(main())
