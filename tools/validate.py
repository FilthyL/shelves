#!/usr/bin/env python3
"""Check the collection data before it is published. Exits 1 if anything would break the site."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from shelflib import ALIASES, DATA, FORMATS, KINDS, load_house, parse_owned  # noqa: E402


def main():
    errors, warnings = [], []
    try:
        house, rooms = load_house()
    except Exception as e:  # unreadable JSON is the most common mistake
        print(f'error: {e}')
        return 1
    ids = set()
    for room in house['rooms']:
        if room.get('kind') not in KINDS:
            errors.append(f"{room.get('id')}: kind must be one of {', '.join(sorted(KINDS))}")
        if room.get('id') in ids:
            errors.append(f"{room.get('id')}: two rooms share this id")
        ids.add(room.get('id'))
        if not (DATA / room.get('file', '')).is_file():
            errors.append(f"{room.get('id')}: {room.get('file')} not found in data/")
    total = 0
    for room, items in rooms:
        where = room['id']
        seen = {}
        for it in items:
            total += 1
            name = f"{where}/{it['_id']} ({it['title']})"
            if it['_id'] in seen:
                errors.append(f'{name}: same id as item {seen[it["_id"]]}')
            seen[it['_id']] = it['_n'] + 1
            fmt = str(it.get('format') or '').strip().lower()
            if fmt and fmt not in FORMATS and fmt not in ALIASES:
                warnings.append(f"{name}: unknown format '{it['format']}', the room's default will be used")
            r = it.get('rating')
            if r is not None and (not isinstance(r, (int, float)) or not 0 <= r <= 10):
                errors.append(f'{name}: rating must be a number from 0 to 10')
            y = it.get('year')
            if y is not None and not isinstance(y, int):
                errors.append(f'{name}: year must be a whole number')
            if room['kind'] == 'manga':
                vols = parse_owned(it.get('owned'), it.get('total'))
                if not vols:
                    errors.append(f"{name}: could not read owned '{it.get('owned')}'")
                if it.get('total') and vols and max(vols) > int(it['total']):
                    warnings.append(f'{name}: owns volume {max(vols)} but total is {it["total"]}')
            if 'tags' in it and not isinstance(it['tags'], list):
                errors.append(f'{name}: tags must be a list')
    for w in warnings:
        print(f'warning: {w}')
    for e in errors:
        print(f'error: {e}')
    print(f'{len(rooms)} rooms, {total} items, {len(errors)} errors, {len(warnings)} warnings')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
