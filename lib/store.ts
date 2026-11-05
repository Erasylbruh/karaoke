/**
 * Synchronous cache over Firestore.
 *
 * Every collection is mirrored in memory through onSnapshot listeners, so lib/storage.ts can keep
 * its synchronous API: reads come from the cache, writes update the cache immediately and are sent
 * to Firestore in the background. Fine for testing and small data; for production, move to
 * per-page queries and server-side counters (see docs/FIREBASE.md).
 */
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
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
  set(item: T) {
    this.map.set(item.id, item);
    emit();
    setDoc(doc(db, this.name, item.id), item).catch((e) => report(`write ${this.name}/${item.id}`, e));
  }
  patch(id: string, partial: Partial<T>): T | undefined {
    const cur = this.map.get(id);
    if (!cur) return undefined;
    const next = { ...cur, ...partial };
    this.set(next);
    return next;
  }
  remove(id: string) {
    this.map.delete(id);
    emit();
    deleteDoc(doc(db, this.name, id)).catch((e) => report(`delete ${this.name}/${id}`, e));
  }
}

export interface FollowDoc { id: string; followers: string[] }
export interface LikeDoc { id: string; ids: string[] }
export interface FlagDoc { id: string; at: string }

/* eslint-disable @typescript-eslint/no-explicit-any */
export const cols = {
  karaokes: new Col<any>('karaokes'),
  users: new Col<any>('users'),
  comments: new Col<any>('comments'),
  playlists: new Col<any>('playlists'),
  follows: new Col<FollowDoc>('follows'),
  likes: new Col<LikeDoc>('likes'),
  interactions: new Col<FlagDoc>('interactions'),
  notifications: new Col<any>('notifications'),
  events: new Col<any>('events'),
};
/* eslint-enable @typescript-eslint/no-explicit-any */

let started: Promise<void> | null = null;

/** Starts all listeners; resolves once every collection delivered its first server snapshot (or after a timeout). */
export function startSync(): Promise<void> {
  if (started) return started;
  started = new Promise<void>((resolve) => {
    const all = Object.values(cols);
    let pending = all.length;
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
    const done = (c: Col<Doc>) => {
      if (c.loaded) return;
      c.loaded = true;
      if (--pending === 0) {
        finish();
      }
    };
    all.forEach((c) => {
      onSnapshot(
        collection(db, c.name),
        (snap) => {
          snap.docChanges().forEach((ch) => {
            if (ch.type === 'removed') c.map.delete(ch.doc.id);
            else c.map.set(ch.doc.id, { ...(ch.doc.data() as Doc), id: ch.doc.id });
          });
          // A cached (offline) snapshot does not prove the server answered.
          if (!snap.metadata.fromCache) void done(c as Col<Doc>);
          emit();
        },
        (e) => {
          report(`listen ${c.name}`, e);
          void done(c as Col<Doc>);
        }
      );
    });
  });
  return started;
}

