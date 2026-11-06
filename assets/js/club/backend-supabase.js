// The club on Supabase: real accounts, with the diary, follows, lists, likes and comments stored in Postgres
// behind row-level security (supabase/schema.sql). The page only ever holds the public anon key; what a
// signed-in member can read or change is decided by the policies, not by this code.
//
// People sign in with a username and password. Supabase wants an email, so each username maps to a
// made-up address on config.emailDomain; "Confirm email" must be off for that (see the README).
import { checkUsername, checkPassword, cleanLog, cleanList, cleanComment, TYPES, PAGE } from './shared.js';

const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
const WHO = 'user:profiles(username, display_name)';

export function createSupabaseBackend(config) {
  let sb = null, meCache = null, booted;
  const domain = config.emailDomain || 'members.filthmanor.example';
  const email = name => `${String(name).trim().toLowerCase()}@${domain}`;
  const ok = ({ data, error }) => { if (error) throw new Error(friendly(error)); return data; };
  const friendly = e => (/duplicate key/i.test(e.message) ? 'It is already there.' : /row-level security/i.test(e.message) ? 'You are not allowed to do that.' : e.message);
  const q = t => sb.from(t);
  const uidOf = () => meCache?.id || null;
  const needMe = () => { if (!meCache) throw new Error('Sign in first.'); return meCache; };
  const profileBy = async (col, v) => ok(await q('profiles').select('*').eq(col, v).maybeSingle());
  const idOf = async name => (await profileBy('username', String(name).toLowerCase()))?.id || null;
  const count = async (t, col, id) => (await q(t).select('*', { count: 'exact', head: true }).eq(col, id)).count || 0;
  const emit = new Set();

  async function boot() {
    const { createClient } = await import(SDK);
    sb = createClient(config.url, config.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await sb.auth.getSession();
    meCache = data.session ? await profileBy('id', data.session.user.id) : null;
    // supabase-js deadlocks if its own calls run inside this callback, so hand the work to the next tick
    sb.auth.onAuthStateChange((_event, session) => setTimeout(async () => {
      meCache = session ? await profileBy('id', session.user.id).catch(() => null) : null;
      emit.forEach(cb => cb(meCache));
    }, 0));
  }

  const pageOf = (query, { before, limit = PAGE }) => (before ? query.lt('created_at', before) : query).order('created_at', { ascending: false }).limit(limit);

  return {
    mode: 'supabase',
    ready() { return (booted ||= boot()); },
    async me() { await this.ready(); return meCache; },
    onAuth(cb) { emit.add(cb); return () => emit.delete(cb); },

    async usernameAvailable(name) { await this.ready(); return ok(await sb.rpc('username_available', { name })) === true; },
    async signUp(name, password) {
      await this.ready();
      name = String(name).trim().toLowerCase();
      const bad = checkUsername(name) || checkPassword(password);
      if (bad) throw new Error(bad);
      if (!(await this.usernameAvailable(name))) throw new Error('That username is taken.');
      const { data, error } = await sb.auth.signUp({ email: email(name), password, options: { data: { username: name } } });
      if (error) throw new Error(error.message);
      if (!data.session) throw new Error('The account was made but cannot sign in yet: turn off "Confirm email" under Authentication in Supabase.');
      meCache = await profileBy('id', data.user.id);
      return meCache;
    },
    async signIn(name, password) {
      await this.ready();
      const { error } = await sb.auth.signInWithPassword({ email: email(name), password });
      if (error) throw new Error('That username and password do not match.');
      return (await this.me());
    },
    async signOut() { await this.ready(); await sb.auth.signOut(); meCache = null; },

    async profile(name) { await this.ready(); return profileBy('username', String(name).toLowerCase()); },
    async saveProfile({ display_name, bio }) {
      await this.ready(); const me = needMe();
      meCache = ok(await q('profiles').update({ display_name: String(display_name || '').slice(0, 40).trim() || null, bio: String(bio || '').slice(0, 300).trim() || null }).eq('id', me.id).select('*').single());
      emit.forEach(cb => cb(meCache));
      return meCache;
    },
    async profileStats(name) {
      await this.ready();
      const id = await idOf(name);
      if (!id) return null;
      const [logs, watch, lists, followers, following] = await Promise.all([
        count('logs', 'user_id', id), count('watchlist', 'user_id', id), count('lists', 'user_id', id), count('follows', 'followee_id', id), count('follows', 'follower_id', id)]);
      return { logs, watch, lists, followers, following };
    },
    async searchUsers(prefix = '') {
      await this.ready();
      const p = String(prefix).trim().toLowerCase().replace(/[^a-z0-9_]/g, '').replace(/_/g, '\\_');
      return ok(await q('profiles').select('*').ilike('username', `${p}%`).order('created_at', { ascending: false }).limit(12));
    },

    async saveLog(input) {
      await this.ready(); needMe();
      const f = cleanLog(input);
      const query = input.id ? q('logs').update(f).eq('id', input.id) : q('logs').insert(f);
      return ok(await query.select(`*, ${WHO}`).single());
    },
    async deleteLog(id) { await this.ready(); needMe(); ok(await q('logs').delete().eq('id', id)); },
    async log(id) { await this.ready(); return ok(await q('logs').select(`*, ${WHO}`).eq('id', id).maybeSingle()); },
    async logs({ username, key, before, limit } = {}) {
      await this.ready();
      let query = q('logs').select(`*, ${WHO}`);
      if (username) { const id = await idOf(username); if (!id) return []; query = query.eq('user_id', id); }
      if (key) query = query.eq('subject_key', key);
      return ok(await pageOf(query, { before, limit }));
    },
    async feed({ everyone, before, limit } = {}) {
      await this.ready();
      let query = q('logs').select(`*, ${WHO}`);
      if (!everyone) {
        if (!meCache) return [];
        const ids = ok(await q('follows').select('followee_id').eq('follower_id', meCache.id)).map(r => r.followee_id);
        if (!ids.length) return [];
        query = query.in('user_id', ids);
      }
      return ok(await pageOf(query, { before, limit }));
    },

    async watchlist(username) {
      await this.ready();
      const id = await idOf(username);
      return id ? ok(await q('watchlist').select('*').eq('user_id', id).order('created_at', { ascending: false })) : [];
    },
    async isWatching(key) {
      await this.ready();
      if (!meCache) return false;
      return !!ok(await q('watchlist').select('id').eq('user_id', meCache.id).eq('subject_key', key).maybeSingle());
    },
    async setWatch(s, on) {
      await this.ready(); const me = needMe();
      if (on) ok(await q('watchlist').upsert({ user_id: me.id, subject_key: s.key, kind: s.kind, title: s.title, creator: s.creator || null, year: s.year || null, cover: s.cover || null }, { onConflict: 'user_id,subject_key' }));
      else ok(await q('watchlist').delete().eq('user_id', me.id).eq('subject_key', s.key));
      return !!on;
    },

    async follow(name, on) {
      await this.ready(); const me = needMe();
      const id = await idOf(name);
      if (!id || id === me.id) throw new Error('You cannot follow that member.');
      if (on) ok(await q('follows').upsert({ follower_id: me.id, followee_id: id }, { onConflict: 'follower_id,followee_id' }));
      else ok(await q('follows').delete().eq('follower_id', me.id).eq('followee_id', id));
      return !!on;
    },
    async isFollowing(name) {
      await this.ready();
      if (!meCache) return false;
      const id = await idOf(name);
      return !!id && !!ok(await q('follows').select('followee_id').eq('follower_id', meCache.id).eq('followee_id', id).maybeSingle());
    },
    async following(name) {
      await this.ready();
      const id = await idOf(name);
      if (!id) return [];
      const ids = ok(await q('follows').select('followee_id').eq('follower_id', id)).map(r => r.followee_id);
      return ids.length ? ok(await q('profiles').select('*').in('id', ids)) : [];
    },
    async followers(name) {
      await this.ready();
      const id = await idOf(name);
      if (!id) return [];
      const ids = ok(await q('follows').select('follower_id').eq('followee_id', id)).map(r => r.follower_id);
      return ids.length ? ok(await q('profiles').select('*').in('id', ids)) : [];
    },

    async lists({ username } = {}) {
      await this.ready();
      let query = q('lists').select(`*, ${WHO}, list_items(count)`).order('created_at', { ascending: false });
      if (username) { const id = await idOf(username); if (!id) return []; query = query.eq('user_id', id); }
      const rows = ok(await query);
      const items = rows.length ? ok(await q('list_items').select('list_id, cover, position').in('list_id', rows.map(r => r.id)).not('cover', 'is', null).order('position')) : [];
      return rows.map(({ list_items, ...l }) => ({ ...l, count: list_items?.[0]?.count || 0, covers: items.filter(i => i.list_id === l.id).slice(0, 4).map(i => i.cover) }));
    },
    async list(id) {
      await this.ready();
      const l = ok(await q('lists').select(`*, ${WHO}`).eq('id', id).maybeSingle());
      return l ? { ...l, items: ok(await q('list_items').select('*').eq('list_id', id).order('position')) } : null;
    },
    async saveList(input) {
      await this.ready(); needMe();
      const f = cleanList(input);
      return ok(await (input.id ? q('lists').update(f).eq('id', input.id) : q('lists').insert(f)).select('*').single());
    },
    async deleteList(id) { await this.ready(); needMe(); ok(await q('lists').delete().eq('id', id)); },
    async addToList(listId, s, note) {
      await this.ready(); needMe();
      const last = ok(await q('list_items').select('position').eq('list_id', listId).order('position', { ascending: false }).limit(1));
      return ok(await q('list_items').insert({ list_id: listId, position: last.length ? last[0].position + 1 : 0, subject_key: s.key, kind: s.kind, title: s.title, creator: s.creator || null, year: s.year || null, cover: s.cover || null, note: String(note || '').slice(0, 300) || null }).select('*').single());
    },
    async removeFromList(itemId) { await this.ready(); needMe(); ok(await q('list_items').delete().eq('id', itemId)); },
    async moveListItem(itemId, dir) {
      await this.ready(); needMe();
      const it = ok(await q('list_items').select('*').eq('id', itemId).maybeSingle());
      if (!it) return;
      const row = ok(await q('list_items').select('id, position').eq('list_id', it.list_id).order('position'));
      const at = row.findIndex(r => r.id === itemId), to = at + (dir < 0 ? -1 : 1);
      if (at < 0 || to < 0 || to >= row.length) return;
      ok(await q('list_items').update({ position: row[to].position }).eq('id', row[at].id));
      ok(await q('list_items').update({ position: row[at].position }).eq('id', row[to].id));
    },

    async likes(type, ids) {
      await this.ready();
      const out = Object.fromEntries(ids.map(id => [id, { n: 0, mine: false }]));
      if (!ids.length) return out;
      for (const r of ok(await q('likes').select('target_id, user_id').eq('target_type', type).in('target_id', ids))) {
        out[r.target_id].n++;
        if (r.user_id === uidOf()) out[r.target_id].mine = true;
      }
      return out;
    },
    async toggleLike(type, id) {
      if (!TYPES.includes(type)) throw new Error('Nothing to like.');
      await this.ready(); const me = needMe();
      const had = !!ok(await q('likes').select('target_id').eq('user_id', me.id).eq('target_type', type).eq('target_id', id).maybeSingle());
      if (had) ok(await q('likes').delete().eq('user_id', me.id).eq('target_type', type).eq('target_id', id));
      else ok(await q('likes').insert({ user_id: me.id, target_type: type, target_id: id }));
      return (await this.likes(type, [id]))[id];
    },
    async comments(type, id) {
      await this.ready();
      return ok(await q('comments').select(`*, ${WHO}`).eq('target_type', type).eq('target_id', id).order('created_at'));
    },
    async addComment(type, id, body) {
      if (!TYPES.includes(type)) throw new Error('Nothing to comment on.');
      await this.ready(); needMe();
      return ok(await q('comments').insert({ target_type: type, target_id: id, body: cleanComment(body) }).select(`*, ${WHO}`).single());
    },
    async deleteComment(id) { await this.ready(); needMe(); ok(await q('comments').delete().eq('id', id)); },

    async stats(keys) {
      await this.ready();
      const out = Object.fromEntries(keys.map(k => [k, { logs: 0, n: 0, avg: null, liked: 0 }]));
      if (!keys.length) return out;
      for (const r of ok(await q('subject_stats').select('*').in('subject_key', keys))) out[r.subject_key] = { logs: r.logs, n: r.n, avg: r.avg, liked: r.liked };
      return out;
    },
  };
}
