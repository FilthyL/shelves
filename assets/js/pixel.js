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
  toys:   { wall: E.grape, motif: E.plum,   floor: E.night, floorLine: E.slate, wood: [E.ink, E.slate, E.steel],  light: E.pink },
  games:  { wall: E.deep,  motif: E.pine,   floor: E.ink,   floorLine: E.night, wood: [E.night, E.ink, E.navy],   light: E.sky },
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

// ============================================================ MANOR GEOMETRY
// Unscaled art pixels. A paler centre block between two wings; each has two floors. The centre's
// ground floor is the entrance hall, its mansard roof holds the attic with a cupola on top, and a
// basement runs under the whole house. hx,hy = top-left of the west wing's upper floor; the attic
// and the roofs sit above it (y < 0).
export const HG = { WW: 92, CW: 108, FH: 42, floors: 2, AH: 34, WR: 18, CR: 12, cup: 18, base: 6, BH: 40, wall: 3 };

export function houseLayout(nRooms) {
  const TW = HG.WW * 2 + HG.CW, bodyH = HG.floors * HG.FH, top = HG.AH + HG.CR + HG.cup;
  const basement = Math.max(0, Math.min(3, nRooms - 6));
  return { floors: HG.floors, attic: true, basement, TW, totalW: TW + 12, bodyH, top, totalH: top + bodyH + HG.base + (basement ? HG.BH : 0) };
}

/** rooms → cells (relative to hx, hy), in house order: the attic, the upper floor west to east, the ground floor's two wings, the basement */
export function cellsFor(rooms) {
  const L = houseLayout(rooms.length), { WW, CW, FH, AH, wall } = HG;
  const slots = [
    { attic: true, wing: 'C', x: WW + 9, y: -AH + 4, w: CW - 18, h: AH - 4 },
    { wing: 'L', floor: 0, x: wall, y: wall, w: WW - wall * 2, h: FH - wall },
    { wing: 'C', floor: 0, x: WW + wall, y: wall, w: CW - wall * 2, h: FH - wall },
    { wing: 'R', floor: 0, x: WW + CW + wall, y: wall, w: WW - wall * 2, h: FH - wall },
    { wing: 'L', floor: 1, x: wall, y: FH + wall, w: WW - wall * 2, h: FH - wall },
    { wing: 'R', floor: 1, x: WW + CW + wall, y: FH + wall, w: WW - wall * 2, h: FH - wall },
  ];
  const n = Math.max(1, L.basement), bw = Math.floor((L.TW - wall * (n + 1)) / n), by = L.bodyH + HG.base + wall;
  for (let k = 0; k < L.basement; k++) slots.push({ basement: true, x: wall + k * (bw + wall), y: by, w: bw, h: HG.BH - wall * 2 });
  return { L, cells: slots.map((s, i) => ({ ...s, room: rooms[i] || null })) };
}

// ============================================================ STREET SCENE
export function createStreet({ rooms, name, number }) {
  const { L, cells } = cellsFor(rooms);
  const title = String(name || 'Filth Manor').toUpperCase().slice(0, 14);
  const S = { W: 0, H: 0, hx: 0, hy: 0, ground: 0, bg: null, ext: null, int: null, frame: null, stars: [], box: null };
  const { WW, CW, FH, AH, WR, CR, cup, base, BH, wall } = HG, TW = L.TW, bodyH = L.bodyH;

  function resize(W, H, ground) {
    Object.assign(S, { W, H, ground });
    S.hx = Math.round(W / 2 - TW / 2);
    S.hy = ground - base - bodyH;
    S.bg = new Raster(W, H); S.ext = new Raster(W, H); S.int = new Raster(W, H); S.frame = new Raster(W, H);
    S.box = { x: S.hx - 6, y: S.hy - L.top - 4, w: TW + 12, h: L.top + bodyH + base + 6 + (L.basement ? BH : 0) };
    drawBackground(S);
    drawHouse(S, S.ext, false);
    drawHouse(S, S.int, true);
  }

  function drawBackground(S) {
    const r = S.bg, { W, H, ground } = S, rand = rng(7);
    // ordered-dither gradient from the zenith down to the horizon
    const bands = [E.night, E.night, E.ink, E.navy];
    for (let y = 0; y < ground; y++) {
      const f = (y / ground) ** 1.15 * (bands.length - 1);
      const i = Math.min(bands.length - 2, Math.floor(f)), frac = f - i;
      const a = col(bands[i]), b = col(bands[i + 1]);
      for (let x = 0; x < W; x++) r.d[y * W + x] = BAYER[y & 3][x & 3] < frac * 16 ? b : a;
    }
    S.stars = [];
    for (let n = 0; n < (W * ground) / 140; n++) {
      const x = Math.floor(rand() * W), y = Math.floor(rand() * ground * 0.62);
      const c = rand() < 0.7 ? E.steel : rand() < 0.6 ? E.fog : E.white;
      r.px(x, y, c);
      if (rand() < 0.2) S.stars.push({ x, y, p: rand() * 6.28, s: 0.6 + rand() * 1.6, base: c });
    }
    for (let n = 0; n < 5; n++) {
      const x = 6 + Math.floor(rand() * (W - 12)), y = 4 + Math.floor(rand() * ground * 0.4);
      r.px(x, y, E.white); r.px(x - 1, y, E.fog); r.px(x + 1, y, E.fog); r.px(x, y - 1, E.fog); r.px(x, y + 1, E.fog);
    }
    const mx = Math.round(W * 0.84), my = Math.round(ground * 0.16);
    r.circle(mx, my, 15, E.ink, 0.5); r.circle(mx, my, 12, E.navy, 0.35);
    r.circle(mx, my, 8, E.sand); r.circle(mx - 2, my - 2, 6, E.white);
    r.circle(mx + 3, my + 2, 2, E.peach); r.px(mx - 3, my + 3, E.peach); r.px(mx - 2, my + 3, E.peach); r.circle(mx + 1, my - 4, 1, E.skin);
    // the city, low and far off, so the manor stands above it
    let x = -2;
    while (x < W) {
      const w = 7 + Math.floor(rand() * 16), h = Math.floor(ground * (0.08 + rand() * 0.2));
      const top = ground - h;
      r.rect(x, top, w, h, E.ink); r.hl(x, top, w, E.navy);
      if (rand() < 0.3) { r.vl(x + 2, top - 5, 5, E.ink); r.px(x + 2, top - 6, E.red); }
      for (let wy = top + 3; wy < ground - 4; wy += 4) for (let wx = x + 2; wx < x + w - 1; wx += 3) {
        const q = rand();
        if (q < 0.12) r.rect(wx, wy, 1, 2, q < 0.04 ? E.yellow : q < 0.09 ? E.amber : E.orange);
      }
      x += w + (rand() < 0.3 ? 2 : 0);
    }
    // the grounds: old trees, then clipped hedges behind iron railings, gate pillars with lamps
    const tree = (cx, base, size) => {
      r.vl(cx, base - size, size, E.plum); r.vl(cx + 1, base - size, size, E.plum);
      r.circle(cx, base - size - 2, size >> 1, E.deep);
      r.circle(cx - 4, base - size + 2, (size >> 1) - 2, E.deep);
      r.circle(cx + 5, base - size + 1, (size >> 1) - 2, E.deep);
      r.circle(cx - 2, base - size - 4, (size >> 2) + 1, E.pine, 0.5);
    };
    tree(S.hx - 30, ground, 34); tree(S.hx - 62, ground, 26); tree(S.hx - 96, ground, 30);
    tree(S.hx + TW + 28, ground, 32); tree(S.hx + TW + 60, ground, 24); tree(S.hx + TW + 92, ground, 30);
    const left = S.hx - 14, right = S.hx + TW + 14;
    for (const [x0, x1] of [[0, left - 4], [right + 4, W]]) {
      for (let i = x0; i < x1; i++) { const h = 7 + ((i * 7) % 5 === 0 ? 1 : 0); r.vl(i, ground - h, h, (i >> 2) % 2 ? E.deep : E.pine); }
      r.dith(x0, ground - 8, x1 - x0, 2, E.green, 0.25);
      for (let i = x0; i < x1; i += 3) { r.vl(i, ground - 10, 10, E.night); r.px(i, ground - 11, E.navy); }
      r.hl(x0, ground - 9, x1 - x0, E.night); r.hl(x0, ground - 3, x1 - x0, E.night);
    }
    for (const gx of [left - 4, right - 2]) {
      r.rect(gx, ground - 16, 6, 16, E.steel); r.vl(gx, ground - 16, 16, E.fog); r.rect(gx - 1, ground - 17, 8, 2, E.fog);
      r.rect(gx + 1, ground - 22, 4, 5, E.night); r.rect(gx + 2, ground - 21, 2, 3, E.yellow);
      glow(r, gx + 3, ground - 20, 9, E.amber, 0.2);
    }
    // the pavement and the road
    r.rect(0, ground, W, H - ground, E.night);
    r.hl(0, ground, W, E.steel); r.rect(0, ground + 1, W, 5, E.slate);
    for (let i = 0; i < W; i += 14) r.vl(i, ground + 1, 5, E.navy);
    r.hl(0, ground + 6, W, E.fog); r.rect(0, ground + 7, W, 2, E.navy);
    if (L.basement) {
      // a cross-section: soil under the pavement, so the basement shows when the front comes off
      r.rect(0, ground + 9, W, H - ground - 9, E.plum);
      r.dith(0, ground + 9, W, H - ground - 9, E.brown, 0.18);
      const srand = rng(31);
      for (let n = 0; n < W / 6; n++) { const sx = Math.floor(srand() * W), sy = ground + 11 + Math.floor(srand() * (H - ground - 12)); r.rect(sx, sy, 2, 1, srand() < 0.5 ? E.ink : E.tan); }
    } else {
      r.rect(0, ground + 9, W, H - ground - 9, E.ink);
      for (let i = 3; i < W; i += 16) r.rect(i, ground + 15, 7, 1, E.slate);
    }
    // street lamps along the pavement
    for (const lx of [S.hx - 120, S.hx + TW + 120]) {
      r.rect(lx, ground - 40, 2, 40, E.navy); r.rect(lx - 1, ground - 2, 4, 2, E.ink);
      r.rect(lx - 2, ground - 44, 6, 4, E.night); r.rect(lx - 1, ground - 41, 4, 2, E.yellow);
      for (let j = 0; j < 40; j++) r.dith(lx + 1 - Math.floor(j / 3), ground - 39 + j, 1 + Math.floor(j / 1.5), 1, E.amber, 0.06);
      r.dith(lx - 10, ground + 1, 24, 5, E.peach, 0.18);
    }
  }

  return { S, cells, L, resize, compose, basementH: L.basement ? BH : 0, get box() { return S.box; } };

  // ------------------------------------------------------------ the manor
  function drawHouse(S, r, cut) {
    const { hx, hy } = S, cx0 = hx + WW, cx1 = hx + WW + CW, mid = hx + Math.round(TW / 2);
    // chimneys at the ends of the wings, behind their roofs
    for (const x of [hx + 8, hx + TW - 18]) {
      const top = hy - WR - 14;
      r.rect(x, top, 10, 22, E.rust);
      for (let j = 0; j < 22; j += 3) { r.hl(x, top + j, 10, E.brown); r.px(x + ((j / 3) % 2 ? 2 : 6), top + 1 + j, E.brown); }
      r.rect(x - 1, top - 2, 12, 2, E.steel); r.hl(x - 1, top - 2, 12, E.fog);
      r.rect(x + 2, top - 5, 2, 3, E.clay); r.rect(x + 6, top - 5, 2, 3, E.clay);
    }
    wingRoof(r, hx - 3, WW + 3, true);
    wingRoof(r, cx1, WW + 3, false);
    centreRoof(r, cx0, cut);
    // the body
    if (!cut) {
      stone(r, hx, hy, WW, bodyH, E.slate, E.navy);
      stone(r, cx1, hy, WW, bodyH, E.slate, E.navy);
      stone(r, cx0, hy, CW, bodyH, E.steel, E.slate);
      for (const x of [hx, cx0 - 3, cx0, cx1 - 3, cx1, hx + TW - 3]) for (let y = hy; y < hy + bodyH; y += 4) r.rect(x, y, (y - hy) % 8 ? 3 : 4, 3, (y - hy) % 8 ? E.steel : E.fog);
      r.rect(hx - 1, hy + FH - 1, TW + 2, 2, E.fog); r.hl(hx - 1, hy + FH + 1, TW + 2, E.navy);
      r.rect(hx - 2, hy - 2, TW + 4, 3, E.fog); r.hl(hx - 2, hy + 1, TW + 4, E.navy);
      // ivy up the west corner
      for (let y = hy + 6; y < hy + bodyH; y++) { const w = 3 + Math.round(3 * Math.sin(y * 0.4) + (y - hy) / 14); r.dith(hx, y, w, 1, (y >> 1) % 3 ? E.pine : E.green, 0.7); }
      // windows: two to a wing room, two either side of the portico in the centre
      for (const c of cells) {
        if (c.attic || c.basement) continue;
        const x0 = hx + c.x, y0 = hy + c.y + 7, arched = c.floor === 0;
        if (c.wing === 'C') { window_(r, x0 + 4, y0, c.room, arched); window_(r, x0 + c.w - 22, y0, c.room, arched); continue; }
        window_(r, x0 + Math.round(c.w / 4) - 9, y0, c.room, arched); window_(r, x0 + Math.round((3 * c.w) / 4) - 9, y0, c.room, arched);
      }
      window_(r, cx0 + 7, hy + FH + 10, null, false); window_(r, cx1 - 25, hy + FH + 10, null, false);
      portico(r, mid);
    } else {
      r.rect(hx, hy, TW, bodyH, E.plum);
      for (const x of [hx, cx0 - wall, cx0, cx1 - wall, cx1, hx + TW - wall]) { r.rect(x, hy, wall, bodyH, E.slate); r.vl(x + (x < mid ? wall - 1 : 0), hy, bodyH, E.navy); }
      for (const c of cells) if (!c.attic && !c.basement) paintCell(r, c, hx + c.x, hy + c.y);
      hall(r, cx0 + wall, hy + FH + wall, CW - wall * 2, FH - wall, mid);
      for (let f = 0; f < HG.floors; f++) { const y = hy + f * FH; r.rect(hx, y, TW, wall, E.brown); r.hl(hx, y, TW, E.clay); r.hl(hx, y + 2, TW, E.plum); }
    }
    // basement under everything
    const by = hy + bodyH + base;
    if (cut && L.basement) {
      r.rect(hx - 3, by, TW + 6, BH, E.slate);
      for (let j = 2; j < BH; j += 4) r.hl(hx - 3, by + j, TW + 6, E.navy);
      for (const c of cells) if (c.basement) paintCell(r, c, hx + c.x, hy + c.y);
      const sx = mid + 26; // the stairs down from the hall
      for (let k = 0; k < 9; k++) { r.rect(sx + k * 3, by - base + k * 4, 3, 2, E.clay); r.hl(sx + k * 3, by - base + k * 4, 3, E.peach); }
    }
    // plinth and steps
    const fy = hy + bodyH;
    r.rect(hx - 3, fy, TW + 6, base, E.steel);
    for (let i = hx - 3; i < hx + TW + 3; i += 8) r.vl(i, fy, base, E.slate);
    r.hl(hx - 3, fy, TW + 6, E.fog); r.hl(hx - 3, fy + base - 1, TW + 6, E.navy);
    if (cut && L.basement) r.rect(mid + 25, fy, 12, base, E.night); // the opening the stairs go down through
    if (!cut) {
      for (let k = 0; k < 3; k++) { const w = 40 + k * 8; r.rect(mid - w / 2, fy + k * 2, w, 2, k % 2 ? E.steel : E.fog); r.hl(mid - w / 2, fy + k * 2, w, E.white); }
      r.sprite(SPR.cat, CAT, mid + 24, fy - 9);
      r.sprite(SPR.pot, POT, mid - 40, fy - 9); r.sprite(SPR.pot, POT, mid + 34, fy - 9);
    }
  }

  /** a wall of dressed stone: courses every 3 rows, joints staggered, a little dither for texture */
  function stone(r, x, y, w, h, c, joint) {
    r.rect(x, y, w, h, c);
    for (let j = 2; j < h; j += 3) {
      r.hl(x, y + j, w, joint);
      for (let i = ((j / 3) % 2) * 5; i < w; i += 10) r.px(x + i, y + j - 1, joint);
    }
    r.dith(x, y, w, h, E.fog, 0.05);
  }

  /** a wing's steep slate roof, sloping down at the outer end, with a dormer */
  function wingRoof(r, x, w, west) {
    for (let j = 0; j < WR; j++) {
      const y = S.hy - WR + j, inset = WR - 1 - j;
      const x0 = west ? x + inset : x, x1 = west ? x + w : x + w - inset;
      for (let i = x0; i < x1; i++) {
        const edge = i === x0 || i === x1 - 1 || j === 0;
        r.px(i, y, edge ? E.night : (j % 3 === 2 ? E.navy : ((i + (j / 3 | 0) * 2) % 5 === 0 ? E.night : E.ink)));
      }
    }
    // a dormer with a little gable
    const dx = x + Math.round(w / 2) - 5, dy = S.hy - WR + 5;
    for (let j = 0; j < 4; j++) r.hl(dx + 4 - j, dy - 4 + j, 3 + j * 2, j === 0 ? E.fog : E.ink);
    r.rect(dx, dy, 11, 11, E.fog); r.rect(dx + 2, dy + 2, 7, 8, E.amber); r.dith(dx + 2, dy + 2, 7, 8, E.yellow, 0.4);
    r.vl(dx + 5, dy + 2, 8, E.fog); r.hl(dx + 2, dy + 5, 7, E.fog);
  }

  /** the centre: the attic storey in a mansard, a balustrade, a cap, and a copper cupola */
  function centreRoof(r, x, cut) {
    const y0 = S.hy - AH;
    for (let j = 0; j < AH; j++) {
      const inset = Math.round((AH - 1 - j) * 0.18), a = x - 3 + inset, b = x + CW + 3 - inset;
      for (let i = a; i < b; i++) {
        const edge = i === a || i === b - 1;
        r.px(i, y0 + j, edge ? E.night : (j % 4 === 3 ? E.night : ((i + (j >> 2)) % 6 === 0 ? E.navy : E.ink)));
      }
    }
    const ac = cells.find(c => c.attic);
    if (cut && ac) paintCell(r, ac, S.hx + ac.x, S.hy + ac.y);
    else for (let k = 0; k < 3; k++) {
      const dx = x + 18 + k * 32, dy = y0 + 10;
      const t = ac?.room ? THEMES[ac.room.kind] : null;
      r.rect(dx - 1, dy - 3, 14, 18, E.fog); r.circle(dx + 6, dy - 2, 7, E.fog);
      r.rect(dx + 1, dy - 1, 10, 14, E.amber); r.circle(dx + 6, dy - 1, 5, E.amber);
      r.dith(dx + 1, dy - 5, 10, 18, t ? (t.light === E.fog ? E.white : t.light) : E.yellow, 0.3);
      r.vl(dx + 6, dy - 6, 19, E.fog); r.hl(dx + 1, dy + 5, 10, E.fog);
    }
    // balustrade along the top of the mansard
    r.rect(x - 1, y0 - 2, CW + 2, 2, E.fog);
    for (let i = x; i < x + CW; i += 3) { r.vl(i, y0 - 6, 4, E.fog); r.px(i, y0 - 7, E.steel); }
    r.hl(x - 1, y0 - 7, CW + 2, E.fog);
    // the cap
    const c0 = S.hy - AH - CR;
    for (let j = 0; j < CR; j++) {
      const inset = 22 - Math.round(j * 1.4), a = x + inset, b = x + CW - inset;
      for (let i = a; i < b; i++) r.px(i, c0 + j, j === 0 || i === a || i === b - 1 ? E.night : (j % 3 === 1 ? E.navy : E.ink));
    }
    // cupola: a lantern with a lit arch, a copper dome and a finial
    const mid = S.hx + Math.round(TW / 2), cy = c0 - cup;
    r.rect(mid - 8, cy + 8, 16, cup - 8, E.fog); r.vl(mid - 8, cy + 8, cup - 8, E.steel); r.vl(mid + 7, cy + 8, cup - 8, E.steel);
    r.rect(mid - 3, cy + 10, 6, 7, E.amber); r.circle(mid, cy + 10, 3, E.amber); r.rect(mid - 1, cy + 11, 2, 6, E.yellow);
    for (let j = 0; j < 8; j++) { const hw = Math.round(9 * Math.sqrt(1 - ((8 - j) / 8) ** 2)); r.hl(mid - hw, cy + j, hw * 2, j < 3 ? E.green : j % 2 ? E.pine : E.deep); }
    r.vl(mid, cy - 5, 5, E.amber); r.px(mid, cy - 6, E.yellow);
  }

  /** the portico: four columns, an entablature with the house's name, a pediment with a round window, the door */
  function portico(r, mid) {
    const y1 = S.hy + bodyH, top = S.hy + FH + 6, x0 = mid - 30, x1 = mid + 30;
    r.dith(x0, top, 60, y1 - top, E.night, 0.35); // the shade under it
    for (const cx of [x0 + 2, x0 + 17, x1 - 21, x1 - 6]) {
      r.rect(cx, top + 2, 4, y1 - top - 3, E.fog); r.vl(cx + 3, top + 2, y1 - top - 3, E.steel); r.vl(cx + 1, top + 2, y1 - top - 3, E.white);
      r.rect(cx - 1, top, 6, 2, E.fog); r.rect(cx - 1, y1 - 2, 6, 2, E.fog);
    }
    // the door: double leaves under a fanlight, a lantern either side
    const dx = mid - 8, dy = y1 - 24;
    r.circle(mid, dy, 8, E.fog); r.circle(mid, dy, 6, E.amber); r.circle(mid, dy, 3, E.yellow);
    for (let k = -2; k <= 2; k++) r.px(mid + k * 2, dy - 4 + Math.abs(k), E.fog);
    r.rect(dx - 1, dy, 18, 24, E.fog); r.rect(dx, dy + 1, 16, 23, E.wine);
    r.vl(mid, dy + 1, 23, E.plum);
    for (const px of [dx + 2, mid + 2]) { r.rect(px, dy + 4, 4, 7, E.plum); r.rect(px, dy + 14, 4, 7, E.plum); }
    r.px(mid - 2, dy + 13, E.amber); r.px(mid + 1, dy + 13, E.amber);
    for (const lx of [x0 + 10, x1 - 12]) { r.rect(lx, dy + 6, 3, 5, E.amber); r.px(lx + 1, dy + 5, E.night); glow(r, lx + 1, dy + 8, 7, E.yellow, 0.25); }
    // entablature with the name carved in the frieze
    r.rect(x0 - 3, top - 8, 66, 8, E.fog); r.hl(x0 - 3, top - 1, 66, E.steel); r.hl(x0 - 3, top - 8, 66, E.white);
    const tw = textWidth(title);
    r.text(title, mid - Math.round(tw / 2), top - 6, E.slate);
    // pediment
    for (let j = 0; j < 14; j++) {
      const half = Math.round(33 - (14 - j) * 2.3), y = top - 22 + j;
      if (half <= 0) continue;
      for (let i = -half; i < half; i++) r.px(mid + i, y, i === -half || i === half - 1 ? E.fog : E.steel);
    }
    r.hl(mid - 33, top - 9, 66, E.fog);
    r.circle(mid, top - 14, 3, E.fog); r.circle(mid, top - 14, 2, E.amber); r.px(mid, top - 14, E.yellow);
  }

  /** the entrance hall: panelled walls, a marble floor, a double staircase and a chandelier */
  function hall(r, x, y, w, h, mid) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const fl = j >= h - 4;
      r.px(x + i, y + j, fl ? (((i >> 1) + ((j - h) >> 1)) % 2 ? E.fog : E.night) : (i % 12 === 0 ? E.plum : j === Math.round(h * 0.62) ? E.brown : E.wine));
    }
    // the double staircase up to a landing
    const fl = y + h - 4, land = y + 12;
    for (let k = 0; k < 10; k++) {
      const sh = Math.round(((fl - land) * (k + 1)) / 10);
      r.rect(x + 2 + k * 3, fl - sh, 3, sh, E.brown); r.hl(x + 2 + k * 3, fl - sh, 3, E.clay);
      r.rect(x + w - 5 - k * 3, fl - sh, 3, sh, E.brown); r.hl(x + w - 5 - k * 3, fl - sh, 3, E.clay);
    }
    for (let k = 0; k < 30; k++) { r.px(x + 2 + k, fl - 7 - Math.round(((fl - land) * k) / 30), E.peach); r.px(x + w - 3 - k, fl - 7 - Math.round(((fl - land) * k) / 30), E.peach); }
    r.rect(x + 32, land, w - 64, 3, E.brown); r.hl(x + 32, land, w - 64, E.clay);
    r.rect(mid - 5, land - 9, 10, 9, E.night); r.circle(mid, land - 9, 5, E.night);
    // chandelier
    r.vl(mid, y, 6, E.amber);
    r.rect(mid - 5, y + 6, 11, 2, E.amber); r.px(mid - 5, y + 5, E.yellow); r.px(mid, y + 5, E.yellow); r.px(mid + 5, y + 5, E.yellow);
    r.rect(mid - 2, y + 8, 5, 2, E.ochre);
    glow(r, mid, y + 8, 20, E.amber, 0.22);
    // the rug
    r.rect(mid - 14, fl, 28, 2, E.wine); r.hl(mid - 14, fl, 28, E.amber);
  }

  function window_(r, x, y, room, arched) {
    const t = room ? THEMES[room.kind] : null;
    r.rect(x - 1, y - 1, 20, 24, E.fog);
    if (arched) { r.circle(x + 9, y, 10, E.fog); }
    const glowc = [E.yellow, E.amber, E.orange];
    for (let j = arched ? -8 : 0; j < 22; j++) for (let i = 0; i < 18; i++) {
      if (j < 0 && (i - 8.5) ** 2 + j * j > 72) continue;
      const d = Math.abs(i - 8.5) / 9 + Math.abs(j - 9) / 14;
      const k = d < 0.45 ? 0 : d < 0.85 ? 1 : 2;
      r.px(x + i, y + j, k === 0 && BAYER[j & 3][i & 3] > 9 ? glowc[1] : glowc[k]);
    }
    if (t) r.dith(x, y - (arched ? 8 : 0), 18, 22 + (arched ? 8 : 0), t.light === E.fog ? E.white : t.light, 0.18);
    // shelves seen through the glass
    if (room) { for (let i = 0; i < 18; i++) if (i % 2 === 0 || i % 5 === 0) r.vl(x + i, y + 15, 7, i % 4 === 0 ? E.brown : E.plum); r.hl(x, y + 14, 18, E.brown); }
    // curtains and glazing bars
    for (let j = 0; j < 22; j++) { const w = 3 + (j > 12 ? 1 : 0); r.rect(x, y + j, w, 1, j % 2 ? E.wine : E.red); r.rect(x + 18 - w, y + j, w, 1, j % 2 ? E.wine : E.red); }
    r.vl(x + 8, y - (arched ? 8 : 0), 22 + (arched ? 8 : 0), E.fog); r.vl(x + 9, y - (arched ? 8 : 0), 22 + (arched ? 8 : 0), E.steel); r.hl(x, y + 9, 18, E.fog);
    if (arched) r.hl(x, y, 18, E.fog);
    // sill
    r.rect(x - 3, y + 22, 24, 2, E.fog); r.hl(x - 3, y + 23, 24, E.steel);
    r.dith(x - 1, y + 24, 20, 4, E.amber, 0.1);
  }

  function paintCell(r, c, x0, y0) {
    for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) r.px(x0 + i, y0 + j, interiorPixel(c.room?.kind, i, j, false, c));
    if (c.room) furnish(r, c, x0, y0);
  }

  // wallpaper + floor for a pixel of a room
  function interiorPixel(kind, i, j, isAttic, c) {
    const t = THEMES[kind] || THEMES.books;
    const h = c.h;
    if (j >= h - 3) {
      if (kind === 'toys') return j === h - 3 ? t.floorLine : ((i >> 1) + j) % 2 ? E.night : E.fog; // arcade checkerboard
      return j === h - 3 ? t.floorLine : (i % 9 === 0 ? t.floorLine : t.floor);
    }
    switch (kind) {
      case 'manga': return (i % 7 === 0 || j % 6 === 0) ? t.motif : t.wall;
      case 'anime': return (i % 4 === 0 && j % 4 === 0) ? E.grape : t.wall;
      case 'music': return ((i + (j >> 2) * 2) % 6 === 0 && j % 4 === 1) ? t.motif : t.wall;
      case 'books': return ((i + j) % 6 === 0 || (i - j + 60) % 6 === 0) ? t.motif : t.wall;
      case 'movies': return (i % 3 === 0) ? t.motif : t.wall;
      case 'toys': return (i % 4 === 2 && j % 4 === 2) ? t.motif : t.wall;
      case 'games': { const a = i % 8, b = j % 8; return (a === 4 && b >= 3 && b <= 5) || (b === 4 && a >= 3 && a <= 5) ? t.motif : t.wall; } // d-pads
      default: return t.wall;
    }
  }

  function furnish(r, c, x0, y0) {
    const room = c.room, kind = room.kind, t = THEMES[kind];
    const fl = y0 + c.h - 3;
    const right = c.wing === 'R', wide = c.w > 70;
    // the light first, so furniture sits in it
    const lx = wide ? x0 + Math.round(c.w / 2) : right ? x0 + 8 : x0 + c.w - 10;
    glow(r, lx, y0 + 6, wide ? 18 : 13, t.light, 0.16);
    // bookcases in this room's colours, filled with the real items' spine colours: one against the outer wall, a second in a wide room
    const bw = 22, bh = Math.min(25, c.h - 6), bx = right ? x0 + c.w - bw - 3 : x0 + 3, by = fl - bh;
    shelf(r, room, bx, by, bw, bh, t.wood, 3);
    if (wide) shelf(r, room, right ? x0 + 3 : x0 + c.w - bw - 3, by, bw, bh, t.wood, 3);
    const px = wide ? x0 + bw + 8 : right ? x0 + 3 : x0 + bw + 7;
    const P = PROPS[kind];
    if (P) P(r, px, fl, c.w - (wide ? bw * 2 + 16 : bw + 10), t);
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
    // smoke from the east chimney
    const cxs = S.hx + TW - 13, cys = S.hy - WR - 21;
    for (let k = 0; k < 3; k++) {
      const p = ((t * 0.35 + k / 3) % 1);
      const sx = Math.round(cxs + p * 10 + Math.sin(p * 6 + k) * 2), sy = Math.round(cys - p * 22);
      const sz = 1 + Math.round(p * 2);
      if (p < 0.92) f.dith(sx - sz, sy - sz, sz * 2 + 1, sz * 2 + 1, p < 0.5 ? E.steel : E.slate, 0.6 - p * 0.5);
    }
    // a little life inside
    if (open > 0.5) {
      for (const c of cells) {
        if (!c.room) continue;
        const x0 = S.hx + c.x, y0 = S.hy + c.y;
        if (c.room.kind === 'toys' && PROPS.arcadeAt) { const a = PROPS.arcadeAt; f.dith(a.x, a.y, 11, 8, Math.sin(t * 6) > 0 ? E.sky : E.lime, 0.35); }
        if (c.room.kind === 'anime') { const tv = PROPS.tvAt; if (tv) f.dith(tv.x, tv.y, 7, 5, Math.sin(t * 9) > 0 ? E.cyan : E.sky, 0.5); }
        if (c.room.kind === 'games' && PROPS.gameTvAt) { const g = PROPS.gameTvAt; f.dith(g.x, g.y, 26, 15, Math.sin(t * 5) > 0 ? E.cyan : E.lime, 0.22); }
        if (c.room.kind === 'music' && PROPS.deckAt) { const d = PROPS.deckAt; f.px(d.x + Math.round(2 + Math.cos(t * 4) * 2), d.y + Math.round(Math.sin(t * 4) * 0.5), E.steel); }
        if (st.hover === c.room.id) outlineRect(f, x0 - 1, y0 - 1, c.w + 2, c.h + 2, c.attic);
      }
    }
    if (st.hoverHouse && open < 0.5) outlineMask(f, S.ext.d, b);
    f.blit(ctx);
  }

  function outlineRect(f, x, y, w, h) {
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
  toys(r, x, fl, w) {
    r.rect(x, fl - 27, 15, 27, E.night); r.rect(x + 1, fl - 26, 13, 4, E.hot); r.hl(x + 3, fl - 25, 9, E.yellow);
    r.rect(x + 2, fl - 20, 11, 8, E.cyan); PROPS.arcadeAt = { x: x + 2, y: fl - 20 };
    r.rect(x + 1, fl - 11, 13, 3, E.slate); r.px(x + 4, fl - 10, E.red); r.px(x + 7, fl - 10, E.amber); r.px(x + 10, fl - 10, E.lime);
    r.rect(x + 22, fl - 10, 34, 2, E.green); r.hl(x + 22, fl - 10, 34, E.lime); r.vl(x + 39, fl - 13, 3, E.white);
    r.rect(x + 24, fl - 8, 1, 8, E.night); r.rect(x + 53, fl - 8, 1, 8, E.night);
    r.rect(x + 60, fl - 4, 4, 4, E.pink); r.px(x + 61, fl - 5, E.white);
  },
  games(r, x, fl, w) {
    // a big TV on a low stand, a console either side, a beanbag in front
    r.rect(x + 2, fl - 26, 28, 17, E.night); r.rect(x + 3, fl - 25, 26, 15, E.blue); r.dith(x + 3, fl - 25, 26, 15, E.sky, 0.4);
    PROPS.gameTvAt = { x: x + 3, y: fl - 25 };
    r.rect(x, fl - 7, 32, 7, E.ink); r.hl(x, fl - 7, 32, E.navy);
    r.rect(x + 2, fl - 13, 4, 6, E.white); r.vl(x + 4, fl - 13, 6, E.fog); r.px(x + 4, fl - 8, E.sky);
    r.rect(x + 25, fl - 11, 5, 4, E.night); r.px(x + 27, fl - 10, E.lime);
    r.rect(x + 36, fl - 6, 10, 6, E.wine); r.hl(x + 37, fl - 7, 8, E.red); r.px(x + 40, fl - 4, E.red);
    r.rect(x + 12, fl - 3, 6, 2, E.night); r.px(x + 13, fl - 3, E.red); r.px(x + 16, fl - 3, E.lime);
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
  controller: { map: { k: E.night, b: E.ink, s: E.slate, r: E.red, g: E.lime, y: E.amber, c: E.sky }, rows: [
    '.bbbbbbbbbbbbb.', 'bbsbbbbbbbbbybb', 'bsssbbbbbbbcbrb', 'bbsbbbsbsbbbgbb', 'bbbbbbbbbbbbbbb', 'bbbbbkkkkkbbbbb', '.bbbk.....kbbb.', '..bb.......bb..'] },
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
  const n = { manga: 12, anime: 8, music: 16, books: 12, movies: 6, toys: 6, games: 8 }[kind] || 12;
  const r = new Raster(n, n);
  const base = { manga: E.deep, anime: E.ink, music: E.plum, books: E.pine, movies: E.wine, toys: E.grape, games: E.deep }[kind] || t.wall;
  r.rect(0, 0, n, n, base);
  if (kind === 'manga') { r.hl(0, 0, n, E.pine); r.vl(0, 0, n, E.pine); }
  if (kind === 'anime') { r.px(0, 0, E.navy); r.px(4, 4, E.grape); }
  if (kind === 'music') { r.rect(4, 4, 2, 2, E.brown); r.rect(12, 12, 2, 2, E.brown); }
  if (kind === 'books') { for (let i = 0; i < n; i++) { r.px(i, i, E.deep); r.px(n - 1 - i, i, E.deep); } r.px(6, 0, E.green); r.px(0, 6, E.green); }
  if (kind === 'movies') { r.vl(0, 0, n, E.brown); r.dith(1, 0, 2, n, E.brown, 0.25); }
  if (kind === 'toys') { r.rect(2, 2, 2, 2, E.plum); r.px(2, 2, E.night); } // pegboard
  if (kind === 'games') { r.hl(2, 4, 5, E.pine); r.vl(4, 2, 5, E.pine); } // a d-pad
  return (spriteCache[key] = { url: r.toURL(), n });
}
