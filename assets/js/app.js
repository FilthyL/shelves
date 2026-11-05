import { loadHouse, hash, esc, roomStats, countLine } from './model.js';
import { spineHTML, spineClass, frameHTML, backHTML, mediaHTML, coverHTML, palVars, volumeLine } from './art.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SWING = 'cubic-bezier(0.65, 0.02, 0.25, 1)';

// House geometry in unscaled px. The house is drawn once and scaled to the viewport.
const G = { W: 600, roofH: 210, floorH: 200, slab: 12, stairX: 258, stairW: 84, base: 34, cellW: 244 };
const GLOW = { music: '#ffb35a', movies: '#ff8a6b', books: '#ffd27a', anime: '#ff6fb5', manga: '#ffc27a' };
const DECOR = {
  plant: ['<i class="pot"></i><i class="leaf"></i><i class="leaf"></i><i class="leaf"></i>', 46, 74],
  candle: ['<i class="wax"></i><i class="flame"></i>', 22, 70],
  bookend: ['<i class="be"></i>', 18, 64],
  speaker: ['<i class="cab"></i><i class="cone"></i><i class="tw"></i>', 50, 76],
  reel: ['<i class="can"></i>', 64, 66],
  globe: ['<i class="ball"></i><i class="stand"></i><i class="base"></i>', 52, 84],
  daruma: ['<i class="body"></i><i class="face"></i>', 44, 50],
};

const S = { house: null, scene: null, room: null, sort: 'shelf', fmt: null, q: '', order: [], insp: null, wrap: null };

boot();

async function boot() {
  const app = $('#app');
  try {
    S.house = await loadHouse('data/');
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
    const key = rest.join('--');
    if (key) openInspect(key); else closeInspect();
  } else {
    closeInspect(true);
    showStreet(h === 'house');
  }
}

function go(hashName) { location.hash = hashName; }

// ============================================================ STREET + HOUSE
function layout() {
  const rooms = S.house.rooms;
  const attic = rooms.length % 2 === 1;
  const floors = Math.max(1, Math.ceil((rooms.length - (attic ? 1 : 0)) / 2));
  const cells = [];
  let i = 0;
  if (attic) {
    const h = G.roofH - 20, half = h / 0.7;
    cells.push({ room: rooms[i++], attic: true, x: G.W / 2 - half, y: 20, w: half * 2, h, where: 'Attic' });
  }
  for (let f = 0; f < floors; f++) {
    const y = G.roofH + f * G.floorH + G.slab;
    const level = floors - 1 - f;
    const name = level === 0 ? 'Ground floor' : level === 1 ? 'First floor' : level === 2 ? 'Second floor' : `Floor ${level}`;
    cells.push({ room: rooms[i++] || null, x: 14, y, w: G.cellW, h: G.floorH - G.slab, where: `${name} · West`, level });
    cells.push({ room: rooms[i++] || null, x: G.W - 14 - G.cellW, y, w: G.cellW, h: G.floorH - G.slab, where: `${name} · East`, level });
  }
  for (const c of cells) if (c.room) c.room.where = c.where;
  return { cells, floors, H: G.roofH + floors * G.floorH + G.base };
}

function buildStreet() {
  const H = S.house;
  const L = layout();
  S.layout = L;
  const totalStats = H.rooms.map(r => `<span><b>${r.kind === 'manga' ? r.objects.length : r.items.length}</b> ${r.kind === 'manga' ? 'volumes' : r.K.many}</span>`).join('');
  const skyline = Array.from({ length: 26 }, (_, i) => {
    const h = 18 + (hash('sky' + i) % 62);
    return `<span style="height:${h}%;flex-grow:${1 + (hash('w' + i) % 3)}"></span>`;
  }).join('');

  $('#street').innerHTML = `
    <div class="stars"></div><div class="stars s2"></div><div class="moon"></div>
    <div class="skyline" aria-hidden="true">${skyline}</div>
    <header class="street-head">
      <p class="eyebrow">No. ${esc(H.number || '7')} · Est. ${esc(H.established || new Date().getFullYear())} · A private collection</p>
      <h1 class="wordmark">${esc(H.name)}</h1>
      <p class="tagline">${esc(H.tagline || '')}</p>
    </header>
    <div class="lot">
      <div class="ground"></div>
      <div class="lamp-post" aria-hidden="true"></div>
      ${houseHTML(L)}
    </div>
    <footer class="street-foot">
      <span class="hint">Click the house to let yourself in</span>
      <button class="btn-search btn-close" type="button">Close the front</button>
      <span class="stats">${totalStats}</span>
      <button class="btn-search js-search" type="button" aria-label="Search the collection">${searchIcon()}<span>Search</span><kbd>/</kbd></button>
    </footer>`;

  const street = $('#street');
  $('.facade', street).addEventListener('click', () => go('house'));
  $('.btn-close', street).addEventListener('click', () => go(''));
  $('.js-search', street).addEventListener('click', openSearch);
  $$('.cell[data-room]', street).forEach(c => c.addEventListener('click', () => zoomInto(c, S.house.byId[c.dataset.room])));
  fitHouse();
}

function houseHTML(L) {
  const { W, roofH, floorH } = G;
  const facadeH = L.H - G.base;
  const name = esc(S.house.name);

  const slabs = Array.from({ length: L.floors }, (_, f) => `<div class="slab" style="top:${roofH + f * floorH}px"></div>`).join('');
  const cells = L.cells.map(cellHTML).join('');

  // windows on the front, one per room, placed over that room
  let wins = '';
  for (const c of L.cells) {
    const glow = c.room ? GLOW[c.room.kind] : '#3a3040';
    if (c.attic) {
      wins += `<span class="win oculus" style="left:${W / 2 - 46}px;top:${roofH - 128}px;width:92px;height:92px;--glow:${glow}"></span>`;
    } else {
      const ww = 104, wh = 116;
      wins += `<span class="win" style="left:${c.x + (c.w - ww) / 2}px;top:${c.y + 30}px;width:${ww}px;height:${wh}px;--glow:${glow}"><span class="flowers"></span></span>`;
    }
  }
  const trims = Array.from({ length: L.floors }, (_, f) =>
    `<span class="trim" style="left:0;right:0;top:${roofH + f * floorH - (f === 0 ? 8 : 4)}px;height:${f === 0 ? 14 : 8}px"></span>`).join('');
  const doorTop = facadeH - 132;

  return `
  <div class="house-wrap" style="--wrap-w:${W + 120}px;--wrap-h:${L.H + 70}px">
    <div class="house" style="--W:${W}px;--H:${L.H}px;--roofH:${roofH}px;--base:${G.base}px;--off-x:60px;--off-y:66px">
      <div class="house-glow"></div>
      <div class="chimney"></div>
      <div class="roof"></div>
      <div class="roof-inner"></div>
      <div class="body-shell"></div>
      <div class="stair" style="left:${G.stairX}px;top:${roofH + G.slab}px;width:${G.stairW}px;height:${L.floors * floorH - G.slab}px">${stairSVG(L.floors)}</div>
      ${slabs}
      ${cells}
      <div class="foundation"></div>
      <div class="steps" style="left:${W / 2 - 55}px"></div>
      <button class="facade" type="button" aria-label="Open the front of ${name}">
        <span class="facade-face">
          <span class="gable"></span>
          <svg viewBox="0 0 ${W} ${facadeH}" width="${W}" height="${facadeH}" style="position:absolute;inset:0" aria-hidden="true">
            <polyline points="0,${roofH} ${W / 2},0 ${W},${roofH}" fill="none" stroke="#e6dcc6" stroke-width="16"/>
            <polyline points="0,${roofH + 4} ${W / 2},4 ${W},${roofH + 4}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="3"/>
          </svg>
          ${trims}
          <span class="trim corner" style="left:0"></span><span class="trim corner" style="right:0"></span>
          ${wins}
          <span class="nameplate" style="left:${W / 2}px;top:${doorTop - 34}px;transform:translateX(-50%)">${name}</span>
          <span class="door" style="left:${W / 2 - 37}px"></span>
          <span class="sconce" style="left:${W / 2 - 66}px;top:${doorTop + 18}px"></span>
          <span class="sconce" style="left:${W / 2 + 54}px;top:${doorTop + 18}px"></span>
          <span class="housenum" style="left:${W / 2 + 50}px;top:${doorTop + 52}px">${esc(S.house.number || '7')}</span>
          <span class="mailbox" style="left:${W / 2 - 80}px;top:${doorTop + 64}px">POST</span>
        </span>
        <span class="facade-back"></span>
      </button>
    </div>
  </div>`;
}

function stairSVG(floors) {
  const w = G.stairW, fh = G.floorH, n = 9;
  let out = '';
  for (let f = 0; f < floors; f++) {
    const top = f * fh, bottom = top + fh - G.slab - 1;
    const sw = (w - 8) / n, sh = (fh - G.slab - 18) / n;
    const ltr = (floors - 1 - f) % 2 === 0;
    let x = ltr ? 4 : w - 4, y = bottom;
    let pts = `${x},${y}`;
    for (let k = 0; k < n; k++) { y -= sh; pts += ` ${x},${y.toFixed(1)}`; x += ltr ? sw : -sw; pts += ` ${x.toFixed(1)},${y.toFixed(1)}`; }
    pts += ` ${ltr ? w - 4 : 4},${bottom}`;
    out += `<polygon points="${pts}" fill="#4b301c" stroke="#7a5232" stroke-width="1.5"/>`;
    out += `<line x1="${ltr ? 6 : w - 6}" y1="${bottom - 30}" x2="${ltr ? w - 6 : 6}" y2="${top + 8}" stroke="#a07a4a" stroke-width="2"/>`;
  }
  return `<svg viewBox="0 0 ${w} ${floors * fh - G.slab}" preserveAspectRatio="none" aria-hidden="true">${out}</svg>`;
}

function cellHTML(c) {
  const r = c.room;
  const style = `left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px`;
  if (!r) {
    return `<div class="cell" style="${style};--wall:#1a1410;--wood:#3a2a1e;--wood-2:#21170f;--light:#665"><span class="cell-floor"></span><span class="cell-label"><b>Vacant</b><i>Room for more</i></span></div>`;
  }
  const mw = c.attic ? 150 : 118, rows = c.attic ? 2 : 3;
  const mx = c.attic ? c.w / 2 - 168 : 16;
  return `<button class="cell theme-${r.kind}${c.attic ? ' attic' : ''}" type="button" style="${style}" data-room="${r.id}" aria-label="Enter ${esc(r.name)}, ${esc(countLine(r))}">
    <span class="mini-case" style="left:${mx}px;width:${mw}px">${miniRows(r, rows, mw - 16)}</span>
    ${propHTML(r.kind, c)}
    <span class="cell-floor"></span>
    <span class="cell-label"><b>${esc(r.name)}</b><i>${esc(countLine(r))}</i></span>
    <span class="cell-enter">Enter →</span>
  </button>`;
}

function miniRows(room, rows, width) {
  const out = []; let cur = '', used = 0, objs = room.objects, i = 0;
  while (out.length < rows) {
    const o = objs[i % objs.length]; i++;
    if (!o) break;
    const w = Math.max(2, Math.min(8, Math.round(o.d * 0.24)));
    const h = Math.max(12, Math.min(28, Math.round(o.h * 0.105)));
    if (used + w + 1 > width) { out.push(cur); cur = ''; used = 0; if (i > objs.length * 3) break; continue; }
    const col = (o.pal || o.item.pal)[0];
    cur += `<i style="width:${w}px;height:${h}px;background:${col}" data-k="${esc(o.key)}"></i>`;
    used += w + 1;
  }
  return out.map(r => `<span class="mini-row">${r}</span>`).join('');
}

function propHTML(kind, c) {
  const left = c.attic ? `left:${c.w / 2 + 10}px` : '';
  const P = {
    music: '<i class="console"></i><i class="deck"></i><i class="platter"></i><i class="arm"></i><i class="spk"></i>',
    movies: '<i class="screen"></i><i class="couch"></i>',
    books: '<i class="flamp"></i><i class="chair"></i>',
    anime: '<i class="neon">アニメ</i><i class="crt"></i><i class="bean"></i>',
    manga: '<i class="kotatsu"></i><i class="lantern"></i>',
  };
  return `<span class="prop prop-${kind}" style="${left}">${P[kind] || ''}</span>`;
}

function fitHouse() {
  const lot = $('#street .lot'), wrap = $('#street .house-wrap');
  if (!lot || !wrap) return;
  const ww = G.W + 120, wh = S.layout.H + 70;
  const s = Math.max(0.3, Math.min(1.08, (lot.clientWidth - 16) / ww, (lot.clientHeight - 64) / wh));
  wrap.style.setProperty('--s', s.toFixed(4));
  $('#street').style.setProperty('--lamp-x', `${(G.W * s) / 2 + 190}px`);
}

function showStreet(open) {
  const street = $('#street'), room = $('#room');
  const fromRoom = S.scene === 'room';
  S.scene = 'street'; S.room = null;
  room.hidden = true; room.innerHTML = '';
  street.hidden = false;
  document.title = open ? `${S.house.name} · Choose a room` : S.house.name;
  fitHouse();
  const house = $('.house', street);
  if (fromRoom || reduced) house.classList.add('no-anim');
  street.classList.toggle('is-open', open);
  house.classList.toggle('is-open', open);
  if (house.classList.contains('no-anim')) {
    const f = $('.facade', house); f.style.transition = 'none';
    requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = ''; house.classList.remove('no-anim'); }));
  }
  window.scrollTo(0, 0);
}

function zoomInto(cell, room) {
  if (reduced) return go(room.id);
  const r = cell.getBoundingClientRect();
  const veil = document.createElement('div');
  veil.className = `zoom-veil theme-${room.kind}`;
  document.body.append(veil);
  const from = { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, opacity: 0.0 };
  const to = { left: '0px', top: '0px', width: `${innerWidth}px`, height: `${innerHeight}px`, opacity: 1 };
  const wrap = $('#street .house-wrap');
  const s = +getComputedStyle(wrap).getPropertyValue('--s') || 1;
  const wr = wrap.getBoundingClientRect();
  const ox = r.left + r.width / 2 - wr.left, oy = r.top + r.height / 2 - wr.top;
  wrap.animate([
    { transform: `translateX(-50%) scale(${s})`, transformOrigin: '50% 100%' },
    { transform: `translateX(-50%) scale(${s})`, transformOrigin: '50% 100%', offset: 0.001 },
  ], { duration: 1 });
  wrap.style.transformOrigin = `${ox / s}px ${oy / s}px`;
  wrap.animate([{ transform: `translateX(-50%) scale(${s})` }, { transform: `translateX(-50%) scale(${s * 2.4})` }], { duration: 700, easing: SWING, fill: 'forwards' });
  veil.animate([from, { ...from, opacity: 0.85, offset: 0.25 }, to], { duration: 700, easing: SWING, fill: 'forwards' }).onfinish = () => {
    wrap.getAnimations().forEach(a => a.cancel());
    wrap.style.transformOrigin = '';
    go(room.id);
    requestAnimationFrame(() => veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, fill: 'forwards' }).onfinish = () => veil.remove());
  };
}

// ============================================================ ROOMS
function showRoom(room) {
  closeInspect(true);
  S.scene = 'room'; S.room = room; S.sort = 'shelf'; S.fmt = null; S.q = '';
  $('#street').hidden = true;
  const sec = $('#room');
  sec.hidden = false;
  sec.className = `scene scene-room theme-${room.kind}`;
  document.title = `${room.name} · ${S.house.name}`;

  const stats = roomStats(room);
  const chips = stats.length > 1
    ? `<button class="chip" type="button" data-fmt="" aria-pressed="true">All</button>` +
      stats.map(s => `<button class="chip" type="button" data-fmt="${s.format}" aria-pressed="false">${esc(s.label)}<b>${s.n}</b></button>`).join('')
    : '';
  const sources = [...new Set(room.items.map(i => i.source).filter(Boolean))];
  const covers = room.items.filter(i => i.cover).length;

  sec.innerHTML = `
    <nav class="room-nav" aria-label="Rooms">
      <a class="nav-mark" href="#house" title="Back to the house">${esc(S.house.name)}</a>
      <div class="nav-rooms">${S.house.rooms.map(r => `<a href="#${r.id}"${r === room ? ' aria-current="page"' : ''}>${esc(r.name.replace(/^The\s+/i, ''))}</a>`).join('')}</div>
      <button class="btn-search js-search" type="button" aria-label="Search the collection">${searchIcon()}<span>Search</span><kbd>/</kbd></button>
    </nav>
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
        <input id="room-q" class="field" type="search" placeholder="Find on these shelves" aria-label="Find on these shelves" autocomplete="off">
      </div>
    </header>
    <div class="wall"><div class="case" id="case"></div></div>
    <div class="floor"></div>
    <footer class="room-foot">
      <span>Click anything to take it off the shelf. Esc puts it back.</span>
      <span>${covers ? `Cover art: ${esc(sources.join(', ') || 'linked')} · ${covers} of ${room.items.length}` : 'Cover art: generated'}</span>
    </footer>`;

  $('.js-search', sec).addEventListener('click', openSearch);
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
  const faceOK = S.sort === 'shelf';
  const rows = []; let row = null;

  for (const o of sortedObjects(room)) {
    const face = faceOK && o.face;
    const w = face ? o.w * scale : Math.max(o.d * scale, (o.fmt.minSpine || 9) * Math.max(fit, 0.8));
    const h = o.h * scale;
    if (!row || (row.items.length && row.w + w + 2 > inner)) { row = { items: [], w: 0, h: 0 }; rows.push(row); }
    const prev = row.items[row.items.length - 1];
    const gap = !prev ? 0 : (face || prev.face) ? 12 : hash(o.key) % 3;
    row.items.push({ o, face, w, h, gap });
    row.w += w + gap;
    row.h = Math.max(row.h, h);
  }

  S.order = [];
  const decorKinds = room.K.decor;
  const html = rows.map((r, ri) => {
    let left = inner - r.w;
    const deco = [];
    const pick = n => DECOR[decorKinds[(hash(room.id + ri) + n) % decorKinds.length]];
    const name = n => decorKinds[(hash(room.id + ri) + n) % decorKinds.length];
    for (let n = 0; n < 2; n++) {
      const d = pick(n);
      if (left > d[1] + 40 && d[2] < r.h + 10) { deco.push(`<span class="decor d-${name(n)}" style="width:${d[1]}px;height:${d[2]}px">${d[0]}</span>`); left -= d[1] + 30; }
      if (left < 120) break;
    }
    // the last spine leans into the gap when there is room for it
    const last = r.items[r.items.length - 1];
    if (last && !last.face && left > 26 && ri === rows.length - 1 ? true : left > 60) {
      if (last && !last.face) last.lean = Math.min(9, (Math.atan((left - 14) / last.h) * 180) / Math.PI).toFixed(1);
    }
    const objs = r.items.map(x => { S.order.push(x.o.key); return objHTML(x); }).join('');
    return `<div class="bay"><div class="row" style="--row-h:${Math.max(r.h + 26, 96).toFixed(0)}px">${objs}${deco.join('')}</div></div><div class="plank"></div>`;
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
  el.className = 'inspect';
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

function cardHTML(o) {
  const it = o.item, K = S.room.K;
  const rows = [];
  const add = (k, v) => { if (v !== undefined && v !== null && v !== '') rows.push([k, v]); };
  add('Year', it.year);
  add('Format', it.fmt.label + (o.vol ? ` · Vol. ${o.vol}` : ''));
  if (it.kind === 'manga') { add('Volumes', volumeLine(it)); add('Publisher', it.publisher); }
  add('Label', it.label);
  if (Array.isArray(it.tracks)) add('Tracks', it.tracks.length);
  add('Runtime', it.runtime && `${it.runtime} min`);
  add('Episodes', it.episodes);
  add('Pages', it.pages);
  add('Country', it.country);
  for (const [k, v] of Object.entries(it.facts || {})) add(k, v);
  add('Status', it.status && it.status[0].toUpperCase() + it.status.slice(1));
  add('Shelfmark', it.cat + (o.vol ? `·${String(o.vol).padStart(2, '0')}` : ''));

  const r = typeof it.rating === 'number' ? it.rating : null;
  const dots = r === null ? '' : `<span class="dots" aria-hidden="true">${[1, 2, 3, 4, 5].map(i => `<i class="${r / 2 >= i ? 'on' : r / 2 >= i - 0.5 ? 'half' : ''}"></i>`).join('')}</span>`;
  const verb = it.status && /ing$/i.test(it.status) ? 'In progress' : K.verb;
  const stamp = r === null ? `<span class="stamp">${esc(verb)}</span>` : `<span class="stamp">${r % 1 ? r.toFixed(1) : r}<small>${esc(verb)} · out of 10</small></span>`;
  const src = it.cover ? (it.source ? `Cover art from ${esc(it.source)}` : 'Cover art linked') : 'Cover art generated until a real one is fetched';

  return `<article class="card">
    <div class="card-top"><span>${esc(S.room.name)}</span><span>${esc(it.cat)}</span></div>
    <h2 class="card-title">${esc(it.title)}${o.vol ? `, Vol. ${o.vol}` : ''}</h2>
    ${it.original && it.original !== it.title ? `<p class="card-orig">${esc(it.original)}</p>` : ''}
    ${it.creator ? `<p class="card-by"><span>${esc(K.by)}</span> ${esc(it.creator)}</p>` : ''}
    <dl class="card-facts">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    <div class="card-rating">${stamp}${dots}</div>
    ${it.note ? `<p class="card-note">${esc(it.note)}</p>` : ''}
    ${it.tags.length ? `<ul class="card-tags">${it.tags.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    <p class="card-src">${src}</p>
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
  el.innerHTML = `<div class="search-box"><label for="search-q">Card catalogue · every room</label>
    <input id="search-q" type="search" placeholder="Title, creator, year, tag" autocomplete="off">
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

// ============================================================ KEYS + RESIZE
function onKey(e) {
  const typing = /input|select|textarea/i.test(document.activeElement?.tagName || '');
  if (e.key === 'Escape') {
    if ($('#search')) return $('#search').remove();
    if (S.insp) return putBack();
    if (S.scene === 'street' && location.hash === '#house') return go('');
  }
  if (e.key === '/' && !typing) { e.preventDefault(); return openSearch(); }
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
