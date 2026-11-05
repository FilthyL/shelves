// Pixel-art renderer for the house, the street and the room decor.
// Every colour comes from the ENDESGA 32 palette by Endesga (lospec.com/palette-list/endesga-32).

export const E = {
  rust: '#be4a2f', ochre: '#d77643', sand: '#ead4aa', peach: '#e4a672', clay: '#b86f50', brown: '#733e39', plum: '#3e2731',
  wine: '#a22633', red: '#e43b44', orange: '#f77622', amber: '#feae34', yellow: '#fee761',
  lime: '#63c74d', green: '#3e8948', pine: '#265c42', deep: '#193c3e',
  blue: '#124e89', sky: '#0099db', cyan: '#2ce8f5',
  white: '#ffffff', fog: '#c0cbdc', steel: '#8b9bb4', slate: '#5a6988', navy: '#3a4466', ink: '#262b44', night: '#181425',
  hot: '#ff0044', grape: '#68386c', rose: '#b55088', pink: '#f6757a', skin: '#e8b796', tan: '#c28569',
};

// Room interiors: back wall, wall motif, floor, floor line, shelf wood (dark, mid, light), light colour
export const THEMES = {
  manga:  { wall: E.sand,  motif: E.tan,    floor: E.peach, floorLine: E.tan,   wood: [E.brown, E.clay, E.peach], light: E.orange },
  anime:  { wall: E.navy,  motif: E.ink,    floor: E.plum,  floorLine: E.night, wood: [E.ink, E.slate, E.steel],  light: E.cyan },
  music:  { wall: E.brown, motif: E.plum,   floor: E.plum,  floorLine: E.night, wood: [E.plum, E.clay, E.peach],  light: E.amber },
  books:  { wall: E.pine,  motif: E.deep,   floor: E.brown, floorLine: E.plum,  wood: [E.plum, E.brown, E.clay],  light: E.amber },
  movies: { wall: E.wine,  motif: E.brown,  floor: E.plum,  floorLine: E.night, wood: [E.night, E.plum, E.brown], light: E.fog },
};

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const cache = new Map();
export function col(hex) {
  let c = cache.get(hex);
  if (c === undefined) {
    const n = parseInt(hex.slice(1, 7), 16);
    c = ((255 << 24) | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)) >>> 0;
    cache.set(hex, c);
  }
  return c;
}

export class Raster {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint32Array(w * h); }
  px(x, y, c) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.d[y * this.w + x] = col(c); }
  rect(x, y, w, h, c) {
    const v = col(c); x |= 0; y |= 0;
    const x0 = Math.max(0, x), x1 = Math.min(this.w, x + w), y0 = Math.max(0, y), y1 = Math.min(this.h, y + h);
    for (let j = y0; j < y1; j++) this.d.fill(v, j * this.w + x0, j * this.w + x1);
  }
  /** stipple colour c over an area at density t (0..1) using a 4×4 Bayer matrix */
  dith(x, y, w, h, c, t) {
    const v = col(c); x |= 0; y |= 0;
    for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++)
      for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++)
        if (BAYER[j & 3][i & 3] < t * 16) this.d[j * this.w + i] = v;
  }
  hl(x, y, w, c) { this.rect(x, y, w, 1, c); }
  vl(x, y, h, c) { this.rect(x, y, 1, h, c); }
  circle(cx, cy, r, c, t = 1) {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++)
      if (i * i + j * j <= r * r + r * 0.6 && (t >= 1 || BAYER[(cy + j) & 3][(cx + i) & 3] < t * 16)) this.px(cx + i, cy + j, c);
  }
  sprite(rows, map, x, y) {
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const c = map[row[i]]; if (c) this.px(x + i, y + j, c); } });
  }
  text(str, x, y, c, gap = 1) {
    let cx = x;
    for (const ch of str.toUpperCase()) { const g = FONT[ch] || FONT[' ']; g.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '1') this.px(cx + i, y + j, c); }); cx += g[0].length + gap; }
    return cx - x - gap;
  }
  blit(ctx) { ctx.putImageData(new ImageData(new Uint8ClampedArray(this.d.buffer), this.w, this.h), 0, 0); }
  toURL() {
    const cv = document.createElement('canvas'); cv.width = this.w; cv.height = this.h;
    this.blit(cv.getContext('2d')); return cv.toDataURL();
  }
}

export function textWidth(str, gap = 1) {
  let w = 0; for (const ch of str.toUpperCase()) w += (FONT[ch] || FONT[' '])[0].length + gap; return Math.max(0, w - gap);
}

const FONT = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'], E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'], I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'], K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'],
  M: ['10001', '11011', '10101', '10001', '10001'], N: ['1001', '1101', '1011', '1001', '1001'], O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'], Q: ['010', '101', '101', '110', '011'], R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'], U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'], W: ['10001', '10001', '10101', '10101', '01010'], X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['110', '001', '010', '100', '111'],
  3: ['110', '001', '010', '001', '110'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '110', '001', '110'],
  6: ['011', '100', '110', '101', '010'], 7: ['111', '001', '010', '010', '010'], 8: ['010', '101', '010', '101', '010'],
  9: ['010', '101', '011', '001', '110'], ' ': ['00', '00', '00', '00', '00'], '.': ['0', '0', '0', '0', '1'], '-': ['000', '000', '111', '000', '000'],
};

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ============================================================ HOUSE GEOMETRY
// Unscaled art pixels. hx,hy = top-left of the house body (below the gable).
export const HG = { BW: 116, RH: 30, FH: 42, base: 5, wall: 3, stair: 18, eave: 4, chimney: 9 };

export function houseLayout(nRooms) {
  const attic = nRooms % 2 === 1;
  const floors = Math.max(1, Math.ceil((nRooms - (attic ? 1 : 0)) / 2));
  const cw = (HG.BW - HG.wall * 2 - HG.stair) / 2;
  return { attic, floors, cw, bodyH: floors * HG.FH, totalH: HG.chimney + HG.RH + floors * HG.FH + HG.base };
}

/** rooms → cells (relative to hx, hy) */
export function cellsFor(rooms) {
  const L = houseLayout(rooms.length);
  const cells = []; let i = 0;
  if (L.attic) cells.push({ room: rooms[i++], attic: true, x: 14, y: -HG.RH + 9, w: HG.BW - 28, h: HG.RH - 9 });
  for (let f = 0; f < L.floors; f++) {
    const y = f * HG.FH + 3, h = HG.FH - 3;
    cells.push({ room: rooms[i++] || null, x: HG.wall, y, w: L.cw, h, floor: f });
    cells.push({ room: rooms[i++] || null, x: HG.wall + L.cw + HG.stair, y, w: L.cw, h, floor: f });
  }
  return { L, cells };
}

// ============================================================ STREET SCENE
export function createStreet({ rooms, name, number }) {
  const { L, cells } = cellsFor(rooms);
  const words = String(name || 'Filthy Residency').toUpperCase().split(/\s+/);
  const signWord = words[0].slice(0, 7);
  const plaque = (words.slice(1).join(' ') || 'HOUSE').slice(0, 11);
  const S = { W: 0, H: 0, hx: 0, hy: 0, ground: 0, bg: null, ext: null, int: null, frame: null, stars: [], box: null };

  function resize(W, H, ground) {
    Object.assign(S, { W, H, ground });
    S.hx = Math.round(W / 2 - HG.BW / 2) - 4;
    S.hy = ground - HG.base - L.bodyH;
    S.bg = new Raster(W, H); S.ext = new Raster(W, H); S.int = new Raster(W, H); S.frame = new Raster(W, H);
    S.box = { x: S.hx - HG.eave - 2, y: S.hy - HG.RH - HG.chimney - 2, w: HG.BW + HG.eave * 2 + 18, h: HG.RH + HG.chimney + L.bodyH + HG.base + 6 };
    drawBackground(S);
    drawHouse(S, S.ext, false);
    drawHouse(S, S.int, true);
  }

  function drawBackground(S) {
    const r = S.bg, { W, H, ground } = S, rand = rng(7);
    // sky: banded with dithered seams
    // ordered-dither gradient from the zenith down to the horizon
    const bands = [E.night, E.night, E.ink, E.navy];
    for (let y = 0; y < ground; y++) {
      const f = (y / ground) ** 1.15 * (bands.length - 1);
      const i = Math.min(bands.length - 2, Math.floor(f)), frac = f - i;
      const a = col(bands[i]), b = col(bands[i + 1]);
      for (let x = 0; x < W; x++) r.d[y * W + x] = BAYER[y & 3][x & 3] < frac * 16 ? b : a;
    }
    // stars
    S.stars = [];
    for (let n = 0; n < (W * ground) / 140; n++) {
      const x = Math.floor(rand() * W), y = Math.floor(rand() * ground * 0.62);
      const c = rand() < 0.7 ? E.steel : rand() < 0.6 ? E.fog : E.white;
      r.px(x, y, c);
      if (rand() < 0.2) S.stars.push({ x, y, p: rand() * 6.28, s: 0.6 + rand() * 1.6, base: c });
    }
    for (let n = 0; n < 5; n++) { // a few bright crosses
      const x = 6 + Math.floor(rand() * (W - 12)), y = 4 + Math.floor(rand() * ground * 0.4);
      r.px(x, y, E.white); r.px(x - 1, y, E.fog); r.px(x + 1, y, E.fog); r.px(x, y - 1, E.fog); r.px(x, y + 1, E.fog);
    }
    // moon
    const mx = Math.round(W * 0.8), my = Math.round(ground * 0.2);
    r.circle(mx, my, 15, E.ink, 0.5);
    r.circle(mx, my, 12, E.navy, 0.35);
    r.circle(mx, my, 8, E.sand); r.circle(mx - 2, my - 2, 6, E.white);
    r.circle(mx + 3, my + 2, 2, E.peach); r.px(mx - 3, my + 3, E.peach); r.px(mx - 2, my + 3, E.peach); r.circle(mx + 1, my - 4, 1, E.skin);
    // far city
    let x = -2;
    while (x < W) {
      const w = 7 + Math.floor(rand() * 16), h = Math.floor(ground * (0.14 + rand() * 0.3));
      const top = ground - h;
      r.rect(x, top, w, h, E.ink);
      r.hl(x, top, w, E.navy);
      if (rand() < 0.3) { r.vl(x + 2, top - 5, 5, E.ink); r.px(x + 2, top - 6, E.red); }
      if (rand() < 0.25) { r.rect(x + w - 6, top - 3, 4, 3, E.ink); r.px(x + w - 6, top, E.ink); }
      for (let wy = top + 3; wy < ground - 4; wy += 4) for (let wx = x + 2; wx < x + w - 1; wx += 3) {
        const q = rand();
        if (q < 0.13) r.rect(wx, wy, 1, 2, q < 0.04 ? E.yellow : q < 0.1 ? E.amber : E.orange);
        else if (q < 0.15) r.rect(wx, wy, 1, 2, E.sky);
      }
      x += w + (rand() < 0.3 ? 2 : 0);
    }
    // trees either side of the house
    const tree = (cx, base, size) => {
      r.vl(cx, base - size, size, E.plum); r.vl(cx + 1, base - size, size, E.plum);
      r.circle(cx, base - size - 2, size >> 1, E.deep);
      r.circle(cx - 4, base - size + 2, (size >> 1) - 2, E.deep);
      r.circle(cx + 5, base - size + 1, (size >> 1) - 2, E.deep);
      r.circle(cx - 2, base - size - 4, (size >> 2) + 1, E.pine, 0.5);
    };
    tree(S.hx - 52, ground, 22); tree(S.hx - 78, ground, 16);
    tree(S.hx + HG.BW + 70, ground, 20); tree(S.hx + HG.BW + 98, ground, 26);
    tree(S.hx - 120, ground, 24); tree(S.hx + HG.BW + 140, ground, 18);
    // power lines from a pole on the right
    const px = S.hx + HG.BW + 46, ptop = ground - 64;
    r.rect(px, ptop, 2, 64, E.plum); r.rect(px - 5, ptop + 3, 12, 1, E.plum); r.rect(px - 3, ptop + 7, 8, 1, E.plum);
    const wire = (y0, sag, x0, x1) => { for (let i = x0; i <= x1; i++) { const u = (i - x0) / (x1 - x0); r.px(i, Math.round(y0 + sag * 4 * u * (1 - u)), E.night); } };
    wire(ptop + 3, 10, -4, px - 5); wire(ptop + 7, 12, -4, px - 3); wire(ptop + 3, 6, px + 7, W + 4);
    // ground: sidewalk, curb, road
    r.rect(0, ground, W, H - ground, E.night);
    r.hl(0, ground, W, E.steel); r.rect(0, ground + 1, W, 5, E.slate);
    for (let i = 0; i < W; i += 14) r.vl(i, ground + 1, 5, E.navy);
    r.hl(0, ground + 6, W, E.fog); r.rect(0, ground + 7, W, 2, E.navy);
    r.rect(0, ground + 9, W, H - ground - 9, E.ink);
    for (let i = 3; i < W; i += 16) r.rect(i, ground + 15, 7, 1, E.slate);
    // street lamp
    const lx = S.hx - 26;
    r.rect(lx, ground - 40, 2, 40, E.navy); r.rect(lx - 1, ground - 2, 4, 2, E.ink);
    r.rect(lx - 2, ground - 44, 6, 4, E.night); r.rect(lx - 1, ground - 41, 4, 2, E.yellow);
    for (let j = 0; j < 40; j++) r.dith(lx + 1 - Math.floor(j / 3), ground - 39 + j, 1 + Math.floor(j / 1.5), 1, E.amber, 0.06);
    r.dith(lx - 10, ground + 1, 24, 5, E.peach, 0.18);
    // vending machine
    const vx = S.hx + HG.BW + 22, vy = ground - 22;
    r.dith(vx - 3, vy - 3, 18, 25, E.sky, 0.12);
    r.rect(vx, vy, 13, 22, E.fog); r.rect(vx + 1, vy + 1, 11, 4, E.cyan);
    r.rect(vx + 1, vy + 6, 11, 9, E.white);
    const cans = [E.red, E.blue, E.lime, E.amber, E.rose, E.sky];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) r.rect(vx + 2 + i * 2, vy + 7 + j * 3, 1, 2, cans[(i + j * 2) % cans.length]);
    r.rect(vx + 2, vy + 17, 6, 2, E.night); r.rect(vx + 9, vy + 16, 2, 3, E.steel); r.hl(vx, vy + 21, 13, E.steel);
  }

  return { S, cells, L, resize, compose, signWord, plaque, get box() { return S.box; } };

  // ------------------------------------------------------------ house painter
  function drawHouse(S, r, cut) {
    const { hx, hy } = S, BW = HG.BW, RH = HG.RH, cx = hx + BW / 2;
    const apex = hy - RH;
    // chimney (behind roof)
    r.rect(hx + 82, apex + 2, 9, 18, E.rust);
    for (let j = 0; j < 18; j += 3) { r.hl(hx + 82, apex + 2 + j, 9, E.brown); r.px(hx + 82 + ((j / 3) % 2 ? 2 : 6), apex + 3 + j, E.brown); }
    r.rect(hx + 81, apex, 11, 2, E.plum);
    // gable + roof band
    for (let j = 0; j < RH; j++) {
      const y = apex + j, half = HG.eave + j * 2;
      const inner = Math.max(0, half - 9);
      for (let i = -half; i < half; i++) {
        const x = Math.round(cx + i), a = Math.abs(i + 0.5);
        if (a > inner) {
          const edge = a > half - 2;
          r.px(x, y, edge ? E.night : ((x + y * 2) & 3) === 0 ? E.plum : (y % 3 === 0 ? E.plum : E.brown));
        } else if (a > inner - 1) {
          r.px(x, y, cut ? E.plum : E.sand);
        } else if (!cut) {
          r.px(x, y, (y - apex) % 3 === 2 ? E.navy : E.slate);
        }
      }
    }
    // attic interior
    const ac = cells.find(c => c.attic);
    if (cut && ac) {
      const kind = ac.room?.kind || 'manga';
      for (let j = 6; j < RH; j++) {
        const y = apex + j, half = HG.eave + j * 2 - 10;
        if (half <= 0) continue;
        for (let i = -half; i < half; i++) r.px(Math.round(cx + i), y, interiorPixel(kind, Math.round(cx + i) - hx, y - apex, true));
      }
      if (ac.room) {
        const t = THEMES[kind], fl = hy - 3;
        glow(r, Math.round(cx), apex + 14, 16, t.light, 0.14);
        shelf(r, ac.room, Math.round(cx) - 40, fl - 13, 30, 13, t.wood, 2);
        const P = PROPS[kind]; if (P) P(r, Math.round(cx) + 10, fl, 30, t);
        r.vl(Math.round(cx), apex + 7, 4, E.plum);
        r.sprite(DECOR_SPRITES.lantern.rows, DECOR_SPRITES.lantern.map, Math.round(cx) - 2, apex + 11);
      }
    }
    // body
    const bodyH = L.bodyH;
    if (!cut) {
      r.rect(hx, hy, BW, bodyH, E.slate);
      for (let j = 2; j < bodyH; j += 3) r.hl(hx, hy + j, BW, E.navy);
      r.dith(hx, hy, BW, bodyH, E.steel, 0.06);
      r.rect(hx, hy, 2, bodyH, E.sand); r.rect(hx + BW - 2, hy, 2, bodyH, E.sand);
      r.vl(hx + 2, hy, bodyH, E.tan); r.vl(hx + BW - 3, hy, bodyH, E.tan);
      for (let f = 0; f < L.floors; f++) { r.rect(hx - 1, hy + f * HG.FH, BW + 2, 2, E.sand); r.hl(hx - 1, hy + f * HG.FH + 2, BW + 2, E.ink); }
    } else {
      r.rect(hx, hy, BW, bodyH, E.plum);
      r.rect(hx, hy, HG.wall, bodyH, E.slate); r.rect(hx + BW - HG.wall, hy, HG.wall, bodyH, E.slate);
      r.vl(hx + HG.wall - 1, hy, bodyH, E.navy); r.vl(hx + BW - HG.wall, hy, bodyH, E.navy);
      // stairwell
      const sx = hx + HG.wall + L.cw;
      r.rect(sx, hy, HG.stair, bodyH, E.plum);
      for (let f = 0; f < L.floors; f++) {
        const top = hy + f * HG.FH + 3, bot = hy + (f + 1) * HG.FH - 1;
        const ltr = (L.floors - 1 - f) % 2 === 0, n = 8, sw = 2, sh = Math.floor((bot - top - 4) / n);
        for (let k = 0; k < n; k++) {
          const stx = ltr ? sx + 1 + k * sw : sx + HG.stair - 1 - (k + 1) * sw;
          r.rect(stx, bot - (k + 1) * sh, sw, (k + 1) * sh, E.brown);
          r.hl(stx, bot - (k + 1) * sh, sw, E.clay);
        }
        for (let k = 0; k < 16; k++) r.px(ltr ? sx + 1 + k : sx + HG.stair - 2 - k, bot - 10 - Math.round(k * (sh * n - 6) / 16), E.peach);
      }
      for (const c of cells) if (!c.attic) paintCell(r, c, hx + c.x, hy + c.y);
      for (let f = 0; f <= L.floors; f++) {
        const y = hy + f * HG.FH;
        if (f === L.floors) break;
        r.rect(hx, y, BW, 3, E.brown); r.hl(hx, y, BW, E.clay); r.hl(hx, y + 2, BW, E.plum);
      }
    }
    // windows
    if (!cut) {
      for (const c of cells) {
        if (c.attic) { attic(r, cx, apex + 19, c.room); continue; }
        window_(r, hx + c.x + Math.round(c.w / 2) - 9, hy + c.y + 7, c.room);
      }
      // door, awning, plaque, lamps
      const groundTop = hy + (L.floors - 1) * HG.FH + 3, dx = Math.round(cx) - 6, dy = hy + bodyH - 20;
      r.rect(dx - 1, dy - 1, 14, 21, E.sand);
      r.rect(dx, dy, 12, 20, E.pine);
      r.rect(dx + 2, dy + 3, 3, 6, E.deep); r.rect(dx + 7, dy + 3, 3, 6, E.deep);
      r.rect(dx + 2, dy + 11, 3, 6, E.deep); r.rect(dx + 7, dy + 11, 3, 6, E.deep);
      r.px(dx + 10, dy + 10, E.amber); r.px(dx, dy, E.sand); r.px(dx + 11, dy, E.sand);
      for (let i = 0; i < 18; i++) r.rect(dx - 3 + i, dy - 4, 1, 3, Math.floor(i / 2) % 2 ? E.sand : E.wine);
      r.hl(dx - 3, dy - 1, 18, E.night);
      const tw = textWidth(plaque);
      const plx = Math.round(cx - tw / 2) - 2, ply = groundTop + 4;
      r.rect(plx, ply, tw + 4, 9, E.night); r.rect(plx + 1, ply + 1, tw + 2, 7, E.ink);
      r.text(plaque, plx + 2, ply + 2, E.sand);
      r.rect(dx - 6, dy + 3, 2, 3, E.amber); r.px(dx - 6, dy + 2, E.night); r.px(dx - 5, dy + 2, E.night); r.dith(dx - 9, dy, 8, 9, E.amber, 0.2);
      r.rect(dx + 16, dy + 3, 2, 3, E.amber); r.px(dx + 16, dy + 2, E.night); r.px(dx + 17, dy + 2, E.night); r.dith(dx + 13, dy, 8, 9, E.amber, 0.2);
      r.rect(dx + 15, dy + 9, 5, 7, E.ink); r.text(String(number || '7').slice(0, 1), dx + 16, dy + 10, E.amber);
      // AC unit on the upper floor
      if (L.floors > 1) {
        const ax = Math.round(cx) - 6, ay = hy + 14;
        r.rect(ax, ay, 12, 8, E.fog); r.rect(ax + 1, ay + 1, 10, 6, E.steel);
        r.circle(ax + 6, ay + 4, 2, E.slate); r.px(ax + 6, ay + 4, E.fog); r.vl(ax + 10, ay + 8, 10, E.navy);
      }
    }
    // vertical sign
    const sx = hx + BW + 2, sy = hy + 3, sh = signWord.length * 6 + 3;
    r.rect(sx, sy + 6, 3, 1, E.night); r.rect(sx, sy + sh - 7, 3, 1, E.night);
    r.rect(sx + 3, sy, 9, sh, E.night); r.rect(sx + 4, sy + 1, 7, sh - 2, E.ink);
    r.dith(sx + 1, sy - 2, 13, sh + 4, E.wine, 0.12);
    // foundation + steps
    const fy = hy + bodyH;
    r.rect(hx - 2, fy, BW + 4, HG.base, E.steel);
    for (let i = hx - 2; i < hx + BW + 2; i += 8) r.vl(i, fy, HG.base, E.slate);
    r.hl(hx - 2, fy, BW + 4, E.fog); r.hl(hx - 2, fy + HG.base - 1, BW + 4, E.navy);
    if (!cut) {
      r.rect(Math.round(cx) - 9, fy, 18, 2, E.fog); r.rect(Math.round(cx) - 11, fy + 2, 22, 3, E.steel);
      r.sprite(SPR.cat, CAT, Math.round(cx) + 12, fy - 9);
      r.sprite(SPR.pot, POT, hx + 8, fy - 9);
    }
  }

  function window_(r, x, y, room) {
    const t = room ? THEMES[room.kind] : null;
    r.rect(x - 1, y - 1, 20, 24, E.sand);
    const glow = [E.yellow, E.amber, E.orange];
    for (let j = 0; j < 22; j++) for (let i = 0; i < 18; i++) {
      const d = Math.abs(i - 8.5) / 9 + Math.abs(j - 9) / 14;
      const k = d < 0.45 ? 0 : d < 0.85 ? 1 : 2;
      r.px(x + i, y + j, k === 0 && BAYER[j & 3][i & 3] > 9 ? glow[1] : glow[k]);
    }
    if (t) r.dith(x, y, 18, 22, t.light === E.fog ? E.white : t.light, 0.18);
    // shelves seen through the glass
    for (let i = 0; i < 18; i++) if (i % 2 === 0 || i % 5 === 0) r.vl(x + i, y + 15, 7, i % 4 === 0 ? E.brown : E.plum);
    r.hl(x, y + 14, 18, E.brown);
    // curtains + mullions
    for (let j = 0; j < 22; j++) { const w = 3 + (j > 12 ? 1 : 0); r.rect(x, y + j, w, 1, j % 2 ? E.wine : E.red); r.rect(x + 18 - w, y + j, w, 1, j % 2 ? E.wine : E.red); }
    r.hl(x, y, 18, E.wine); r.hl(x, y + 1, 18, E.red);
    r.vl(x + 8, y, 22, E.sand); r.vl(x + 9, y, 22, E.tan); r.hl(x, y + 9, 18, E.sand);
    // sill + flower box
    r.rect(x - 3, y + 22, 24, 1, E.sand); r.rect(x - 2, y + 23, 22, 3, E.brown); r.hl(x - 2, y + 23, 22, E.clay);
    for (let i = 0; i < 20; i += 2) { r.px(x - 1 + i, y + 21, i % 4 ? E.green : E.lime); if (i % 6 === 0) r.px(x - 1 + i, y + 20, i % 12 ? E.pink : E.red); }
    r.dith(x - 1, y + 26, 20, 4, E.amber, 0.12);
  }

  function attic(r, cx, cy, room) {
    cx = Math.round(cx);
    r.circle(cx, cy, 8, E.sand);
    for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) if (i * i + j * j <= 40) r.px(cx + i, cy + j, i * i + j * j < 12 ? E.yellow : i * i + j * j < 26 ? E.amber : E.orange);
    r.vl(cx, cy - 6, 13, E.sand); r.hl(cx - 6, cy, 13, E.sand);
  }

  function paintCell(r, c, x0, y0) {
    for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) r.px(x0 + i, y0 + j, interiorPixel(c.room?.kind, i, j, false, c));
    if (c.room) furnish(r, c, x0, y0);
  }

  // wallpaper + floor for a pixel of a room
  function interiorPixel(kind, i, j, isAttic, c) {
    const t = THEMES[kind] || THEMES.books;
    const h = isAttic ? HG.RH : c.h;
    if (j >= h - 3) return j === h - 3 ? t.floorLine : (i % 9 === 0 ? t.floorLine : t.floor);
    switch (kind) {
      case 'manga': return (i % 7 === 0 || j % 6 === 0) ? t.motif : t.wall;
      case 'anime': return (i % 4 === 0 && j % 4 === 0) ? E.grape : t.wall;
      case 'music': return ((i + (j >> 2) * 2) % 6 === 0 && j % 4 === 1) ? t.motif : t.wall;
      case 'books': return ((i + j) % 6 === 0 || (i - j + 60) % 6 === 0) ? t.motif : t.wall;
      case 'movies': return (i % 3 === 0) ? t.motif : t.wall;
      default: return t.wall;
    }
  }

  function furnish(r, c, x0, y0) {
    const room = c.room, kind = room.kind, t = THEMES[kind];
    const fl = y0 + c.h - 3;
    const right = c.floor !== undefined && c.x > HG.BW / 2;
    // the light first, so furniture sits in it
    const lx = right ? x0 + 8 : x0 + c.w - 10;
    glow(r, lx, y0 + 6, 13, t.light, 0.16);
    // mini bookcase in this room's colours, filled with the real items' spine colours
    const bw = 22, bh = 25, bx = right ? x0 + c.w - bw - 3 : x0 + 3, by = fl - bh;
    shelf(r, room, bx, by, bw, bh, t.wood, 3);
    const px = right ? x0 + 3 : x0 + bw + 7;
    const P = PROPS[kind];
    if (P) P(r, px, fl, c.w - bw - 10, t);
  }

  function shelf(r, room, x, y, w, h, wood, rows) {
    r.rect(x, y, w, h, wood[0]);
    r.rect(x + 1, y + 1, w - 2, h - 1, E.night);
    const rh = Math.floor((h - 1) / rows);
    let n = 0; const objs = room.objects;
    for (let k = 0; k < rows; k++) {
      const top = y + 1 + k * rh, bot = top + rh - 1;
      r.hl(x, bot, w, wood[1]); r.hl(x, bot + 1 < y + h ? bot : bot, w, wood[1]);
      let cx = x + 1;
      while (cx < x + w - 2 && objs.length) {
        const o = objs[n++ % objs.length];
        const sw = o.d > 30 ? 3 : o.d > 13 ? 2 : 1;
        const sh = Math.max(3, Math.min(rh - 2, Math.round(o.h / 34)));
        r.rect(cx, bot - sh, sw, sh, (o.pal || o.item.pal)[0]);
        cx += sw + (n % 5 === 0 ? 1 : 0);
      }
    }
    r.vl(x, y, h, wood[2]); r.hl(x, y, w, wood[2]);
  }

  // ------------------------------------------------------------ frame
  function compose(ctx, t, st) {
    const f = S.frame, b = S.box;
    f.d.set(S.bg.d);
    const open = st.open;
    for (let y = Math.max(0, b.y); y < Math.min(S.H, b.y + b.h); y++) {
      const row = y * S.W;
      for (let x = Math.max(0, b.x); x < Math.min(S.W, b.x + b.w); x++) {
        const i = row + x;
        const src = open >= 1 ? S.int.d : open <= 0 ? S.ext.d : ((BAYER[(y >> 1) & 3][(x >> 1) & 3] + 0.5) / 16 < open ? S.int.d : S.ext.d);
        if (src[i]) f.d[i] = src[i];
      }
    }
    // twinkle
    for (const s of S.stars) { const v = Math.sin(t * s.s + s.p); f.px(s.x, s.y, v > 0.75 ? E.white : v < -0.6 ? E.navy : s.base); }
    // chimney smoke
    const cxs = S.hx + 86, cys = S.hy - HG.RH - 1;
    for (let k = 0; k < 3; k++) {
      const p = ((t * 0.35 + k / 3) % 1);
      const sx = Math.round(cxs + p * 10 + Math.sin(p * 6 + k) * 2), sy = Math.round(cys - p * 22);
      const sz = 1 + Math.round(p * 2);
      if (p < 0.92) f.dith(sx - sz, sy - sz, sz * 2 + 1, sz * 2 + 1, p < 0.5 ? E.steel : E.slate, 0.6 - p * 0.5);
    }
    // sign letters with the odd flicker
    const sx = S.hx + HG.BW + 8, sy = S.hy + 5;
    signWord.split('').forEach((ch, i) => {
      const w = textWidth(ch);
      f.text(ch, sx - (w > 3 ? 1 : 0), sy + i * 6, E.red);
    });
    // a little life inside
    if (open > 0.5) {
      for (const c of cells) {
        if (!c.room) continue;
        const x0 = S.hx + c.x, y0 = S.hy + c.y;
        if (c.room.kind === 'anime') { const tv = PROPS.tvAt; if (tv) f.dith(tv.x, tv.y, 7, 5, Math.sin(t * 9) > 0 ? E.cyan : E.sky, 0.5); }
        if (c.room.kind === 'music' && PROPS.deckAt) { const d = PROPS.deckAt; f.px(d.x + Math.round(2 + Math.cos(t * 4) * 2), d.y + Math.round(Math.sin(t * 4) * 0.5), E.steel); }
        if (st.hover === c.room.id) outlineRect(f, x0 - 1, y0 - 1, c.w + 2, c.h + 2, c.attic);
      }
    }
    if (st.hoverHouse && open < 0.5) outlineMask(f, S.ext.d, b);
    f.blit(ctx);
  }

  function outlineRect(f, x, y, w, h, isAttic) {
    if (isAttic) {
      const cx = S.hx + HG.BW / 2, apex = S.hy - HG.RH;
      for (let j = 6; j < HG.RH; j++) { const half = HG.eave + j * 2 - 10; if (half > 0) { f.px(Math.round(cx - half), apex + j, E.amber); f.px(Math.round(cx + half - 1), apex + j, E.amber); } }
      f.hl(Math.round(cx - (HG.eave + (HG.RH - 1) * 2 - 10)), S.hy - 1, (HG.eave + (HG.RH - 1) * 2 - 10) * 2, E.amber);
      return;
    }
    f.hl(x, y, w, E.amber); f.hl(x, y + h - 1, w, E.amber); f.vl(x, y, h, E.amber); f.vl(x + w - 1, y, h, E.amber);
  }

  function outlineMask(f, m, b) {
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
      const i = y * S.W + x;
      if (m[i]) continue;
      if (m[i - 1] || m[i + 1] || m[i - S.W] || m[i + S.W]) f.d[i] = col(E.amber);
    }
  }
}

/** a pool of light that thins out from its centre, as stippled pixels */
function glow(r, cx, cy, rad, c, peak) {
  for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++) {
    const d = Math.hypot(i, j * 1.3) / rad;
    if (d < 1) r.dith(cx + i, cy + j, 1, 1, c, peak * (1 - d));
  }
}

// ============================================================ PROPS (inside the cutaway)
const PROPS = {
  manga(r, x, fl, w) {
    r.rect(x + 2, fl - 4, 14, 2, E.clay); r.rect(x, fl - 6, 18, 2, E.wine); r.hl(x, fl - 6, 18, E.red);
    r.rect(x + 3, fl - 2, 2, 2, E.brown); r.rect(x + 13, fl - 2, 2, 2, E.brown);
  },
  anime(r, x, fl, w) {
    r.rect(x + 2, fl - 10, 11, 9, E.fog); r.rect(x + 3, fl - 9, 7, 6, E.sky); PROPS.tvAt = { x: x + 3, y: fl - 9 };
    r.rect(x + 11, fl - 8, 1, 4, E.steel); r.rect(x + 4, fl - 1, 2, 1, E.slate); r.rect(x + 9, fl - 1, 2, 1, E.slate);
    r.rect(x + 14, fl - 5, 6, 5, E.rose); r.hl(x + 15, fl - 6, 4, E.pink);
    r.rect(x + 4, fl - 26, 8, 11, E.night); r.rect(x + 5, fl - 25, 6, 9, E.red); r.rect(x + 6, fl - 22, 4, 3, E.yellow);
  },
  music(r, x, fl, w) {
    r.rect(x, fl - 7, 16, 7, E.clay); r.hl(x, fl - 7, 16, E.peach); r.rect(x + 1, fl - 5, 6, 4, E.brown); r.rect(x + 9, fl - 5, 6, 4, E.brown);
    r.rect(x + 1, fl - 9, 12, 2, E.night); r.hl(x + 3, fl - 10, 6, E.ink); PROPS.deckAt = { x: x + 3, y: fl - 10 };
    r.vl(x + 11, fl - 12, 3, E.fog);
    r.rect(x + 17, fl - 13, 5, 13, E.plum); r.circle(x + 19, fl - 4, 1, E.slate); r.px(x + 19, fl - 10, E.slate);
  },
  books(r, x, fl, w) {
    r.rect(x + 6, fl - 9, 10, 9, E.wine); r.rect(x + 5, fl - 7, 12, 5, E.red); r.rect(x + 6, fl - 6, 10, 3, E.wine);
    r.vl(x + 1, fl - 22, 22, E.sand); r.rect(x - 1, fl - 24, 5, 3, E.amber); glow(r, x + 1, fl - 18, 9, E.yellow, 0.3);
  },
  movies(r, x, fl, w) {
    r.rect(x, fl - 30, 22, 14, E.night); r.rect(x + 1, fl - 29, 20, 12, E.fog); r.dith(x + 1, fl - 29, 20, 12, E.white, 0.5);
    glow(r, x + 11, fl - 23, 16, E.white, 0.14);
    r.rect(x + 1, fl - 7, 20, 7, E.rust); r.rect(x, fl - 9, 3, 9, E.brown); r.rect(x + 19, fl - 9, 3, 9, E.brown); r.hl(x + 3, fl - 7, 16, E.ochre);
  },
};

// ============================================================ SPRITES
const CAT = { o: E.orange, O: E.ochre, k: E.night, e: E.lime, n: E.pink, w: E.sand };
const POT = { g: E.lime, G: E.green, c: E.clay, C: E.peach, d: E.brown };
const SPR = {
  cat: [
    '.o...o..',
    '.oo.oo..',
    '.ooooo..',
    '.ekoke..',
    '.oonoo..',
    '.OoooO.o',
    'oOoooOoo',
    'oooooooo',
    '.ww.ww..',
  ],
  pot: [
    '..g.g..',
    '.gGgGg.',
    'gGgGgGg',
    '.gGgGg.',
    '..CCC..',
    '.ccccc.',
    '.ccccc.',
    '..ccc..',
    '..ddd..',
  ],
};

const DECOR_SPRITES = {
  plant: { map: POT, rows: [
    '......g......', '...g..gG.g...', '..gGg.gGgGg..', '.gGGgGgGGgg..', '.gGgGGgGgGGg.', '..gGgGGGgGg..',
    '...gGGgGGg...', '....gGGGg....', '.....gGg.....', '......G......', '..CCCCCCCCC..', '..ccccccccc..',
    '..ccccccccc..', '...ccccccc...', '...ccccccc...', '...ccccccc...', '....ccccc....', '....ddddd....'] },
  candle: { map: { y: E.yellow, o: E.orange, k: E.plum, s: E.sand, S: E.peach, b: E.steel, B: E.slate }, rows: [
    '...y...', '..yoy..', '..yoy..', '...o...', '...k...', '.sssss.', '.sssSS.', '.sssSS.', '.sssSS.',
    '.sssSS.', '.sssSS.', '.sssSS.', '.sssSS.', 'bbbbbbb', '.BBBBB.'] },
  cat: { map: { k: E.orange, K: E.ochre, e: E.plum, n: E.pink, w: E.sand }, rows: [
    '..............k..', '.k.k...........kk', '.kkk...........k.', 'kekek.........kk.', 'kkkkkKKKKKKKkkk..',
    '.kkkkkkkkkkkkkk..', '.kkkkkkkkkkkkkk..', '..ww.......ww....'] },
  speaker: { map: { b: E.plum, B: E.brown, k: E.night, s: E.slate, f: E.steel }, rows: [
    'bbbbbbbbbb', 'bBBBBBBBBb', 'bBBkkkkBBb', 'bBkkffkkBb', 'bBBkkkkBBb', 'bBBBBBBBBb', 'bBBkkkkBBb', 'bBkssssk.b',
    'bkssffsskb', 'bkssffsskb', 'bBkssssk.b', 'bBBkkkkBBb', 'bBBBBBBBBb', 'bbbbbbbbbb'] },
  daruma: { map: { r: E.red, R: E.wine, w: E.sand, k: E.night, y: E.amber }, rows: [
    '...rrrr...', '..rrrrrr..', '.rrwwwwrr.', '.rwkwwkwr.', '.rwwwwwwr.', 'rrrwwwwrrr', 'rrrrrrrrrr', 'rryrrrryrr',
    'rrrryyrrrr', 'RrrrrrrrrR', '.RRrrrrRR.', '..RRRRRR..'] },
  globe: { map: { b: E.sky, B: E.blue, g: E.lime, G: E.green, y: E.amber, Y: E.ochre }, rows: [
    '...bbbbb...', '..bbggbbb..', '.bbgggbBbb.', '.bbggbbbBb.', 'bbbgbbggbBy', 'bbbbbgggbBy', '.bbbbbggBby', '.bBbbbbbBb.',
    '..bBBBBBb..', 'y..bbbbb..y', '.yy.....yy.', '...yyyyy...', '.....y.....', '....YYY....', '...YYYYY...'] },
  reel: { map: { s: E.steel, S: E.slate, k: E.night, f: E.fog }, rows: [
    '...ssssss...', '..sffssffs..', '.sfkkssskfs.', 'sfkkssssskks', 'sssssSSsssss', 'ssksSkkSskss',
    'ssksSkkSskss', 'sssssSSsssss', 'skkssssskkfs', '.sfkssskkfs.', '..sffssffs..', '...ssssss...'] },
  lantern: { map: { k: E.plum, o: E.orange, a: E.amber, y: E.yellow, r: E.rust }, rows: [
    '..k..', '.kkk.', 'oaaao', 'ayyya', 'ayyya', 'oaaao', 'rooor', '.kkk.', '..k..'] },
  bookend: { map: { s: E.fog, S: E.steel, k: E.slate }, rows: [
    'sS....', 'sS....', 'sS....', 'sS....', 'sS....', 'sS....', 'sS....', 'sS....', 'sS....', 'sS....', 'sSSSSS', 'kkkkkk'] },
};

const spriteCache = {};
/** data URL for a decor sprite, plus its size in art pixels */
export function decorSprite(name) {
  if (spriteCache[name]) return spriteCache[name];
  const s = DECOR_SPRITES[name] || DECOR_SPRITES.plant;
  const w = Math.max(...s.rows.map(r => r.length)), h = s.rows.length;
  const r = new Raster(w, h); r.sprite(s.rows, s.map, 0, 0);
  return (spriteCache[name] = { url: r.toURL(), w, h });
}

/** a small repeating wallpaper tile for a room's back wall */
export function wallTile(kind) {
  const key = 'wall-' + kind;
  if (spriteCache[key]) return spriteCache[key];
  const t = THEMES[kind] || THEMES.books;
  const n = { manga: 12, anime: 8, music: 16, books: 12, movies: 6 }[kind] || 12;
  const r = new Raster(n, n);
  const base = { manga: E.deep, anime: E.ink, music: E.plum, books: E.pine, movies: E.wine }[kind] || t.wall;
  r.rect(0, 0, n, n, base);
  if (kind === 'manga') { r.hl(0, 0, n, E.pine); r.vl(0, 0, n, E.pine); }
  if (kind === 'anime') { r.px(0, 0, E.navy); r.px(4, 4, E.grape); }
  if (kind === 'music') { r.rect(4, 4, 2, 2, E.brown); r.rect(12, 12, 2, 2, E.brown); }
  if (kind === 'books') { for (let i = 0; i < n; i++) { r.px(i, i, E.deep); r.px(n - 1 - i, i, E.deep); } r.px(6, 0, E.green); r.px(0, 6, E.green); }
  if (kind === 'movies') { r.vl(0, 0, n, E.brown); r.dith(1, 0, 2, n, E.brown, 0.25); }
  return (spriteCache[key] = { url: r.toURL(), n });
}
