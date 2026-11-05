import { loadHouse, putEntry, hash, esc, roomStats, countLine } from './model.js';
import { spineHTML, spineClass, frameHTML, backHTML, mediaHTML, coverHTML, palVars, volumeLine } from './art.js';
import { createStreet, decorSprite, wallTile } from './pixel.js';
import { openLog, canLog, applyPending } from './log.js';
import { TOYS, trickCount, player } from './toys.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SWING = 'cubic-bezier(0.22, 1, 0.36, 1)';

const S = { house: null, scene: null, room: null, sort: 'shelf', fmt: null, q: '', order: [], insp: null };
const MEDIA_ROOMS = new Set(['music', 'movies', 'anime']);

boot();

async function boot() {
  const app = $('#app');
  try {
    S.house = await loadHouse('data/');
    applyPending(S.house, putEntry);
  } catch (e) {
    const local = location.protocol === 'file:';
    app.innerHTML = `<div class="loading"><p>${local
      ? 'The house can’t read its shelves from a file opened on disk.<br>In the repo folder run <code>python3 -m http.server</code> and open <code>http://localhost:8000</code>.'
      : `The collection data didn’t load (${esc(e.message)}).<br>Check that the data folder was deployed.`}</p></div>`;
    return;
  }
  buildStreet();
  addEventListener('hashchange', route);
  addEventListener('resize', debounce(onResize, 120));
  document.addEventListener('keydown', onKey);
  // a cover that fails to load falls back to the generated art underneath it
  document.addEventListener('error', e => { if (e.target?.classList?.contains('art-img')) e.target.remove(); }, true);
  route();
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ============================================================ ROUTING
// #            street, front closed
// #house       street, front open
// #music       a room
// #music--kid-a / #manga--berserk--7   a room with one object in hand
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  const [rid, ...rest] = h.split('--');
  const room = S.house.byId[rid];
  if (room) {
    if (S.scene !== 'room' || S.room !== room) showRoom(room);
    if (room.kind === 'toys') {
      if (rest[0]) openPlay(room, rest[0], rest[1]); else closePlay();
      return;
    }
    const key = rest.join('--');
    if (key) openInspect(key); else closeInspect();
  } else {
    closeInspect(true);
    closePlay();
    showStreet(h === 'house');
  }
}

function go(hashName) { location.hash = hashName; }

// ============================================================ STREET + HOUSE (pixel art)
const ST = { scene: null, k: 4, ctx: null, raf: 0, last: 0, t0: performance.now(), open: 0, target: 0, hover: null, hoverHouse: false };

function floorName(f, floors) {
  const level = floors - 1 - f;
  return level === 0 ? 'Ground floor' : level === 1 ? 'First floor' : level === 2 ? 'Second floor' : `Floor ${level}`;
}

function buildStreet() {
  const H = S.house;
  ST.scene = createStreet({ rooms: H.rooms, name: H.name, number: H.number });
  const { cells, L } = ST.scene;
  for (const c of cells) if (c.room) c.room.where = c.attic ? 'Attic' : c.basement ? 'Basement' : `${floorName(c.floor, L.floors)} · ${c.x > 50 ? 'East' : 'West'}`;
  const totalStats = H.rooms.map(r => `<span><b>${r.kind === 'manga' ? r.objects.length : r.items.length}</b> ${r.kind === 'manga' ? 'volumes' : r.K.many}</span>`).join('');

  $('#street').innerHTML = `
    <canvas class="street-canvas" aria-hidden="true"></canvas>
    <header class="street-head">
      <p class="eyebrow">No. ${esc(H.number || '7')} · Est. ${esc(H.established || new Date().getFullYear())} · A private collection</p>
      <h1 class="wordmark">${esc(H.name)}</h1>
      <p class="tagline">${esc(H.tagline || '')}</p>
    </header>
    <div class="hits">
      <button class="hit-house" type="button" aria-label="Open the front of ${esc(H.name)}"></button>
      ${cells.filter(c => c.room).map(c => `<button class="hit-room${c.attic ? ' attic' : ''}" type="button" data-room="${c.room.id}" aria-label="Enter ${esc(c.room.name)}, ${esc(countLine(c.room))}">
        <span class="hit-label"><b>${esc(c.room.name.replace(/^The\s+/i, ''))}</b><i>${esc(countLine(c.room))}</i></span></button>`).join('')}
    </div>
    <footer class="street-foot">
      <span class="hint">Click the house to let yourself in</span>
      <button class="btn btn-close" type="button">Close the front</button>
      <span class="stats">${totalStats}</span>
      ${logButton()}
      <button class="btn js-search" type="button" aria-label="Search the collection">${searchIcon()}<span>Search</span><kbd>/</kbd></button>
    </footer>`;

  const street = $('#street');
  ST.ctx = $('.street-canvas', street).getContext('2d');
  const hh = $('.hit-house', street);
  const set = (k, v) => () => { ST[k] = v; drawStreet(); };
  hh.addEventListener('click', () => go('house'));
  hh.addEventListener('pointerenter', set('hoverHouse', true));
  hh.addEventListener('pointerleave', set('hoverHouse', false));
  hh.addEventListener('focus', set('hoverHouse', true));
  hh.addEventListener('blur', set('hoverHouse', false));
  $$('.hit-room', street).forEach(b => {
    const on = set('hover', b.dataset.room), off = set('hover', null);
    b.addEventListener('pointerenter', on); b.addEventListener('pointerleave', off);
    b.addEventListener('focus', on); b.addEventListener('blur', off);
    b.addEventListener('click', () => zoomInto(b, S.house.byId[b.dataset.room]));
  });
  $('.btn-close', street).addEventListener('click', () => go(''));
  $$('.js-log', street).forEach(b => b.addEventListener('click', startLog));
  $('.js-search', street).addEventListener('click', openSearch);
}

function fitHouse() {
  const street = $('#street');
  if (!ST.scene || street.hidden) return;
  const vw = street.clientWidth, vh = street.clientHeight;
  const head = $('.street-head', street).offsetHeight, foot = $('.street-foot', street).offsetHeight;
  const need = ST.scene.L.totalH + 12;
  let k = Math.min((vh - head - foot - 12) / need, (vw - 8) / 150, 6);
  k = k >= 3 ? Math.floor(k) : Math.max(1.5, Math.floor(k * 4) / 4);
  const W = Math.ceil(vw / k), H = Math.ceil(vh / k);
  const ground = H - Math.ceil(foot / k) - 7 - ST.scene.basementH;
  ST.k = k;
  ST.scene.resize(W, H, ground);
  const cv = $('.street-canvas', street);
  cv.width = W; cv.height = H;
  cv.style.width = `${W * k}px`; cv.style.height = `${H * k}px`;
  const { S: geo, cells } = ST.scene, b = ST.scene.box;
  const place = (el, x, y, w, h) => Object.assign(el.style, { left: `${x * k}px`, top: `${y * k}px`, width: `${w * k}px`, height: `${h * k}px` });
  place($('.hit-house', street), b.x, b.y, b.w, b.h);
  for (const c of cells) {
    const el = c.room && $(`.hit-room[data-room="${c.room.id}"]`, street);
    if (el) place(el, geo.hx + c.x, geo.hy + c.y, c.w, c.h);
  }
  street.style.setProperty('--k', k);
  drawStreet();
}

function drawStreet(now = performance.now()) {
  if (!ST.scene || !ST.ctx || !ST.scene.S.bg) return;
  ST.scene.compose(ST.ctx, (now - ST.t0) / 1000, { open: ST.open, hover: ST.hover, hoverHouse: ST.hoverHouse });
}

function loop(now) {
  ST.raf = 0;
  if (S.scene !== 'street') return;
  const dt = Math.min(0.1, (now - (ST.last || now)) / 1000);
  if (ST.open !== ST.target) {
    ST.open = reduced ? ST.target : Math.max(0, Math.min(1, ST.open + Math.sign(ST.target - ST.open) * dt / 0.9));
    ST.last = now; drawStreet(now);
  } else if (!reduced && now - ST.last > 90) { ST.last = now; drawStreet(now); }
  if (!reduced || ST.open !== ST.target) ST.raf = requestAnimationFrame(loop);
}

function showStreet(open) {
  const street = $('#street'), room = $('#room');
  const fromRoom = S.scene === 'room';
  S.scene = 'street'; S.room = null;
  room.hidden = true; room.innerHTML = '';
  street.hidden = false;
  document.title = open ? `${S.house.name} · Choose a room` : S.house.name;
  const cv = $('.street-canvas', street);
  cv.getAnimations().forEach(a => a.cancel());
  ST.target = open ? 1 : 0;
  if (fromRoom || reduced) ST.open = ST.target;
  street.classList.toggle('is-open', open);
  fitHouse();
  if (!ST.raf) { ST.last = 0; ST.raf = requestAnimationFrame(loop); }
  window.scrollTo(0, 0);
}

function zoomInto(btn, room) {
  if (reduced) return go(room.id);
  const street = $('#street'), cv = $('.street-canvas', street);
  const r = btn.getBoundingClientRect(), cr = cv.getBoundingClientRect();
  const ox = r.left + r.width / 2 - cr.left, oy = r.top + r.height / 2 - cr.top;
  const zoom = Math.min(innerWidth / r.width, innerHeight / r.height) * 1.1;
  street.classList.add('zooming');
  const veil = document.createElement('div');
  veil.className = `zoom-veil theme-${room.kind}`;
  document.body.append(veil);
  cv.style.transformOrigin = `${ox}px ${oy}px`;
  cv.animate([{ transform: 'scale(1)' }, { transform: `scale(${zoom})` }], { duration: 650, easing: SWING, fill: 'forwards' });
  veil.animate([{ opacity: 0 }, { opacity: 0, offset: 0.55 }, { opacity: 1 }], { duration: 650, fill: 'forwards' }).onfinish = () => {
    street.classList.remove('zooming');
    go(room.id);
    requestAnimationFrame(() => veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, fill: 'forwards' }).onfinish = () => veil.remove());
  };
}

// ============================================================ ROOMS
function showRoom(room) {
  if (room.kind === 'toys') return showToyRoom(room);
  closeInspect(true);
  closePlay();
  S.scene = 'room'; S.room = room; S.sort = 'shelf'; S.fmt = null; S.q = '';
  $('#street').hidden = true;
  const sec = $('#room');
  sec.hidden = false;
  sec.className = `scene scene-room theme-${room.kind}`;
  const tile = wallTile(room.kind);
  sec.style.setProperty('--wallpaper', `url(${tile.url})`);
  sec.style.setProperty('--tile', `${tile.n * 4}px`);
  document.title = `${room.name} · ${S.house.name}`;

  const stats = roomStats(room);
  const chips = stats.length > 1
    ? `<button class="chip" type="button" data-fmt="" aria-pressed="true">All</button>` +
      stats.map(s => `<button class="chip" type="button" data-fmt="${s.format}" aria-pressed="false">${esc(s.label)}<b>${s.n}</b></button>`).join('')
    : '';
  const sources = [...new Set(room.items.map(i => i.source).filter(Boolean))];
  const covers = room.items.filter(i => i.cover).length;

  sec.innerHTML = `
    ${navHTML(room)}
    <header class="room-head">
      <div>
        <p class="eyebrow">${esc(room.where || '')}</p>
        <h1 class="room-title">${esc(room.name)}</h1>
        <p class="room-sub">${esc(countLine(room))} · ${stats.map(s => `${s.n} ${esc(s.label)}`).join(' · ')}</p>
      </div>
      <div class="room-tools">
        ${chips}
        <label class="sr" for="room-sort" hidden>Sort</label>
        <select id="room-sort" class="field" aria-label="Arrange the shelves">
          <option value="shelf">As shelved</option><option value="year">By year</option>
          <option value="title">A to Z</option><option value="creator">By ${esc(room.K.by.toLowerCase().replace('directed by', 'director'))}</option>
          <option value="rating">Highest rated</option>
        </select>
        <input id="room-q" class="field" type="search" placeholder="Find a ${esc(room.K.one)}" aria-label="Find on these shelves" autocomplete="off">
      </div>
    </header>
    <div class="wall"><div class="case" id="case"></div></div>
    <div class="floor"></div>
    <footer class="room-foot">
      <span>Click anything to take it off the shelf. Esc puts it back.</span>
      <span>${covers ? `Cover art: ${esc(sources.join(', ') || 'linked')} · ${covers} of ${room.items.length}` : 'Cover art: generated'}</span>
      <button class="linkish js-log" type="button">${canLog() ? 'Log an entry' : 'Owner? Log an entry'}</button>
    </footer>`;

  $('.js-search', sec).addEventListener('click', openSearch);
  $$('.js-log', sec).forEach(b => b.addEventListener('click', startLog));
  $$('.chip', sec).forEach(ch => ch.addEventListener('click', () => {
    S.fmt = ch.dataset.fmt || null;
    $$('.chip', sec).forEach(c => c.setAttribute('aria-pressed', String(c === ch)));
    applyFilter();
  }));
  $('#room-sort').addEventListener('change', e => { S.sort = e.target.value; packShelves(); });
  $('#room-q').addEventListener('input', e => { S.q = e.target.value.trim().toLowerCase(); applyFilter(); });
  $('#case').addEventListener('click', e => {
    const b = e.target.closest('.obj');
    if (b) { S.pushed = true; go(`${room.id}--${b.dataset.key}`); }
  });
  packShelves();
  window.scrollTo(0, 0);
  samplePalettes(room);
}

function sortedObjects(room) {
  const objs = room.objects.slice();
  const by = {
    year: (a, b) => (a.item.year || 9999) - (b.item.year || 9999) || (a.vol || 0) - (b.vol || 0),
    title: (a, b) => a.item.title.localeCompare(b.item.title) || (a.vol || 0) - (b.vol || 0),
    creator: (a, b) => (a.item.creator || '').localeCompare(b.item.creator || '') || (a.item.year || 0) - (b.item.year || 0) || (a.vol || 0) - (b.vol || 0),
    rating: (a, b) => (b.item.rating ?? -1) - (a.item.rating ?? -1) || a.item.order - b.item.order || (a.vol || 0) - (b.vol || 0),
  }[S.sort];
  return by ? objs.sort(by) : objs;
}

function packShelves() {
  const room = S.room, kase = $('#case');
  if (!room || !kase) return;
  const inner = kase.clientWidth - 40 - 16;
  const fit = Math.max(0.52, Math.min(1, (inner + 56) / 1180));
  const scale = room.K.scale * fit;
  const ds = fit > 0.8 ? 4 : 3; // size of one decor pixel
  const shelved = S.sort === 'shelf';
  const objs = sortedObjects(room);

  // records, discs and tapes are usually kept with their own format
  let groups = [objs];
  if (shelved && MEDIA_ROOMS.has(room.kind)) {
    const by = new Map();
    for (const o of objs) { if (!by.has(o.item.format)) by.set(o.item.format, []); by.get(o.item.format).push(o); }
    groups = [...by.values()];
  }
  const mk = (o, face) => ({ o, face, h: o.h * scale, w: face ? o.w * scale : Math.max(o.d * scale, (o.fmt.minSpine || 9) * Math.max(fit, 0.8)) });
  const gapOf = (a, b) => (a.face || b.face) ? 14 : hash(b.o.key) % 3;
  const widthOf = items => items.reduce((s, x, i) => s + x.w + (i ? gapOf(items[i - 1], x) : 0), 0);

  let rows = [];
  for (const g of groups) {
    let row = [];
    for (const o of g) {
      const x = mk(o, shelved && o.face);
      if (row.length && widthOf([...row, x]) > inner) { rows.push(row); row = []; }
      row.push(x);
    }
    if (row.length) rows.push(row);
  }
  // a bookcase has at least three shelves: split the fullest one until it does
  while (rows.length < 3) {
    let at = -1, most = 1;
    rows.forEach((r, i) => { if (r.length > most) { most = r.length; at = i; } });
    if (at < 0) { rows.push([]); continue; }
    const r = rows[at], half = Math.ceil(r.length / 2);
    rows.splice(at, 1, r.slice(0, half), r.slice(half));
  }
  // a shelf with room to spare turns its best pieces face-out, like a shop display
  for (const r of rows) {
    const cands = r.filter(x => !x.face).sort((a, b) =>
      (a.o.vol > 1) - (b.o.vol > 1) || (b.o.item.rating ?? 0) - (a.o.item.rating ?? 0) || a.o.item.order - b.o.item.order);
    for (const c of cands) {
      if (widthOf(r) > inner * 0.66) break;
      const i = r.indexOf(c), trial = r.slice(); trial[i] = mk(c.o, true);
      if (widthOf(trial) <= inner * 0.94) r[i] = trial[i];
    }
  }

  S.order = [];
  const decorKinds = room.K.decor, used = new Set();
  const html = rows.map((r, ri) => {
    const rh = Math.max(r.length ? Math.max(...r.map(x => x.h)) + 26 : 0, 104 * fit, 96);
    let left = inner - widthOf(r);
    const deco = [];
    // each piece of decor appears once per room, in a seeded order
    const order = decorKinds.map((_, n) => decorKinds[(hash(room.id + ri) + n) % decorKinds.length]);
    for (const name of order) {
      if (deco.length >= 2 || left < 60 || used.has(name)) continue;
      const sp = decorSprite(name), w = sp.w * ds, h = sp.h * ds;
      if (left > w + 36 && h < rh - 12) { used.add(name); deco.push(`<img class="decor" src="${sp.url}" alt="" width="${w}" height="${h}">`); left -= w + 22; }
    }
    const last = r[r.length - 1];
    if (last && !last.face && left > 30) last.lean = Math.min(9, (Math.atan((left - 18) / last.h) * 180) / Math.PI).toFixed(1);
    const objsHTML = r.map((x, i) => { S.order.push(x.o.key); x.gap = i ? gapOf(r[i - 1], x) : 0; return objHTML(x); }).join('');
    return `<div class="bay"><div class="row" style="--row-h:${rh.toFixed(0)}px">${objsHTML}${deco.join('')}</div></div><div class="plank"></div>`;
  }).join('');
  kase.innerHTML = html + '<div class="case-foot"></div>';
  applyFilter();
  if (S.insp) $(`.obj[data-key="${cssEsc(S.insp.o.key)}"]`)?.classList.add('is-out');
}

function objHTML(x) {
  const o = x.o, it = o.item;
  const pal = o.pal || it.pal;
  const cls = ['obj', x.face ? 'face' : 'sp', it.kind === 'books' && /read/i.test(it.status || '') ? 'reading' : '', x.lean ? 'lean' : ''].filter(Boolean).join(' ');
  const style = `--sw:${x.w.toFixed(1)}px;--sh:${x.h.toFixed(1)}px;--gap:${x.gap}px;${palVars(pal)};--hue:${o.vol ? (o.vol * 23) % 360 : 0}deg${x.lean ? `;--lean:${x.lean}deg` : ''}`;
  const inner = x.face ? frameHTML(o) : `<span class="${spineClass(o)}">${spineHTML(o)}</span>`;
  const title = `${it.title}${o.vol ? ` ${o.vol}` : ''}`;
  const sub = [it.creator, it.year].filter(Boolean).join(' · ');
  const label = `${it.title}${o.vol ? `, volume ${o.vol}` : ''}${it.creator ? `, ${it.creator}` : ''}`;
  return `<button class="${cls}" type="button" style="${style}" data-key="${esc(o.key)}" data-item="${esc(it.id)}" aria-label="${esc(label)}"><span class="obj-tip" aria-hidden="true"><b>${esc(title)}</b>${esc(sub)}</span>${inner}</button>`;
}

function matches(it) {
  if (S.fmt && it.format !== S.fmt) return false;
  if (!S.q) return true;
  const hay = [it.title, it.creator, it.original, it.year, it.label, it.publisher, ...(it.tags || [])].filter(Boolean).join(' ').toLowerCase();
  return S.q.split(/\s+/).every(w => hay.includes(w));
}

function applyFilter() {
  const room = S.room;
  if (!room) return;
  const byId = Object.fromEntries(room.items.map(i => [i.id, i]));
  $$('#case .obj').forEach(b => b.classList.toggle('dim', !matches(byId[b.dataset.item])));
}

function cssEsc(s) { return window.CSS?.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'); }

// ============================================================ COVER COLOURS
// Spines take their colours from the real cover when there is one: the cover's
// dominant colour becomes the spine ground, the strongest contrasting colour its ink.
function samplePalettes(room) {
  const todo = room.objects.filter(o => o.cover && !o.pal);
  let i = 0;
  const next = () => {
    if (S.room !== room || i >= todo.length) return;
    const o = todo[i++];
    const cp = o.item.coverPal;
    const pre = o.vol ? cp[o.vol] || (o.cover === o.item.cover && cp.src) : cp.src;
    if (pre) { setPal(o, pre); return next(); }
    samplePal(o.cover).then(p => { if (p) setPal(o, p); }).finally(next);
  };
  for (let k = 0; k < 4; k++) next();
}

function setPal(o, pal) {
  o.pal = pal;
  $$(`.obj[data-key="${cssEsc(o.key)}"]`).forEach(el => {
    el.style.setProperty('--bg', pal[0]); el.style.setProperty('--ink', pal[1]);
    el.style.setProperty('--ac', pal[2]); el.style.setProperty('--ex', pal[3]);
  });
}

const palCache = new Map();
function samplePal(src) {
  if (palCache.has(src)) return Promise.resolve(palCache.get(src));
  try { const c = localStorage.getItem('fr-pal:' + src); if (c) { const p = JSON.parse(c); palCache.set(src, p); return Promise.resolve(p); } } catch { /* storage unavailable */ }
  return new Promise(resolve => {
    const img = new Image();
    if (/^https?:/i.test(src) && !src.startsWith(location.origin)) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const n = 28, cv = document.createElement('canvas'); cv.width = cv.height = n;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0, n, n);
        const p = paletteFrom(cx.getImageData(0, 0, n, n).data);
        palCache.set(src, p);
        try { localStorage.setItem('fr-pal:' + src, JSON.stringify(p)); } catch { /* ignore */ }
        resolve(p);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function paletteFrom(px) {
  const bins = new Map();
  for (let i = 0; i < px.length; i += 4) {
    const k = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
    const b = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += px[i]; b.g += px[i + 1]; b.b += px[i + 2];
    bins.set(k, b);
  }
  const cols = [...bins.values()].map(b => ({ n: b.n, c: [b.r / b.n, b.g / b.n, b.b / b.n] })).sort((a, b) => b.n - a.n);
  const bg = cols[0].c;
  const far = cols.filter(x => dist(x.c, bg) > 90);
  const sat = c => { const mx = Math.max(...c), mn = Math.min(...c); return mx ? (mx - mn) / mx : 0; };
  const accent = (far.slice().sort((a, b) => sat(b.c) * Math.sqrt(b.n) - sat(a.c) * Math.sqrt(a.n))[0] || { c: lum(bg) > 0.5 ? [20, 20, 20] : [240, 236, 226] }).c;
  const inkCand = far.find(x => contrast(x.c, bg) >= 4.5)?.c;
  const ink = inkCand || (lum(bg) > 0.45 ? [22, 20, 18] : [244, 240, 230]);
  const ex = (far.find(x => dist(x.c, accent) > 70)?.c) || accent;
  return [hex(bg), hex(ink), hex(contrast(accent, bg) > 1.6 ? accent : ink), hex(ex)];
}
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function lum(c) { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); }
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function hex(c) { return '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join(''); }

// ============================================================ INSPECTOR
function openInspect(key) {
  const room = S.room;
  const o = room.objects.find(x => x.key === key);
  if (!o) { history.replaceState(null, '', `#${room.id}`); return; }
  if (S.insp?.o === o) return;
  if (S.insp) return swapInspect(o);
  buildInspect(o);
}

function sizeFor(o, stage) {
  const sw = stage.clientWidth, sh = stage.clientHeight;
  const media = ['vinyl', 'cd', 'cassette'].includes(o.item.format);
  const k = Math.min((sh * 0.66) / o.h, (sw * (media ? 0.44 : 0.56)) / o.w, 560 / o.h);
  const W = o.w * k, H = o.h * k, D = Math.max(o.d * k, 4);
  return { W, H, D, out: media ? W * (o.item.format === 'cassette' ? 0.62 : 0.56) : 0 };
}

function obj3dHTML(o, z) {
  const it = o.item, g = it.fmt.group;
  const pal = o.pal || it.pal;
  const edge = { book: `eg-book${it.format === 'hardcover' ? ' eg-hardcover' : ''}`, manga: 'eg-manga', case: 'eg-case', jewel: 'eg-jewel', sleeve: 'eg-open', vhs: 'eg-vhs', box: 'eg-box', cassette: 'eg-cassette' }[g] || 'eg-case';
  const top = { book: 'eg-book', manga: 'eg-manga', sleeve: 'eg-sleeve' }[g] || edge;
  const caseCol = { bluray: '#1d58b8', dvd: '#121212', '4k': '#0b0b0b' }[it.format] || '#111';
  return `<div class="obj3d" style="--W:${z.W}px;--H:${z.H}px;--D:${z.D}px;--case:${caseCol};${palVars(pal)}">
    ${mediaHTML(o)}
    <div class="f f-front">${frameHTML(o)}</div>
    <div class="f f-back">${backHTML(o)}</div>
    <div class="f f-left"><span class="${spineClass(o)}" style="width:var(--D);height:var(--H)">${spineHTML(o)}</span></div>
    <div class="f f-right"><span class="edge ${edge}"></span></div>
    <div class="f f-top"><span class="edge ${top}"></span></div>
    <div class="f f-bottom"><span class="edge ${top}"></span></div>
  </div>`;
}

function buildInspect(o) {
  const el = document.createElement('div');
  el.className = `inspect theme-${S.room.kind}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', o.item.title);
  el.innerHTML = `
    <div class="inspect-backdrop"></div>
    <div class="stage">
      <p class="stage-hint">Drag to turn it · double-click to flip</p>
      <div class="stage-anchor"></div>
      <div class="holder"></div>
      <div class="stage-ui">
        <button class="round js-prev" type="button" aria-label="Previous on the shelf">←</button>
        <span class="stage-count"></span>
        <button class="round js-next" type="button" aria-label="Next on the shelf">→</button>
      </div>
    </div>
    <aside class="notes"></aside>
    <button class="round btn-x" type="button" aria-label="Put it back on the shelf">✕</button>`;
  document.body.append(el);
  document.body.style.overflow = 'hidden';
  S.insp = { el, o, rotX: 6, rotY: -24 };
  $('.inspect-backdrop', el).addEventListener('click', putBack);
  $('.btn-x', el).addEventListener('click', putBack);
  $('.js-prev', el).addEventListener('click', () => step(-1));
  $('.js-next', el).addEventListener('click', () => step(1));
  bindDrag($('.stage', el));
  fill(o, true);
  $('.btn-x', el).focus({ preventScroll: true });
}

function fill(o, fly) {
  const I = S.insp, el = I.el, stage = $('.stage', el), holder = $('.holder', el);
  const prevEl = I.o && $(`.obj[data-key="${cssEsc(I.o.key)}"]`);
  prevEl?.classList.remove('is-out');
  I.o = o;
  const z = sizeFor(o, stage);
  I.z = z;
  holder.innerHTML = obj3dHTML(o, z);
  $('.notes', el).innerHTML = cardHTML(o);
  el.setAttribute('aria-label', o.item.title);
  const idx = S.order.indexOf(o.key);
  $('.stage-count', el).textContent = idx >= 0 ? `${idx + 1} / ${S.order.length}` : '';
  $('.js-prev', el).disabled = idx <= 0;
  $('.js-next', el).disabled = idx < 0 || idx >= S.order.length - 1;

  const shelfEl = $(`.obj[data-key="${cssEsc(o.key)}"]`);
  const face = shelfEl?.classList.contains('face');
  const obj3d = $('.obj3d', holder);
  const rest = `translate(${-z.out / 2}px, 0px) scale(1)`;
  I.rotX = 6; I.rotY = z.out ? -14 : -24;
  const restRot = `rotateX(${I.rotX}deg) rotateY(${I.rotY}deg)`;

  if (fly && shelfEl && !reduced) {
    const a = $('.stage-anchor', el).getBoundingClientRect();
    const r = shelfEl.getBoundingClientRect();
    const m = r.height / z.H;
    const startT = `translate(${r.left + r.width / 2 - a.left}px, ${r.top + r.height / 2 - a.top}px) scale(${m})`;
    const startR = face ? 'rotateX(5deg) rotateY(0deg)' : 'rotateX(0deg) rotateY(90deg)';
    shelfEl.classList.add('is-out');
    holder.animate([{ transform: startT }, { transform: rest }], { duration: 820, easing: SWING, fill: 'both' });
    obj3d.animate([{ transform: startR }, { transform: restRot }], { duration: 820, easing: SWING, fill: 'both' })
      .onfinish = () => { setRot(); slideOut(); };
  } else {
    shelfEl?.classList.add('is-out');
    holder.getAnimations().forEach(a => a.cancel());
    holder.style.transform = rest;
    if (fly || reduced) { setRot(); slideOut(); }
    else {
      obj3d.animate([{ transform: `rotateX(${I.rotX}deg) rotateY(${I.rotY + 70}deg)`, opacity: 0 }, { transform: restRot, opacity: 1 }],
        { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }).onfinish = () => { setRot(); slideOut(); };
    }
  }
}

function slideOut() {
  const I = S.insp; if (!I) return;
  const m = $('.media', I.el);
  if (m) requestAnimationFrame(() => m.style.setProperty('--out', `${I.z.out}px`));
}

function setRot() {
  const I = S.insp; if (!I) return;
  const o3 = $('.obj3d', I.el);
  o3.getAnimations().forEach(a => a.cancel());
  o3.style.transform = `rotateX(${I.rotX}deg) rotateY(${I.rotY}deg)`;
}

function bindDrag(stage) {
  let sx = 0, sy = 0, bx = 0, by = 0, down = false, moved = false;
  stage.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    down = true; moved = false; sx = e.clientX; sy = e.clientY; bx = S.insp.rotX; by = S.insp.rotY;
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', e => {
    if (!down || !S.insp) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    S.insp.rotY = by + dx * 0.45;
    S.insp.rotX = Math.max(-60, Math.min(60, bx - dy * 0.3));
    setRot();
  });
  const up = () => { down = false; };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('dblclick', e => { if (!e.target.closest('button')) flip(); });
  stage.addEventListener('click', e => { if (!moved && e.target === stage) putBack(); });
}

function flip() {
  const I = S.insp; if (!I) return;
  const o3 = $('.obj3d', I.el);
  const from = `rotateX(${I.rotX}deg) rotateY(${I.rotY}deg)`;
  I.rotY += 180;
  o3.animate([{ transform: from }, { transform: `rotateX(${I.rotX}deg) rotateY(${I.rotY}deg)` }], { duration: reduced ? 1 : 700, easing: SWING }).onfinish = setRot;
}

function step(d) {
  const I = S.insp; if (!I) return;
  const idx = S.order.indexOf(I.o.key);
  const key = S.order[idx + d];
  if (key) history.replaceState(null, '', `#${S.room.id}--${key}`), swapInspect(S.room.objects.find(x => x.key === key));
}

function swapInspect(o) {
  if (!S.insp || !o) return;
  const shelfEl = $(`.obj[data-key="${cssEsc(o.key)}"]`);
  shelfEl?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  fill(o, false);
}

function putBack() {
  if (!S.insp) return;
  if (S.pushed) { S.pushed = false; history.back(); } else go(S.room.id);
}

function closeInspect(instant) {
  const I = S.insp;
  if (!I) return;
  S.insp = null;
  document.body.style.overflow = '';
  const shelfEl = $(`.obj[data-key="${cssEsc(I.o.key)}"]`);
  const done = () => { I.el.remove(); shelfEl?.classList.remove('is-out'); shelfEl?.focus({ preventScroll: true }); };
  if (instant || reduced || !shelfEl) return done();
  const r = shelfEl.getBoundingClientRect();
  const holder = $('.holder', I.el), o3 = $('.obj3d', I.el);
  const a = $('.stage-anchor', I.el).getBoundingClientRect();
  const m = r.height / I.z.H;
  const face = shelfEl.classList.contains('face');
  $('.media', I.el)?.style.setProperty('--out', '0px');
  $('.notes', I.el).style.opacity = '0';
  $('.inspect-backdrop', I.el).animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, fill: 'forwards' });
  holder.animate([{ transform: getComputedStyle(holder).transform }, { transform: `translate(${r.left + r.width / 2 - a.left}px, ${r.top + r.height / 2 - a.top}px) scale(${m})` }],
    { duration: 640, easing: SWING, fill: 'forwards' });
  o3.animate([{ transform: o3.style.transform || 'none' }, { transform: face ? 'rotateX(5deg) rotateY(0deg)' : `rotateX(0deg) rotateY(${90 + 360 * Math.round((I.rotY - 90) / 360)}deg)` }],
    { duration: 640, easing: SWING, fill: 'forwards' }).onfinish = done;
}

const STAR = ['...1...', '..111..', '1111111', '.11111.', '..111..', '.11.11.', '.1...1.'];
function starSVG(fill) {
  let rects = '';
  STAR.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === '1') rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill >= 1 || (fill > 0 && x <= 3) ? '#feae34' : '#3a4466'}"/>`;
  }));
  return `<svg width="21" height="21" viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

function cardHTML(o) {
  const it = o.item, K = S.room.K;
  const rows = [];
  const add = (k, v) => { if (v !== undefined && v !== null && v !== '') rows.push([k, v]); };
  add('Year', it.year);
  add('Format', it.fmt.label + (o.vol ? ` · Vol. ${o.vol}` : ''));
  if (it.kind === 'manga') { add('Owned', volumeLine(it)); add('Publisher', it.publisher); }
  add('Label', it.label);
  if (Array.isArray(it.tracks)) add('Tracks', it.tracks.length);
  add('Runtime', it.runtime && `${it.runtime} min`);
  add('Episodes', it.episodes);
  add('Pages', it.pages);
  add('Country', it.country);
  for (const [k, v] of Object.entries(it.facts || {})) add(k, v);
  add('Status', it.status && it.status[0].toUpperCase() + it.status.slice(1));

  const r = typeof it.rating === 'number' ? it.rating : null;
  const verb = it.status && /ing$/i.test(it.status) ? 'In progress' : K.verb;
  const stars = r === null ? '' : `<span class="stars" role="img" aria-label="${r} out of 10">${[1, 2, 3, 4, 5].map(i => starSVG(r / 2 >= i ? 1 : r / 2 >= i - 0.5 ? 0.5 : 0)).join('')}</span>`;
  const score = r === null ? '' : `<span class="score">${r % 1 ? r.toFixed(1) : r}<small>/10</small></span>`;
  const src = it.cover ? (it.source ? `Cover art: ${esc(it.source)}` : 'Cover art: linked') : 'Cover art: generated until the real one is fetched';
  const shelfmark = it.cat + (o.vol ? `·${String(o.vol).padStart(2, '0')}` : '');

  return `<article class="card">
    <div class="card-bar"><span>${esc(shelfmark)}</span><span>${esc(S.room.name.replace(/^The\s+/i, ''))}</span></div>
    <div class="card-body">
      <h2 class="card-title">${esc(it.title)}${o.vol ? ` <span>${o.vol}</span>` : ''}</h2>
      ${it.original && it.original !== it.title ? `<p class="card-orig">${esc(it.original)}</p>` : ''}
      ${it.creator ? `<p class="card-by"><span>${esc(K.by)}</span>${esc(it.creator)}</p>` : ''}
      <dl class="card-facts">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <div class="card-rating">${score}${stars}<span class="stamp">${esc(verb)}</span></div>
      ${it.note ? `<p class="card-note"><span class="card-label">My take</span>${esc(it.note)}</p>` : ''}
      ${it.tags.length ? `<ul class="card-tags">${it.tags.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      <p class="card-src">${src}</p>
    </div>
  </article>`;
}

// ============================================================ SEARCH
function searchIcon() {
  return '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 11l4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
}

function openSearch() {
  if ($('#search')) return $('#search-q').focus();
  const el = document.createElement('div');
  el.id = 'search'; el.className = 'search';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Search the collection');
  el.innerHTML = `<div class="search-box"><label for="search-q">Search every room</label>
    <input id="search-q" type="search" placeholder="Search" autocomplete="off">
    <ul class="results" role="listbox"></ul></div>`;
  document.body.append(el);
  const input = $('#search-q'), list = $('.results', el);
  let sel = 0, hits = [];
  const all = S.house.rooms.flatMap(r => r.items.map(it => ({ r, it })));
  const render = () => {
    const q = input.value.trim().toLowerCase();
    hits = (q ? all.filter(({ it }) => [it.title, it.creator, it.original, it.year, ...(it.tags || [])].filter(Boolean).join(' ').toLowerCase().includes(q)) : all.filter(x => x.it.featured)).slice(0, 40);
    sel = 0;
    list.innerHTML = hits.length ? hits.map(({ r, it }, i) => {
      const key = it.kind === 'manga' ? `${it.id}--${it.vols[0]}` : it.id;
      const o = r.objects.find(x => x.key === key);
      return `<li><a href="#${r.id}--${esc(key)}" role="option" aria-selected="${i === sel}">
        <span class="thumb"><span class="cover" style="inset:0">${coverHTML(o)}</span></span>
        <span class="r-t"><b>${esc(it.title)}</b><i>${esc([it.creator, it.year, it.fmt.label].filter(Boolean).join(' · '))}</i></span>
        <span class="r-room">${esc(r.name.replace(/^The\s+/i, ''))}</span></a></li>`;
    }).join('') : `<li class="empty">Nothing on any shelf matches “${esc(input.value)}”.</li>`;
  };
  const close = () => el.remove();
  input.addEventListener('input', render);
  input.addEventListener('keydown', e => {
    const links = $$('a', list);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = Math.max(0, Math.min(links.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
      links.forEach((a, i) => a.setAttribute('aria-selected', String(i === sel)));
      links[sel]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && links[sel]) { e.preventDefault(); close(); location.hash = links[sel].getAttribute('href').slice(1); }
  });
  list.addEventListener('click', e => { if (e.target.closest('a')) close(); });
  el.addEventListener('click', e => { if (e.target === el) close(); });
  render();
  input.focus();
}

// ============================================================ THE TRICK ROOM
function navHTML(room) {
  return `<nav class="room-nav" aria-label="Rooms">
      <a class="nav-mark" href="#house" title="Back to the house">${esc(S.house.name)}</a>
      <div class="nav-rooms">${S.house.rooms.map(r => `<a href="#${r.id}"${r === room ? ' aria-current="page"' : ''}>${esc(r.name.replace(/^The\s+/i, ''))}</a>`).join('')}</div>
      ${logButton()}
      <button class="btn js-search" type="button" aria-label="Search the collection">${searchIcon()}<span>Search</span><kbd>/</kbd></button>
    </nav>`;
}

function showToyRoom(room) {
  closeInspect(true);
  closePlay();
  S.scene = 'room'; S.room = room;
  $('#street').hidden = true;
  const sec = $('#room');
  sec.hidden = false;
  sec.className = `scene scene-room theme-${room.kind}`;
  const tile = wallTile(room.kind);
  sec.style.setProperty('--wallpaper', `url(${tile.url})`);
  sec.style.setProperty('--tile', `${tile.n * 4}px`);
  document.title = `${room.name} · ${S.house.name}`;
  const toys = room.items.filter(it => TOYS[it.toy]);
  sec.innerHTML = `
    ${navHTML(room)}
    <header class="room-head"><div>
      <p class="eyebrow">${esc(room.where || '')}</p>
      <h1 class="room-title">${esc(room.name)}</h1>
      <p class="room-sub">${toys.length} ${toys.length === 1 ? 'toy' : 'toys'} · ${trickCount(room)} tricks to play</p>
    </div></header>
    <div class="wall"><div class="bench">${toys.map(it => `
      <button class="toy-station" type="button" data-key="${esc(it.id)}" style="${palVars(it.pal)}" aria-label="Play with the ${esc(it.title.toLowerCase())}, ${TOYS[it.toy].tricks.length} tricks">
        <span class="toy-case"><span class="toy-anchor" style="--sc:${(TOYS[it.toy].scale * 0.62).toFixed(2)}"></span></span>
        <span class="toy-label"><b>${esc(it.title)}</b><i>${TOYS[it.toy].tricks.length} tricks${it.creator ? ` · ${esc(it.creator)}` : ''}</i></span>
      </button>`).join('')}</div></div>
    <div class="floor"></div>
    <footer class="room-foot">
      <span>Pick a toy up to play with it. Arrow keys change the trick, space pauses.</span>
      <button class="linkish js-log" type="button">${canLog() ? 'Log an entry' : 'Owner? Log an entry'}</button>
    </footer>`;
  $('.js-search', sec).addEventListener('click', openSearch);
  $$('.js-log', sec).forEach(b => b.addEventListener('click', startLog));
  $$('.toy-station', sec).forEach(btn => {
    const it = room.items.find(i => i.id === btn.dataset.key), toy = TOYS[it.toy];
    const rig = toy.make($('.toy-anchor', btn), { ghosts: 0 });
    rig.pose();
    const pl = player(rig);
    pl.setMode('loop'); pl.setSpeed(0.8);
    const on = () => { if (!reduced) pl.go(Math.max(0, toy.tricks.findIndex(t => t.id === toy.preview))); };
    const off = () => { pl.stop(); rig.pose(); };
    btn.addEventListener('pointerenter', on); btn.addEventListener('pointerleave', off);
    btn.addEventListener('focus', on); btn.addEventListener('blur', off);
    btn.addEventListener('click', () => { off(); S.pushed = true; go(`${room.id}--${it.id}`); });
  });
  window.scrollTo(0, 0);
}

function openPlay(room, itemId, trickId) {
  const it = room.items.find(i => i.id === itemId);
  const toy = it && TOYS[it.toy];
  if (!toy) { history.replaceState(null, '', `#${room.id}`); return closePlay(); }
  const want = Math.max(0, toy.tricks.findIndex(t => t.id === trickId));
  if (S.play?.item === it) { if (trickId && want !== S.play.pl.index) S.play.pl.go(want); return; }
  closePlay();
  const el = document.createElement('div');
  el.className = `play theme-${room.kind}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', it.title);
  el.innerHTML = `
    <div class="inspect-backdrop"></div>
    <div class="play-stage">
      <div class="play-anchor" style="--sc:${toy.scale}"></div>
      <div class="play-now" aria-live="polite"><b></b><i></i></div>
      <div class="play-ui">
        <span class="play-progress" aria-hidden="true"><i></i></span>
        <div class="play-buttons">
          <button class="round js-prev" type="button" aria-label="Previous trick">←</button>
          <button class="round js-toggle" type="button" aria-label="Pause">❚❚</button>
          <button class="round js-next" type="button" aria-label="Next trick">→</button>
          <span class="play-gap"></span>
          ${[0.5, 1, 2].map(s => `<button class="chip js-speed" type="button" data-s="${s}" aria-pressed="${s === 1}">${s}×</button>`).join('')}
          <button class="chip js-mode" type="button" aria-pressed="false" title="Repeat this trick instead of moving on">Repeat</button>
        </div>
      </div>
    </div>
    <aside class="notes play-notes">
      <article class="card">
        <div class="card-bar"><span>${esc(it.cat)}</span><span>${esc(room.name.replace(/^The\s+/i, ''))}</span></div>
        <div class="card-body">
          <h2 class="card-title">${esc(it.title)}</h2>
          ${it.creator ? `<p class="card-by"><span>Kind</span>${esc(it.creator)}</p>` : ''}
          <p class="play-about"></p>
          <ol class="tricks">${toy.tricks.map((t, i) => `<li><button type="button" data-i="${i}"><span>${String(i + 1).padStart(2, '0')}</span><b>${esc(t.name)}</b><i>${esc(t.level)}</i></button></li>`).join('')}</ol>
        </div>
      </article>
    </aside>
    <button class="round btn-x" type="button" aria-label="Put it down">✕</button>`;
  document.body.append(el);
  document.body.style.overflow = 'hidden';
  const rig = toy.make($('.play-anchor', el), { ghosts: reduced ? 0 : 2 });
  const bar = $('.play-progress i', el), toggleBtn = $('.js-toggle', el);
  const pl = player(rig, {
    onTrick(i) {
      const t = toy.tricks[i];
      $('.play-now b', el).textContent = t.name;
      $('.play-now i', el).textContent = `${t.level} · ${i + 1} of ${toy.tricks.length}`;
      $('.play-about', el).textContent = t.about;
      $$('.tricks button', el).forEach(b => b.toggleAttribute('aria-current', +b.dataset.i === i));
      $(`.tricks button[data-i="${i}"]`, el)?.scrollIntoView({ block: 'nearest' });
      history.replaceState(null, '', `#${room.id}--${it.id}--${t.id}`);
    },
    onTick(u) {
      if (typeof u === 'number') bar.style.width = `${(u * 100).toFixed(1)}%`;
      toggleBtn.textContent = pl.playing ? '❚❚' : '▶';
      toggleBtn.setAttribute('aria-label', pl.playing ? 'Pause' : 'Play');
    },
  });
  S.play = { el, item: it, room, rig, pl };
  $('.inspect-backdrop', el).addEventListener('click', putBackPlay);
  $('.btn-x', el).addEventListener('click', putBackPlay);
  $('.js-prev', el).addEventListener('click', () => pl.go(pl.index - 1));
  $('.js-next', el).addEventListener('click', () => pl.go(pl.index + 1));
  toggleBtn.addEventListener('click', () => pl.toggle());
  $$('.js-speed', el).forEach(b => b.addEventListener('click', () => {
    pl.setSpeed(+b.dataset.s);
    $$('.js-speed', el).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  }));
  $('.js-mode', el).addEventListener('click', e => {
    const loop = pl.mode !== 'loop';
    pl.setMode(loop ? 'loop' : 'all');
    e.currentTarget.setAttribute('aria-pressed', String(loop));
  });
  $('.tricks', el).addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) pl.go(+b.dataset.i); });
  pl.go(want);
  $('.btn-x', el).focus({ preventScroll: true });
}

function closePlay() {
  if (!S.play) return;
  S.play.pl.stop();
  S.play.rig.destroy();
  S.play.el.remove();
  S.play = null;
  document.body.style.overflow = '';
}

function putBackPlay() {
  if (S.pushed) { S.pushed = false; history.back(); } else go(S.room.id);
}

// ============================================================ LOGGING
function logButton() {
  return canLog() ? '<button class="btn js-log" type="button" aria-label="Log an entry">+ <span>Log</span><kbd>L</kbd></button>' : '';
}

function startLog() {
  openLog({ house: S.house, roomId: S.room?.id, onLogged });
}

function onLogged(roomId, entry, where) {
  const room = putEntry(S.house, roomId, entry, where);
  buildStreet(); // the house's mini shelves pick up the new spine
  const it = room.items.find(i => i.title === entry.title && (i.year ?? null) === (entry.year ?? null));
  toast(`Logged ${entry.title}. It's on the shelf now; the live site catches up in about a minute.`);
  if (!it) return go(roomId);
  S.pushed = false;
  go(`${roomId}--${it.kind === 'manga' ? `${it.id}--${it.vols[0]}` : it.id}`);
}

function toast(text) {
  $('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = text;
  document.body.append(t);
  setTimeout(() => t.remove(), 5000);
}

// ============================================================ KEYS + RESIZE
function onKey(e) {
  const typing = /input|select|textarea/i.test(document.activeElement?.tagName || '');
  if (e.key === 'Escape') {
    if ($('#log')) return $('#log').remove();
    if (S.play) return putBackPlay();
    if ($('#search')) return $('#search').remove();
    if (S.insp) return putBack();
    if (S.scene === 'street' && location.hash === '#house') return go('');
  }
  if (e.key === '/' && !typing) { e.preventDefault(); return openSearch(); }
  if ((e.key === 'l' || e.key === 'L') && !typing && !S.insp && !S.play && !$('#search') && !$('#log')) { e.preventDefault(); return startLog(); }
  if (S.play && !typing && !$('#search')) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); return S.play.pl.go(S.play.pl.index - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); return S.play.pl.go(S.play.pl.index + 1); }
    if (e.key === ' ') { e.preventDefault(); return S.play.pl.toggle(); }
  }
  if (S.insp && !typing) {
    if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'f' || e.key === 'F') flip();
  } else if (S.scene === 'street' && !typing && (e.key === 'Enter' || e.key === ' ') && document.activeElement === document.body) {
    go('house');
  }
}

function onResize() {
  if (S.scene === 'street') fitHouse();
  else if (S.scene === 'room') {
    packShelves();
    if (S.insp) fill(S.insp.o, false);
  }
}
