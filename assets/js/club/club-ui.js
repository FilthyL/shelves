// The club's way into the rest of the site: whether it is on at all, the account button and menu, the
// page router (#feed, #find, #u/<name>, #log/<id>, #list/<id>), and the members panel under an open item.
import { initClub, club } from './club.js';
import { esc } from '../model.js';
import {
  $, $$, be, state, say, accountButton, openAuth, openLogDialog, openFinder, needAccount, modal,
  stars, avgText, heartSVG, profileLink, fmtDate,
} from './club-kit.js';
import { mountPages, renderPage, refreshPage } from './club-pages.js';

const PATHS = /^(feed|find|u\/|log\/|list\/)/;
let root = null, panel = null;

/** host: { house, toast, section } the site lends the club. Resolves false when the club is off. */
export async function startClub(host) {
  const backend = await initClub();
  if (!backend) return false;
  state.host = host;
  state.me = await backend.me().catch(() => null);
  root = host.section;
  mountPages(root);
  backend.onAuth(u => {
    state.me = u;
    syncButtons();
    if (!root.hidden) refreshPage();
    panel?.draw();
  });
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  return true;
}

export const enabled = () => !!club();
/** the account button's markup for a nav bar or footer ('' while the club is off) */
export const button = () => (enabled() ? accountButton() : '');
export const handles = h => enabled() && PATHS.test(h);
export function show(h) { root.hidden = false; closeMenu(); renderPage(h); }
export function hide() { if (root) root.hidden = true; }

function syncButtons() {
  $$('.js-club').forEach(b => {
    b.dataset.club = state.me ? 'menu' : 'auth';
    b.textContent = state.me ? `@${state.me.username}` : 'Sign in';
  });
}

// ------------------------------------------------------------------ account button and menu
const afterChange = () => { if (!root.hidden) refreshPage(); panel?.draw(); };
function closeMenu() { $('#club-menu')?.remove(); }

function onDocClick(e) {
  const b = e.target.closest('.js-club');
  if (b) { e.preventDefault(); if (b.dataset.club === 'menu') toggleMenu(b); else openAuth({ then: afterChange }); return; }
  if (!e.target.closest('#club-menu')) closeMenu();
}

function toggleMenu(btn) {
  if ($('#club-menu')) return closeMenu();
  const u = encodeURIComponent(state.me.username), r = btn.getBoundingClientRect();
  const m = document.createElement('div');
  m.id = 'club-menu'; m.className = 'club-menu'; m.setAttribute('role', 'menu');
  m.style.right = `${Math.max(8, innerWidth - r.right)}px`;
  m.innerHTML = `<a href="#u/${u}" role="menuitem">Profile</a><a href="#u/${u}/watchlist" role="menuitem">Watchlist</a><a href="#u/${u}/lists" role="menuitem">Lists</a><a href="#feed" role="menuitem">Feed</a>
    <button type="button" role="menuitem" data-m="log">Log something</button><button type="button" role="menuitem" data-m="out">Sign out</button>`;
  m.addEventListener('click', async e => {
    const a = e.target.closest('[data-m]');
    closeMenu();
    if (a?.dataset.m === 'log') openFinder({ title: 'Log something', onPick: s => openLogDialog(s, null, afterChange) });
    if (a?.dataset.m === 'out') { await be().signOut(); say('Signed out.'); }
  });
  document.body.append(m);
  // below the button when there is room (a nav bar), above it when there is not (the street's footer)
  if (innerHeight - r.bottom > m.offsetHeight + 12) m.style.top = `${r.bottom + 6}px`;
  else m.style.bottom = `${innerHeight - r.top + 6}px`;
  $('a', m).focus();
}

// ------------------------------------------------------------------ under an open item in the inspector
/** fill slot with what members say about subject, and the buttons to log it */
export function mountItemPanel(slot, subject) {
  if (!enabled()) return;
  let seq = 0, mine = null;
  panel = { slot, draw };
  slot.addEventListener('click', async e => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    if (b.dataset.p === 'auth') return openAuth({ then: draw });
    if (b.dataset.p === 'log') return openLogDialog(subject, mine, draw);
    if (b.dataset.p === 'watch') {
      try { await be().setWatch(subject, b.getAttribute('aria-pressed') !== 'true'); draw(); } catch (err) { say(err.message); }
    }
    if (b.dataset.p === 'list') needAccount(() => addToListDialog(subject, draw));
  });
  draw();

  async function draw() {
    if (!slot.isConnected) { if (panel?.slot === slot) panel = null; return; }
    const turn = ++seq, u = state.me;
    try {
      const [stats, rows, own, watching] = await Promise.all([
        be().stats([subject.key]), be().logs({ key: subject.key, limit: 5 }),
        u ? be().logs({ username: u.username, key: subject.key, limit: 1 }) : [], u ? be().isWatching(subject.key) : false]);
      if (turn !== seq || !slot.isConnected) return;
      const s = stats[subject.key];
      mine = own[0] || null;
      const buttons = u
        ? `<button type="button" class="btn btn-primary" data-p="log">${mine ? 'Edit your log' : 'Log it'}</button><button type="button" class="btn" data-p="watch" aria-pressed="${watching}">${watching ? 'On your watchlist' : 'Watchlist'}</button><button type="button" class="btn" data-p="list">Add to a list</button>`
        : '<button type="button" class="btn btn-primary" data-p="auth">Sign in to log it</button>';
      const summary = s.n ? `${stars(s.avg, 16)}<b class="cavg">${avgText(s.avg)}</b> from ${s.n} ${s.n === 1 ? 'rating' : 'ratings'}` : s.logs ? 'Logged, not yet rated.' : 'Nobody has logged this yet.';
      const yours = mine ? `<p class="cmeta cyours"><span class="log-label">Your log</span>${stars(mine.rating)}${mine.liked ? heartSVG(true, 12) : ''}<span class="cdate">${esc(fmtDate(mine.logged_on))}</span></p>` : '';
      const recent = rows.map(r => {
        const text = r.review && !r.spoilers ? `<p class="creview">${esc(r.review.length > 160 ? `${r.review.slice(0, 160).trim()}…` : r.review)}</p>` : r.review ? '<p class="creview cspoil">Review contains spoilers.</p>' : '';
        return `<li><p class="cmeta">${profileLink(r.user)}${stars(r.rating, 12)}${r.liked ? heartSVG(true, 12) : ''}</p>${text}<a class="clink" href="#log/${esc(r.id)}">Open</a></li>`;
      }).join('');
      slot.innerHTML = `<section class="cpanel" aria-label="Members">
        <div class="card-bar"><span>Members</span><span>${s.logs ? `${s.logs} ${s.logs === 1 ? 'log' : 'logs'}` : ''}</span></div>
        <div class="cpanel-body"><p class="cmeta">${summary}</p><div class="cacts">${buttons}</div>${yours}${recent ? `<ul class="cpanel-list">${recent}</ul>` : ''}</div></section>`;
    } catch { if (turn === seq && slot.isConnected) slot.innerHTML = ''; }
  }
}

async function addToListDialog(subject, done) {
  const lists = await be().lists({ username: state.me.username }).catch(() => []);
  const rows = lists.map(l => `<li><button type="button" data-id="${esc(l.id)}"><span><b>${esc(l.title)}</b><i>${l.count} ${l.count === 1 ? 'item' : 'items'}${l.is_public ? '' : ' · private'}</i></span></button></li>`).join('');
  const body = lists.length ? `<ul class="cfind">${rows}</ul>` : `<p>You have no lists yet. <a href="#u/${esc(state.me.username)}/lists">Make one from your profile</a>, then come back.</p>`;
  const { el, close } = modal(`<div class="search-box log-box club-form"><div class="log-bar"><span>Add to a list</span><button type="button" class="log-x" aria-label="Close">✕</button></div>
    <div class="log-body">${body}<p class="log-msg" role="status"></p></div></div>`, 'Add to a list');
  $('.cfind', el)?.addEventListener('click', async e => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    try { await be().addToList(b.dataset.id, subject); close(); say(`Added ${subject.title}.`); done?.(); } catch (err) { $('.log-msg', el).textContent = err.message; }
  });
}
