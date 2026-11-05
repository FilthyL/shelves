// Logging new entries from the site. The page commits them straight into the repo through
// GitHub's API, which redeploys the site; until that lands, the entry is kept on this device.
import { esc, slug, FORMATS, KINDS } from './model.js';

const TOKEN_KEY = 'fm-github-token';
const PENDING_KEY = 'fm-pending';
const API = 'https://api.github.com';
const FORMATS_FOR = {
  movies: ['bluray', '4k', 'dvd', 'vhs'],
  music: ['vinyl', 'cd', 'cassette'],
  books: ['paperback', 'hardcover'],
  anime: ['bluray', 'boxset', 'dvd', '4k'],
  manga: ['tankobon', 'kanzenban', 'deluxe'],
};
const $ = (s, r = document) => r.querySelector(s);

// ------------------------------------------------------------------ storage (this device only)
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function write(key, value) { try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ } }
export const getToken = () => read(TOKEN_KEY, '') || '';
export const canLog = () => !!getToken();

export function repoOf(house) {
  if (house.repo) return { repo: house.repo, branch: house.branch || 'main' };
  const host = location.hostname.match(/^([^.]+)\.github\.io$/);
  const seg = location.pathname.split('/').filter(Boolean)[0];
  return host && seg ? { repo: `${host[1]}/${seg}`, branch: 'main' } : null;
}

/** Entries logged here that the deployed data does not include yet go back on their shelves. */
export function applyPending(house, putEntry) {
  const target = repoOf(house)?.repo;
  const keep = [];
  for (const p of read(PENDING_KEY, [])) {
    const room = house.byId[p.room];
    if (!room || p.repo !== target || Date.now() - p.at > 2 * 864e5) continue;
    const landed = room.raw.some(it => slug(it.title) === slug(p.entry.title) && (it.year ?? null) === (p.entry.year ?? null));
    if (landed) continue;
    putEntry(house, p.room, p.entry, p.where);
    keep.push(p);
  }
  write(PENDING_KEY, keep);
}

// ------------------------------------------------------------------ GitHub
async function gh(path, token, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: `Bearer ${token}`,
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (r.ok) return r.json();
  let msg = '';
  try { msg = (await r.json()).message || ''; } catch { /* no body */ }
  const err = new Error(
    r.status === 401 ? 'GitHub did not accept that token. Check it was copied in full and has not expired.'
    : r.status === 403 || r.status === 404 ? 'That token cannot write to this repo. Give it access to the repo with Contents set to Read and write.'
    : `GitHub answered ${r.status}${msg ? `: ${msg}` : ''}.`);
  err.status = r.status;
  throw err;
}

const b64e = s => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64d = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), c => c.charCodeAt(0)));

/** Same layout as the hand-written files: one entry per line. */
export function serialize(data) {
  const keys = Object.keys(data);
  if (keys.length !== 1 || keys[0] !== 'items') return JSON.stringify(data, null, 2) + '\n';
  const line = it => '    { ' + Object.entries(it).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ') + ' }';
  return '{\n  "items": [\n' + data.items.map(line).join(',\n') + '\n  ]\n}\n';
}

async function commitEntry({ repo, branch }, token, file, entry, where) {
  const path = `/repos/${repo}/contents/data/${file}`;
  for (let attempt = 0; ; attempt++) {
    const cur = await gh(`${path}?ref=${encodeURIComponent(branch)}`, token);
    const data = JSON.parse(b64d(cur.content));
    const items = Array.isArray(data) ? data : (data.items ||= []);
    if (where === 'end') items.push(entry); else items.unshift(entry);
    const body = { message: `Log ${entry.title}`, branch, sha: cur.sha, content: b64e(serialize(Array.isArray(data) ? { items } : data)) };
    try { return await gh(path, token, { method: 'PUT', body: JSON.stringify(body) }); } catch (e) {
      if (e.status !== 409 || attempt) throw e; // someone else changed the file; read it again once
    }
  }
}

// ------------------------------------------------------------------ suggestions from free databases
const ANILIST_Q = `query($q:String,$t:MediaType){Page(perPage:6){media(search:$q,type:$t,sort:SEARCH_MATCH){
  title{english romaji native} startDate{year} episodes volumes format coverImage{large extraLarge}
  studios(isMain:true){nodes{name}} staff(perPage:2){nodes{name{full}}}}}}`;

const SUGGEST = {
  anime: q => anilist(q, 'ANIME'),
  manga: q => anilist(q, 'MANGA'),
  async books(q) {
    const r = await fetch(`https://openlibrary.org/search.json?${new URLSearchParams({ q, limit: 6, fields: 'title,author_name,first_publish_year,cover_i,number_of_pages_median,isbn' })}`);
    return ((await r.json()).docs || []).map(d => ({
      title: d.title, creator: d.author_name?.[0], year: d.first_publish_year, pages: d.number_of_pages_median,
      isbn: (d.isbn || []).find(x => x.length === 13),
      thumb: d.cover_i && `https://covers.openlibrary.org/b/id/${d.cover_i}-S.jpg`,
      cover: d.cover_i && `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`,
      sub: [d.author_name?.[0], d.first_publish_year].filter(Boolean).join(' · '),
    }));
  },
  async music(q) {
    const r = await fetch(`https://musicbrainz.org/ws/2/release-group/?${new URLSearchParams({ query: q, fmt: 'json', limit: 6 })}`, { headers: { Accept: 'application/json' } });
    return ((await r.json())['release-groups'] || []).map(g => {
      const artist = (g['artist-credit'] || []).map(c => c.name + (c.joinphrase || '')).join('');
      const year = parseInt(g['first-release-date'], 10) || undefined;
      return { title: g.title, creator: artist, year,
        thumb: `https://coverartarchive.org/release-group/${g.id}/front-250`, cover: `https://coverartarchive.org/release-group/${g.id}/front-500`,
        sub: [artist, g['primary-type'], year].filter(Boolean).join(' · ') };
    });
  },
  async movies(q) {
    const s = q.toLowerCase().trim();
    const r = await fetch(`https://v3.sg.media-imdb.com/suggestion/${encodeURIComponent(s[0] || 'x')}/${encodeURIComponent(s)}.json`);
    const size = (url, w) => url?.replace(/\._V1_.*\.jpg$/, `._V1_SX${w}.jpg`);
    return ((await r.json()).d || []).filter(x => ['movie', 'tvMovie', 'video'].includes(x.qid) || x.q === 'feature').map(x => ({
      title: x.l, year: x.y, thumb: size(x.i?.imageUrl, 120), cover: size(x.i?.imageUrl, 800), sub: [x.y, x.s].filter(Boolean).join(' · '),
    }));
  },
};

async function anilist(q, type) {
  const r = await fetch('https://graphql.anilist.co', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: ANILIST_Q, variables: { q, t: type } }),
  });
  return ((await r.json())?.data?.Page?.media || []).map(m => ({
    title: m.title?.english || m.title?.romaji, original: m.title?.native, year: m.startDate?.year,
    creator: type === 'ANIME' ? m.studios?.nodes?.[0]?.name : m.staff?.nodes?.[0]?.name?.full,
    episodes: type === 'ANIME' ? m.episodes : undefined, total: type === 'MANGA' ? m.volumes : undefined,
    thumb: m.coverImage?.large, cover: m.coverImage?.extraLarge || m.coverImage?.large,
    sub: [m.format && m.format.replace('_', ' ').toLowerCase(), m.startDate?.year].filter(Boolean).join(' · '),
  }));
}

// ------------------------------------------------------------------ dialog
const EXTRA = {
  manga: [['owned', 'Volumes owned', 'text', '1-12'], ['total', 'Total volumes', 'number', ''], ['original', 'Original title', 'text', '']],
  anime: [['episodes', 'Episodes', 'number', ''], ['original', 'Original title', 'text', '']],
  books: [['pages', 'Pages', 'number', ''], ['isbn', 'ISBN', 'text', 'Pins the exact edition']],
  movies: [['runtime', 'Runtime (min)', 'number', '']],
  music: [],
};

export function openLog({ house, roomId, onLogged }) {
  document.getElementById('log')?.remove();
  const target = repoOf(house);
  const el = document.createElement('div');
  el.id = 'log';
  el.className = 'search log';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Log an entry');
  document.body.append(el);
  const close = () => el.remove();
  el.addEventListener('click', e => { if (e.target === el) close(); });
  el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  if (!target) {
    el.innerHTML = `<div class="search-box log-box"><div class="log-bar">Log an entry</div><div class="log-body">
      <p>Logging works on the published site. Add <code>"repo": "owner/name"</code> to data/house.json to log from anywhere else.</p></div></div>`;
    return;
  }
  if (!getToken()) connectView(); else formView();

  function connectView() {
    const name = target.repo.split('/')[1];
    el.innerHTML = `<form class="search-box log-box" novalidate>
      <div class="log-bar"><span>Connect GitHub to log</span><button type="button" class="log-x" aria-label="Close">✕</button></div>
      <div class="log-body">
        <p>Logging writes new entries straight into <b>${esc(target.repo)}</b>. This browser needs a token that can do that. It is kept on this device only.</p>
        <ol class="log-steps">
          <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">a new fine-grained token</a> on GitHub.</li>
          <li>Under Repository access, choose Only select repositories and pick <b>${esc(name)}</b>.</li>
          <li>Under Permissions, set Contents to Read and write.</li>
          <li>Generate it and paste it below.</li>
        </ol>
        <label class="log-label" for="log-token">Token</label>
        <input id="log-token" class="field" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…">
        <div class="log-actions"><span class="log-msg" role="status"></span><button class="btn btn-primary" type="submit">Connect</button></div>
      </div></form>`;
    $('.log-x', el).addEventListener('click', close);
    const form = $('form', el), msg = $('.log-msg', el);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const token = $('#log-token', el).value.trim();
      if (!token) { msg.textContent = 'Paste the token first.'; return; }
      msg.textContent = 'Checking with GitHub…';
      try {
        const repo = await gh(`/repos/${target.repo}`, token);
        if (repo.permissions && !repo.permissions.push) throw new Error('That GitHub account cannot write to this repo.');
        write(TOKEN_KEY, token);
        formView();
      } catch (err) { msg.textContent = err.message; }
    });
    $('#log-token', el).focus();
  }

  function formView() {
    const rooms = house.rooms;
    const start = house.byId[roomId] ? roomId : rooms[0].id;
    el.innerHTML = `<form class="search-box log-box" novalidate autocomplete="off">
      <div class="log-bar"><span>Log to the shelves</span><button type="button" class="log-x" aria-label="Close">✕</button></div>
      <div class="log-body">
        <div class="log-grid">
          <div><label class="log-label" for="log-room">Shelf</label>
            <select id="log-room" class="field">${rooms.map(r => `<option value="${r.id}"${r.id === start ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
          <div><label class="log-label" for="log-where">Place it</label>
            <select id="log-where" class="field"><option value="front">At the front</option><option value="end">At the end</option></select></div>
        </div>
        <div class="log-title">
          <label class="log-label" for="log-q">Title</label>
          <input id="log-q" class="field" type="text" placeholder="Start typing a title" aria-autocomplete="list" aria-controls="log-sugg">
          <ul id="log-sugg" class="log-sugg" role="listbox" hidden></ul>
        </div>
        <div class="log-picked" hidden><img alt="" referrerpolicy="no-referrer"><span></span><button type="button" class="log-unpick">Use generated art</button></div>
        <div class="log-grid">
          <div><label class="log-label" for="log-creator">Creator</label><input id="log-creator" class="field" type="text"></div>
          <div><label class="log-label" for="log-year">Year</label><input id="log-year" class="field" type="number" min="0" max="2100" inputmode="numeric"></div>
          <div><label class="log-label" for="log-format">Format</label><select id="log-format" class="field"></select></div>
          <div><label class="log-label" for="log-rating">Rating out of 10</label><input id="log-rating" class="field" type="number" min="0" max="10" step="0.5" inputmode="decimal"></div>
        </div>
        <div class="log-grid log-extra"></div>
        <div><label class="log-label" for="log-note">My take</label><textarea id="log-note" class="field" rows="3"></textarea></div>
        <div><label class="log-label" for="log-tags">Tags, separated by commas</label><input id="log-tags" class="field" type="text"></div>
        <label class="log-check"><input id="log-featured" type="checkbox"> Show it face-out on the shelf</label>
        <div class="log-actions">
          <button type="button" class="log-forget">Disconnect this device</button>
          <span class="log-msg" role="status"></span>
          <button class="btn btn-primary" type="submit">Log it</button>
        </div>
      </div></form>`;

    const form = $('form', el), msg = $('.log-msg', el), list = $('#log-sugg', el), q = $('#log-q', el);
    const picked = $('.log-picked', el);
    let cover = null, seq = 0, timer = 0, hits = [], sel = -1, dupeOk = false;
    $('.log-x', el).addEventListener('click', close);
    $('.log-forget', el).addEventListener('click', () => { write(TOKEN_KEY, null); connectView(); });
    $('.log-unpick', el).addEventListener('click', () => { cover = null; picked.hidden = true; });

    const kind = () => house.byId[$('#log-room', el).value].kind;
    const setShelf = () => {
      const k = kind();
      $('#log-format', el).innerHTML = FORMATS_FOR[k].map(f => `<option value="${f}"${f === KINDS[k].format ? ' selected' : ''}>${esc(FORMATS[f].label)}</option>`).join('');
      $('.log-extra', el).innerHTML = EXTRA[k].map(([id, label, type, ph]) =>
        `<div><label class="log-label" for="log-${id}">${esc(label)}</label><input id="log-${id}" class="field" type="${type}"${ph ? ` placeholder="${esc(ph)}"` : ''}></div>`).join('');
      $('label[for="log-creator"]', el).textContent = KINDS[k].by.replace('Directed by', 'Director');
      list.hidden = true; hits = [];
    };
    $('#log-room', el).addEventListener('change', setShelf);
    setShelf();

    const render = () => {
      list.hidden = !hits.length;
      list.innerHTML = hits.map((h, i) => `<li role="option" aria-selected="${i === sel}" data-i="${i}">
        <span class="log-thumb">${h.thumb ? `<img src="${esc(h.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>
        <span class="log-hit"><b>${esc(h.title)}</b><i>${esc(h.sub || '')}</i></span></li>`).join('');
    };
    const choose = h => {
      if (!h) return;
      q.value = h.title || '';
      const set = (id, v) => { const f = $(`#log-${id}`, el); if (f && v != null && v !== '') f.value = v; };
      set('creator', h.creator); set('year', h.year); set('pages', h.pages); set('isbn', h.isbn);
      set('episodes', h.episodes); set('total', h.total); set('original', h.original && h.original !== h.title ? h.original : null);
      cover = kind() === 'manga' ? null : h.cover || null; // manga volumes get their own covers from MangaDex
      picked.hidden = !h.thumb;
      if (h.thumb) { $('img', picked).src = h.thumb; $('span', picked).textContent = cover ? 'This cover goes on the shelf' : 'Volume covers are found after logging'; }
      hits = []; render();
      $('#log-rating', el).focus();
    };
    q.addEventListener('input', () => {
      clearTimeout(timer); dupeOk = false;
      const text = q.value.trim();
      if (text.length < 2) { hits = []; render(); return; }
      timer = setTimeout(async () => {
        const mine = ++seq;
        try {
          const res = (await SUGGEST[kind()](text)).filter(h => h.title).slice(0, 6);
          if (mine === seq) { hits = res; sel = -1; render(); }
        } catch { if (mine === seq) { hits = []; render(); } }
      }, 320);
    });
    q.addEventListener('keydown', e => {
      if (list.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); sel = Math.max(0, Math.min(hits.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))); render();
      } else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); choose(hits[sel]); }
    });
    list.addEventListener('mousedown', e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); choose(hits[+li.dataset.i]); } });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const v = id => ($(`#log-${id}`, el)?.value || '').trim();
      const roomIdNow = $('#log-room', el).value, room = house.byId[roomIdNow], k = room.kind;
      const title = v('q');
      if (!title) { msg.textContent = 'Give it a title.'; q.focus(); return; }
      const rating = v('rating');
      if (rating && !(+rating >= 0 && +rating <= 10)) { msg.textContent = 'Ratings go from 0 to 10.'; return; }
      const entry = { title };
      const num = x => (x === '' ? undefined : Number(x));
      if (v('original')) entry.original = v('original');
      if (v('creator')) entry.creator = v('creator');
      if (v('year')) entry.year = num(v('year'));
      entry.format = v('format');
      if (k === 'manga') {
        entry.owned = /^\d+$/.test(v('owned')) ? Number(v('owned')) : v('owned') || 1;
        if (v('total')) entry.total = num(v('total'));
      }
      for (const f of ['episodes', 'pages', 'runtime']) if (v(f)) entry[f] = num(v(f));
      if (v('isbn')) entry.isbn = v('isbn');
      if (rating) entry.rating = Number(rating);
      if (v('note')) entry.note = v('note');
      const tags = v('tags').split(',').map(t => t.trim()).filter(Boolean);
      if (tags.length) entry.tags = tags;
      if ($('#log-featured', el).checked) entry.featured = true;
      if (cover) entry.cover = cover;

      const dupe = room.raw.some(it => slug(it.title) === slug(title) && (entry.year == null || it.year === entry.year));
      if (dupe && !dupeOk) { dupeOk = true; msg.textContent = 'That is already on this shelf. Press Log it again to add another copy.'; return; }

      const btn = $('button[type="submit"]', el);
      btn.disabled = true; msg.textContent = 'Logging…';
      try {
        const where = $('#log-where', el).value;
        await commitEntry(target, getToken(), room.file, entry, where);
        const pending = read(PENDING_KEY, []);
        pending.push({ repo: target.repo, room: roomIdNow, entry, where, at: Date.now() });
        write(PENDING_KEY, pending);
        close();
        onLogged(roomIdNow, entry, where);
      } catch (err) {
        msg.textContent = err.message || 'Logging failed. Try again.';
        btn.disabled = false;
        if (err.status === 401) { write(TOKEN_KEY, null); }
      }
    });
    q.focus();
  }
}
