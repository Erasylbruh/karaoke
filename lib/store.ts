/**
 * Synchronous cache over Firestore.
 *
 * The public catalog (active public tracks) and site settings are mirrored in memory for everyone.
 * Profiles, reviews, playlists and follower lists are read on demand: a page asks for the documents
 * it shows (useWatch, retain), so a visitor never downloads those whole collections. Personal data
 * (author's own non-public tracks, notifications, downloads, likes, author stats, private profile
 * data) is mirrored only for the signed-in person, through queries limited to their own documents
 * (see setSyncScope), so firestore.rules can keep it private.
 */
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  increment,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentReference,
  type Query,
} from 'firebase/firestore';
import { db } from './firebase';

type Doc = { id: string };
type Listener = () => void;

const listeners = new Set<Listener>();
let version = 0;

export function emitStore() {
  version++;
  listeners.forEach((l) => l());
}

export function subscribeStore(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const getStoreVersion = () => version;

export const syncErrors: string[] = [];
export let connectionFailed = false;

function report(whereKey: string, e: unknown, isConnection = false) {
  const msg = `${whereKey}: ${e instanceof Error ? e.message : String(e)}`;
  console.warn('[firestore]', msg);
  syncErrors.push(msg);
  if (isConnection) connectionFailed = true;
  emitStore();
}

/** Firestore value for a field: `undefined` removes it. */
const toFirestore = (partial: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(partial).map(([k, v]) => [k, v === undefined ? deleteField() : v]));

export class Col<T extends Doc> {
  map = new Map<string, T>();
  loaded = false;
  constructor(public readonly name: string) {}

  all(): T[] {
    return [...this.map.values()];
  }
  get(id: string): T | undefined {
    return this.map.get(id);
  }
  /** Writes the whole document (creates it or replaces it). Returns a promise for callers that await durability. */
  set(item: T): Promise<void> {
    this.map.set(item.id, item);
    emitStore();
    return setDoc(doc(db, this.name, item.id), item).catch((e) => {
      report(`write ${this.name}/${item.id}`, e);
      throw e;
    });
  }
  /**
   * Changes only the given fields (`undefined` deletes a field), so a stale cache can't overwrite
   * fields someone else changed, and the rules see exactly what this write touches.
   */
  patch(id: string, partial: Partial<T>): T | undefined {
    const cur = this.map.get(id);
    if (!cur) return undefined;
    const next = { ...cur, ...partial };
    for (const [k, v] of Object.entries(partial)) if (v === undefined) delete (next as Record<string, unknown>)[k];
    this.map.set(id, next);
    emitStore();
    updateDoc(doc(db, this.name, id), toFirestore(partial as Record<string, unknown>)).catch((e) =>
      report(`update ${this.name}/${id}`, e)
    );
    return next;
  }
  /** Atomic +by on a numeric field, so two people acting at once can't overwrite each other. */
  increment(id: string, field: keyof T & string, by = 1) {
    const cur = this.map.get(id);
    if (!cur) return;
    this.map.set(id, { ...cur, [field]: (Number(cur[field]) || 0) + by });
    emitStore();
    updateDoc(doc(db, this.name, id), { [field]: increment(by) }).catch((e) => report(`increment ${this.name}/${id}`, e));
  }
  /**
   * Atomic +by on `field` of a document that may not exist yet (it is created with `base`).
   * Works without having the document in the cache, e.g. another author's daily stats.
   */
  upsertIncrement(id: string, base: Omit<T, 'id'>, field: keyof T & string, by = 1) {
    const cur = this.map.get(id);
    if (cur) {
      this.map.set(id, { ...cur, [field]: (Number(cur[field]) || 0) + by });
      emitStore();
    }
    setDoc(doc(db, this.name, id), { id, ...base, [field]: increment(by) }, { merge: true }).catch((e) =>
      report(`increment ${this.name}/${id}`, e)
    );
  }
  remove(id: string) {
    this.map.delete(id);
    emitStore();
    deleteDoc(doc(db, this.name, id)).catch((e) => report(`delete ${this.name}/${id}`, e));
  }
  clear() {
    this.map.clear();
    this.loaded = false;
  }
}

export interface FollowDoc { id: string; followers: string[] }
export interface LikeDoc { id: string; ids: string[] }
/** `usernames/{tag}`: the tag's owner (see lib/account.ts reserveUsername). */
export interface UsernameDoc { id: string; uid: string }

/* eslint-disable @typescript-eslint/no-explicit-any */
export const cols = {
  // Public catalog: only active public tracks are mirrored to every visitor.
  karaokes: new Col<any>('karaokes'),
  // Scoped tracks: the signed-in author's own tracks (including private/unlisted), or all tracks for admins.
  scopedKaraokes: new Col<any>('karaokes'),
  // Single tracks opened by direct link (e.g. unlisted tracks).
  directKaraokes: new Map<string, any>(),
  // On demand (see retain): profiles, tag reservations, reviews, playlists, follower lists.
  users: new Col<any>('users'),
  usernames: new Col<UsernameDoc>('usernames'),
  comments: new Col<any>('comments'),
  playlists: new Col<any>('playlists'),
  follows: new Col<FollowDoc>('follows'),
  /** Site settings: `genres` (the list projects pick from), `aligner` (auto-timing address). */
  config: new Col<any>('config'),
  // Personal: only the signed-in person's documents (see setSyncScope).
  notifications: new Col<any>('notifications'),
  downloads: new Col<any>('downloads'),
  events: new Col<any>('events'),
  likes: new Col<LikeDoc>('likes'),
  /** Email and moderation details of a profile: the owner's own, or everyone's for admins. */
  userPrivate: new Col<any>('userPrivate'),
};
/* eslint-enable @typescript-eslint/no-explicit-any */

const PUBLIC_SOURCES: Array<{ col: Col<Doc>; source: () => Query }> = [
  {
    col: cols.karaokes as Col<Doc>,
    source: () => query(collection(db, 'karaokes'), where('status', '==', 'active'), where('visibility', '==', 'public')),
  },
  { col: cols.config as Col<Doc>, source: () => collection(db, 'config') },
];

const PERSONAL = [cols.scopedKaraokes, cols.notifications, cols.downloads, cols.events, cols.likes, cols.userPrivate];

/** Mirrors a query (or a single document) into `c`. Returns the unsubscribe function. */
function mirror(c: Col<Doc>, source: Query | DocumentReference, onFirst?: () => void, isPublicBoot = false) {
  const first = () => {
    if (c.loaded) return;
    c.loaded = true;
    onFirst?.();
  };
  if (source.type === 'document') {
    return onSnapshot(
      source as DocumentReference,
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.exists()) c.map.set(snap.id, { ...(snap.data() as Doc), id: snap.id });
        else c.map.delete(snap.id);
        if (!snap.metadata.fromCache) {
          connectionFailed = false;
          first();
        }
        emitStore();
      },
      (e) => {
        report(`listen ${c.name}`, e, isPublicBoot);
        first();
      }
    );
  }
  return onSnapshot(
    source as Query,
    { includeMetadataChanges: true },
    (snap) => {
      snap.docChanges().forEach((ch) => {
        if (ch.type === 'removed') c.map.delete(ch.doc.id);
        else c.map.set(ch.doc.id, { ...(ch.doc.data() as Doc), id: ch.doc.id });
      });
      if (!snap.metadata.fromCache) {
        connectionFailed = false;
        first();
      }
      emitStore();
    },
    (e) => {
      report(`listen ${c.name}`, e, isPublicBoot);
      first();
    }
  );
}

let started: Promise<void> | null = null;

/** Starts the public listeners; resolves once each delivered its first server snapshot (or after a timeout). */
export function startSync(): Promise<void> {
  if (started) return started;
  started = new Promise<void>((resolve) => {
    let pending = PUBLIC_SOURCES.length;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      emitStore();
      resolve();
    };
    const timer = setTimeout(() => {
      report('connect', 'Сервер долго не отвечает', true);
      finish();
    }, 12000);
    PUBLIC_SOURCES.forEach(({ col, source }) =>
      mirror(
        col,
        source(),
        () => {
          if (--pending === 0) finish();
        },
        true
      )
    );
  });
  return started;
}

// ---------------- ON-DEMAND READS ----------------
//
// Keys name what a page shows:
//   user:{id}         users/{id}
//   tag:{tag}         usernames/{tag} (who owns a tag; profile pages resolve /u/{tag} through it)
//   follows:{id}      follows/{id} (the person's followers)
//   comments:{track}  reviews of one track
//   playlists:{owner} one person's playlists
//   users:all         every profile (admins only, see setSyncScope)
// Single-field equality queries only: they need no composite index and match the read rules.
// Several listeners can feed one Col (a profile by id and the admin list of everyone), so each
// cached document remembers which listeners delivered it and leaves the cache when none still does.

interface Watch {
  refs: number;
  loaded: boolean;
  unsub: () => void;
  stopTimer?: ReturnType<typeof setTimeout>;
  col: Col<Doc>;
  /** Ids of the documents this listener delivered. */
  docs: Set<string>;
}

const watches = new Map<string, Watch>();
const holders = new WeakMap<Col<Doc>, Map<string, Set<string>>>();

/** A released listener lingers this long, so going back to a page doesn't read it again. */
const LINGER_MS = 120_000;

function sourceFor(key: string): { col: Col<Doc>; ref: Query | DocumentReference } | null {
  const at = key.indexOf(':');
  const kind = key.slice(0, at);
  const arg = key.slice(at + 1);
  // Firestore document ids: no '/', not '.' or '..', not __reserved__, not absurdly long.
  if (at < 1 || !arg || arg.includes('/') || arg === '.' || arg === '..' || /^__.*__$/.test(arg) || arg.length > 700) return null;
  switch (kind) {
    case 'user':
      return { col: cols.users as Col<Doc>, ref: doc(db, 'users', arg) };
    case 'tag':
      return { col: cols.usernames as Col<Doc>, ref: doc(db, 'usernames', arg) };
    case 'follows':
      return { col: cols.follows as Col<Doc>, ref: doc(db, 'follows', arg) };
    case 'comments':
      return { col: cols.comments as Col<Doc>, ref: query(collection(db, 'comments'), where('karaokeId', '==', arg)) };
    case 'playlists':
      return { col: cols.playlists as Col<Doc>, ref: query(collection(db, 'playlists'), where('ownerId', '==', arg)) };
    case 'users':
      return arg === 'all' ? { col: cols.users as Col<Doc>, ref: collection(db, 'users') } : null;
  }
  return null;
}

function hold(w: Watch, key: string, item: Doc) {
  let byId = holders.get(w.col);
  if (!byId) holders.set(w.col, (byId = new Map()));
  let keys = byId.get(item.id);
  if (!keys) byId.set(item.id, (keys = new Set()));
  keys.add(key);
  w.docs.add(item.id);
  w.col.map.set(item.id, item);
}

function drop(w: Watch, key: string, id: string) {
  w.docs.delete(id);
  const byId = holders.get(w.col);
  const keys = byId?.get(id);
  keys?.delete(key);
  if (!keys || keys.size === 0) {
    byId?.delete(id);
    w.col.map.delete(id);
  }
}

function listen(key: string, w: Watch, ref: Query | DocumentReference) {
  const settle = (fromCache: boolean) => {
    if (fromCache || w.loaded) return;
    w.loaded = true;
    connectionFailed = false;
  };
  const onError = (e: unknown) => {
    report(`listen ${key}`, e);
    w.loaded = true;
  };
  if (ref.type === 'document') {
    return onSnapshot(
      ref as DocumentReference,
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.exists()) hold(w, key, { ...(snap.data() as Doc), id: snap.id });
        else if (w.docs.has(snap.id)) drop(w, key, snap.id);
        settle(snap.metadata.fromCache);
        emitStore();
      },
      onError
    );
  }
  return onSnapshot(
    ref as Query,
    { includeMetadataChanges: true },
    (snap) => {
      snap.docChanges().forEach((ch) => {
        if (ch.type === 'removed') drop(w, key, ch.doc.id);
        else hold(w, key, { ...(ch.doc.data() as Doc), id: ch.doc.id });
      });
      settle(snap.metadata.fromCache);
      emitStore();
    },
    onError
  );
}

function stopWatch(key: string) {
  const w = watches.get(key);
  if (!w || w.refs > 0) return;
  w.unsub();
  watches.delete(key);
  [...w.docs].forEach((id) => drop(w, key, id));
  emitStore();
}

/**
 * Starts (or reuses) the listener for `key` and returns its release function (`immediate` skips the
 * linger). Never emits synchronously, so it is safe to call from effects while others render.
 */
export function retain(key: string): (immediate?: boolean) => void {
  let w = watches.get(key);
  if (w) {
    w.refs++;
    clearTimeout(w.stopTimer);
    w.stopTimer = undefined;
  } else {
    const src = sourceFor(key);
    if (!src) return () => undefined;
    const fresh: Watch = { refs: 1, loaded: false, unsub: () => undefined, col: src.col, docs: new Set() };
    watches.set(key, fresh);
    fresh.unsub = listen(key, fresh, src.ref);
    w = fresh;
  }
  let released = false;
  return (immediate = false) => {
    if (released) return;
    released = true;
    const cur = watches.get(key);
    if (!cur || --cur.refs > 0) return;
    if (immediate) stopWatch(key);
    else cur.stopTimer = setTimeout(() => stopWatch(key), LINGER_MS);
  };
}

/** True once `key`'s listener answered from the server (or failed), so "missing" really means missing. */
export const isWatchLoaded = (key: string) => !!watches.get(key)?.loaded;

const commentTexts = new Map<string, string | null>();

/** The text of one review, read once by id (the bell quotes replies without loading whole tracks). */
export function commentText(id: string): string | null | undefined {
  const cached = (cols.comments.get(id) as { content?: string } | undefined)?.content;
  return cached ?? commentTexts.get(id);
}

export async function loadCommentText(id: string) {
  if (!id || id.includes('/') || commentTexts.has(id)) return;
  commentTexts.set(id, null);
  try {
    const snap = await getDoc(doc(db, 'comments', id));
    if (snap.exists()) commentTexts.set(id, String((snap.data() as { content?: unknown }).content ?? ''));
  } catch {
    /* no quote then */
  }
  emitStore();
}

// The signed-in person's own public documents, keyed by uid only: an admin flip (setSyncScope) never
// reloads them, so it can't loop through "profile → admin → reload → not admin".
let ownUid = '';
let ownReleases: (() => void)[] = [];
let ownTimer: ReturnType<typeof setTimeout> | undefined;
let ownTimedOut = false;

function setOwnWatches(uid: string) {
  if (uid === ownUid) return;
  ownReleases.forEach((r) => r());
  ownReleases = [];
  clearTimeout(ownTimer);
  ownTimedOut = false;
  ownUid = uid;
  if (!uid) return;
  ownReleases = [`user:${uid}`, `follows:${uid}`, `playlists:${uid}`].map(retain);
  // The sign-in wait (AuthContext.isLoading) must end even when Firestore never answers.
  ownTimer = setTimeout(() => {
    ownTimedOut = true;
    emitStore();
  }, 12000);
}

/** True once the signed-in person's profile answered (it may not exist yet, e.g. mid-registration). */
export const ownProfileSettled = (uid: string) => uid === ownUid && (isWatchLoaded(`user:${uid}`) || ownTimedOut);

/** True once an admin's list of every profile arrived. */
export const allUsersLoaded = () => isWatchLoaded('users:all');

let scopeKey = '';
let scopedUnsubs: (() => void)[] = [];

/** Every profile, for admins only; stops at once when the admin scope ends. */
function retainAllUsers() {
  const release = retain('users:all');
  return () => release(true);
}

/**
 * Switches the personal listeners to the signed-in person (null = signed out). Each one asks only
 * for that person's documents; admins also get all tracks, every profile and its private data.
 */
export function setSyncScope(scope: { uid: string; admin: boolean } | null) {
  setOwnWatches(scope?.uid ?? '');
  const key = scope ? `${scope.uid}|${scope.admin}` : '';
  if (key === scopeKey) return;
  scopeKey = key;
  scopedUnsubs.forEach((u) => u());
  scopedUnsubs = [];
  PERSONAL.forEach((c) => c.clear());
  emitStore();
  if (!scope) return;
  const { uid, admin } = scope;
  const mine = (c: Col<Doc>, field: string) => mirror(c, query(collection(db, c.name), where(field, '==', uid)));
  scopedUnsubs = [
    admin
      ? mirror(cols.scopedKaraokes as Col<Doc>, collection(db, 'karaokes'))
      : mine(cols.scopedKaraokes as Col<Doc>, 'authorId'),
    mine(cols.notifications as Col<Doc>, 'userId'),
    mine(cols.downloads as Col<Doc>, 'userId'),
    mine(cols.events as Col<Doc>, 'authorId'),
    mirror(cols.likes as Col<Doc>, doc(db, 'likes', uid)),
    admin
      ? mirror(cols.userPrivate as Col<Doc>, collection(db, 'userPrivate'))
      : mirror(cols.userPrivate as Col<Doc>, doc(db, 'userPrivate', uid)),
    ...(admin ? [retainAllUsers()] : []),
  ];
}

/** Fetches a single karaoke document by ID (e.g. an unlisted track opened by direct link). */
export async function fetchSingleKaraoke<T extends Doc>(id: string): Promise<T | undefined> {
  if (!id) return undefined;
  try {
    const snap = await getDoc(doc(db, 'karaokes', id));
    if (!snap.exists()) {
      cols.directKaraokes.delete(id);
      return undefined;
    }
    const item = { ...(snap.data() as T), id: snap.id };
    cols.directKaraokes.set(snap.id, item);
    emitStore();
    return item;
  } catch {
    return undefined;
  }
}

/**
 * Creates `collectionName/id` once: resolves true when this call created it, false when it already
 * existed or the write was refused. Reads a single document, never the whole collection.
 */
export async function createOnce(collectionName: string, id: string, data: Record<string, unknown>): Promise<boolean> {
  try {
    const ref = doc(db, collectionName, id);
    if ((await getDoc(ref)).exists()) return false;
    await setDoc(ref, data);
    return true;
  } catch {
    return false;
  }
}
