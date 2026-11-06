#!/usr/bin/env python3
"""Find the published cover for everything on the shelves.

Free sources, no keys needed, all shelves looked up at the same time:
  anime   AniList
  manga   Open Library's editions, a cover for each owned volume (the cover Open Library holds, else
          the one Amazon serves for the edition's ISBN), AniList's series cover for any volume without one.
          MangaDex is not used: it now sends image requests to a bot challenge, so no browser can load them
  music   MusicBrainz with the Cover Art Archive (Deezer for a record it lacks)
  books   Open Library (by isbn when the item has one)
  movies  IMDb's public title suggestions
  games   Wikipedia (the box art in each game's article)

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
PACE = {'graphql.anilist.co': 2.1, 'musicbrainz.org': 1.1, 'api.deezer.com': 0.2,
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


# ------------------------------------------------------------------ manga volumes: Open Library editions
VOL_RE = re.compile(r'(?:\bvol(?:ume)?\.?|#|\bbook|\bpart)\s*(\d+)', re.I)
BIG_EDITIONS = ('perfect', 'deluxe', 'kanzenban', 'master edition', 'omnibus', 'collector', 'vizbig', 'definitive')
CJK_RE = re.compile(r'[\u3040-\u30ff\u3400-\u9fff]')
MANGA_V = 4  # bump to look every manga up again (entries made by an older recipe are dropped)
RANGE_RE = re.compile(r'\d+\s*[-\u2010-\u2015~\u301c]\s*\d+')  # "17\u201018": two volumes in one


def volume_of(title):
    """The volume number in an edition's title: "Monster, Vol. 3", "Blame! 4", "Volume 10: ..."."""
    t = str(title or '')
    m = VOL_RE.search(t) or re.search(r'\u7b2c\s*(\d+)\s*\u5dfb', t) or re.search(r'\(?(\d+)\)?\s*$', t)
    return int(m.group(1)) if m else None


def isbn10(isbn):
    """The ISBN-10 for an ISBN-10 or a 978-prefixed ISBN-13 (Amazon keys its images by it), else None."""
    d = re.sub(r'[^0-9Xx]', '', str(isbn))
    if len(d) == 13 and d.startswith('978') and d.isdigit():
        core = d[3:12]
        total = sum((10 - i) * int(c) for i, c in enumerate(core))
        check = (11 - total % 11) % 11
        return core + ('X' if check == 10 else str(check))
    return d.upper() if len(d) == 10 else None


def isbn13(isbn):
    """The ISBN-13 for an ISBN-10 or an ISBN-13, else None."""
    d = re.sub(r'[^0-9Xx]', '', str(isbn)).upper()
    if len(d) == 13 and d.isdigit():
        return d
    if len(d) == 10:
        core = '978' + d[:9]
        return core + str((10 - sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(core)) % 10) % 10)
    return None


def jp_links(isbns):
    """Covers of a Japanese edition by its ISBN, from Japanese book-cover services. A record's own ISBNs are far
    more reliable than the images Open Library attaches to it, which are sometimes another volume's."""
    out = []
    for i in list(dict.fromkeys(x for x in map(isbn13, isbns) if x and x.startswith('9784')))[:4]:
        out += [f'https://cover.openbd.jp/{i}.jpg', f'https://ndlsearch.ndl.go.jp/thumbnail/{i}.jpg']
    return out


def isbn_links(isbns):
    """Image links keyed by an edition's ISBN: Open Library's, the VIZ and Amazon image servers, AbeBooks'."""
    out = []
    for i in isbns:
        ten = isbn10(i)
        out.append(f'https://covers.openlibrary.org/b/isbn/{i}-L.jpg?default=false')
        for key in dict.fromkeys(k for k in (ten, i) if k):
            out.append(f'https://dw9to29mmj727.cloudfront.net/products/{key}.jpg')
        if ten:
            out.append(f'https://m.media-amazon.com/images/P/{ten}.01.LZZZZZZZ.jpg')
        out.append(f'https://pictures.abebooks.com/isbn/{i}-us.jpg')
    return out


SET_WORDS = ('box', '-in-1', 'omnibus', 'maximum', 'maximun', ' set', 'collection', 'guide', 'artbook', 'art book', 'illustration', 'fan book', 'fanbook', 'official',
             '\u30ac\u30a4\u30c9', '\u30a4\u30e9\u30b9\u30c8', '\u30bb\u30c3\u30c8', '\u753b\u96c6')


def openlibrary_volumes(it, wanted, log):
    """Candidate cover links per wanted volume from Open Library's editions of the series, best edition first:
    the cover Open Library holds, then images keyed by the edition's ISBN. {volume: [url, ...]}.

    The shelves list the Japanese publishers (Shueisha, Kodansha ...), so the Japanese edition's covers come
    first and the rest only fill what it lacks; an item can say "edition": "en" to prefer the English ones. The
    series is searched once for everything, then each volume still without a preferred cover is searched for."""
    wanted, found = set(wanted), {}
    big = it.get('format') in ('kanzenban', 'deluxe')
    want_jp = it.get('edition', 'jp') != 'en'
    names = [n.strip() for n in (it['title'], it.get('original')) if n and n.strip()]
    creator = it.get('creator') or ''
    norm = lambda x: re.sub(r'[^a-z0-9 ]+', '', str(x).lower())  # noqa: E731
    latin = lambda x: bool(re.search(r'[A-Za-z]', str(x)))  # noqa: E731

    def named(t):
        # a Latin title is compared without punctuation; a Japanese one has to appear as written
        return any((norm(n) in norm(t)) if norm(n) else (n in t) for n in names)

    def collect(params):
        q = urllib.parse.urlencode({**params, 'limit': 100, 'fields': 'title,author_name,cover_i,isbn,language'})
        for d in get_json(f'https://openlibrary.org/search.json?{q}').get('docs', []):
            title = d.get('title') or ''
            t, v = title.lower(), volume_of(title)
            all_isbns = [i for i in (str(x) for x in d.get('isbn') or []) if len(re.sub(r'[^0-9Xx]', '', i)) in (10, 13)]
            isbns = list(dict.fromkeys(all_isbns))[:4]
            if v not in wanted or not (d.get('cover_i') or isbns) or not named(title):
                continue
            raw = d.get('author_name') or []
            # Open Library often lists the mangaka in Japanese, or as "\u4e95\u4e0a\u96c4\u5f66 (Takehiko Inoue)": compare the Latin parts
            authors = [x.strip() for a in raw for x in [a, re.sub(r'\(.*?\)', '', a)] + re.findall(r'\((.*?)\)', a)]
            if creator and any(latin(a) for a in authors) and best_sim(creator, [a for a in authors if latin(a)]) < 0.6:
                continue
            if RANGE_RE.search(title):
                continue  # two or more volumes in one
            is_big = any(w in t for w in BIG_EDITIONS)
            if (any(w in t for w in SET_WORDS) and not (big and is_big and 'box' not in t)) or (is_big and not big):
                continue  # a box, an omnibus, a guide or a different printing's collected volumes
            jp = bool(CJK_RE.search(title)) or 'jpn' in (d.get('language') or []) or (bool(raw) and not any(latin(a) for a in raw))
            own = [f"https://covers.openlibrary.org/b/id/{d['cover_i']}-L.jpg?default=false"] if d.get('cover_i') else []
            urls = (jp_links(all_isbns) + own + isbn_links(isbns)) if jp else own + isbn_links(isbns)
            rank = (1 if jp == want_jp else 0, 1 if is_big == big else 0, 1 if d.get('cover_i') else 0)
            found.setdefault(v, []).append((rank, urls))

    def settled(v):  # a volume is done once it has a cover from the edition we prefer
        return any(r[0] for r, _ in found.get(v, []))

    creator_q = {'author': creator} if creator else {}
    series = [{'title': it['title'], **creator_q}, {'q': f"{it['title']} {creator}".strip()}]
    if it.get('original'):
        series.append({'title': it['original']})
    for params in series:
        collect(params)
        if all(settled(v) for v in wanted):
            break
    for v in sorted(wanted):
        if settled(v):
            continue
        tries = [{'q': f"{it['original']} {v}"}, {'title': f"{it['original']}({v})"}] if it.get('original') and want_jp else []
        tries += [{'q': f"{it['title']} vol {v} {creator}".strip()}, {'title': f"{it['title']} volume {v}"}]
        for params in tries:
            collect(params)
            if settled(v) or (v in found and not want_jp):
                break
    out = {}
    for v, cands in found.items():
        links = []
        for _, urls in sorted(cands, key=lambda c: c[0], reverse=True)[:3]:
            links += [u for u in urls if u not in links]
        out[str(v)] = links
    if out:
        log(f'Open Library: editions for volumes {sorted(int(v) for v in out)}')
    return out


def manga_volumes(it, kind, log):
    """A cover per owned volume where an edition has one, and the series cover (AniList) for the rest."""
    vols = openlibrary_volumes(it, it['_vols'], log)
    series = None
    try:
        series = anilist(it, kind, log)
    except Exception as e:  # the volumes alone are still worth keeping
        log(f'AniList failed: {e}')
    if not vols and not series:
        return None
    hit = {'from': 'Open Library' + (' and AniList' if vols and series else '') if vols else 'AniList',
           'match': (series or {}).get('match') or it['title'], 'score': (series or {}).get('score', 1.0), 'vols': vols}
    if series:
        hit['url'] = series['url']
    return hit


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


# ------------------------------------------------------------------ games: Wikipedia
WP = 'https://en.wikipedia.org/w/api.php'


def game_wikipedia(it, kind, log):
    """Box art from the game's Wikipedia article: the infobox image is the published cover."""
    q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'generator': 'search', 'gsrsearch': f"{it['title']} video game",
                                'gsrlimit': 8, 'prop': 'pageimages|description', 'piprop': 'original', 'redirects': 1,
                                # box art is used under fair use: without this the API only offers free images (logos)
                                'pilicense': 'any'})
    pages = [p for p in ((get_json(f'{WP}?{q}').get('query') or {}).get('pages') or {}).values()
             if (p.get('original') or {}).get('source') and not re.search(r'series|franchise', f"{p.get('title')} {p.get('description')}", re.I)]

    def score(p):
        desc = (p.get('description') or '').lower()
        name = re.sub(r'\s*\((?:\d{4} )?video game\)$', '', p.get('title') or '')
        m = re.search(r'(?:19|20)\d\d', desc)
        not_game = 0 if 'video game' in desc else 0.3
        return 0.75 * sim(it['title'], name) + 0.25 * year_score(it.get('year'), int(m.group(0)) if m else None) - not_game - variant_penalty(it['title'], name)
    best, s = pick(pages, score)
    if best and s >= THRESHOLD:
        return {'from': 'Wikipedia', 'url': best['original']['source'], 'match': best.get('title'), 'score': s}
    short('Wikipedia', pages, s, log)
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
    'manga': [manga_volumes],
    'music': [music_musicbrainz, music_deezer],
    'books': [book_openlibrary],
    'movies': [movie_imdb],
    'games': [game_wikipedia],
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
            entry = {'from': hit['from'], 'match': hit['match'], **({'v': MANGA_V} if kind == 'manga' else {})}
            if 'vols' in hit:
                entry['vols'] = {}
                for v, urls in hit['vols'].items():
                    for url in [urls] if isinstance(urls, str) else urls:
                        try:
                            img = check(url, log)
                        except Exception as e:
                            log(f'volume {v}: {e}')
                            continue
                        entry['vols'][v] = {'src': url, **({'pal': p} if img and (p := palette(img)) else {})}
                        break
                if hit.get('url'):
                    try:
                        img = check(hit['url'], log)
                        entry['src'] = hit['url']
                        if img and (p := palette(img)):
                            entry['pal'] = p
                    except Exception as e:
                        log(f'series cover: {e}')
                if not entry['vols'] and 'src' not in entry:
                    continue
                if 'src' not in entry:
                    first = entry['vols'][min(entry['vols'], key=int)]
                    entry.update({k: first[k] for k in ('src', 'pal') if k in first})
            else:
                img = check(hit['url'], log)
                entry['src'] = hit['url']
                if img and (p := palette(img)):
                    entry['pal'] = p
            for v, url in (it.get('vol_covers') or {}).items():  # a cover the owner pinned by hand wins
                try:
                    img = check(url, log)
                    entry.setdefault('vols', {})[str(v)] = {'src': url, **({'pal': p} if img and (p := palette(img)) else {})}
                except Exception as e:
                    log(f'pinned volume {v}: {e}')
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
    for key in [k for k, e in covers.items() if 'uploads.mangadex.org' in json.dumps(e) or (k.startswith('manga/') and not e.get('miss') and e.get('v') != MANGA_V)]:
        covers.pop(key)  # MangaDex's images are challenge-walled; and a manga found by an older recipe is looked up again
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
            gaps = kind == 'manga' and prev and not prev.get('miss') and prev.get('checked') != today and \
                {str(v) for v in parse_owned(it.get('owned'), it.get('total'))} - set(prev.get('vols') or {})
            if 'cover' in it or kind not in SOURCES or (prev and not args.refresh and not (prev.get('miss') and args.retry_misses) and not gaps):
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
                prev = covers.get(key) or {}
                if entry and prev.get('vols') and len(entry.get('vols') or {}) <= len(prev['vols']):
                    prev['checked'] = today  # no better than what we had: keep it, ask again tomorrow
                    log(f"still {len(prev['vols'])} volume covers, keeping them")
                    save()
                    continue
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
