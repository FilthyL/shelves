// Exercises the club's local backend through the whole interface the UI uses (the Supabase backend implements
// the same one). Run: node tools/test_club.mjs   (also run by the Python test suite when Node is installed)
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const { createLocalBackend } = await import('../assets/js/club/backend-local.js');
const { subjectOf, subjectKey, checkUsername, checkPassword, cleanLog } = await import('../assets/js/club/shared.js');

const b = createLocalBackend();
const rejects = (p, re) => assert.rejects(p, re);

// names, passwords, subjects
assert.equal(checkUsername('ada_99'), '');
assert.match(checkUsername('Ad'), /3 to 20/);
assert.match(checkUsername('admin'), /not available/);
assert.match(checkPassword('short'), /8 characters/);
assert.equal(subjectKey('movies', 'Heat', 1995), 'movies:heat-1995');
assert.equal(subjectKey('movies', 'Heat', null), 'movies:heat');
assert.match(subjectKey('manga', 'ベルセルク', 1989), /^manga:h[a-z0-9]+-1989$/);
assert.throws(() => cleanLog({ subject: subjectOf({ kind: 'movies', title: 'Heat' }), rating: 11 }), /half a star/);
assert.throws(() => cleanLog({ subject: { kind: 'nope', title: 'x' } }), /Choose/);

// accounts
assert.equal(await b.me(), null);
await rejects(b.signUp('ab', 'longenough'), /3 to 20/);
await rejects(b.signUp('ada', 'short'), /8 characters/);
const ada = await b.signUp('Ada', 'correct horse');
assert.equal(ada.username, 'ada');
assert.equal((await b.me()).username, 'ada');
assert.equal(await b.usernameAvailable('ada'), false);
assert.equal(await b.usernameAvailable('bob'), true);
await b.signOut();
assert.equal(await b.me(), null);
await rejects(b.signIn('ada', 'wrong password'), /do not match/);
await rejects(b.saveLog({ subject: subjectOf({ kind: 'movies', title: 'Heat' }) }), /Sign in/);
assert.equal((await b.signIn('ada', 'correct horse')).username, 'ada');
await rejects(b.signUp('ada', 'correct horse'), /taken/);
assert.equal((await b.saveProfile({ display_name: 'Ada L.', bio: 'films' })).display_name, 'Ada L.');

// the diary
const heat = subjectOf({ kind: 'movies', title: 'Heat', creator: 'Michael Mann', year: 1995, cover: 'https://x/heat.jpg' });
const l1 = await b.saveLog({ subject: heat, rating: 9, liked: true, review: 'Neil and Vincent.', logged_on: '2026-01-02' });
assert.equal(l1.user.username, 'ada');
assert.equal((await b.saveLog({ id: l1.id, subject: heat, rating: 10, liked: true, review: 'Still great.' })).rating, 10);
assert.equal((await b.logs({ username: 'ada' })).length, 1);
assert.equal((await b.log(l1.id)).review, 'Still great.');
await b.signOut();
const bob = await b.signUp('bob', 'another passphrase');
await rejects(b.saveLog({ id: l1.id, subject: heat, rating: 1 }), /not yours/);
await b.saveLog({ subject: heat, rating: 7 });
const st = (await b.stats([heat.key, 'movies:none']))[heat.key];
assert.deepEqual([st.logs, st.n, st.avg, st.liked], [2, 2, 8.5, 1]);
assert.equal((await b.stats(['movies:none']))['movies:none'].avg, null);
assert.equal((await b.logs({ key: heat.key })).length, 2);

// watchlist
const dune = subjectOf({ kind: 'books', title: 'Dune', creator: 'Frank Herbert', year: 1965 });
assert.equal(await b.isWatching(dune.key), false);
await b.setWatch(dune, true); await b.setWatch(dune, true);
assert.equal((await b.watchlist('bob')).length, 1);
assert.equal(await b.isWatching(dune.key), true);
await b.setWatch(dune, false);
assert.equal((await b.watchlist('bob')).length, 0);

// follows and the feed
assert.deepEqual(await b.feed(), []);
await rejects(b.follow('bob', true), /cannot follow/);
await b.follow('ada', true);
assert.equal(await b.isFollowing('ada'), true);
assert.equal((await b.feed()).length, 1);
assert.equal((await b.feed({ everyone: true })).length, 2);
assert.deepEqual((await b.following('bob')).map(u => u.username), ['ada']);
assert.deepEqual((await b.followers('ada')).map(u => u.username), ['bob']);
assert.deepEqual(await b.profileStats('ada'), { logs: 1, watch: 0, lists: 0, followers: 1, following: 0 });
assert.deepEqual((await b.searchUsers('a')).map(u => u.username), ['ada']);

// likes and comments
assert.deepEqual(await b.toggleLike('log', l1.id), { n: 1, mine: true });
assert.deepEqual((await b.likes('log', [l1.id]))[l1.id], { n: 1, mine: true });
assert.deepEqual(await b.toggleLike('log', l1.id), { n: 0, mine: false });
await b.toggleLike('log', l1.id);
const c = await b.addComment('log', l1.id, '  agreed  ');
assert.equal(c.body, 'agreed');
await rejects(b.addComment('log', l1.id, '   '), /something/);
await rejects(b.addComment('shoe', l1.id, 'x'), /Nothing/);
assert.equal((await b.comments('log', l1.id)).length, 1);

// lists
const list = await b.saveList({ title: 'Heists', description: 'Cool crews', is_public: true });
const a = await b.addToList(list.id, heat, 'the best'), d = await b.addToList(list.id, subjectOf({ kind: 'movies', title: 'Ronin', year: 1998 }));
await rejects(b.addToList(list.id, heat), /already/);
await b.moveListItem(d.id, -1);
assert.deepEqual((await b.list(list.id)).items.map(i => i.title), ['Ronin', 'Heat']);
await b.moveListItem(d.id, -1);
assert.deepEqual((await b.list(list.id)).items.map(i => i.title), ['Ronin', 'Heat']);
await b.removeFromList(a.id);
assert.equal((await b.list(list.id)).items.length, 1);
assert.equal((await b.lists({ username: 'bob' }))[0].count, 1);
await b.toggleLike('list', list.id);
await b.addComment('list', list.id, 'nice');
const priv = await b.saveList({ title: 'Secret', is_public: false });
assert.equal((await b.lists({ username: 'bob' })).length, 2);
await b.signOut();
assert.equal((await b.lists({ username: 'bob' })).length, 1);
assert.equal(await b.list(priv.id), null);
await b.signIn('bob', 'another passphrase');
await b.deleteList(list.id);
assert.equal(await b.list(list.id), null);
assert.equal((await b.comments('list', list.id)).length, 0);

// deleting a log takes its likes and comments with it; only the owner can
await b.signOut(); await b.signIn('bob', 'another passphrase');
await b.deleteLog(l1.id);
assert.equal((await b.logs({ username: 'ada' })).length, 1);
await b.signOut(); await b.signIn('ada', 'correct horse');
await b.deleteLog(l1.id);
assert.equal((await b.logs({ username: 'ada' })).length, 0);
assert.equal((await b.comments('log', l1.id)).length, 0);
assert.equal((await b.likes('log', [l1.id]))[l1.id].n, 0);

// sign-in changes reach listeners
let seen = null;
const off = b.onAuth(u => { seen = u?.username ?? null; });
await b.signOut(); assert.equal(seen, null);
await b.signIn('ada', 'correct horse'); assert.equal(seen, 'ada');
off();
console.log('club backend: all checks passed');
