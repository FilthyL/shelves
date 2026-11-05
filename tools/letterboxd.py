#!/usr/bin/env python3
"""Bring the films from a Letterboxd profile onto the Screening Room shelf.

Sources, all public:
  --user NAME     the profile's films pages (every film, with your star rating)
                  and its RSS feed (your reviews and the year of recent entries).
                  Defaults to "letterboxd" in data/house.json.
  --export PATH   Letterboxd's own data export (Settings > Data > Export your data),
                  as the .zip or the unzipped folder. Use this if the profile pages
                  cannot be read.

Every synced film carries "letterboxd": "<slug>", so later runs add new films and
refresh ratings and reviews without touching entries you added yourself. Ratings
become scores out of 10 (four and a half stars is 9). Covers are found afterwards
by tools/covers.py.

  python3 tools/letterboxd.py                 add new films, refresh synced ones
  python3 tools/letterboxd.py --replace       the shelf becomes exactly your Letterboxd films
  python3 tools/letterboxd.py --dry-run       show what would change
"""
import argparse
import csv
import html
import io
import json
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from shelflib import DATA, load_json, slug  # noqa: E402

UA = 'FilthManor-shelves/1.0 (+https://github.com/FilthyL/shelves)'
NS = {'letterboxd': 'https://letterboxd.com', 'tmdb': 'https://themoviedb.org'}


def get(url, tries=2):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html,application/xml;q=0.9,*/*;q=0.8'})
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if attempt == tries - 1:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == tries - 1:
                raise
        time.sleep(2)


# ------------------------------------------------------------------ profile pages
def _attr(chunk, *names):
    for n in names:
        m = re.search(rf'{n}="([^"]*)"', chunk)
        if m:
            return html.unescape(m.group(1))
    return None


def parse_films_page(page):
    """Films on one /films/page/N/ page: slug, title, year, rating out of 10."""
    films = []
    for chunk in re.split(r'<li class="(?:poster-container|griditem)', page)[1:]:
        film_slug = _attr(chunk, 'data-film-slug', 'data-item-slug')
        if not film_slug:
            m = re.search(r'(?:data-target-link|data-item-link|href)="/film/([^/"]+)/', chunk)
            film_slug = m and m.group(1)
        if not film_slug:
            continue
        name = _attr(chunk, 'data-film-name', 'data-item-name', 'data-item-full-display-name', 'alt') or film_slug.replace('-', ' ').title()
        year = _attr(chunk, 'data-film-release-year')
        m = re.match(r'^(.*)\s\((\d{4})\)$', name)
        if m:
            name, year = m.group(1), year or m.group(2)
        rating = re.search(r'\brated-(\d{1,2})\b', chunk)
        film = {'letterboxd': film_slug, 'title': name.strip()}
        if year and str(year).isdigit():
            film['year'] = int(year)
        if rating:
            film['rating'] = int(rating.group(1))  # half-stars, so already out of 10
        films.append(film)
    return films


def fetch_profile(user, log=print):
    films, page = [], 1
    while page <= 300:
        body = get(f'https://letterboxd.com/{user}/films/page/{page}/')
        found = parse_films_page(body or '')
        if not found:
            break
        films += found
        log(f'  films page {page}: {len(found)} films')
        if f'/{user}/films/page/{page + 1}/' not in (body or ''):
            break
        page += 1
        time.sleep(1)  # be gentle with a public site
    return films


def parse_rss(xml_text):
    """Recent diary entries: slug, title, year, rating, review."""
    out = {}
    root = ET.fromstring(xml_text)
    for item in root.iter('item'):
        link = item.findtext('link') or ''
        m = re.search(r'/film/([^/]+)/', link)
        title = item.findtext('letterboxd:filmTitle', namespaces=NS)
        if not m or not title:
            continue  # lists and other non-film entries
        film = {'letterboxd': m.group(1), 'title': title.strip()}
        year = item.findtext('letterboxd:filmYear', namespaces=NS)
        if year and year.isdigit():
            film['year'] = int(year)
        rating = item.findtext('letterboxd:memberRating', namespaces=NS)
        if rating:
            film['rating'] = round(float(rating) * 2, 1)
        review = review_text(item.findtext('description') or '')
        if review:
            film['note'] = review
        out.setdefault(film['letterboxd'], film)  # newest entry wins
    return out


def review_text(desc):
    paras = [html.unescape(re.sub(r'<[^>]+>', '', p)).strip() for p in re.findall(r'<p>(.*?)</p>', desc, re.S)]
    paras = [p for p in paras if p and not re.match(r'^(Watched|Rewatched) on ', p) and 'This review may contain spoilers' not in p]
    text = '\n\n'.join(paras).strip()
    return text[:1200] if text else None


# ------------------------------------------------------------------ official export
def read_export(path):
    path = Path(path)
    files = {}
    if path.suffix == '.zip':
        with zipfile.ZipFile(path) as z:
            for n in z.namelist():
                if n.endswith('.csv'):
                    files[Path(n).name] = z.read(n).decode('utf-8-sig')
    else:
        for f in path.glob('*.csv'):
            files[f.name] = f.read_text(encoding='utf-8-sig')

    def rows(name):
        return list(csv.DictReader(io.StringIO(files.get(name, ''))))

    films = {}

    def key(r):
        return f"{slug(r.get('Name', ''))}-{r.get('Year', '')}"

    for r in rows('watched.csv'):
        if r.get('Name'):
            films[key(r)] = {'letterboxd': r.get('Letterboxd URI') or key(r), 'title': r['Name'], **({'year': int(r['Year'])} if (r.get('Year') or '').isdigit() else {})}
    for r in rows('ratings.csv'):
        if key(r) in films and r.get('Rating'):
            films[key(r)]['rating'] = round(float(r['Rating']) * 2, 1)
    for r in rows('reviews.csv'):
        if key(r) in films and (r.get('Review') or '').strip():
            films[key(r)]['note'] = r['Review'].strip()[:1200]
            tags = [t.strip() for t in (r.get('Tags') or '').split(',') if t.strip()]
            if tags:
                films[key(r)]['tags'] = tags
    return list(films.values())


# ------------------------------------------------------------------ merge onto the shelf
def merge(items, films, replace=False, default_format='bluray'):
    """New films go to the front in Letterboxd's order; synced films get fresh ratings and reviews."""
    def same(a, b):
        if a.get('letterboxd') and a.get('letterboxd') == b.get('letterboxd'):
            return True
        return slug(a.get('title', '')) == slug(b.get('title', '')) and (a.get('year') is None or b.get('year') is None or a.get('year') == b.get('year'))

    items = [dict(it) for it in items]  # never change the caller's list
    on_letterboxd, added, updated = set(), [], 0
    for film in films:
        i = next((n for n, it in enumerate(items) if same(it, film)), None)
        if i is not None:
            match, before = items[i], dict(items[i])
            on_letterboxd.add(i)
            match['letterboxd'] = film['letterboxd']
            for k in ('year', 'rating', 'note'):
                if film.get(k) is not None:
                    match[k] = film[k]
            updated += match != before
        else:
            added.append({'title': film['title'], **({'year': film['year']} if film.get('year') else {}), 'format': default_format,
                          **{k: film[k] for k in ('rating', 'note', 'tags') if film.get(k) is not None}, 'letterboxd': film['letterboxd']})
    # --replace keeps only films that are on Letterboxd, with whatever you set on them here (format, featured...)
    kept = [it for n, it in enumerate(items) if not replace or n in on_letterboxd]
    return added + kept, len(added), updated, len(items) - len(kept)


def serialize(items):
    line = lambda it: '    { ' + ', '.join(f'{json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)}' for k, v in it.items()) + ' }'  # noqa: E731
    return '{\n  "items": [\n' + ',\n'.join(line(it) for it in items) + '\n  ]\n}\n'


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--user')
    ap.add_argument('--export')
    ap.add_argument('--replace', action='store_true')
    ap.add_argument('--format', default='bluray')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args(argv)

    house = load_json(DATA / 'house.json')
    room = next((r for r in house['rooms'] if r.get('kind') == 'movies'), None)
    if not room:
        print('There is no movies room in data/house.json.')
        return 1
    path = DATA / room['file']

    films = []
    if args.export:
        films = read_export(args.export)
        print(f'export: {len(films)} films')
    else:
        user = args.user or house.get('letterboxd')
        if not user:
            print('Give --user, or add "letterboxd": "<username>" to data/house.json.')
            return 1
        try:
            films = fetch_profile(user)
        except Exception as e:
            print(f'  could not read the films pages ({e}); using the RSS feed only')
        try:
            feed = parse_rss(get(f'https://letterboxd.com/{user}/rss/') or '<rss/>')
        except Exception as e:
            print(f'  could not read the RSS feed ({e})')
            feed = {}
        if not films:  # pages blocked: the feed is the recent diary only
            films = list(feed.values())
        else:
            for f in films:
                extra = feed.get(f['letterboxd'])
                if extra:
                    f.update({k: v for k, v in extra.items() if k in ('year', 'note') and v is not None})
        print(f'{user}: {len(films)} films ({len(feed)} recent diary entries)')

    if not films:
        print('Found no films, so the shelf was left as it is.')
        return 1
    data = load_json(path)
    items = data if isinstance(data, list) else data.get('items', [])
    new_items, added, updated, removed = merge(items, films, args.replace, args.format)
    print(f'shelf: {added} added, {updated} updated, {removed} removed, {len(new_items)} films in total')
    if not args.dry_run:
        path.write_text(serialize(new_items), encoding='utf-8')
    return 0


if __name__ == '__main__':
    sys.exit(main())
