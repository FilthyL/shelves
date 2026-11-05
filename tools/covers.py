#!/usr/bin/env python3
"""Fetch the real, published cover art for everything on the shelves.

Nothing is stored in the repo: data/covers.json records where each cover is
published, and the site loads it from there. Each image is fetched once into
memory to check the link works and, when Pillow is installed, to take the spine
colours from it.

Sources, none of which need a key:
  music   iTunes Search (albums), then Deezer
  movies  TMDB when TMDB_API_KEY is set, then IMDb title suggestions, then iTunes Search
  books   Open Library (by isbn when the item has one), then Google Books
  anime   AniList, then Jikan (MyAnimeList)
  manga   MangaDex, one cover per owned volume, then AniList for the series

Usage
  python3 tools/covers.py                  fetch whatever is missing
  python3 tools/covers.py --room music     only one room
  python3 tools/covers.py --only kid-a     only one item (by id)
  python3 tools/covers.py --refresh        fetch again and replace
  python3 tools/covers.py --retry-misses   retry items that matched nothing last time
  python3 tools/covers.py --dry-run        print the matches, download nothing
  python3 tools/covers.py --prune          drop entries for items no longer in the data

To pin a cover yourself, give the item "cover": "<url or path>". To keep the
generated art instead, give it "cover": false.
"""
import argparse
import datetime as dt
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from shelflib import DATA, load_house, load_json, parse_owned  # noqa: E402

COVERS_JSON = DATA / 'covers.json'
UA = 'FilthyResidency-shelves/1.0 (+https://github.com/FilthyL/shelves)'
THRESHOLD = 0.72

# minimum seconds between requests to each host, from each API's published limits
PACE = {
    'itunes.apple.com': 3.2, 'api.deezer.com': 0.25, 'api.themoviedb.org': 0.1,
    'openlibrary.org': 1.0, 'www.googleapis.com': 1.0, 'graphql.anilist.co': 2.2,
    'api.jikan.moe': 1.2, 'api.mangadex.org': 0.3, 'v3.sg.media-imdb.com': 0.5,
}
LOG = print
_last = {}


# ------------------------------------------------------------------ http
def _wait(host):
    gap = PACE.get(host, 0.2)
    t = time.monotonic() - _last.get(host, 0)
    if t < gap:
        time.sleep(gap - t)
    _last[host] = time.monotonic()


def http(url, data=None, headers=None, tries=3):
    host = urllib.parse.urlparse(url).netloc
    for attempt in range(tries):
        _wait(host)
        req = urllib.request.Request(url, data=data, headers={'User-Agent': UA, 'Accept': '*/*', **(headers or {})})
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.read(), r.headers.get('Content-Type', '')
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < tries - 1:
                time.sleep(2 ** attempt * 3)
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            if attempt < tries - 1:
                time.sleep(2 ** attempt * 2)
                continue
            raise


def get_json(url, **kw):
    body, _ = http(url, **kw)
    return json.loads(body.decode('utf-8'))


def post_json(url, payload, headers=None):
    body, _ = http(url, data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json', 'Accept': 'application/json', **(headers or {})})
    return json.loads(body.decode('utf-8'))


# ------------------------------------------------------------------ matching
_DROP = re.compile(r'\b(remaster(ed)?|deluxe|edition|expanded|anniversary|version|special|collector\'?s|original motion picture soundtrack|ost)\b')


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


# releases that share a title with the one you own but are not it
VARIANTS = re.compile(r'\b(ep|b-sides?|remix(es)?|instrumentals?|live|demos?|karaoke|tribute|acoustic|commentary|'
                      r'notes|study guide|summary|sparknotes|cliffsnotes|analysis|workbook|malayalam|telugu|hindi|kannada|'
                      r'dubbed|sampler|single|making of)\b')


def variant_penalty(own, cand):
    mine = set(VARIANTS.findall(str(own or '').lower()))
    theirs = set(VARIANTS.findall(str(cand or '').lower()))
    return 0.3 if theirs - mine else 0.0


def short(name, res, s):
    LOG(f'      {name}: {len(res)} candidates, best score {s}')


def pick(cands, score):
    best, top = None, 0.0
    for c in cands:
        s = score(c)
        if s > top:
            best, top = c, s
    return (best, round(top, 3)) if best is not None else (None, 0.0)


# ------------------------------------------------------------------ sources
def music_itunes(it):
    q = urllib.parse.urlencode({'term': f"{it.get('creator', '')} {it['title']}", 'entity': 'album', 'media': 'music', 'limit': 20})
    res = get_json(f'https://itunes.apple.com/search?{q}').get('results', [])
    return choose_album(it, res)


def choose_album(it, res):
    best, s = pick(res, lambda r: 0.6 * sim(it['title'], r.get('collectionName')) + 0.3 * sim(it.get('creator'), r.get('artistName'))
                   + 0.1 * year_score(it.get('year'), r.get('releaseDate')) - variant_penalty(it['title'], r.get('collectionName')))
    if best and s >= THRESHOLD and best.get('artworkUrl100'):
        return {'from': 'iTunes', 'url': best['artworkUrl100'].replace('100x100bb', '1000x1000bb'),
                'match': f"{best.get('collectionName')} by {best.get('artistName')}", 'score': s}
    short('iTunes albums', res, s)
    return None


def music_deezer(it):
    q = urllib.parse.urlencode({'q': f'artist:"{it.get("creator", "")}" album:"{it["title"]}"', 'limit': 15})
    res = get_json(f'https://api.deezer.com/search/album?{q}').get('data', [])
    best, s = pick(res, lambda r: 0.65 * sim(it['title'], r.get('title')) + 0.35 * sim(it.get('creator'), (r.get('artist') or {}).get('name'))
                   - variant_penalty(it['title'], r.get('title')))
    if best and s >= THRESHOLD and best.get('cover_xl'):
        return {'from': 'Deezer', 'url': best['cover_xl'], 'match': f"{best.get('title')} by {(best.get('artist') or {}).get('name')}", 'score': s}
    short('Deezer', res, s)
    return None


def movie_tmdb(it):
    key = os.environ.get('TMDB_API_KEY', '').strip()
    if not key:
        return None
    params = {'query': it['title'], 'include_adult': 'false'}
    if it.get('year'):
        params['year'] = it['year']
    headers = {}
    if key.startswith('eyJ'):
        headers['Authorization'] = f'Bearer {key}'
    else:
        params['api_key'] = key
    res = get_json('https://api.themoviedb.org/3/search/movie?' + urllib.parse.urlencode(params), headers=headers).get('results', [])
    best, s = pick(res, lambda r: 0.75 * best_sim(it['title'], [r.get('title'), r.get('original_title')]) + 0.25 * year_score(it.get('year'), r.get('release_date')))
    if best and s >= THRESHOLD and best.get('poster_path'):
        return {'from': 'TMDB', 'url': f"https://image.tmdb.org/t/p/w780{best['poster_path']}", 'match': f"{best.get('title')} ({(best.get('release_date') or '')[:4]})", 'score': s}
    short('TMDB', res, s)
    return None


def movie_imdb(it):
    """IMDb's public title-suggestion feed: title, year and poster, no key."""
    q = re.sub(r'\s+', ' ', str(it['title']).lower()).strip()
    url = f"https://v3.sg.media-imdb.com/suggestion/{urllib.parse.quote(q[:1] or 'x')}/{urllib.parse.quote(q)}.json"
    res = [r for r in get_json(url).get('d', []) if (r.get('i') or {}).get('imageUrl')]
    return choose_imdb(it, res)


def choose_imdb(it, res):
    def score(r):
        kind = 0.0 if r.get('qid') in ('movie', 'tvMovie', 'video', None) or r.get('q') == 'feature' else 0.25
        return 0.7 * sim(it['title'], r.get('l')) + 0.3 * year_score(it.get('year'), r.get('y')) - kind - variant_penalty(it['title'], r.get('l'))
    best, s = pick(res, score)
    if best and s >= THRESHOLD:
        img = best['i']['imageUrl']
        img = re.sub(r'\._V1_.*\.jpg$', '._V1_SX800.jpg', img)
        return {'from': 'IMDb', 'url': img, 'match': f"{best.get('l')} ({best.get('y')})", 'score': s}
    short('IMDb', res, s)
    return None


def movie_itunes(it):
    q = urllib.parse.urlencode({'term': it['title'], 'media': 'movie', 'entity': 'movie', 'limit': 20})
    res = get_json(f'https://itunes.apple.com/search?{q}').get('results', [])
    return choose_film(it, res)


def choose_film(it, res):
    best, s = pick(res, lambda r: 0.6 * sim(it['title'], r.get('trackName')) + 0.2 * sim(it.get('creator'), r.get('artistName'))
                   + 0.2 * year_score(it.get('year'), r.get('releaseDate')) - variant_penalty(it['title'], r.get('trackName')))
    if best and s >= THRESHOLD and best.get('artworkUrl100'):
        return {'from': 'iTunes', 'url': best['artworkUrl100'].replace('100x100bb', '600x900bb'),
                'match': f"{best.get('trackName')} ({(best.get('releaseDate') or '')[:4]})", 'score': s}
    short('iTunes films', res, s)
    return None


def book_isbn(it):
    """An item with an isbn gets that exact edition's cover."""
    isbn = re.sub(r'[^0-9Xx]', '', str(it.get('isbn') or ''))
    if not isbn:
        return None
    return {'from': 'Open Library', 'url': f'https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg?default=false', 'match': f'ISBN {isbn}', 'score': 1.0}


def book_openlibrary(it):
    fields = 'title,author_name,first_publish_year,cover_i'
    queries = [{'title': it['title'], 'author': it.get('creator', '')}, {'q': f"{it['title']} {it.get('creator', '')}".strip()}]
    res, best, s = [], None, 0.0
    for params in queries:
        q = urllib.parse.urlencode({**params, 'limit': 20, 'fields': fields})
        res = [d for d in get_json(f'https://openlibrary.org/search.json?{q}').get('docs', []) if d.get('cover_i')]
        best, s = pick(res, lambda d: 0.65 * sim(it['title'], d.get('title')) + 0.35 * best_sim(it.get('creator'), d.get('author_name') or [])
                       - variant_penalty(it['title'], d.get('title')))
        if best and s >= THRESHOLD:
            return {'from': 'Open Library', 'url': f"https://covers.openlibrary.org/b/id/{best['cover_i']}-L.jpg?default=false",
                    'match': f"{best.get('title')} by {', '.join(best.get('author_name') or [])}", 'score': s}
    short('Open Library', res, s)
    return None


def book_google(it):
    q = f'intitle:{it["title"]}' + (f' inauthor:{it["creator"]}' if it.get('creator') else '')
    params = {'q': q, 'maxResults': 10, 'printType': 'books'}
    if os.environ.get('GOOGLE_BOOKS_API_KEY'):
        params['key'] = os.environ['GOOGLE_BOOKS_API_KEY']
    res = get_json('https://www.googleapis.com/books/v1/volumes?' + urllib.parse.urlencode(params)).get('items', [])
    res = [r.get('volumeInfo', {}) for r in res if (r.get('volumeInfo') or {}).get('imageLinks')]
    best, s = pick(res, lambda v: 0.65 * sim(it['title'], v.get('title')) + 0.35 * best_sim(it.get('creator'), v.get('authors') or [])
                   - variant_penalty(it['title'], v.get('title')))
    if best and s >= THRESHOLD:
        links = best['imageLinks']
        url = (links.get('extraLarge') or links.get('large') or links.get('medium') or links.get('thumbnail')).replace('http://', 'https://')
        url = re.sub(r'&edge=curl', '', url)
        return {'from': 'Google Books', 'url': url + '&fife=w800', 'match': best.get('title'), 'score': s}
    return None


ANILIST_Q = '''query ($q: String, $type: MediaType) { Page(perPage: 8) { media(search: $q, type: $type, sort: SEARCH_MATCH) {
  title { romaji english native } startDate { year } coverImage { extraLarge large }
  studios(isMain: true) { nodes { name } } staff(perPage: 4) { nodes { name { full } } } } } }'''


def anilist(it, kind):
    data = post_json('https://graphql.anilist.co', {'query': ANILIST_Q, 'variables': {'q': it['title'], 'type': 'MANGA' if kind == 'manga' else 'ANIME'}})
    res = ((data.get('data') or {}).get('Page') or {}).get('media') or []
    return choose_anilist(it, kind, res)


def choose_anilist(it, kind, res):
    def score(m):
        t = m.get('title') or {}
        s = 0.65 * best_sim(it['title'], [t.get('english'), t.get('romaji')])
        if it.get('original') and t.get('native') and it['original'].strip() == t['native'].strip():
            s = max(s, 0.65)
        s += 0.2 * year_score(it.get('year'), (m.get('startDate') or {}).get('year'))
        people = [n.get('name') for n in ((m.get('studios') or {}).get('nodes') or [])]
        people += [(n.get('name') or {}).get('full') for n in ((m.get('staff') or {}).get('nodes') or [])]
        s += 0.15 * best_sim(it.get('creator'), people)
        return s
    best, s = pick(res, score)
    img = (best or {}).get('coverImage') or {}
    if best and s >= THRESHOLD - 0.05 and (img.get('extraLarge') or img.get('large')):
        t = best.get('title') or {}
        return {'from': 'AniList', 'url': img.get('extraLarge') or img.get('large'), 'match': t.get('english') or t.get('romaji'), 'score': round(s, 3)}
    return None


def jikan(it, kind):
    q = urllib.parse.urlencode({'q': it['title'], 'limit': 10})
    res = get_json(f'https://api.jikan.moe/v4/{"manga" if kind == "manga" else "anime"}?{q}').get('data', [])

    def score(m):
        s = 0.7 * best_sim(it['title'], [m.get('title'), m.get('title_english')] + [t.get('title') for t in m.get('titles') or []])
        y = m.get('year') or (((m.get('aired') or m.get('published') or {}).get('prop') or {}).get('from') or {}).get('year')
        return s + 0.3 * year_score(it.get('year'), y)
    best, s = pick(res, score)
    url = ((best or {}).get('images') or {}).get('jpg', {}).get('large_image_url')
    if best and s >= THRESHOLD and url:
        return {'from': 'MyAnimeList', 'url': url, 'match': best.get('title_english') or best.get('title'), 'score': s}
    return None


MD = 'https://api.mangadex.org'


def mangadex(it):
    q = urllib.parse.urlencode([('title', it['title']), ('limit', 10), ('includes[]', 'author'),
                                ('contentRating[]', 'safe'), ('contentRating[]', 'suggestive'), ('contentRating[]', 'erotica')])
    res = get_json(f'{MD}/manga?{q}').get('data', [])
    best, s = pick(res, lambda m: score_mangadex(it, m))
    if not best or s < THRESHOLD:
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
        return None
    url = lambda fn: f"https://uploads.mangadex.org/covers/{best['id']}/{fn}.512.jpg"  # noqa: E731
    titles = (best.get('attributes') or {}).get('title') or {}
    return {'from': 'MangaDex', 'vols': {v: url(fn) for v, fn in vols.items()}, 'match': next(iter(titles.values()), it['title']), 'score': s}


def score_mangadex(it, m):
    a = m.get('attributes') or {}
    names = list((a.get('title') or {}).values()) + [t for d in a.get('altTitles') or [] for t in d.values()]
    s = 0.7 * best_sim(it['title'], names)
    if it.get('original') and it['original'] in names:
        s = max(s, 0.7)
    authors = [(r.get('attributes') or {}).get('name') for r in m.get('relationships') or [] if r.get('type') == 'author']
    s += 0.15 * best_sim(it.get('creator'), authors) + 0.15 * year_score(it.get('year'), a.get('year'))
    return s


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


SOURCES = {
    'music': [music_itunes, music_deezer],
    'movies': [movie_tmdb, movie_imdb, movie_itunes],
    'books': [book_isbn, book_openlibrary, book_google],
    'anime': [lambda it: anilist(it, 'anime'), lambda it: jikan(it, 'anime')],
    'manga': [mangadex, lambda it: anilist(it, 'manga'), lambda it: jikan(it, 'manga')],
}


# ------------------------------------------------------------------ images
def check(url):
    """Fetch the image into memory to make sure the link serves a real cover. Nothing is written."""
    body, ctype = http(url)
    if not ctype.startswith('image/') or len(body) < 2000:
        raise ValueError(f'not an image ({ctype}, {len(body)} bytes)')
    return body


def palette(image):
    """[ground, ink, accent, extra] from the cover, the same recipe the site uses."""
    try:
        from PIL import Image
    except ImportError:
        return None
    try:
        im = Image.open(io.BytesIO(image) if isinstance(image, bytes) else image).convert('RGB').resize((28, 28))
    except Exception:
        return None
    bins = {}
    for px in im.getdata():
        k = (px[0] >> 4, px[1] >> 4, px[2] >> 4)
        b = bins.setdefault(k, [0, 0, 0, 0])
        b[0] += 1; b[1] += px[0]; b[2] += px[1]; b[3] += px[2]
    cols = sorted(([b[0], (b[1] / b[0], b[2] / b[0], b[3] / b[0])] for b in bins.values()), key=lambda x: -x[0])
    bg = cols[0][1]
    dist = lambda a, b: sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5  # noqa: E731

    def lum(c):
        f = lambda v: (v / 255) / 12.92 if v / 255 <= 0.03928 else ((v / 255 + 0.055) / 1.055) ** 2.4  # noqa: E731
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])

    def contrast(a, b):
        x, y = lum(a), lum(b)
        return (max(x, y) + 0.05) / (min(x, y) + 0.05)

    sat = lambda c: (max(c) - min(c)) / max(c) if max(c) else 0  # noqa: E731
    far = [c for c in cols if dist(c[1], bg) > 90]
    accent = max(far, key=lambda c: sat(c[1]) * c[0] ** 0.5)[1] if far else ((20, 20, 20) if lum(bg) > 0.5 else (240, 236, 226))
    ink = next((c[1] for c in far if contrast(c[1], bg) >= 4.5), (22, 20, 18) if lum(bg) > 0.45 else (244, 240, 230))
    extra = next((c[1] for c in far if dist(c[1], accent) > 70), accent)
    hx = lambda c: '#' + ''.join(f'{round(v):02x}' for v in c)  # noqa: E731
    return [hx(bg), hx(ink), hx(accent if contrast(accent, bg) > 1.6 else ink), hx(extra)]


# ------------------------------------------------------------------ main
def resolve(kind, it, log):
    for src in SOURCES.get(kind, []):
        try:
            hit = src(it)
        except Exception as e:  # one source failing should not stop the others
            log(f'      {getattr(src, "__name__", "source")} failed: {e}')
            continue
        if hit:
            return hit
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
    log = lambda m: print(m, flush=True)  # noqa: E731
    stats = {'found': 0, 'missed': 0, 'skipped': 0}
    live = set()

    def save():
        if not args.dry_run:
            COVERS_JSON.write_text(json.dumps(dict(sorted(covers.items())), indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    for room, items in rooms:
        kind = room.get('kind', room['id'])
        for it in items:
            key = f"{room['id']}/{it['_id']}"
            live.add(key)
            if args.room and room['id'] != args.room or args.only and it['_id'] != args.only:
                continue
            if 'cover' in it:
                stats['skipped'] += 1
                continue
            prev = covers.get(key)
            if prev and not args.refresh and not (prev.get('miss') and args.retry_misses):
                stats['skipped'] += 1
                continue
            it['_vols'] = parse_owned(it.get('owned'), it.get('total')) if kind == 'manga' else []
            log(f"  {key}: {it['title']}")
            hit = resolve(kind, it, log)
            if not hit:
                log('      no confident match')
                covers[key] = {'miss': True, 'tried': today}
                stats['missed'] += 1
                save()
                continue
            log(f"      {hit['from']}: {hit['match']} ({hit['score']})")
            if args.dry_run:
                stats['found'] += 1
                continue
            entry = {'from': hit['from'], 'match': hit['match'], 'fetched': today}
            try:
                if 'vols' in hit:
                    entry['vols'] = {}
                    for v, url in hit['vols'].items():
                        entry['vols'][v] = {'src': url, **({'pal': p} if (p := palette(check(url))) else {})}
                    first = entry['vols'][min(entry['vols'], key=int)]
                    entry['src'] = first['src']
                    if first.get('pal'):
                        entry['pal'] = first['pal']
                else:
                    entry['src'] = hit['url']
                    if (p := palette(check(hit['url']))):
                        entry['pal'] = p
            except Exception as e:
                log(f'      cover link failed: {e}')
                covers[key] = {'miss': True, 'tried': today, 'error': str(e)[:200]}
                stats['missed'] += 1
                save()
                continue
            covers[key] = entry
            stats['found'] += 1
            save()

    if args.prune:
        for key in [k for k in covers if k not in live]:
            log(f'  pruning {key}')
            covers.pop(key)
        save()

    log(f"covers: {stats['found']} fetched, {stats['missed']} without a match, {stats['skipped']} already done")
    return 0


if __name__ == '__main__':
    sys.exit(main())
