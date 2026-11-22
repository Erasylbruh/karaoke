// Tests for firestore.rules against the Firestore emulator (needs Java 11+).
// The tooling is not a project dependency; install it in any scratch folder:
//   npm i firebase-tools @firebase/rules-unit-testing@6 firebase@13
// then, from that folder (firebase.json there: {"firestore":{"rules":"firestore.rules"}}, with copies
// of the project's firestore.rules and of this file next to it, so the imports resolve there):
//   RULES=./firestore.rules npx firebase emulators:exec --only firestore --project demo-karaoke "node --test firestore.rules.test.mjs"
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const inc = (n) => firebase.firestore.FieldValue.increment(n);
const del = () => firebase.firestore.FieldValue.delete();
const arrayRemove = (v) => firebase.firestore.FieldValue.arrayRemove(v);
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-karaoke',
    firestore: { rules: readFileSync(process.env.RULES, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const user = (id, role = 'user', extra = {}) => db.doc(`users/${id}`).set({ id, uid: id, username: id, name: id, avatar: '', role, status: 'active', createdAt: 'x', ...extra });
    await user('alice', 'user', { email: 'alice@x.com' });
    await user('bob');
    await user('carol');
    await user('banned', 'user', { status: 'banned_perm' });
    await user('admin', 'admin');
    for (const id of ['alice', 'bob', 'admin']) await db.doc(`usernames/${id}`).set({ uid: id });
    await db.doc('userPrivate/alice').set({ id: 'alice', email: 'alice@x.com', warnings: 1 });
    await db.doc('userPrivate/bob').set({ id: 'bob', email: 'bob@x.com' });
    await db.doc('karaokes/k1').set({ id: 'k1', authorId: 'alice', title: 'Song', artist: 'A', lyrics: [], status: 'active', visibility: 'public', viewsCount: 0, likesCount: 0, recommendationScore: 58, isFeatured: false });
    await db.doc('karaokes/k_unlisted').set({ id: 'k_unlisted', authorId: 'alice', title: 'LinkOnly', artist: 'A', lyrics: [], status: 'active', visibility: 'unlisted', viewsCount: 0, likesCount: 0, recommendationScore: 10, isFeatured: false });
    await db.doc('karaokes/k_priv').set({ id: 'k_priv', authorId: 'alice', title: 'Secret', artist: 'A', lyrics: [], status: 'active', visibility: 'private', viewsCount: 0, likesCount: 0, recommendationScore: 10, isFeatured: false });
    await db.doc('karaokes/k_blocked').set({ id: 'k_blocked', authorId: 'alice', title: 'Blocked', artist: 'A', lyrics: [], status: 'blocked', visibility: 'public', viewsCount: 0, likesCount: 0, recommendationScore: 10, isFeatured: false });
    await db.doc('notifications/n1').set({ id: 'n1', userId: 'alice', actorId: 'bob', type: 'like', text: 'hi', createdAt: 'x', read: false });
    await db.doc('notifications/w1').set({ id: 'w1', userId: 'alice', actorId: 'admin', type: 'warning', text: 'warn', createdAt: 'x', read: false });
    await db.doc('downloads/d1').set({ id: 'd1', userId: 'alice', karaokeId: 'k1', title: 'Song', artist: 'A', format: 'reel', createdAt: 'x' });
    await db.doc('events/alice_listen_2026-11-16').set({ id: 'alice_listen_2026-11-16', authorId: 'alice', type: 'listen', day: '2026-11-16', count: 1 });
    await db.doc('comments/c1').set({ id: 'c1', karaokeId: 'k1', userId: 'bob', userName: 'bob', userAvatar: '', content: 'top', createdAt: 'x' });
    await db.doc('comments/c2').set({ id: 'c2', karaokeId: 'k1', userId: 'carol', userName: 'carol', userAvatar: '', content: 'reply', createdAt: 'x', parentId: 'c1' });
    await db.doc('follows/alice').set({ id: 'alice', followers: ['bob'] });
    await db.doc('likes/bob').set({ id: 'bob', ids: [] });
    await db.doc('playlists/p1').set({ id: 'p1', ownerId: 'bob', name: 'Mine', karaokeIds: [], createdAt: 'x' });
    await db.doc('services/aligner').set({ uid: 'svc' });
  });
});

const guest = () => env.unauthenticatedContext().firestore();
const as = (uid) => env.authenticatedContext(uid, { email: `${uid}@x.com`, email_verified: true }).firestore();
const asUnverified = (uid) => env.authenticatedContext(uid, { email: `${uid}@x.com`, email_verified: false }).firestore();

test('private profile data: owner and admin only', async () => {
  await assertFails(guest().doc('userPrivate/alice').get());
  await assertFails(as('bob').doc('userPrivate/alice').get());
  await assertSucceeds(as('alice').doc('userPrivate/alice').get());
  await assertSucceeds(as('admin').collection('userPrivate').get());
  await assertFails(as('bob').collection('userPrivate').get());
  await assertSucceeds(guest().doc('users/alice').get());
  await assertSucceeds(as('alice').doc('userPrivate/alice').update({ contactEmail: 'contact@x.com' }));
});

test('track visibility: private and blocked hidden from guests; unlisted get-only', async () => {
  await assertSucceeds(guest().collection('karaokes').where('status', '==', 'active').where('visibility', '==', 'public').get());
  await assertFails(guest().collection('karaokes').get());
  await assertSucceeds(guest().doc('karaokes/k_unlisted').get());
  await assertFails(guest().doc('karaokes/k_priv').get());
  await assertFails(as('bob').doc('karaokes/k_priv').get());
  await assertSucceeds(as('alice').doc('karaokes/k_priv').get());
  await assertFails(guest().doc('karaokes/k_blocked').get());
  await assertSucceeds(as('admin').collection('karaokes').get());
});

test('banned users cannot create content or comments', async () => {
  const b = as('banned');
  await assertFails(b.doc('comments/cb').set({ id: 'cb', karaokeId: 'k1', userId: 'banned', userName: 'banned', userAvatar: '', content: 'spam', createdAt: 'x' }));
  await assertFails(b.doc('karaokes/kb').set({ id: 'kb', authorId: 'banned', title: 'S', artist: 'A', lyrics: [], status: 'active', visibility: 'public', viewsCount: 0, likesCount: 0, recommendationScore: 10, isFeatured: false }));
  await assertFails(b.doc('users/banned').update({ name: 'Renamed' }));
});

test('registration: tag reserved first, public profile without email, private email from the token', async () => {
  const dave = as('dave');
  const pub = { id: 'dave', uid: 'dave', username: 'dave', name: 'Dave', avatar: '', bio: '', role: 'user', status: 'active', createdAt: 'x' };
  await assertFails(dave.doc('users/dave').set(pub));
  await assertSucceeds(dave.doc('usernames/dave').set({ uid: 'dave' }));
  await assertFails(dave.doc('usernames/alice').set({ uid: 'dave' }));
  await assertFails(dave.doc('users/dave').set({ ...pub, username: 'alice' }));
  await assertFails(dave.doc('users/dave').set({ ...pub, email: 'dave@x.com' }));
  await assertFails(dave.doc('users/dave').set({ ...pub, role: 'admin' }));
  await assertFails(dave.doc('users/dave').set({ ...pub, termsVersion: '2026-11-21' }));
  await assertSucceeds(dave.doc('users/dave').set(pub));
  await assertFails(dave.doc('userPrivate/dave').set({ id: 'dave', email: 'other@x.com' }));
  await assertFails(dave.doc('userPrivate/dave').set({ id: 'dave', email: 'dave@x.com', warnings: 0 }));
  await assertFails(dave.doc('userPrivate/dave').set({ id: 'dave', email: 'dave@x.com', termsVersion: 'x'.repeat(30) }));
  await assertSucceeds(dave.doc('userPrivate/dave').set({ id: 'dave', email: 'dave@x.com' }));
  await assertSucceeds(dave.doc('userPrivate/dave').set({ id: 'dave', termsVersion: '2026-11-21', consentAt: '2026-11-21T10:00:00.000Z' }, { merge: true }));
  await assertFails(dave.doc('userPrivate/dave').set({ id: 'dave', consentAt: 123 }, { merge: true }));
});

test('tags: only an admin reserves a tag for someone else', async () => {
  await assertSucceeds(as('admin').doc('usernames/carol').set({ uid: 'carol' }));
  await assertFails(as('bob').doc('usernames/carolina').set({ uid: 'carol' }));
  await assertFails(as('admin').doc('usernames/BAD TAG').set({ uid: 'carol' }));
  await assertFails(as('bob').doc('usernames/alice').delete());
  await assertSucceeds(as('alice').doc('usernames/alice').delete());
});

test('own profile: edit allowed fields, drop the old public email, change the tag only to a reserved one', async () => {
  const a = as('alice');
  await assertSucceeds(a.doc('users/alice').update({ name: 'Alice' }));
  await assertSucceeds(a.doc('users/alice').update({ email: del() }));
  await assertFails(a.doc('users/alice').update({ email: 'new@x.com' }));
  await assertFails(a.doc('users/alice').update({ role: 'admin' }));
  await assertFails(as('bob').doc('users/alice').update({ name: 'hacked' }));
  await assertFails(a.doc('users/alice').update({ username: 'alice2' }));
  await assertFails(a.doc('users/alice').update({ username: 'bob' }));
  await assertSucceeds(a.doc('usernames/alice2').set({ uid: 'alice' }));
  await assertSucceeds(a.doc('users/alice').update({ username: 'alice2' }));
  await assertFails(a.doc('userPrivate/alice').update({ warnings: 0 }));
  await assertSucceeds(as('admin').doc('userPrivate/alice').update({ warnings: 2, banReason: 'spam' }));
  await assertSucceeds(as('admin').doc('users/alice').update({ status: 'warned' }));
});

test('notifications: only the recipient reads them; actors write as themselves with real names', async () => {
  await assertFails(guest().collection('notifications').get());
  await assertFails(as('alice').collection('notifications').get());
  await assertSucceeds(as('alice').collection('notifications').where('userId', '==', 'alice').get());
  await assertFails(as('bob').collection('notifications').where('userId', '==', 'alice').get());
  const n = (id, extra) => ({ id, userId: 'alice', type: 'like', text: 't', createdAt: 'x', read: false, ...extra });
  await assertSucceeds(as('bob').doc('notifications/n2').set(n('n2', { actorId: 'bob' })));
  await assertSucceeds(as('bob').doc('notifications/n2b').set(n('n2b', { actorId: 'bob', actorName: 'bob', karaokeId: 'k1', karaokeTitle: 'Song' })));
  await assertFails(as('bob').doc('notifications/n2c').set(n('n2c', { actorId: 'bob', actorName: 'Администрация' })));
  await assertFails(as('bob').doc('notifications/n2d').set(n('n2d', { actorId: 'bob', karaokeId: 'k1', karaokeTitle: 'Ваш аккаунт взломан' })));
  await assertFails(as('bob').doc('notifications/n2e').set(n('n2e', { actorId: 'bob', type: 'custom' })));
  await assertFails(as('bob').doc('notifications/n3').set(n('n3', { actorId: 'carol' })));
  await assertFails(guest().doc('notifications/n4').set(n('n4', { actorId: 'bob' })));
  await assertFails(as('bob').doc('notifications/n5').set(n('n5', { actorId: 'bob', type: 'warning' })));
  await assertFails(as('bob').doc('notifications/n5b').set(n('n5b', { actorId: 'bob', type: 'report' })));
  await assertSucceeds(as('admin').doc('notifications/n6').set(n('n6', { actorId: 'admin', type: 'warning' })));
  await assertSucceeds(as('admin').doc('notifications/n7').set(n('n7', { actorId: 'admin', type: 'report', text: 'Ответ по жалобе' })));
  await assertSucceeds(as('alice').doc('notifications/n1').update({ read: true }));
  await assertFails(as('bob').doc('notifications/n1').update({ read: true }));
  await assertFails(as('alice').doc('notifications/w1').delete());
  await assertSucceeds(as('alice').doc('notifications/n1').delete());
});

test('downloads: owner only', async () => {
  await assertFails(guest().collection('downloads').get());
  await assertSucceeds(as('alice').collection('downloads').where('userId', '==', 'alice').get());
  await assertFails(as('bob').collection('downloads').where('userId', '==', 'alice').get());
  await assertSucceeds(as('bob').doc('downloads/d2').set({ id: 'd2', userId: 'bob', karaokeId: 'k1', title: 'S', artist: 'A', format: 'reel', createdAt: 'x' }));
  await assertFails(as('bob').doc('downloads/d3').set({ id: 'd3', userId: 'alice', karaokeId: 'k1', title: 'S', artist: 'A', format: 'reel', createdAt: 'x' }));
});

test('author stats: +1 by anyone, read by the author', async () => {
  const id = 'alice_listen_2026-11-16';
  await assertSucceeds(guest().doc(`events/${id}`).set({ id, authorId: 'alice', type: 'listen', day: '2026-11-16', count: inc(1) }, { merge: true }));
  await assertFails(guest().doc(`events/${id}`).set({ id, authorId: 'alice', type: 'listen', day: '2026-11-16', count: inc(5) }, { merge: true }));
  const nid = 'alice_follow_2026-11-17';
  await assertSucceeds(as('bob').doc(`events/${nid}`).set({ id: nid, authorId: 'alice', type: 'follow', day: '2026-11-17', count: inc(1) }, { merge: true }));
  await assertFails(guest().doc('events/x').set({ id: 'x', authorId: 'alice', type: 'listen', day: '2026-11-18', count: 1 }));
  await assertFails(guest().collection('events').get());
  await assertSucceeds(as('alice').collection('events').where('authorId', '==', 'alice').get());
});

test('track counters: one step at a time; authors cannot self-pump counters', async () => {
  await assertSucceeds(guest().doc('karaokes/k1').update({ viewsCount: inc(1) }));
  await assertFails(guest().doc('karaokes/k1').update({ viewsCount: 100 }));
  await assertFails(as('alice').doc('karaokes/k1').update({ viewsCount: 10000, title: 'Boosted' }));
  await assertFails(guest().doc('karaokes/k1').update({ likesCount: inc(1) }));
  await assertSucceeds(as('bob').doc('karaokes/k1').update({ likesCount: inc(1) }));
  await assertFails(as('bob').doc('karaokes/k1').update({ likesCount: inc(5) }));
  await assertFails(guest().doc('karaokes/k1').update({ isFeatured: true }));
  await assertSucceeds(guest().doc('karaokes/k1').update({ recommendationScore: inc(3) }));
  await assertSucceeds(guest().doc('karaokes/k1').update({ isFeatured: true }));
  await assertFails(guest().doc('karaokes/k1').update({ recommendationScore: inc(10) }));
  await assertFails(guest().doc('karaokes/k1').update({ title: 'hacked' }));
  await assertFails(as('bob').doc('karaokes/k1').update({ title: 'hacked' }));
  await assertSucceeds(as('alice').doc('karaokes/k1').update({ title: 'New title' }));
});

test('publishing: a confirmed email is required for new tracks and reviews', async () => {
  const track = (id) => ({ id, authorId: 'bob', title: 'Mine', artist: 'B', lyrics: [], status: 'active', visibility: 'public', viewsCount: 0, likesCount: 0, recommendationScore: 10, isFeatured: false });
  await assertFails(asUnverified('bob').doc('karaokes/kb1').set(track('kb1')));
  await assertSucceeds(as('bob').doc('karaokes/kb2').set(track('kb2')));
  const review = { id: 'cv', karaokeId: 'k1', userId: 'bob', userName: 'bob', userAvatar: '', content: 'x', createdAt: 'x' };
  await assertFails(asUnverified('bob').doc('comments/cv').set(review));
  await assertSucceeds(as('bob').doc('comments/cv').set(review));
  // Editing an existing track does not need a confirmed email.
  await assertSucceeds(asUnverified('alice').doc('karaokes/k1').update({ title: 'Edited' }));
});

test('recommendation flags: created once, never listed', async () => {
  const ref = guest().doc('interactions/k1|guest-1|listen');
  await assertSucceeds(ref.set({ at: 'x' }));
  await assertFails(ref.set({ at: 'y' }));
  await assertSucceeds(ref.get());
  await assertFails(guest().collection('interactions').get());
});

test('reviews: write as yourself under your real name, delete your own (and replies to it), pin by the track author', async () => {
  const c = (id, userId, extra = {}) => ({ id, karaokeId: 'k1', userId, userName: userId, userAvatar: '', content: 'x', createdAt: 'x', ...extra });
  await assertSucceeds(as('bob').doc('comments/c3').set(c('c3', 'bob')));
  await assertFails(as('bob').doc('comments/c4').set(c('c4', 'carol')));
  await assertFails(as('bob').doc('comments/c4b').set(c('c4b', 'bob', { userName: 'alice' })));
  await assertFails(as('bob').doc('comments/c4c').set(c('c4c', 'bob', { userAvatar: 'https://evil.example/a.png' })));
  await assertFails(guest().doc('comments/c5').set(c('c5', 'bob')));
  await assertFails(as('carol').doc('comments/c1').delete());
  await assertSucceeds(as('bob').doc('comments/c2').delete());
  await assertFails(as('bob').doc('comments/c1').update({ pinned: true }));
  await assertSucceeds(as('alice').doc('comments/c1').update({ pinned: true }));
  await assertFails(as('alice').doc('comments/c1').update({ content: 'edited' }));
  await assertSucceeds(as('admin').doc('comments/c1').delete());
});

test('follows: only add or remove yourself', async () => {
  await assertSucceeds(as('carol').doc('follows/alice').set({ id: 'alice', followers: ['bob', 'carol'] }));
  await assertFails(as('carol').doc('follows/alice').set({ id: 'alice', followers: ['carol'] }));
  await assertSucceeds(as('bob').doc('follows/alice').set({ id: 'alice', followers: ['carol'] }));
  await assertSucceeds(as('alice').doc('follows/bob').set({ id: 'bob', followers: ['alice'] }));
  await assertFails(as('alice').doc('follows/carol').set({ id: 'carol', followers: ['bob'] }));
});

test('follows: arrayUnion / arrayRemove of yourself (lib/storage toggleFollow), others kept', async () => {
  const arrayUnion = (v) => firebase.firestore.FieldValue.arrayUnion(v);
  const follow = (who, target, fn) => as(who).doc(`follows/${target}`).set({ id: target, followers: fn(who) }, { merge: true });
  await assertSucceeds(follow('carol', 'alice', arrayUnion));
  await assertSucceeds(follow('carol', 'alice', arrayRemove));
  await assertSucceeds(follow('alice', 'carol', arrayUnion)); // creates the list
  await assertFails(as('carol').doc('follows/alice').set({ id: 'alice', followers: arrayRemove('bob') }, { merge: true }));
  await assertFails(as('carol').doc('follows/alice').set({ id: 'alice', followers: arrayUnion('dave') }, { merge: true }));
  let left;
  await env.withSecurityRulesDisabled(async (ctx) => {
    left = (await ctx.firestore().doc('follows/alice').get()).data();
  });
  assert.deepEqual(left.followers, ['bob']);
});

test('on-demand reads: single-field queries the app uses are allowed for guests', async () => {
  await assertSucceeds(guest().collection('comments').where('karaokeId', '==', 'k1').get());
  await assertSucceeds(guest().collection('playlists').where('ownerId', '==', 'alice').get());
  await assertSucceeds(guest().doc('usernames/alice').get());
  await assertSucceeds(guest().doc('follows/alice').get());
  await assertSucceeds(guest().doc('users/alice').get());
});

test('likes and playlists: own only', async () => {
  await assertSucceeds(as('bob').doc('likes/bob').set({ id: 'bob', ids: ['k1'] }));
  await assertFails(as('bob').doc('likes/alice').set({ id: 'alice', ids: ['k1'] }));
  await assertFails(guest().doc('likes/bob').get());
  await assertSucceeds(guest().doc('playlists/p1').get());
  await assertSucceeds(as('bob').doc('playlists/p1').update({ name: 'Renamed', karaokeIds: [] }));
  await assertFails(as('alice').doc('playlists/p1').update({ name: 'Hacked', karaokeIds: [] }));
  await assertFails(as('alice').doc('playlists/p2').set({ id: 'p2', ownerId: 'bob', name: 'x', karaokeIds: [], createdAt: 'x' }));
});

test('account deletion: the owner removes their own data, nobody else can', async () => {
  const a = as('alice');
  const b = as('bob');
  await assertFails(b.doc('follows/alice').delete());
  await assertSucceeds(a.doc('follows/alice').delete());
  // Deleting an already missing own list also passes (the first step of account deletion relies on it).
  await assertSucceeds(a.doc('follows/alice').delete());
  await assertFails(b.doc('karaokes/k_priv').delete());
  await assertSucceeds(a.doc('karaokes/k_priv').delete());
  await assertSucceeds(a.doc('karaokes/k_blocked').delete());
  await assertFails(b.doc('events/alice_listen_2026-11-16').delete());
  await assertSucceeds(a.doc('events/alice_listen_2026-11-16').delete());
  await assertSucceeds(b.doc('comments/c1').delete());
  await assertFails(b.doc('userPrivate/alice').delete());
  await assertSucceeds(a.doc('userPrivate/alice').delete());
  await assertFails(a.doc('notifications/w1').delete());
  await assertFails(b.doc('users/alice').delete());
  await assertSucceeds(a.doc('users/alice').delete());
  await assertSucceeds(a.doc('notifications/w1').delete());
  await env.withSecurityRulesDisabled(async (ctx) => ctx.firestore().doc('follows/carol').set({ id: 'carol', followers: ['bob', 'alice'] }));
  await assertSucceeds(b.doc('follows/carol').update({ followers: arrayRemove('bob') }));
});

test('genres: everyone reads the list, only admins change it', async () => {
  await assertSucceeds(as('admin').doc('config/genres').set({ id: 'genres', list: ['поп', 'рок'] }));
  await assertSucceeds(guest().doc('config/genres').get());
  await assertFails(as('alice').doc('config/genres').set({ id: 'genres', list: ['spam'] }));
  await assertFails(guest().doc('config/genres').set({ id: 'genres', list: ['spam'] }));
  await assertFails(as('admin').doc('config/genres').set({ id: 'genres', list: ['поп'], extra: true }));
  await assertFails(as('admin').doc('config/aligner').set({ url: 'https://evil.trycloudflare.com' }));
  await assertFails(guest().doc('config/aligner').set({ url: 'https://evil.trycloudflare.com' }));
});

test('aligner address: only the service account, only a tunnel url and a time', async () => {
  const svc = as('svc');
  const now = Date.now();
  await assertSucceeds(svc.doc('config/aligner').set({ url: 'https://brave-cat-lake.trycloudflare.com', updatedAt: now }));
  await assertSucceeds(svc.doc('config/aligner').set({ url: '', updatedAt: now }));
  await assertSucceeds(guest().doc('config/aligner').get());
  await assertFails(svc.doc('config/aligner').set({ url: 'http://brave-cat-lake.trycloudflare.com', updatedAt: now }));
  await assertFails(svc.doc('config/aligner').set({ url: 'https://x.trycloudflare.com.evil.com', updatedAt: now }));
  await assertFails(svc.doc('config/aligner').set({ url: 'https://evil.com/a.trycloudflare.com', updatedAt: now }));
  await assertFails(svc.doc('config/aligner').set({ url: 'https://evil.com', updatedAt: now }));
  await assertFails(svc.doc('config/aligner').set({ url: '', updatedAt: String(now) }));
  await assertFails(svc.doc('config/aligner').set({ url: '', updatedAt: now, extra: true }));
  await assertFails(svc.doc('config/aligner').delete());
  await assertFails(svc.doc('config/genres').set({ id: 'genres', list: ['spam'] }));
  await assertFails(as('alice').doc('config/aligner').set({ url: '', updatedAt: now }));
  await assertFails(as('admin').doc('config/aligner').set({ url: '', updatedAt: now }));
  await assertFails(guest().doc('config/aligner').set({ url: '', updatedAt: now }));
  await assertFails(svc.doc('services/aligner').get());
  await assertFails(svc.doc('services/aligner').set({ uid: 'svc' }));
  await assertFails(as('alice').doc('services/aligner').set({ uid: 'alice' }));
  await assertFails(as('admin').doc('services/aligner').set({ uid: 'admin' }));
});
