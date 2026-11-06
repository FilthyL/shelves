// The club on this device only: accounts, logs, follows and lists kept in localStorage. It runs the same
// interface as the Supabase backend, so the whole club works before any server is set up (and in tests).
// Nothing syncs and passwords are only stirred, not secured; real accounts need the Supabase backend.
import { checkUsername, checkPassword, cleanLog, cleanList, cleanComment, TYPES, PAGE } from './shared.js';

const KEY = 'fm-club-local';
const blank = () => ({ users: [], session: null, logs: [], watch: [], follows: [], lists: [], items: [], likes: [], comments: [] });
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const byNew = (a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0);

async function stir(password, salt) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function createLocalBackend() {
  const listeners = new Set();
  const load = () => { try { return { ...blank(), ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return blank(); } };
  const save = d => localStorage.setItem(KEY, JSON.stringify(d));
  const pub = u => (u ? { id: u.id, username: u.username, display_name: u.display_name || null, bio: u.bio || null, created_at: u.created_at } : null);
  const brief = (d, id) => { const u = d.users.find(x => x.id === id); return u ? { username: u.username, display_name: u.display_name || null } : { username: '?', display_name: null }; };
  const userByName = (d, name) => d.users.find(u => u.username === String(name).toLowerCase());
  const meRow = d => d.users.find(u => u.id === d.session) || null;
  const need = d => { const u = meRow(d); if (!u) throw new Error('Sign in first.'); return u; };
  const withUser = d => r => ({ ...r, user: brief(d, r.user_id) });
  const page = (rows, { before, limit = PAGE }) => rows.filter(r => !before || r.created_at < before).sort(byNew).slice(0, limit);
  const changed = () => { const m = pub(meRow(load())); listeners.forEach(cb => cb(m)); };

  return {
    mode: 'local',
    async ready() {},
    async me() { return pub(meRow(load())); },
    onAuth(cb) { listeners.add(cb); return () => listeners.delete(cb); },

    async usernameAvailable(name) { return !checkUsername(name) && !userByName(load(), name); },
    async signUp(name, password) {
      name = String(name).trim().toLowerCase();
      const bad = checkUsername(name) || checkPassword(password);
      if (bad) throw new Error(bad);
      const d = load();
      if (userByName(d, name)) throw new Error('That username is taken.');
      const salt = uid();
      const u = { id: uid(), username: name, display_name: null, bio: null, created_at: now(), salt, hash: await stir(password, salt) };
      d.users.push(u); d.session = u.id; save(d); changed();
      return pub(u);
    },
    async signIn(name, password) {
      const d = load(), u = userByName(d, String(name).trim());
      if (!u || u.hash !== await stir(password, u.salt)) throw new Error('That username and password do not match.');
      d.session = u.id; save(d); changed();
      return pub(u);
    },
    async signOut() { const d = load(); d.session = null; save(d); changed(); },

    async profile(name) { return pub(userByName(load(), name)); },
    async saveProfile({ display_name, bio }) {
      const d = load(), u = need(d);
      u.display_name = String(display_name || '').slice(0, 40).trim() || null;
      u.bio = String(bio || '').slice(0, 300).trim() || null;
      save(d); changed();
      return pub(u);
    },
    async profileStats(name) {
      const d = load(), u = userByName(d, name);
      if (!u) return null;
      return {
        logs: d.logs.filter(l => l.user_id === u.id).length, watch: d.watch.filter(w => w.user_id === u.id).length,
        lists: d.lists.filter(l => l.user_id === u.id && (l.is_public || l.user_id === d.session)).length,
        followers: d.follows.filter(f => f.followee_id === u.id).length, following: d.follows.filter(f => f.follower_id === u.id).length,
      };
    },
    async searchUsers(prefix = '') {
      const p = String(prefix).trim().toLowerCase();
      return load().users.filter(u => u.username.startsWith(p)).sort(byNew).slice(0, 12).map(pub);
    },

    async saveLog(input) {
      const d = load(), u = need(d), f = cleanLog(input), t = now();
      const old = input.id && d.logs.find(l => l.id === input.id && l.user_id === u.id);
      if (input.id && !old) throw new Error('That log is not yours to change.');
      if (old) Object.assign(old, f, { updated_at: t });
      else d.logs.push({ id: uid(), user_id: u.id, ...f, created_at: t, updated_at: t });
      save(d);
      return withUser(d)(old || d.logs[d.logs.length - 1]);
    },
    async deleteLog(id) {
      const d = load(), u = need(d);
      d.logs = d.logs.filter(l => !(l.id === id && l.user_id === u.id));
      d.likes = d.likes.filter(l => !(l.target_type === 'log' && l.target_id === id));
      d.comments = d.comments.filter(c => !(c.target_type === 'log' && c.target_id === id));
      save(d);
    },
    async log(id) { const d = load(), l = d.logs.find(x => x.id === id); return l ? withUser(d)(l) : null; },
    async logs({ username, key, before, limit } = {}) {
      const d = load(), u = username && userByName(d, username);
      if (username && !u) return [];
      return page(d.logs.filter(l => (!u || l.user_id === u.id) && (!key || l.subject_key === key)), { before, limit }).map(withUser(d));
    },
    async feed({ everyone, before, limit } = {}) {
      const d = load(), me = meRow(d);
      const ids = new Set(everyone ? d.users.map(u => u.id) : me ? d.follows.filter(f => f.follower_id === me.id).map(f => f.followee_id) : []);
      return page(d.logs.filter(l => ids.has(l.user_id)), { before, limit }).map(withUser(d));
    },

    async watchlist(username) {
      const d = load(), u = userByName(d, username);
      return u ? d.watch.filter(w => w.user_id === u.id).sort(byNew) : [];
    },
    async isWatching(key) { const d = load(), me = meRow(d); return !!me && d.watch.some(w => w.user_id === me.id && w.subject_key === key); },
    async setWatch(subject, on) {
      const d = load(), u = need(d);
      d.watch = d.watch.filter(w => !(w.user_id === u.id && w.subject_key === subject.key));
      if (on) d.watch.push({ id: uid(), user_id: u.id, subject_key: subject.key, kind: subject.kind, title: subject.title, creator: subject.creator || null, year: subject.year || null, cover: subject.cover || null, created_at: now() });
      save(d);
      return !!on;
    },

    async follow(name, on) {
      const d = load(), me = need(d), u = userByName(d, name);
      if (!u || u.id === me.id) throw new Error('You cannot follow that member.');
      d.follows = d.follows.filter(f => !(f.follower_id === me.id && f.followee_id === u.id));
      if (on) d.follows.push({ follower_id: me.id, followee_id: u.id, created_at: now() });
      save(d);
      return !!on;
    },
    async isFollowing(name) { const d = load(), me = meRow(d), u = userByName(d, name); return !!(me && u && d.follows.some(f => f.follower_id === me.id && f.followee_id === u.id)); },
    async following(name) { const d = load(), u = userByName(d, name); return u ? d.follows.filter(f => f.follower_id === u.id).map(f => pub(d.users.find(x => x.id === f.followee_id))) : []; },
    async followers(name) { const d = load(), u = userByName(d, name); return u ? d.follows.filter(f => f.followee_id === u.id).map(f => pub(d.users.find(x => x.id === f.follower_id))) : []; },

    async lists({ username } = {}) {
      const d = load(), me = meRow(d), u = username && userByName(d, username);
      if (username && !u) return [];
      return d.lists.filter(l => (!u || l.user_id === u.id) && (l.is_public || l.user_id === me?.id)).sort(byNew)
        .map(l => ({ ...withUser(d)(l), count: d.items.filter(i => i.list_id === l.id).length, covers: d.items.filter(i => i.list_id === l.id && i.cover).sort((a, b) => a.position - b.position).slice(0, 4).map(i => i.cover) }));
    },
    async list(id) {
      const d = load(), me = meRow(d), l = d.lists.find(x => x.id === id);
      if (!l || !(l.is_public || l.user_id === me?.id)) return null;
      return { ...withUser(d)(l), items: d.items.filter(i => i.list_id === id).sort((a, b) => a.position - b.position) };
    },
    async saveList(input) {
      const d = load(), u = need(d), f = cleanList(input), t = now();
      const old = input.id && d.lists.find(l => l.id === input.id && l.user_id === u.id);
      if (input.id && !old) throw new Error('That list is not yours to change.');
      if (old) Object.assign(old, f);
      else d.lists.push({ id: uid(), user_id: u.id, ...f, created_at: t });
      save(d);
      return old || d.lists[d.lists.length - 1];
    },
    async deleteList(id) {
      const d = load(), u = need(d);
      if (!d.lists.some(l => l.id === id && l.user_id === u.id)) return;
      d.lists = d.lists.filter(l => l.id !== id); d.items = d.items.filter(i => i.list_id !== id);
      d.likes = d.likes.filter(l => !(l.target_type === 'list' && l.target_id === id));
      d.comments = d.comments.filter(c => !(c.target_type === 'list' && c.target_id === id));
      save(d);
    },
    async addToList(listId, s, note) {
      const d = load(), u = need(d);
      if (!d.lists.some(l => l.id === listId && l.user_id === u.id)) throw new Error('That list is not yours to change.');
      const mine = d.items.filter(i => i.list_id === listId);
      if (mine.some(i => i.subject_key === s.key)) throw new Error('It is already on that list.');
      const item = { id: uid(), list_id: listId, position: mine.length ? Math.max(...mine.map(i => i.position)) + 1 : 0, subject_key: s.key, kind: s.kind, title: s.title, creator: s.creator || null, year: s.year || null, cover: s.cover || null, note: String(note || '').slice(0, 300) || null };
      d.items.push(item); save(d);
      return item;
    },
    async removeFromList(itemId) {
      const d = load(), u = need(d), it = d.items.find(i => i.id === itemId);
      if (it && d.lists.some(l => l.id === it.list_id && l.user_id === u.id)) { d.items = d.items.filter(i => i.id !== itemId); save(d); }
    },
    async moveListItem(itemId, dir) {
      const d = load(), u = need(d), it = d.items.find(i => i.id === itemId);
      if (!it || !d.lists.some(l => l.id === it.list_id && l.user_id === u.id)) return;
      const row = d.items.filter(i => i.list_id === it.list_id).sort((a, b) => a.position - b.position);
      const at = row.indexOf(it), to = at + (dir < 0 ? -1 : 1);
      if (to < 0 || to >= row.length) return;
      [row[at].position, row[to].position] = [row[to].position, row[at].position];
      save(d);
    },

    async likes(type, ids) {
      const d = load(), me = meRow(d), out = {};
      for (const id of ids) {
        const rows = d.likes.filter(l => l.target_type === type && l.target_id === id);
        out[id] = { n: rows.length, mine: !!me && rows.some(l => l.user_id === me.id) };
      }
      return out;
    },
    async toggleLike(type, id) {
      if (!TYPES.includes(type)) throw new Error('Nothing to like.');
      const d = load(), u = need(d);
      const had = d.likes.some(l => l.user_id === u.id && l.target_type === type && l.target_id === id);
      d.likes = d.likes.filter(l => !(l.user_id === u.id && l.target_type === type && l.target_id === id));
      if (!had) d.likes.push({ user_id: u.id, target_type: type, target_id: id, created_at: now() });
      save(d);
      return { n: d.likes.filter(l => l.target_type === type && l.target_id === id).length, mine: !had };
    },
    async comments(type, id) {
      const d = load();
      return d.comments.filter(c => c.target_type === type && c.target_id === id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).map(withUser(d));
    },
    async addComment(type, id, body) {
      if (!TYPES.includes(type)) throw new Error('Nothing to comment on.');
      const d = load(), u = need(d);
      const c = { id: uid(), user_id: u.id, target_type: type, target_id: id, body: cleanComment(body), created_at: now() };
      d.comments.push(c); save(d);
      return withUser(d)(c);
    },
    async deleteComment(id) {
      const d = load(), u = need(d);
      d.comments = d.comments.filter(c => !(c.id === id && c.user_id === u.id));
      save(d);
    },

    async stats(keys) {
      const d = load(), out = {};
      for (const k of keys) {
        const rows = d.logs.filter(l => l.subject_key === k), rated = rows.filter(l => l.rating != null);
        out[k] = { logs: rows.length, n: rated.length, avg: rated.length ? rated.reduce((s, l) => s + l.rating, 0) / rated.length : null, liked: rows.filter(l => l.liked).length };
      }
      return out;
    },
  };
}
