// Rules and shapes shared by both club backends (the local one and Supabase) and the interface.
//
// A subject is anything that can be logged: { key, kind, title, creator, year, cover }. Its key is
// "<kind>:<slug of the title>-<year>", worked out from the title and year alone, so the same film is the
// same subject whether it came from our shelves or from a search, and for every member.
//
// The backend interface (every method async unless noted):
//   mode (string), ready(), me(), onAuth(cb) -> off()
//   usernameAvailable(name), signUp(name, password), signIn(name, password), signOut()
//   profile(name), saveProfile({ display_name, bio }), profileStats(name), searchUsers(prefix)
//   saveLog(entry), deleteLog(id), log(id), logs({ username, key, before, limit }), feed({ everyone, before, limit })
//   watchlist(username), isWatching(key), setWatch(subject, on)
//   follow(name, on), isFollowing(name), following(name), followers(name)
//   lists({ username }), list(id), saveList({ id, title, description, is_public }), deleteList(id)
//   addToList(listId, subject, note), removeFromList(itemId), moveListItem(itemId, dir)
//   likes(type, ids), toggleLike(type, id), comments(type, id), addComment(type, id, body), deleteComment(id)
//   stats(keys)
import { slug, hash } from '../model.js';

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const RESERVED = new Set(['admin', 'root', 'me', 'you', 'filthyl', 'owner', 'system', 'support', 'null', 'undefined']);

/** '' when fine, else what to tell the person */
export function checkUsername(u) {
  if (!u) return 'Choose a username.';
  if (!USERNAME_RE.test(u)) return 'Use 3 to 20 lowercase letters, numbers or underscores.';
  if (RESERVED.has(u)) return 'That name is not available.';
  return '';
}

export const checkPassword = p => (String(p || '').length < 8 ? 'Use at least 8 characters.' : '');

export const KINDS = ['movies', 'anime', 'manga', 'books', 'music', 'games'];
export const TYPES = ['log', 'list'];

export function subjectKey(kind, title, year) {
  const s = slug(title) || `h${hash(String(title)).toString(36)}`;
  return `${kind}:${s}${year ? `-${year}` : ''}`;
}

export function subjectOf({ kind, title, creator, year, cover }) {
  const y = Number.isFinite(+year) && +year > 0 ? Math.trunc(+year) : null;
  return { key: subjectKey(kind, title, y), kind, title: String(title).trim(), creator: creator || null, year: y, cover: cover || null };
}

const clip = (s, n) => String(s ?? '').slice(0, n);
const today = () => new Date().toISOString().slice(0, 10);

/** an entry as typed in the dialog -> the row fields every backend stores */
export function cleanLog(input) {
  const s = input.subject;
  if (!s || !KINDS.includes(s.kind) || !String(s.title || '').trim()) throw new Error('Choose what you are logging.');
  const rating = input.rating == null || input.rating === '' ? null : Math.round(+input.rating);
  if (rating !== null && !(rating >= 1 && rating <= 10)) throw new Error('A rating is half a star to five stars.');
  const on = /^\d{4}-\d{2}-\d{2}$/.test(input.logged_on || '') ? input.logged_on : today();
  return {
    subject_key: s.key, kind: s.kind, title: clip(s.title, 200), creator: s.creator ? clip(s.creator, 200) : null,
    year: s.year || null, cover: s.cover ? clip(s.cover, 600) : null,
    rating, liked: !!input.liked, review: clip(input.review, 5000).trim() || null, spoilers: !!input.spoilers, logged_on: on,
  };
}

export const cleanList = input => {
  const title = clip(input.title, 100).trim();
  if (!title) throw new Error('Give the list a title.');
  return { title, description: clip(input.description, 1000).trim() || null, is_public: input.is_public !== false };
};

export const cleanComment = body => {
  const b = clip(body, 1000).trim();
  if (!b) throw new Error('Write something first.');
  return b;
};

/** "heat-1995" style subject fields carried on a list item or a log */
export const subjectFields = r => ({ key: r.subject_key, kind: r.kind, title: r.title, creator: r.creator, year: r.year, cover: r.cover });

export const PAGE = 24;
