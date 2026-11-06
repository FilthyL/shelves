// What the club's pages and dialogs share: who is signed in, small widgets (stars, hearts, thumbnails, a
// diary row) and the dialogs for signing in, writing a log and finding something to log.
import { club } from './club.js';
import { esc } from '../model.js';
import { coverSrc } from '../img.js';
import { subjectOf, checkUsername, checkPassword, KINDS } from './shared.js';
import { suggest } from '../log.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const be = () => club();

/** me: the signed-in profile or null; host: what the site lends the club; refresh: re-draws whatever is showing */
export const state = { me: null, host: { house: null, toast() {} }, refresh() {} };

export const KIND_LABEL = { movies: 'Film', anime: 'Anime', manga: 'Manga', books: 'Book', music: 'Record', games: 'Game' };
export const fmtDate = d => (d ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00` : d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const profileLink = u => `<a class="cuser" href="#u/${esc(u.username)}">${esc(u.display_name || u.username)}${u.display_name ? `<i>@${esc(u.username)}</i>` : ''}</a>`;
export const say = msg => state.host.toast(msg);
export const accountButton = () => `<button class="btn js-club" type="button" data-club="${state.me ? 'menu' : 'auth'}">${state.me ? `@${esc(state.me.username)}` : 'Sign in'}</button>`;

// ------------------------------------------------------------------ pixel widgets
const STAR = ['...1...', '..111..', '1111111', '.11111.', '..111..', '.11.11.', '.1...1.'];
const HEART = ['.11.11.', '1111111', '1111111', '.11111.', '..111..', '...1...'];
function pixels(rows, color, size) {
  let r = '';
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === '1') r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${typeof color === 'function' ? color(x) : color}"/>`; }));
  return `<svg width="${size}" height="${Math.round(size * rows.length / 7)}" viewBox="0 0 7 ${rows.length}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
}
export const starSVG = (fill, size = 16) => pixels(STAR, x => (fill >= 1 || (fill > 0 && x <= 3) ? '#feae34' : '#3a4466'), size);
export const heartSVG = (on, size = 14) => pixels(HEART, on ? '#e43b44' : '#5a6988', size);

/** n is out of 10 (half stars), so 9 is four and a half stars */
export const stars = (n, size = 14) => (n == null ? '' : `<span class="cstars" role="img" aria-label="${n / 2} out of 5 stars">${[1, 2, 3, 4, 5].map(i => starSVG(n >= 2 * i ? 1 : n >= 2 * i - 1 ? 0.5 : 0, size)).join('')}</span>`);
export const avgText = avg => (avg == null ? '' : (avg / 2).toFixed(1));

export function likeButton(type, id, info = { n: 0, mine: false }) {
  return `<button class="clike" type="button" data-act="like" data-type="${type}" data-id="${esc(id)}" aria-pressed="${info.mine}" aria-label="${info.mine ? 'Unlike' : 'Like'}">${heartSVG(info.mine)}<span>${info.n || ''}</span></button>`;
}

// ------------------------------------------------------------------ shelf links: a subject we own opens in its room
let shelfIndex = null;
function shelves() {
  if (shelfIndex) return shelfIndex;
  shelfIndex = new Map();
  for (const room of state.host.house?.rooms || []) for (const it of room.items || []) {
    const s = subjectOf({ kind: it.kind, title: it.title, creator: it.creator, year: it.year, cover: it.cover });
    shelfIndex.set(s.key, `#${room.id}--${it.kind === 'manga' ? `${it.id}--${it.vols[0]}` : it.id}`);
  }
  return shelfIndex;
}
export const shelfLink = key => shelves().get(key) || null;
export function ownedSubjects(kind, q) {
  const needle = q.trim().toLowerCase(), out = [];
  for (const room of state.host.house?.rooms || []) {
    if (room.kind !== kind) continue;
    for (const it of room.items || []) if (!needle || it.title.toLowerCase().includes(needle) || (it.creator || '').toLowerCase().includes(needle)) out.push(subjectOf({ kind: it.kind, title: it.title, creator: it.creator, year: it.year, cover: it.cover }));
  }
  return out;
}

export function thumb(s) {
  const src = coverSrc(s.cover, 'sm'), direct = s.cover && src !== s.cover ? ` data-direct="${esc(s.cover)}"` : '';
  return `<span class="cthumb k-${esc(s.kind)}"><span class="cph">${esc((s.title || '?')[0])}</span>${s.cover ? `<img class="art-img" src="${esc(src)}"${direct} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</span>`;
}

export function subjectLine(s) {
  const link = shelfLink(s.key);
  const title = `${esc(s.title)}${s.year ? ` <i>${s.year}</i>` : ''}`;
  return `${link ? `<a class="ctitle" href="${link}">${title}</a>` : `<span class="ctitle">${title}</span>`}`;
}

/** one diary entry; showUser adds who wrote it (the feed, a film's page) */
export function logRow(l, { showUser = false, likes, full = false } = {}) {
  const s = { key: l.subject_key, kind: l.kind, title: l.title, creator: l.creator, year: l.year, cover: l.cover };
  const hidden = l.spoilers && !full;
  const review = l.review ? (hidden
    ? `<p class="creview"><button type="button" class="clink" data-act="reveal">Contains spoilers. Show the review</button><span hidden>${esc(l.review)}</span></p>`
    : `<p class="creview">${esc(full ? l.review : l.review.length > 280 ? `${l.review.slice(0, 280).trim()}…` : l.review)}</p>`) : '';
  return `<li class="crow" data-log="${esc(l.id)}">
    ${thumb(s)}
    <div class="cbody">
      <h3>${subjectLine(s)}</h3>
      <p class="cmeta">${showUser ? `${profileLink(l.user)} · ` : ''}${stars(l.rating)}${l.liked ? `<span class="cliked" title="Liked">${heartSVG(true, 12)}</span>` : ''}<span class="cdate">${esc(fmtDate(l.logged_on))}</span></p>
      ${review}
      <p class="cacts">${likeButton('log', l.id, likes?.[l.id])}<a class="clink" href="#log/${esc(l.id)}">${full ? '' : 'Open'}</a>${state.me?.id === l.user_id ? `<button type="button" class="clink" data-act="edit-log" data-id="${esc(l.id)}">Edit</button>` : ''}</p>
    </div></li>`;
}

// ------------------------------------------------------------------ modals
export function modal(html, label) {
  $('#club-modal')?.remove();
  const el = document.createElement('div');
  el.id = 'club-modal'; el.className = 'search log';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', label);
  el.innerHTML = html;
  document.body.append(el);
  const close = () => el.remove();
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('.log-x')) close(); });
  el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  return { el, close };
}

const bar = (title) => `<div class="log-bar"><span>${esc(title)}</span><button type="button" class="log-x" aria-label="Close">✕</button></div>`;

// ------------------------------------------------------------------ sign in / create account
export function openAuth({ mode = 'in', then } = {}) {
  const local = be().mode === 'local';
  const { el, close } = modal(`<form class="search-box log-box club-form" novalidate>
    ${bar('Your account')}
    <div class="log-body">
      <div class="ctabs" role="group" aria-label="Sign in or create an account">
        <button type="button" data-mode="in" aria-pressed="true">Sign in</button><button type="button" data-mode="up" aria-pressed="false">Create account</button>
      </div>
      <label class="log-label" for="c-user">Username</label>
      <input id="c-user" class="field" type="text" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="20" autocomplete="username">
      <label class="log-label" for="c-pass">Password</label>
      <input id="c-pass" class="field" type="password" autocomplete="current-password">
      <p class="club-hint"></p>
      <div class="log-actions"><span class="log-msg" role="status"></span><button class="btn btn-primary" type="submit">Sign in</button></div>
    </div></form>`, 'Your account');
  const form = $('form', el), msg = $('.log-msg', el), user = $('#c-user', el), pass = $('#c-pass', el), submit = $('[type=submit]', el);
  let m = mode;
  const paint = () => {
    $$('.ctabs button', el).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    submit.textContent = m === 'in' ? 'Sign in' : 'Create account';
    pass.autocomplete = m === 'in' ? 'current-password' : 'new-password';
    $('.club-hint', el).textContent = (m === 'up' ? 'Your username is how people find and follow you: 3 to 20 lowercase letters, numbers or underscores. The password needs at least 8 characters. ' : '')
      + (local ? 'Accounts here live in this browser only, until the house is connected to a server.' : '');
    msg.textContent = '';
  };
  $('.ctabs', el).addEventListener('click', e => { const b = e.target.closest('button'); if (b) { m = b.dataset.mode; paint(); } });
  user.addEventListener('input', () => { user.value = user.value.toLowerCase(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = user.value.trim();
    if (m === 'up') { const bad = checkUsername(name) || checkPassword(pass.value); if (bad) { msg.textContent = bad; return; } }
    submit.disabled = true; msg.textContent = m === 'in' ? 'Signing in…' : 'Creating your account…';
    try {
      const u = await (m === 'in' ? be().signIn(name, pass.value) : be().signUp(name, pass.value));
      close();
      say(m === 'in' ? `Signed in as @${u.username}.` : `Welcome, @${u.username}.`);
      then?.(u);
    } catch (err) { msg.textContent = err.message; submit.disabled = false; }
  });
  paint();
  user.focus();
}

/** run fn once someone is signed in: straight away, or after they sign in */
export function needAccount(fn) {
  if (state.me) return fn();
  openAuth({ then: fn });
}

// ------------------------------------------------------------------ the log dialog
export function openLogDialog(subject, existing, done) {
  const { el, close } = modal(`<form class="search-box log-box club-form" novalidate>
    ${bar(existing ? 'Edit your log' : 'Log it')}
    <div class="log-body">
      <div class="club-subject">${thumb(subject)}<div><b>${esc(subject.title)}</b><i>${esc([subject.creator, subject.year].filter(Boolean).join(' · '))}</i></div></div>
      <div class="club-rate-row"><span class="log-label">Rating</span>
        <div class="rate" role="group" aria-label="Rating">${[1, 2, 3, 4, 5].map(i => `<span class="rate-star"><span class="rate-art"></span><button type="button" class="rate-half l" data-v="${2 * i - 1}" aria-label="${i - 0.5} stars"></button><button type="button" class="rate-half r" data-v="${2 * i}" aria-label="${i} stars"></button></span>`).join('')}</div>
        <output class="rate-out"></output><button type="button" class="clink rate-clear">Clear</button>
        <button type="button" class="club-like" aria-pressed="false">${heartSVG(false)}<span>Liked</span></button>
      </div>
      <div class="log-grid">
        <div><label class="log-label" for="c-date">Date</label><input id="c-date" class="field" type="date"></div>
      </div>
      <div><label class="log-label" for="c-review">Review</label><textarea id="c-review" class="field" rows="5" maxlength="5000" placeholder="Optional"></textarea></div>
      <label class="log-check"><input id="c-spoil" type="checkbox"> Contains spoilers</label>
      <div class="log-actions">${existing ? '<button type="button" class="log-forget club-del">Delete this log</button>' : ''}<span class="log-msg" role="status"></span><button class="btn btn-primary" type="submit">${existing ? 'Save' : 'Log it'}</button></div>
    </div></form>`, 'Log it');
  let rating = existing?.rating ?? null, liked = !!existing?.liked;
  const out = $('.rate-out', el), likeB = $('.club-like', el), msg = $('.log-msg', el);
  const paint = () => {
    $$('.rate-star', el).forEach((s, i) => { $('.rate-art', s).innerHTML = starSVG(rating >= 2 * (i + 1) ? 1 : rating >= 2 * i + 1 ? 0.5 : 0, 28); });
    $$('.rate-half', el).forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === rating)));
    out.textContent = rating == null ? '' : `${rating / 2} of 5`;
    likeB.setAttribute('aria-pressed', String(liked));
    likeB.innerHTML = `${heartSVG(liked)}<span>${liked ? 'Liked' : 'Like'}</span>`;
  };
  $('.rate', el).addEventListener('click', e => { const b = e.target.closest('.rate-half'); if (b) { rating = +b.dataset.v === rating ? null : +b.dataset.v; paint(); } });
  $('.rate-clear', el).addEventListener('click', () => { rating = null; paint(); });
  likeB.addEventListener('click', () => { liked = !liked; paint(); });
  $('#c-date', el).value = existing?.logged_on || new Date().toISOString().slice(0, 10);
  $('#c-review', el).value = existing?.review || '';
  $('#c-spoil', el).checked = !!existing?.spoilers;
  paint();
  $('.club-del', el)?.addEventListener('click', async () => {
    if (!confirm('Delete this log, its likes and its comments?')) return;
    try { await be().deleteLog(existing.id); close(); say('Log deleted.'); done?.(null); } catch (err) { msg.textContent = err.message; }
  });
  $('form', el).addEventListener('submit', async e => {
    e.preventDefault();
    msg.textContent = 'Saving…';
    try {
      const saved = await be().saveLog({ id: existing?.id, subject, rating, liked, review: $('#c-review', el).value, spoilers: $('#c-spoil', el).checked, logged_on: $('#c-date', el).value });
      close(); say(existing ? 'Log updated.' : `Logged ${subject.title}.`); done?.(saved);
    } catch (err) { msg.textContent = err.message; }
  });
  $('.rate-half', el).focus();
}

// ------------------------------------------------------------------ find something: our shelves first, then the open web's suggestions
export function openFinder({ title = 'Find something', kind = 'movies', onPick }) {
  const { el, close } = modal(`<div class="search-box log-box club-form">
    ${bar(title)}
    <div class="log-body">
      <div class="log-grid"><div><label class="log-label" for="c-kind">Kind</label><select id="c-kind" class="field">${KINDS.map(k => `<option value="${k}"${k === kind ? ' selected' : ''}>${KIND_LABEL[k]}</option>`).join('')}</select></div>
        <div style="grid-column: span 3"><label class="log-label" for="c-q">Title</label><input id="c-q" class="field" type="search" autocomplete="off" placeholder="Start typing a title"></div></div>
      <ul class="cfind" role="listbox"></ul>
      <p class="log-msg club-find-msg" role="status"></p>
    </div></div>`, title);
  const list = $('.cfind', el), msg = $('.club-find-msg', el), q = $('#c-q', el), k = $('#c-kind', el);
  let seq = 0, timer = 0, hits = [];
  const draw = (note = '') => {
    list.innerHTML = hits.map((h, i) => `<li><button type="button" data-i="${i}">${thumb(h.s)}<span><b>${esc(h.s.title)}</b><i>${esc([h.s.creator, h.s.year].filter(Boolean).join(' · '))}</i></span>${h.own ? '<em>On the shelves</em>' : ''}</button></li>`).join('');
    msg.textContent = note;
  };
  async function search() {
    const text = q.value.trim(), mine = ++seq, kind = k.value;
    hits = ownedSubjects(kind, text).slice(0, 6).map(s => ({ s, own: true }));
    draw(text.length >= 2 ? 'Searching…' : '');
    if (text.length < 2) return;
    try {
      const res = (await suggest(kind, text)).filter(r => r.title).slice(0, 6).map(r => ({ s: subjectOf({ kind, title: r.title, creator: r.creator, year: r.year, cover: r.cover || r.thumb }), own: false }));
      if (mine !== seq) return;
      const seen = new Set(hits.map(h => h.s.key));
      hits = hits.concat(res.filter(h => !seen.has(h.s.key)));
      draw(hits.length ? '' : 'Nothing found. Try another spelling.');
    } catch { if (mine === seq) draw(hits.length ? '' : 'The search could not be reached.'); }
  }
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 280); });
  k.addEventListener('change', search);
  list.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) { const s = hits[+b.dataset.i].s; close(); onPick(s); } });
  search();
  q.focus();
}
