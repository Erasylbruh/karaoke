/**
 * Synchronous cache over Firestore.
 *
 * Public collections (active public tracks, public profiles, reviews, playlists, follows) are
 * mirrored in memory for everyone. Personal ones (author's own non-public tracks, notifications,
 * downloads, likes, author stats, private profile data) are mirrored only for the signed-in person,
 * through queries limited to their own documents (see setSyncScope), so firestore.rules can keep
 * them private.
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

/* eslint-disable @typescript-eslint/no-explicit-any */
export const cols = {
  // Public catalog: only active public tracks are mirrored to every visitor.
  karaokes: new Col<any>('karaokes'),
  // Scoped tracks: the signed-in author's own tracks (including private/unlisted), or all tracks for admins.
  scopedKaraokes: new Col<any>('karaokes'),
  // Single tracks opened by direct link (e.g. unlisted tracks).
  directKaraokes: new Map<string, any>(),
  users: new Col<any>('users'),
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
  { col: cols.users as Col<Doc>, source: () => collection(db, 'users') },
  { col: cols.comments as Col<Doc>, source: () => collection(db, 'comments') },
  { col: cols.playlists as Col<Doc>, source: () => collection(db, 'playlists') },
  { col: cols.follows as Col<Doc>, source: () => collection(db, 'follows') },
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

let scopeKey = '';
let scopedUnsubs: (() => void)[] = [];

/**
 * Switches the personal listeners to the signed-in person (null = signed out). Each one asks only
 * for that person's documents; admins also get all tracks and every profile's private data.
 */
export function setSyncScope(scope: { uid: string; admin: boolean } | null) {
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
