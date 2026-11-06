// Data model: physical formats, room kinds, palettes, and loading/normalising the JSON.

// Real-world dimensions in millimetres (w × h × d). d = spine thickness.
export const FORMATS = {
  vinyl:     { label: 'Vinyl LP',        group: 'sleeve',   w: 314, h: 314, d: 4,  minSpine: 8 },
  cd:        { label: 'Compact Disc',    group: 'jewel',    w: 142, h: 125, d: 10 },
  cassette:  { label: 'Cassette',        group: 'cassette', w: 69,  h: 109, d: 17 },
  dvd:       { label: 'DVD',             group: 'case',     w: 135, h: 190, d: 14 },
  bluray:    { label: 'Blu-ray',         group: 'case',     w: 135, h: 171, d: 12 },
  '4k':      { label: '4K Ultra HD',     group: 'case',     w: 135, h: 171, d: 12 },
  vhs:       { label: 'VHS',             group: 'vhs',      w: 112, h: 200, d: 28 },
  boxset:    { label: 'Blu-ray box set', group: 'box',      w: 142, h: 190, d: 42 },
  hardcover: { label: 'Hardcover',       group: 'book',     w: 156, h: 236, d: null },
  paperback: { label: 'Paperback',       group: 'book',     w: 129, h: 198, d: null },
  tankobon:  { label: 'Tankōbon',        group: 'manga',    w: 113, h: 176, d: 15 },
  kanzenban: { label: 'Perfect edition', group: 'manga',    w: 148, h: 210, d: 24 },
  deluxe:    { label: 'Deluxe hardcover',group: 'manga',    w: 182, h: 257, d: 30 },
  toy:       { label: 'Toy',             group: 'toy',      w: 120, h: 90,  d: 30 },
  // game cases: the PlayStation and current Xbox keep cases are Blu-ray sized, the Xbox 360's is DVD sized
  ps5:           { label: 'PS5',            group: 'case', w: 135, h: 170, d: 14 },
  ps4:           { label: 'PS4',            group: 'case', w: 135, h: 170, d: 14 },
  ps3:           { label: 'PS3',            group: 'case', w: 135, h: 170, d: 14 },
  'xbox-series': { label: 'Xbox Series X',  group: 'case', w: 135, h: 170, d: 14 },
  'xbox-one':    { label: 'Xbox One',       group: 'case', w: 135, h: 170, d: 14 },
  'xbox-360':    { label: 'Xbox 360',       group: 'case', w: 135, h: 190, d: 14 },
};

const ALIASES = {
  lp: 'vinyl', record: 'vinyl', 'blu-ray': 'bluray', bd: 'bluray', uhd: '4k', '4k uhd': '4k',
  'tankōbon': 'tankobon', manga: 'tankobon', 'perfect edition': 'kanzenban', 'box set': 'boxset',
  box: 'boxset', tape: 'cassette', hc: 'hardcover', pb: 'paperback', book: 'paperback',
  'playstation 5': 'ps5', 'playstation 4': 'ps4', 'playstation 3': 'ps3', 'xbox series x': 'xbox-series', 'xbox series': 'xbox-series',
  xsx: 'xbox-series', 'xbox one': 'xbox-one', xb1: 'xbox-one', 'xbox 360': 'xbox-360', x360: 'xbox-360',
};

export const KINDS = {
  movies: { code: 'MOV', one: 'film',   many: 'films',   verb: 'Watched', by: 'Directed by', format: 'bluray',
            scale: 1.0,  decor: ['reel', 'candle', 'cat', 'plant'] },
  music:  { code: 'MUS', one: 'record', many: 'records', verb: 'Spun',    by: 'Artist',      format: 'vinyl',
            scale: 0.74, decor: ['speaker', 'plant', 'cat', 'candle'] },
  books:  { code: 'BKS', one: 'book',   many: 'books',   verb: 'Read',    by: 'Author',      format: 'paperback',
            scale: 0.92, decor: ['globe', 'candle', 'cat', 'plant'] },
  anime:  { code: 'ANI', one: 'series', many: 'series',  verb: 'Watched', by: 'Studio',      format: 'bluray',
            scale: 0.98, decor: ['daruma', 'plant', 'bookend', 'candle'] },
  toys:   { code: 'TOY', one: 'toy',    many: 'toys',    verb: 'Played',  by: 'Kind',        format: 'toy',
            scale: 1.0,  decor: ['plant', 'cat', 'candle', 'bookend'] },
  games:  { code: 'GAM', one: 'game',   many: 'games',   verb: 'Played',  by: 'Developer',   format: 'ps5',
            scale: 1.0,  decor: ['controller', 'plant', 'cat', 'candle'] },
  manga:  { code: 'MNG', one: 'volume', many: 'volumes', verb: 'Read',    by: 'Mangaka',     format: 'tankobon',
            scale: 1.0,  decor: ['daruma', 'lantern', 'cat', 'plant'] },
};

// Generated-cover palettes, all drawn from ENDESGA 32: [ground, ink, accent, extra]
export const PALETTES = [
  ['#ead4aa', '#262b44', '#e43b44', '#124e89'],
  ['#181425', '#ead4aa', '#feae34', '#0099db'],
  ['#3a4466', '#ffffff', '#f77622', '#feae34'],
  ['#be4a2f', '#ead4aa', '#feae34', '#3e2731'],
  ['#265c42', '#ead4aa', '#63c74d', '#feae34'],
  ['#124e89', '#ffffff', '#2ce8f5', '#feae34'],
  ['#fee761', '#3e2731', '#e43b44', '#124e89'],
  ['#733e39', '#ead4aa', '#e4a672', '#feae34'],
  ['#ffffff', '#181425', '#e43b44', '#0099db'],
  ['#68386c', '#ead4aa', '#f6757a', '#feae34'],
  ['#193c3e', '#c0cbdc', '#63c74d', '#2ce8f5'],
  ['#a22633', '#ead4aa', '#feae34', '#181425'],
  ['#c0cbdc', '#262b44', '#124e89', '#e43b44'],
  ['#e4a672', '#3e2731', '#be4a2f', '#265c42'],
  ['#262b44', '#c0cbdc', '#e43b44', '#8b9bb4'],
  ['#f77622', '#181425', '#fee761', '#ffffff'],
  ['#3e2731', '#e8b796', '#b55088', '#e4a672'],
  ['#0099db', '#181425', '#ffffff', '#fee761'],
  ['#e8b796', '#733e39', '#a22633', '#3e8948'],
  ['#5a6988', '#ffffff', '#feae34', '#262b44'],
];

// ---------- small utilities ----------
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function slug(s) {
  return String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** "1-12, 15" | 12 | [1,2,3] → sorted unique volume numbers */
export function parseOwned(owned, total) {
  if (owned == null || owned === '') return total ? range(1, total) : [1];
  if (typeof owned === 'number') return range(1, owned);
  if (Array.isArray(owned)) return [...new Set(owned.map(Number).filter(n => n > 0))].sort((a, b) => a - b);
  const out = [];
  for (const part of String(owned).split(',')) {
    const p = part.trim();
    const m = p.match(/^(\d+)\s*(?:-|–|to)\s*(\d+)$/);
    if (m) out.push(...range(+m[1], +m[2]));
    else if (/^\d+$/.test(p)) out.push(+p);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

function range(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }

export function compactRanges(nums) {
  const out = []; let s = null, p = null;
  for (const n of nums) {
    if (s === null) { s = p = n; continue; }
    if (n === p + 1) { p = n; continue; }
    out.push(s === p ? `${s}` : `${s}–${p}`); s = p = n;
  }
  if (s !== null) out.push(s === p ? `${s}` : `${s}–${p}`);
  return out.join(', ');
}

export function normFormat(f, kind) {
  const k = String(f || KINDS[kind]?.format || 'paperback').trim().toLowerCase();
  const name = ALIASES[k] || k;
  return FORMATS[name] ? name : (KINDS[kind]?.format || 'paperback');
}

// ---------- loading ----------
async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

export async function loadHouse(base = 'data/') {
  const [house, covers] = await Promise.all([
    getJSON(base + 'house.json'),
    getJSON(base + 'covers.json').catch(() => ({})),
  ]);
  const rooms = await Promise.all(house.rooms.map(async (r, i) => {
    const data = await getJSON(base + r.file);
    const raw = Array.isArray(data) ? data : data.items || [];
    return Object.assign(buildRoom(r, raw, covers, i, house.name), { raw });
  }));
  return { ...house, covers, rooms, byId: Object.fromEntries(rooms.map(r => [r.id, r])) };
}

/** Put a new entry on a room's shelf (at the front or the end) and rebuild that room. */
export function putEntry(house, roomId, entry, where = 'front') {
  const i = house.rooms.findIndex(r => r.id === roomId);
  if (i < 0) return null;
  const old = house.rooms[i];
  const raw = where === 'end' ? [...old.raw, entry] : [entry, ...old.raw];
  const room = Object.assign(buildRoom(old, raw, house.covers || {}, old.index, house.name), { raw, where: old.where });
  house.rooms[i] = room;
  house.byId[roomId] = room;
  return room;
}

function buildRoom(meta, rawItems, covers, index, houseName = 'Filth Manor') {
  // shelfmark prefix from the house's initials: Filth Manor -> FM
  const prefix = (String(houseName).match(/[A-Za-z0-9]+/g) || ['FM']).map(w => w[0]).join('').toUpperCase().slice(0, 3);
  const kind = KINDS[meta.kind] ? meta.kind : 'books';
  const K = KINDS[kind];
  const room = { ...meta, kind, K, index, items: [], objects: [] };
  const seen = new Set();

  rawItems.forEach((raw, n) => {
    if (!raw || !raw.title) return;
    let id = raw.id ? slug(raw.id) : slug(raw.title);
    if (!id) id = 'item-' + (n + 1);
    if (seen.has(id)) id = `${id}-${raw.year || n + 1}`;
    seen.add(id);

    const format = normFormat(raw.format, kind);
    const seed = hash(`${room.id}/${id}`);
    const pal = Array.isArray(raw.colors) && raw.colors.length >= 2
      ? [raw.colors[0], raw.colors[1], raw.colors[2] || raw.colors[1], raw.colors[3] || raw.colors[2] || raw.colors[1]]
      : PALETTES[seed % PALETTES.length];
    // covers.json is written by tools/covers.py: { src, from, pal, vols: { "3": { src, pal } } }
    const entry = covers[`${room.id}/${id}`];
    const fetched = typeof entry === 'string' ? { src: entry } : (entry && (entry.src || entry.vols) ? entry : null);
    const useFetched = raw.cover === undefined || raw.cover === null;
    const volCovers = {}, coverPal = {};
    if (useFetched && fetched) {
      if (fetched.pal) coverPal.src = fetched.pal;
      for (const [v, e] of Object.entries(fetched.vols || {})) {
        const src = typeof e === 'string' ? e : e?.src;
        if (src) volCovers[v] = src;
        if (e?.pal) coverPal[v] = e.pal;
      }
    }
    const firstVol = Object.keys(volCovers).sort((a, b) => a - b)[0];
    const cover = raw.cover === false ? null : (raw.cover || (useFetched && (fetched?.src || volCovers[firstVol])) || null);

    const item = {
      ...raw, id, kind, room: room.id, format, fmt: FORMATS[format], seed, pal, cover,
      cat: `${prefix}-${K.code}-${String(n + 1).padStart(3, '0')}`, house: houseName,
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      order: n, volCovers, coverPal, source: useFetched && fetched ? fetched.from || null : null,
    };
    if (kind === 'manga') {
      item.vols = parseOwned(raw.owned, raw.total);
      if (!item.vols.length) item.vols = [1];
    }
    room.items.push(item);
  });

  room.objects = room.items.flatMap(item => objectsFor(item));
  return room;
}

function objectsFor(item) {
  const fmt = item.fmt;
  const r = rng(item.seed);
  if (item.kind === 'manga') {
    return item.vols.map((v, i) => ({
      key: `${item.id}--${v}`, item, vol: v, fmt, cover: item.volCovers[v] || item.cover,
      w: fmt.w, h: fmt.h, d: fmt.d + Math.round((r() - 0.5) * 4),
      face: item.featured && i === 0,
    }));
  }
  let d = fmt.d;
  if (fmt.group === 'book') {
    const pages = +item.pages || Math.round(180 + r() * 420);
    d = Math.max(9, Math.min(72, pages * 0.058 + (item.format === 'hardcover' ? 7 : 2)));
  }
  // books vary slightly in trim size; cases are standard
  const jitter = fmt.group === 'book' ? 1 + (r() - 0.5) * 0.09 : 1;
  return [{ key: item.id, item, vol: null, fmt, cover: item.cover, w: fmt.w * jitter, h: fmt.h * jitter, d, face: !!item.featured }];
}

export function roomStats(room) {
  const counts = {};
  for (const o of room.objects) counts[o.item.format] = (counts[o.item.format] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([f, n]) => ({ format: f, label: FORMATS[f].label, n }));
}

export function countLine(room) {
  const K = room.K;
  if (room.kind === 'manga') {
    return `${room.items.length} series · ${room.objects.length} ${room.objects.length === 1 ? K.one : K.many}`;
  }
  const n = room.items.length;
  return `${n} ${n === 1 ? K.one : K.many}`;
}
