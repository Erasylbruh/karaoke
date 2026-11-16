/**
 * Synchronous cache over Firestore.
 *
 * Public collections (tracks, public profiles, reviews, playlists, follows) are mirrored in memory
 * for everyone. Personal ones (notifications, downloads, likes, author stats, private profile
 * data) are mirrored only for the signed-in person, through queries limited to their own
 * documents (see setSyncScope), so firestore.rules can keep them private.
 *
 * lib/storage.ts keeps its synchronous API: reads come from the cache, writes update the cache
 * immediately and are sent to Firestore in the background.
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

function emit() {
  version++;
  listeners.forEach((l) => l());
}

export function subscribeStore(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const getStoreVersion = () => version;

export const syncErrors: string[] = [];
function report(where: string, e: unknown) {
  const msg = `${where}: ${e instanceof Error ? e.message : String(e)}`;
  console.warn('[firestore]', msg);
  syncErrors.push(msg);
  emit();
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
  /** Writes the whole document (creates it or replaces it). */
  set(item: T) {
    this.map.set(item.id, item);
    emit();
    setDoc(doc(db, this.name, item.id), item).catch((e) => report(`write ${this.name}/${item.id}`, e));
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
    emit();
    updateDoc(doc(db, this.name, id), toFirestore(partial as Record<string, unknown>)).catch((e) => report(`update ${this.name}/${id}`, e));
    return next;
  }
  /** Atomic +by on a numeric field, so two people acting at once can't overwrite each other. */
  increment(id: string, field: keyof T & string, by = 1) {
    const cur = this.map.get(id);
    if (!cur) return;
    this.map.set(id, { ...cur, [field]: (Number(cur[field]) || 0) + by });
    emit();
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
      emit();
    }
    setDoc(doc(db, this.name, id), { id, ...base, [field]: increment(by) }, { merge: true }).catch((e) =>
      report(`increment ${this.name}/${id}`, e)
    );
  }
  remove(id: string) {
    this.map.delete(id);
    emit();
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
  // Public: everyone mirrors the whole collection.
  karaokes: new Col<any>('karaokes'),
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

const PUBLIC = [cols.karaokes, cols.users, cols.comments, cols.playlists, cols.follows, cols.config];
const PERSONAL = [cols.notifications, cols.downloads, cols.events, cols.likes, cols.userPrivate];

/** Mirrors a query (or a single document) into `c`. Returns the unsubscribe function. */
function mirror(c: Col<Doc>, source: Query | DocumentReference, onFirst?: () => void) {
  const first = () => {
    if (c.loaded) return;
    c.loaded = true;
    onFirst?.();
  };
  // includeMetadataChanges: a first snapshot served from the local cache is followed by a
  // metadata-only one once the server confirms it; without it `loaded` could stay false forever.
  if (source.type === 'document') {
    return onSnapshot(
      source as DocumentReference,
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.exists()) c.map.set(snap.id, { ...(snap.data() as Doc), id: snap.id });
        else c.map.delete(snap.id);
        if (!snap.metadata.fromCache) first();
        emit();
      },
      (e) => {
        report(`listen ${c.name}`, e);
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
      // A cached (offline) snapshot does not prove the server answered.
      if (!snap.metadata.fromCache) first();
      emit();
    },
    (e) => {
      report(`listen ${c.name}`, e);
      first();
    }
  );
}

let started: Promise<void> | null = null;

/** Starts the public listeners; resolves once each delivered its first server snapshot (or after a timeout). */
export function startSync(): Promise<void> {
  if (started) return started;
  started = new Promise<void>((resolve) => {
    let pending = PUBLIC.length;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      emit();
      resolve();
    };
    const timer = setTimeout(() => {
      report('connect', 'Firestore не ответил за 12 секунд');
      finish();
    }, 12000);
    PUBLIC.forEach((c) =>
      mirror(c as Col<Doc>, collection(db, c.name), () => {
        if (--pending === 0) finish();
      })
    );
  });
  return started;
}

let scopeKey = '';
let scopedUnsubs: (() => void)[] = [];

/**
 * Switches the personal listeners to the signed-in person (null = signed out). Each one asks only
 * for that person's documents; admins also get every profile's private data for moderation.
 */
export function setSyncScope(scope: { uid: string; admin: boolean } | null) {
  const key = scope ? `${scope.uid}|${scope.admin}` : '';
  if (key === scopeKey) return;
  scopeKey = key;
  scopedUnsubs.forEach((u) => u());
  scopedUnsubs = [];
  PERSONAL.forEach((c) => c.clear());
  emit();
  if (!scope) return;
  const { uid, admin } = scope;
  const mine = (c: Col<Doc>, field: string) => mirror(c, query(collection(db, c.name), where(field, '==', uid)));
  scopedUnsubs = [
    mine(cols.notifications as Col<Doc>, 'userId'),
    mine(cols.downloads as Col<Doc>, 'userId'),
    mine(cols.events as Col<Doc>, 'authorId'),
    mirror(cols.likes as Col<Doc>, doc(db, 'likes', uid)),
    admin
      ? mirror(cols.userPrivate as Col<Doc>, collection(db, 'userPrivate'))
      : mirror(cols.userPrivate as Col<Doc>, doc(db, 'userPrivate', uid)),
  ];
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
