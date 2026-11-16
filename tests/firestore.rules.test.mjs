// Tests for firestore.rules against the Firestore emulator (needs Java 11+).
// The tooling is not a project dependency; install it in any scratch folder:
//   npm i firebase-tools @firebase/rules-unit-testing@6 firebase@13
// then, from that folder (firebase.json there: {"firestore":{"rules":"firestore.rules"}}, with a copy
// of the project's firestore.rules next to it):
//   RULES=./firestore.rules npx firebase emulators:exec --only firestore --project demo-karaoke "node --test <path>/firestore.rules.test.mjs"
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const inc = (n) => firebase.firestore.FieldValue.increment(n);
const del = () => firebase.firestore.FieldValue.delete();
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
    await user('admin', 'admin');
    await db.doc('userPrivate/alice').set({ id: 'alice', email: 'alice@x.com', warnings: 1 });
    await db.doc('userPrivate/bob').set({ id: 'bob', email: 'bob@x.com' });
    await db.doc('karaokes/k1').set({ id: 'k1', authorId: 'alice', title: 'Song', status: 'active', visibility: 'public', viewsCount: 0, likesCount: 0, recommendationScore: 58, isFeatured: false });
    await db.doc('notifications/n1').set({ id: 'n1', userId: 'alice', actorId: 'bob', type: 'like', text: 'hi', createdAt: 'x', read: false });
    await db.doc('downloads/d1').set({ id: 'd1', userId: 'alice', karaokeId: 'k1', title: 'Song', artist: 'A', format: 'reel', createdAt: 'x' });
    await db.doc('events/alice_listen_2026-11-16').set({ id: 'alice_listen_2026-11-16', authorId: 'alice', type: 'listen', day: '2026-11-16', count: 1 });
    await db.doc('comments/c1').set({ id: 'c1', karaokeId: 'k1', userId: 'bob', userName: 'bob', userAvatar: '', content: 'top', createdAt: 'x' });
    await db.doc('comments/c2').set({ id: 'c2', karaokeId: 'k1', userId: 'carol', userName: 'carol', userAvatar: '', content: 'reply', createdAt: 'x', parentId: 'c1' });
    await db.doc('follows/alice').set({ id: 'alice', followers: ['bob'] });
    await db.doc('likes/bob').set({ id: 'bob', ids: [] });
    await db.doc('playlists/p1').set({ id: 'p1', ownerId: 'bob', name: 'Mine', karaokeIds: [], createdAt: 'x' });
  });
});

const guest = () => env.unauthenticatedContext().firestore();
const as = (uid) => env.authenticatedContext(uid, { email: `${uid}@x.com` }).firestore();

test('private profile data: owner and admin only', async () => {
  await assertFails(guest().doc('userPrivate/alice').get());
  await assertFails(as('bob').doc('userPrivate/alice').get());
  await assertSucceeds(as('alice').doc('userPrivate/alice').get());
  await assertSucceeds(as('admin').collection('userPrivate').get());
  await assertFails(as('bob').collection('userPrivate').get());
  await assertSucceeds(guest().doc('users/alice').get());
});

test('registration: public profile without email, private email from the token', async () => {
  const dave = as('dave');
  const pub = { id: 'dave', uid: 'dave', username: 'dave', name: 'Dave', avatar: '', bio: '', role: 'user', status: 'active', createdAt: 'x' };
  await assertFails(dave.doc('users/dave').set({ ...pub, email: 'dave@x.com' }));
  await assertFails(dave.doc('users/dave').set({ ...pub, role: 'admin' }));
  await assertSucceeds(dave.doc('users/dave').set(pub));
  await assertFails(dave.doc('userPrivate/dave').set({ id: 'dave', email: 'other@x.com' }));
  await assertFails(dave.doc('userPrivate/dave').set({ id: 'dave', email: 'dave@x.com', warnings: 0 }));
  await assertSucceeds(dave.doc('userPrivate/dave').set({ id: 'dave', email: 'dave@x.com' }));
});

test('own profile: edit allowed fields, drop the old public email, nothing else', async () => {
  const a = as('alice');
  await assertSucceeds(a.doc('users/alice').update({ name: 'Alice' }));
  await assertSucceeds(a.doc('users/alice').update({ email: del() }));
  await assertFails(a.doc('users/alice').update({ email: 'new@x.com' }));
  await assertFails(a.doc('users/alice').update({ role: 'admin' }));
  await assertFails(as('bob').doc('users/alice').update({ name: 'hacked' }));
  await assertFails(a.doc('userPrivate/alice').update({ warnings: 0 }));
  await assertSucceeds(as('admin').doc('userPrivate/alice').update({ warnings: 2, banReason: 'spam' }));
  await assertSucceeds(as('admin').doc('users/alice').update({ status: 'warned' }));
});

test('notifications: only the recipient reads them; actors write as themselves', async () => {
  await assertFails(guest().collection('notifications').get());
  await assertFails(as('alice').collection('notifications').get());
  await assertSucceeds(as('alice').collection('notifications').where('userId', '==', 'alice').get());
  await assertFails(as('bob').collection('notifications').where('userId', '==', 'alice').get());
  const n = (id, extra) => ({ id, userId: 'alice', type: 'like', text: 't', createdAt: 'x', read: false, ...extra });
  await assertSucceeds(as('bob').doc('notifications/n2').set(n('n2', { actorId: 'bob' })));
  await assertFails(as('bob').doc('notifications/n3').set(n('n3', { actorId: 'carol' })));
  await assertFails(guest().doc('notifications/n4').set(n('n4', { actorId: 'bob' })));
  await assertFails(as('bob').doc('notifications/n5').set(n('n5', { actorId: 'bob', type: 'warning' })));
  await assertSucceeds(as('admin').doc('notifications/n6').set(n('n6', { actorId: 'admin', type: 'warning' })));
  await assertSucceeds(as('alice').doc('notifications/n1').update({ read: true }));
  await assertFails(as('bob').doc('notifications/n1').update({ read: true }));
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

test('track counters: one step at a time; other fields stay the author’s', async () => {
  await assertSucceeds(guest().doc('karaokes/k1').update({ viewsCount: inc(1) }));
  await assertFails(guest().doc('karaokes/k1').update({ viewsCount: 100 }));
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

test('recommendation flags: created once, never listed', async () => {
  const ref = guest().doc('interactions/k1|guest-1|listen');
  await assertSucceeds(ref.set({ at: 'x' }));
  await assertFails(ref.set({ at: 'y' }));
  await assertSucceeds(ref.get());
  await assertFails(guest().collection('interactions').get());
});

test('reviews: write as yourself, delete your own (and replies to it), pin by the track author', async () => {
  const c = (id, userId) => ({ id, karaokeId: 'k1', userId, userName: userId, userAvatar: '', content: 'x', createdAt: 'x' });
  await assertSucceeds(as('bob').doc('comments/c3').set(c('c3', 'bob')));
  await assertFails(as('bob').doc('comments/c4').set(c('c4', 'carol')));
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

test('likes and playlists: own only', async () => {
  await assertSucceeds(as('bob').doc('likes/bob').set({ id: 'bob', ids: ['k1'] }));
  await assertFails(as('bob').doc('likes/alice').set({ id: 'alice', ids: ['k1'] }));
  await assertFails(guest().doc('likes/bob').get());
  await assertSucceeds(guest().doc('playlists/p1').get());
  await assertSucceeds(as('bob').doc('playlists/p1').update({ name: 'Renamed' }));
  await assertFails(as('alice').doc('playlists/p1').update({ name: 'Hacked' }));
  await assertFails(as('alice').doc('playlists/p2').set({ id: 'p2', ownerId: 'bob', name: 'x', karaokeIds: [], createdAt: 'x' }));
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
