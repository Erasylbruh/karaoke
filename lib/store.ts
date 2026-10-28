import { useMemo, useSyncExternalStore } from 'react';
import { Karaoke, Comment, User } from './types';
import { INITIAL_KARAOKES, INITIAL_COMMENTS, INITIAL_USERS } from './mock-data';
import { STORAGE_KEYS, subscribeStorage } from './storage';

export const GUEST_USER_ID = 'guest-user';

const NO_IDS: string[] = [];

/**
 * Builds a getSnapshot for one localStorage key. The parsed value is cached by the raw string,
 * so the same string always yields the same object. It only reads storage, never writes.
 */
function createSnapshot<T>(key: string, parse: (raw: string | null) => T): () => T {
  let cached = false;
  let lastRaw: string | null = null;
  let lastValue: T;
  return () => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      raw = null;
    }
    if (!cached || raw !== lastRaw) {
      cached = true;
      lastRaw = raw;
      lastValue = parse(raw);
    }
    return lastValue;
  };
}

function parseJson(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

// Same fallbacks as the getters in storage.ts: a missing or empty list means the seed data.
function listOr<T>(initial: T[]): (raw: string | null) => T[] {
  return (raw) => {
    const value = parseJson(raw);
    return Array.isArray(value) && value.length > 0 ? (value as T[]) : initial;
  };
}

const getKaraokesSnapshot = createSnapshot(STORAGE_KEYS.KARAOKES, listOr<Karaoke>(INITIAL_KARAOKES));
const getUsersSnapshot = createSnapshot(STORAGE_KEYS.USERS, listOr<User>(INITIAL_USERS));
const getCommentsSnapshot = createSnapshot(STORAGE_KEYS.COMMENTS, listOr<Comment>(INITIAL_COMMENTS));

const getCurrentUserSnapshot = createSnapshot<User | null>(STORAGE_KEYS.CURRENT_USER, (raw) => {
  if (raw === null) return INITIAL_USERS[0];
  const value = parseJson(raw);
  if (value === null) return null;
  return value && typeof value === 'object' ? (value as User) : INITIAL_USERS[0];
});

const getLikedSnapshot = createSnapshot<Record<string, string[]>>(STORAGE_KEYS.LIKED_POSTS, (raw) => {
  const value = parseJson(raw);
  return value && typeof value === 'object' ? (value as Record<string, string[]>) : {};
});

const getNullSnapshot = () => null;
const getUnknownSnapshot = () => undefined;

export function useStoredKaraokes(): Karaoke[] | null {
  return useSyncExternalStore(subscribeStorage, getKaraokesSnapshot, getNullSnapshot);
}

export function useStoredUsers(): User[] | null {
  return useSyncExternalStore(subscribeStorage, getUsersSnapshot, getNullSnapshot);
}

/** `undefined` — not known yet (server and hydration), `null` — guest. */
export function useStoredCurrentUser(): User | null | undefined {
  return useSyncExternalStore<User | null | undefined>(subscribeStorage, getCurrentUserSnapshot, getUnknownSnapshot);
}

export function useStoredComments(karaokeId: string): Comment[] | null {
  const all = useSyncExternalStore(subscribeStorage, getCommentsSnapshot, getNullSnapshot);
  return useMemo(() => (all ? all.filter((c) => c.karaokeId === karaokeId) : null), [all, karaokeId]);
}

export function useStoredLikedIds(userId: string): string[] | null {
  const likedMap = useSyncExternalStore(subscribeStorage, getLikedSnapshot, getNullSnapshot);
  return useMemo(() => (likedMap ? likedMap[userId] ?? NO_IDS : null), [likedMap, userId]);
}
