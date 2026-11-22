// Tests lib/server/storage.ts (the /api/storage/upload and /api/storage/delete logic) with a mocked fetch:
// what the routes send to Identity Toolkit, Firestore and Supabase, and what they refuse.
// Needs Node 23.6+ (runs the .ts module directly). Run: npm run test:storage
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const MODULE_URL = process.env.STORAGE_TS
  ? pathToFileURL(process.env.STORAGE_TS).href
  : new URL('../lib/server/storage.ts', import.meta.url).href;
const SUPA = 'https://alspedwglexctjkztcof.supabase.co';
const PUB = `${SUPA}/storage/v1/object/public/uploads/`;

let calls;
let accounts; // idToken -> { localId, emailVerified, disabled }
let profiles; // uid -> fields | 'error'
let supabaseStatus;
let listing; // prefix -> [{ name, id }]

globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  calls.push({ url, init });
  if (url.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup')) {
    const { idToken } = JSON.parse(init.body);
    const acc = accounts[idToken];
    if (!acc) return Response.json({ error: { message: 'INVALID_ID_TOKEN' } }, { status: 400 });
    return Response.json({ users: [acc] });
  }
  if (url.startsWith('https://firestore.googleapis.com/')) {
    const uid = decodeURIComponent(url.split('/documents/users/')[1].split('?')[0]);
    const p = profiles[uid];
    if (p === 'error') return new Response('boom', { status: 500 });
    if (!p) return Response.json({ error: { code: 404 } }, { status: 404 });
    return Response.json({ fields: p });
  }
  if (url.startsWith(`${SUPA}/storage/v1/object/upload/sign/`)) {
    if (supabaseStatus !== 200) return new Response('nope', { status: supabaseStatus });
    const path = url.slice(`${SUPA}/storage/v1`.length);
    return Response.json({ url: `${path}?token=signed-token` });
  }
  if (url === `${SUPA}/storage/v1/object/list/uploads` && init.method === 'POST') {
    if (supabaseStatus !== 200) return new Response('nope', { status: supabaseStatus });
    const { prefix, offset } = JSON.parse(init.body);
    return Response.json(offset ? [] : listing[prefix] ?? []);
  }
  if (url === `${SUPA}/storage/v1/object/uploads` && init.method === 'DELETE') {
    if (supabaseStatus !== 200) return new Response('nope', { status: supabaseStatus });
    return Response.json(JSON.parse(init.body).prefixes.map((name) => ({ name })));
  }
  throw new Error('unexpected fetch ' + url);
};

const { signUpload, deleteObjects, objectFromPublicUrl } = await import(MODULE_URL);

const req = (body, token) =>
  new Request('http://localhost/api/storage/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  calls = [];
  supabaseStatus = 200;
  listing = {};
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_TEST';
  accounts = {
    good: { localId: 'uidA', emailVerified: true },
    unverified: { localId: 'uidB', emailVerified: false },
    banned: { localId: 'uidC', emailVerified: true },
    tempban: { localId: 'uidD', emailVerified: true },
    admin: { localId: 'uidAdmin', emailVerified: true },
    disabled: { localId: 'uidE', emailVerified: true, disabled: true },
    flaky: { localId: 'uidF', emailVerified: true },
  };
  profiles = {
    uidA: { role: { stringValue: 'user' }, status: { stringValue: 'active' } },
    uidB: { role: { stringValue: 'user' } },
    uidC: { status: { stringValue: 'banned_perm' } },
    uidD: { status: { stringValue: 'banned_temp' }, banUntilMs: { integerValue: String(Date.now() + 86400000) } },
    uidAdmin: { role: { stringValue: 'admin' }, uid: { stringValue: 'uidAdmin' } },
    uidF: 'error',
  };
});

const good = { folder: 'audio', contentType: 'audio/mpeg', size: 9 * 1024 * 1024 };

test('sign: 501 without the server key, so the client keeps the old path', async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await signUpload(req(good, 'good'));
  assert.equal(res.status, 501);
  assert.equal(calls.length, 0);
});

test('sign: issues a signed URL for a 9 MB mp3 (over the 4.5 MB function body limit) with the path chosen by the server', async () => {
  const res = await signUpload(req({ ...good, folder: 'audio' }, 'good'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.publicUrl, new RegExp(`^${PUB}audio/uidA/[a-z0-9]+-[a-f0-9]{8}$`));
  const path = body.publicUrl.slice(PUB.length);
  assert.equal(body.uploadUrl, `${SUPA}/storage/v1/object/upload/sign/uploads/${path}?token=signed-token`);
  const sign = calls.find((c) => c.url.includes('/object/upload/sign/'));
  assert.equal(sign.init.method, 'POST');
  assert.equal(sign.init.headers.apikey, 'sb_secret_TEST');
  assert.equal(sign.init.headers.Authorization, undefined, 'new sb_secret keys must not go in Authorization');
  assert.equal(objectFromPublicUrl(body.publicUrl).owner, 'uidA');
});

test('sign: legacy service_role JWT also goes in Authorization', async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJlegacy.jwt.key';
  await signUpload(req(good, 'good'));
  const sign = calls.find((c) => c.url.includes('/object/upload/sign/'));
  assert.equal(sign.init.headers.Authorization, 'Bearer eyJlegacy.jwt.key');
});

test('sign: refuses without sign-in, unconfirmed email, bans, disabled accounts', async () => {
  assert.equal((await signUpload(req(good))).status, 401);
  assert.equal((await signUpload(req(good, 'nonsense'))).status, 401);
  assert.equal((await signUpload(req(good, 'unverified'))).status, 403);
  assert.equal((await signUpload(req(good, 'banned'))).status, 403);
  assert.equal((await signUpload(req(good, 'tempban'))).status, 403);
  assert.equal((await signUpload(req(good, 'disabled'))).status, 403);
  assert.equal(calls.filter((c) => c.url.includes('/object/upload/sign/')).length, 0, 'never signs for refused accounts');
});

test('sign: fails closed when the profile cannot be read', async () => {
  assert.equal((await signUpload(req(good, 'flaky'))).status, 503);
});

test('sign: validates folder, type and declared size before touching anything', async () => {
  assert.equal((await signUpload(req({ ...good, folder: '../etc' }, 'good'))).status, 400);
  assert.equal((await signUpload(req({ ...good, contentType: 'text/html' }, 'good'))).status, 415);
  assert.equal((await signUpload(req({ ...good, contentType: 'application/octet-stream' }, 'good'))).status, 415);
  assert.equal((await signUpload(req({ ...good, size: 41 * 1024 * 1024 }, 'good'))).status, 413);
  assert.equal((await signUpload(req({ ...good, folder: 'covers', contentType: 'image/jpeg', size: 6 * 1024 * 1024 }, 'good'))).status, 413);
  assert.equal((await signUpload(req({ ...good, size: 0 }, 'good'))).status, 400);
  assert.equal((await signUpload(req('not json', 'good'))).status, 400);
  assert.equal(calls.length, 0);
});

test('sign: storage errors become 502', async () => {
  supabaseStatus = 400;
  assert.equal((await signUpload(req(good, 'good'))).status, 502);
});

test('delete: owners delete their own files; others are refused', async () => {
  const mine = `${PUB}audio/uidA/abc-12345678`;
  const theirs = `${PUB}audio/uidZ/abc-12345678`;
  const res = await deleteObjects(req({ urls: [mine, theirs, 'https://evil.example/x', `${PUB}audio/uidA`, `${PUB}../secret`] }, 'good'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.deleted, 1);
  assert.deepEqual(body.refused, [theirs, 'https://evil.example/x', `${PUB}audio/uidA`, `${PUB}../secret`]);
  const del = calls.find((c) => c.init.method === 'DELETE');
  assert.deepEqual(JSON.parse(del.init.body), { prefixes: ['audio/uidA/abc-12345678'] });
  assert.equal(del.init.headers.apikey, 'sb_secret_TEST');
});

test('delete: never sends a folder or bucket-wide prefix', async () => {
  const res = await deleteObjects(req({ urls: [`${PUB}audio/uidA/`, `${PUB}audio/`, `${PUB}`, `${PUB}audio/uidA/x/y`] }, 'good'));
  const body = await res.json();
  assert.equal(body.deleted, 0);
  assert.equal(calls.filter((c) => c.init.method === 'DELETE').length, 0);
});

test('delete: admins may delete any file; non-admins may not', async () => {
  const theirs = `${PUB}covers/uidZ/pic-1`;
  const asAdmin = await (await deleteObjects(req({ urls: [theirs] }, 'admin'))).json();
  assert.equal(asAdmin.deleted, 1);
  calls = [];
  const asUser = await (await deleteObjects(req({ urls: [theirs] }, 'good'))).json();
  assert.equal(asUser.deleted, 0);
  assert.equal(calls.filter((c) => c.init.method === 'DELETE').length, 0);
});

test('sign: per-account quota (300 MB) refuses an upload that would go over it', async () => {
  const MB = 1024 * 1024;
  listing = {
    'audio/uidA': [{ name: 'a', id: 'f1', metadata: { size: 250 * MB } }, { name: 'folder', id: null, metadata: null }],
    'covers/uidA': [{ name: 'c', id: 'f2', metadata: { size: 45 * MB } }],
  };
  const over = await signUpload(req({ ...good, size: 9 * MB }, 'good'));
  assert.equal(over.status, 413);
  assert.match((await over.json()).error, /лимит хранилища/);
  assert.equal(calls.filter((c) => c.url.includes('/object/upload/sign/')).length, 0);
  const under = await signUpload(req({ ...good, size: 4 * MB }, 'good'));
  assert.equal(under.status, 200);
  process.env.STORAGE_USER_QUOTA_MB = '1000';
  assert.equal((await signUpload(req({ ...good, size: 9 * MB }, 'good'))).status, 200);
  delete process.env.STORAGE_USER_QUOTA_MB;
});

test('sign: admins are not limited, and a failed listing does not block the upload', async () => {
  const MB = 1024 * 1024;
  listing = { 'audio/uidAdmin': [{ name: 'big', id: 'f1', metadata: { size: 900 * MB } }] };
  assert.equal((await signUpload(req({ ...good, size: 9 * MB }, 'admin'))).status, 200);
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) =>
    String(url).includes('/object/list/') ? new Response('boom', { status: 500 }) : origFetch(url, init);
  try {
    assert.equal((await signUpload(req({ ...good, size: 9 * MB }, 'good'))).status, 200);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('delete: an empty list is the availability check (200 with the key, 501 without), without touching anything', async () => {
  assert.equal((await deleteObjects(req({ urls: [] }))).status, 200);
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal((await deleteObjects(req({ urls: [] }))).status, 501);
  assert.equal(calls.length, 0);
});

test('delete: purgeOwn lists only the caller\'s own folders and deletes the files found there', async () => {
  listing = {
    'audio/uidA': [{ name: 'song-1', id: 'f1' }, { name: 'nested', id: null }],
    'covers/uidA': [{ name: 'old-avatar', id: 'f2' }, { name: 'cover-2', id: 'f3' }],
    'audio/uidZ': [{ name: 'someone-else', id: 'f9' }],
  };
  const res = await deleteObjects(req({ purgeOwn: true }, 'good'));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).deleted, 3);
  const listed = calls.filter((c) => c.url.endsWith('/object/list/uploads')).map((c) => JSON.parse(c.init.body).prefix);
  assert.deepEqual(listed.sort(), ['audio/uidA', 'covers/uidA', 'fonts/uidA', 'uploads/uidA']);
  const del = calls.find((c) => c.init.method === 'DELETE');
  assert.deepEqual(JSON.parse(del.init.body).prefixes, ['audio/uidA/song-1', 'covers/uidA/old-avatar', 'covers/uidA/cover-2']);
});

test('delete: purgeOwn needs sign-in and reports storage failures', async () => {
  assert.equal((await deleteObjects(req({ purgeOwn: true }))).status, 401);
  supabaseStatus = 500;
  assert.equal((await deleteObjects(req({ purgeOwn: true }, 'good'))).status, 502);
});

test('delete: 501 without key, 401 without token', async () => {
  assert.equal((await deleteObjects(req({ urls: [`${PUB}audio/uidA/a`] }))).status, 401);
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal((await deleteObjects(req({ urls: [`${PUB}audio/uidA/a`] }, 'good'))).status, 501);
});
