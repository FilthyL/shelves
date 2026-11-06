// The club's pages, drawn into one section of the site: the feed, member search, a member's profile (diary,
// watchlist, lists, following), one review with its comments, and one list.
import { esc } from '../model.js';
import { PAGE } from './shared.js';
import {
  $, be, state, say, modal, fmtDate, profileLink, logRow, likeButton, thumb, subjectLine,
  openLogDialog, openFinder, needAccount, accountButton,
} from './club-kit.js';

let root = null, current = '', token = 0;
const cur = on => (on ? ' aria-current="page"' : '');
const fail = err => { say(err.message || 'That did not work.'); };

export function mountPages(el) {
  root = el;
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('input', onInput);
}

export const refreshPage = () => renderPage(current, true);

function nav(active) {
  const me = state.me;
  return `<nav class="room-nav" aria-label="Members">
    <a class="nav-mark" href="#house" title="Back to the house">${esc(state.host.house.name)}</a>
    <div class="nav-rooms"><a href="#feed"${cur(active === 'feed')}>Feed</a><a href="#find"${cur(active === 'find')}>Members</a>${me ? `<a href="#u/${esc(me.username)}"${cur(active === 'me')}>Profile</a>` : ''}</div>
    ${accountButton()}
  </nav>`;
}

const wrap = (active, inner) => `${nav(active)}<main class="club">${inner}</main>`;
const empty = (title, text) => `<div class="cempty"><h1>${esc(title)}</h1><p>${text}</p></div>`;
const notFound = (what, active = '') => wrap(active, empty('Not found', esc(what)));

export async function renderPage(path, keepScroll = false) {
  current = path;
  const mine = ++token, y = scrollY;
  document.title = `${state.host.house.name} · ${path.startsWith('u/') ? `@${path.split('/')[1]}` : path.split('/')[0] === 'find' ? 'Members' : 'The club'}`;
  const [a, b, c] = path.split('/');
  let html;
  try {
    if (a === 'feed') html = await feedPage(b === 'all');
    else if (a === 'find') html = await findPage();
    else if (a === 'u') html = await profilePage(decodeURIComponent(b || ''), c || 'diary');
    else if (a === 'log') html = await reviewPage(b);
    else if (a === 'list') html = await listPage(b);
    else html = notFound('There is nothing at that address.');
  } catch (err) { html = wrap('', empty('Something went wrong', esc(err.message))); }
  if (mine !== token) return;
  root.innerHTML = html;
  if (keepScroll) scrollTo(0, y); else scrollTo(0, 0);
}

// ------------------------------------------------------------------ feed and members
const more = (kind, rows, extra = '') => (rows.length >= PAGE ? `<button type="button" class="btn cmore" data-act="more" data-kind="${kind}" data-before="${esc(rows[rows.length - 1].created_at)}" ${extra}>Load more</button>` : '');

async function feedPage(everyone) {
  const rows = await be().feed({ everyone, limit: PAGE });
  const likes = await be().likes('log', rows.map(r => r.id));
  const tabs = `<div class="ctabs" role="group" aria-label="Whose logs"><a href="#feed" aria-pressed="${!everyone}">Following</a><a href="#feed/all" aria-pressed="${everyone}">Everyone</a></div>`;
  const body = rows.length
    ? `<ul class="clist">${rows.map(r => logRow(r, { showUser: true, likes })).join('')}</ul>${more(everyone ? 'feed-all' : 'feed', rows)}`
    : empty(everyone ? 'Nothing logged yet' : 'Your feed is empty', everyone ? 'Be the first: open anything in the house and log it.' : state.me ? 'Follow some <a href="#find">members</a> and what they log appears here, or look at <a href="#feed/all">everyone</a>.' : '<button type="button" class="clink" data-act="auth">Sign in</button> to follow members, or look at <a href="#feed/all">everyone</a>.');
  return wrap('feed', `<header class="chead"><h1>Feed</h1></header>${tabs}${body}`);
}

const chips = (users, follows = {}) => (users.length ? `<ul class="cchips">${users.map(u => `<li>${profileLink(u)}${state.me && state.me.id !== u.id ? `<button type="button" class="btn" data-act="follow" data-user="${esc(u.username)}" data-on="${!follows[u.username]}">${follows[u.username] ? 'Following' : 'Follow'}</button>` : ''}</li>`).join('')}</ul>` : '');

async function followMap(users) {
  const out = {};
  if (state.me) await Promise.all(users.filter(u => u.id !== state.me.id).map(async u => { out[u.username] = await be().isFollowing(u.username); }));
  return out;
}

async function findPage() {
  const users = await be().searchUsers('');
  return wrap('find', `<header class="chead"><h1>Members</h1></header>
    <label class="log-label" for="c-find">Find a member by username</label>
    <input id="c-find" class="field cfindin" type="search" autocomplete="off" autocapitalize="none" placeholder="Start typing a username">
    <div id="c-found">${users.length ? chips(users, await followMap(users)) : empty('No members yet', 'Create an account and be the first.')}</div>`);
}

let findTimer = 0;
function onInput(e) {
  if (e.target.id !== 'c-find') return;
  clearTimeout(findTimer);
  findTimer = setTimeout(async () => {
    try {
      const users = await be().searchUsers(e.target.value);
      const out = $('#c-found', root);
      if (out && $('#c-find', root)?.value === e.target.value) out.innerHTML = users.length ? chips(users, await followMap(users)) : '<p class="cnone">Nobody by that name.</p>';
    } catch (err) { fail(err); }
  }, 220);
}

// ------------------------------------------------------------------ a member
async function profilePage(name, tab) {
  const p = await be().profile(name);
  if (!p) return notFound(`There is no member called @${name}.`);
  const me = state.me, mine = me?.id === p.id;
  const [stats, following] = await Promise.all([be().profileStats(p.username), me && !mine ? be().isFollowing(p.username) : false]);
  const tabs = [['diary', 'Diary', stats.logs], ['watchlist', 'Watchlist', stats.watch], ['lists', 'Lists', stats.lists], ['following', 'Following', stats.following], ['followers', 'Followers', stats.followers]];
  const head = `<header class="chead cprofile">
      <div><h1>${esc(p.display_name || p.username)}</h1>${p.display_name ? `<p class="cuname">@${esc(p.username)}</p>` : ''}${p.bio ? `<p class="cbio">${esc(p.bio)}</p>` : ''}</div>
      <div class="cacts">${mine ? '<button type="button" class="btn" data-act="edit-profile">Edit profile</button>' : me ? `<button type="button" class="btn${following ? '' : ' btn-primary'}" data-act="follow" data-user="${esc(p.username)}" data-on="${!following}">${following ? 'Following' : 'Follow'}</button>` : '<button type="button" class="btn btn-primary" data-act="auth">Sign in to follow</button>'}</div>
    </header>
    <nav class="ctabs ctabs-line" aria-label="${esc(p.username)}'s pages">${tabs.map(([k, label, n]) => `<a href="#u/${esc(p.username)}${k === 'diary' ? '' : `/${k}`}" aria-pressed="${tab === k}">${label} <b>${n}</b></a>`).join('')}</nav>`;
  let body = '';
  if (tab === 'diary') {
    const rows = await be().logs({ username: p.username, limit: PAGE });
    const likes = await be().likes('log', rows.map(r => r.id));
    body = rows.length ? `<ul class="clist">${rows.map(r => logRow(r, { likes })).join('')}</ul>${more('diary', rows, `data-user="${esc(p.username)}"`)}` : empty(mine ? 'Your diary is empty' : 'Nothing logged yet', mine ? 'Open anything in the house and choose Log it, or use the account menu to log something that is not on the shelves.' : '');
  } else if (tab === 'watchlist') {
    const rows = await be().watchlist(p.username);
    body = rows.length ? `<ul class="cgrid">${rows.map(r => { const s = { key: r.subject_key, kind: r.kind, title: r.title, creator: r.creator, year: r.year, cover: r.cover }; return `<li>${thumb(s)}<div>${subjectLine(s)}<span class="cmeta">${esc(r.creator || '')}</span>${mine ? `<button type="button" class="clink" data-act="unwatch" data-i="${esc(r.subject_key)}">Remove</button>` : ''}</div></li>`; }).join('')}</ul>` : empty('Nothing on the watchlist', mine ? 'Open anything in the house and choose Watchlist to keep it for later.' : '');
  } else if (tab === 'lists') {
    const rows = await be().lists({ username: p.username });
    body = `${mine ? '<p><button type="button" class="btn btn-primary" data-act="list-new">New list</button></p>' : ''}${rows.length ? `<ul class="clists">${rows.map(l => `<li><a href="#list/${esc(l.id)}"><span class="ccollage">${(l.covers || []).map(c => thumb({ cover: c, kind: 'movies', title: '' })).join('') || '<span class="cph"></span>'}</span><b>${esc(l.title)}</b><i>${l.count} ${l.count === 1 ? 'item' : 'items'}${l.is_public ? '' : ' · private'}</i></a></li>`).join('')}</ul>` : empty('No lists yet', mine ? 'Make one for anything: favourites, a marathon, what to read next.' : '')}`;
  } else if (tab === 'following' || tab === 'followers') {
    const users = await (tab === 'following' ? be().following(p.username) : be().followers(p.username));
    body = users.length ? chips(users, await followMap(users)) : empty(tab === 'following' ? 'Not following anyone yet' : 'No followers yet', '');
  } else body = empty('Not found', 'There is no such page.');
  return wrap(mine ? 'me' : '', `${head}<div class="cbodybox">${body}</div>`);
}

// ------------------------------------------------------------------ one review
const commentsBlock = (type, id, comments) => `<section class="ccomments" aria-label="Comments"><h2>${comments.length} ${comments.length === 1 ? 'comment' : 'comments'}</h2>
  <ul>${comments.map(c => `<li><p class="cmeta">${profileLink(c.user)}<span class="cdate">${esc(fmtDate(c.created_at))}</span>${state.me?.id === c.user_id ? `<button type="button" class="clink" data-act="comment-del" data-id="${esc(c.id)}">Delete</button>` : ''}</p><p>${esc(c.body)}</p></li>`).join('')}</ul>
  ${state.me ? `<form class="ccomment" data-act="comment" data-type="${type}" data-id="${esc(id)}"><label class="log-label" for="c-body">Add a comment</label><textarea id="c-body" class="field" rows="3" maxlength="1000"></textarea><button class="btn btn-primary" type="submit">Post</button></form>` : '<p><button type="button" class="clink" data-act="auth">Sign in</button> to comment.</p>'}</section>`;

async function reviewPage(id) {
  const l = await be().log(id);
  if (!l) return notFound('That log is not there any more.');
  const [likes, comments] = await Promise.all([be().likes('log', [id]), be().comments('log', id)]);
  return wrap('', `<header class="chead"><h1>${esc(l.title)}</h1><p class="cuname">Logged by ${profileLink(l.user)}</p></header>
    <ul class="clist">${logRow(l, { likes, full: true })}</ul>${commentsBlock('log', id, comments)}`);
}

// ------------------------------------------------------------------ one list
async function listPage(id) {
  const l = await be().list(id);
  if (!l) return notFound('That list is private or has been deleted.');
  const mine = state.me?.id === l.user_id;
  const [likes, comments] = await Promise.all([be().likes('list', [id]), be().comments('list', id)]);
  const items = l.items.map((i, n) => {
    const s = { key: i.subject_key, kind: i.kind, title: i.title, creator: i.creator, year: i.year, cover: i.cover };
    return `<li class="crow">${`<span class="cnum">${n + 1}</span>`}${thumb(s)}<div class="cbody"><h3>${subjectLine(s)}</h3><p class="cmeta">${esc(i.creator || '')}</p>${i.note ? `<p class="creview">${esc(i.note)}</p>` : ''}
      ${mine ? `<p class="cacts"><button type="button" class="clink" data-act="item-up" data-id="${esc(i.id)}"${n === 0 ? ' disabled' : ''}>Move up</button><button type="button" class="clink" data-act="item-down" data-id="${esc(i.id)}"${n === l.items.length - 1 ? ' disabled' : ''}>Move down</button><button type="button" class="clink" data-act="item-rm" data-id="${esc(i.id)}">Remove</button></p>` : ''}</div></li>`;
  }).join('');
  return wrap('', `<header class="chead cprofile"><div><h1>${esc(l.title)}</h1><p class="cuname">A list by ${profileLink(l.user)}${l.is_public ? '' : ' · private'}</p>${l.description ? `<p class="cbio">${esc(l.description)}</p>` : ''}</div>
      <div class="cacts">${likeButton('list', id, likes[id])}${mine ? `<button type="button" class="btn btn-primary" data-act="list-add" data-id="${esc(id)}">Add something</button><button type="button" class="btn" data-act="list-edit" data-id="${esc(id)}">Edit</button>` : ''}</div></header>
    ${l.items.length ? `<ol class="clist clist-num">${items}</ol>` : empty('Nothing on this list yet', mine ? 'Choose Add something.' : '')}
    ${commentsBlock('list', id, comments)}`);
}

// ------------------------------------------------------------------ actions
function listDialog(list) {
  const { el, close } = modal(`<form class="search-box log-box club-form" novalidate>
    <div class="log-bar"><span>${list ? 'Edit list' : 'New list'}</span><button type="button" class="log-x" aria-label="Close">✕</button></div>
    <div class="log-body">
      <div><label class="log-label" for="c-lt">Title</label><input id="c-lt" class="field" type="text" maxlength="100"></div>
      <div><label class="log-label" for="c-ld">Description</label><textarea id="c-ld" class="field" rows="3" maxlength="1000" placeholder="Optional"></textarea></div>
      <label class="log-check"><input id="c-lp" type="checkbox"> Anyone can see this list</label>
      <div class="log-actions">${list ? '<button type="button" class="log-forget club-del">Delete list</button>' : ''}<span class="log-msg" role="status"></span><button class="btn btn-primary" type="submit">Save</button></div>
    </div></form>`, 'List');
  $('#c-lt', el).value = list?.title || ''; $('#c-ld', el).value = list?.description || ''; $('#c-lp', el).checked = list ? list.is_public : true;
  const msg = $('.log-msg', el);
  $('.club-del', el)?.addEventListener('click', async () => {
    if (!confirm('Delete this list and its comments?')) return;
    try { await be().deleteList(list.id); close(); location.hash = `#u/${state.me.username}/lists`; } catch (err) { msg.textContent = err.message; }
  });
  $('form', el).addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const saved = await be().saveList({ id: list?.id, title: $('#c-lt', el).value, description: $('#c-ld', el).value, is_public: $('#c-lp', el).checked });
      close();
      if (list) refreshPage(); else location.hash = `#list/${saved.id}`;
    } catch (err) { msg.textContent = err.message; }
  });
  $('#c-lt', el).focus();
}

const actions = {
  auth: () => needAccount(refreshPage),
  async follow(b) { try { await be().follow(b.dataset.user, b.dataset.on === 'true'); refreshPage(); } catch (e) { fail(e); } },
  async like(b) {
    needAccount(async () => {
      try { const info = await be().toggleLike(b.dataset.type, b.dataset.id); b.outerHTML = likeButton(b.dataset.type, b.dataset.id, info); } catch (e) { fail(e); }
    });
  },
  reveal(b) { const span = b.nextElementSibling; b.replaceWith(Object.assign(document.createElement('span'), { textContent: span.textContent })); span.remove(); },
  async 'edit-log'(b) { try { const l = await be().log(b.dataset.id); if (l) openLogDialog({ key: l.subject_key, kind: l.kind, title: l.title, creator: l.creator, year: l.year, cover: l.cover }, l, refreshPage); } catch (e) { fail(e); } },
  async unwatch(b) { try { await be().setWatch({ key: b.dataset.i }, false); refreshPage(); } catch (e) { fail(e); } },
  'list-new': () => listDialog(null),
  async 'list-edit'(b) { try { const l = await be().list(b.dataset.id); if (l) listDialog(l); } catch (e) { fail(e); } },
  'list-add': b => openFinder({ title: 'Add to this list', onPick: async s => { try { await be().addToList(b.dataset.id, s); refreshPage(); } catch (e) { fail(e); } } }),
  async 'item-up'(b) { try { await be().moveListItem(b.dataset.id, -1); refreshPage(); } catch (e) { fail(e); } },
  async 'item-down'(b) { try { await be().moveListItem(b.dataset.id, 1); refreshPage(); } catch (e) { fail(e); } },
  async 'item-rm'(b) { try { await be().removeFromList(b.dataset.id); refreshPage(); } catch (e) { fail(e); } },
  async 'comment-del'(b) { try { await be().deleteComment(b.dataset.id); refreshPage(); } catch (e) { fail(e); } },
  'edit-profile'() {
    const me = state.me, head = $('.cprofile > div', root);
    head.innerHTML = `<form class="cedit" data-act="save-profile"><label class="log-label" for="c-dn">Display name</label><input id="c-dn" class="field" maxlength="40" value="${esc(me.display_name || '')}" placeholder="${esc(me.username)}">
      <label class="log-label" for="c-bio">About you</label><textarea id="c-bio" class="field" rows="3" maxlength="300">${esc(me.bio || '')}</textarea>
      <p><button class="btn btn-primary" type="submit">Save</button> <button type="button" class="btn" data-act="cancel-edit">Cancel</button></p></form>`;
    $('#c-dn', root).focus();
  },
  'cancel-edit': () => refreshPage(),
  async more(b) {
    const kind = b.dataset.kind, before = b.dataset.before;
    try {
      const rows = kind === 'diary' ? await be().logs({ username: b.dataset.user, before, limit: PAGE }) : await be().feed({ everyone: kind === 'feed-all', before, limit: PAGE });
      const likes = await be().likes('log', rows.map(r => r.id));
      $('.clist', root).insertAdjacentHTML('beforeend', rows.map(r => logRow(r, { showUser: kind !== 'diary', likes })).join(''));
      if (rows.length >= PAGE) b.dataset.before = rows[rows.length - 1].created_at; else b.remove();
    } catch (e) { fail(e); }
  },
};

function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b || b.tagName === 'FORM' || b.disabled) return;
  const fn = actions[b.dataset.act];
  if (fn) { e.preventDefault(); fn(b); }
}

async function onSubmit(e) {
  const f = e.target.closest('form[data-act]');
  if (!f) return;
  e.preventDefault();
  try {
    if (f.dataset.act === 'comment') {
      await be().addComment(f.dataset.type, f.dataset.id, $('textarea', f).value);
      refreshPage();
    } else if (f.dataset.act === 'save-profile') {
      await be().saveProfile({ display_name: $('#c-dn', f).value, bio: $('#c-bio', f).value });
      say('Profile saved.');
      refreshPage();
    }
  } catch (err) { fail(err); }
}
