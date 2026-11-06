"""Shared helpers for the shelves tools. Mirrors the id rules in assets/js/model.js."""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'

FORMATS = {
    'vinyl', 'cd', 'cassette', 'dvd', 'bluray', '4k', 'vhs', 'boxset',
    'hardcover', 'paperback', 'tankobon', 'kanzenban', 'deluxe', 'toy',
    'ps5', 'ps4', 'ps3', 'xbox-series', 'xbox-one', 'xbox-360',
}
ALIASES = {
    'lp': 'vinyl', 'record': 'vinyl', 'blu-ray': 'bluray', 'bd': 'bluray', 'uhd': '4k', '4k uhd': '4k',
    'tankōbon': 'tankobon', 'manga': 'tankobon', 'perfect edition': 'kanzenban', 'box set': 'boxset',
    'box': 'boxset', 'tape': 'cassette', 'hc': 'hardcover', 'pb': 'paperback', 'book': 'paperback',
    'playstation 5': 'ps5', 'playstation 4': 'ps4', 'playstation 3': 'ps3', 'xbox series x': 'xbox-series', 'xbox series': 'xbox-series',
    'xsx': 'xbox-series', 'xbox one': 'xbox-one', 'xb1': 'xbox-one', 'xbox 360': 'xbox-360', 'x360': 'xbox-360',
}
KINDS = {'movies', 'music', 'books', 'anime', 'manga', 'toys', 'games'}


def slug(s):
    s = unicodedata.normalize('NFKD', str(s))
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def parse_owned(owned, total=None):
    """'1-12, 15' | 12 | [1, 2, 3] -> sorted unique volume numbers."""
    if owned is None or owned == '':
        return list(range(1, int(total) + 1)) if total else [1]
    if isinstance(owned, bool):
        return [1]
    if isinstance(owned, int):
        return list(range(1, owned + 1))
    if isinstance(owned, list):
        return sorted({int(v) for v in owned if int(v) > 0})
    out = set()
    for part in str(owned).split(','):
        p = part.strip()
        m = re.match(r'^(\d+)\s*(?:-|–|to)\s*(\d+)$', p)
        if m:
            out.update(range(int(m.group(1)), int(m.group(2)) + 1))
        elif p.isdigit():
            out.add(int(p))
    return sorted(out)


def norm_format(f, kind):
    default = {'movies': 'bluray', 'music': 'vinyl', 'books': 'paperback', 'anime': 'bluray', 'manga': 'tankobon', 'toys': 'toy', 'games': 'ps5'}.get(kind, 'paperback')
    k = str(f or default).strip().lower()
    k = ALIASES.get(k, k)
    return k if k in FORMATS else default


def load_json(path):
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


def load_house():
    """Yield (room, items) with each item's site id worked out the same way the site does."""
    house = load_json(DATA / 'house.json')
    rooms = []
    for room in house['rooms']:
        raw = load_json(DATA / room['file'])
        items = raw if isinstance(raw, list) else raw.get('items', [])
        seen, out = set(), []
        for n, it in enumerate(items):
            if not isinstance(it, dict) or not it.get('title'):
                continue
            iid = slug(it['id']) if it.get('id') else slug(it['title'])
            if not iid:
                iid = f'item-{n + 1}'
            if iid in seen:
                iid = f"{iid}-{it.get('year') or n + 1}"
            seen.add(iid)
            out.append({**it, '_id': iid, '_n': n})
        rooms.append((room, out))
    return house, rooms
