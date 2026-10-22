import { Karaoke, Comment, User } from './types';
import { INITIAL_KARAOKES, INITIAL_COMMENTS, INITIAL_USERS } from './mock-data';

const STORAGE_KEYS = {
  KARAOKES: 'karaokecraft_karaokes',
  COMMENTS: 'karaokecraft_comments',
  USERS: 'karaokecraft_users',
  CURRENT_USER: 'karaokecraft_current_user',
  LIKED_POSTS: 'karaokecraft_liked_posts',
};

function safeGetItem<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch (e) {
    console.error(`Error reading ${key} from storage:`, e);
    return defaultValue;
  }
}

function safeSetItem<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Error writing ${key} to storage:`, e);
  }
}

// ---------------- KARAOKES ----------------

export function getKaraokes(): Karaoke[] {
  const items = safeGetItem<Karaoke[]>(STORAGE_KEYS.KARAOKES, []);
  if (!items || items.length === 0) {
    safeSetItem(STORAGE_KEYS.KARAOKES, INITIAL_KARAOKES);
    return INITIAL_KARAOKES;
  }
  return items;
}

export function getKaraokeById(id: string): Karaoke | undefined {
  const all = getKaraokes();
  return all.find((k) => k.id === id);
}

export function saveKaraoke(karaoke: Karaoke): Karaoke {
  const all = getKaraokes();
  const existingIdx = all.findIndex((k) => k.id === karaoke.id);
  let updated: Karaoke[];
  if (existingIdx >= 0) {
    updated = [...all];
    updated[existingIdx] = karaoke;
  } else {
    updated = [karaoke, ...all];
  }
  safeSetItem(STORAGE_KEYS.KARAOKES, updated);
  return karaoke;
}

export function deleteKaraoke(id: string): boolean {
  const all = getKaraokes();
  const filtered = all.filter((k) => k.id !== id);
  safeSetItem(STORAGE_KEYS.KARAOKES, filtered);
  return true;
}

export function toggleFeatured(id: string): boolean {
  const all = getKaraokes();
  const item = all.find((k) => k.id === id);
  if (!item) return false;
  item.isFeatured = !item.isFeatured;
  safeSetItem(STORAGE_KEYS.KARAOKES, all);
  return item.isFeatured;
}

export function incrementViewCount(id: string): void {
  const all = getKaraokes();
  const item = all.find((k) => k.id === id);
  if (item) {
    item.viewsCount = (item.viewsCount || 0) + 1;
    safeSetItem(STORAGE_KEYS.KARAOKES, all);
  }
}

export function toggleKaraokeLike(karaokeId: string, userId: string): { isLiked: boolean; count: number } {
  const likedMap = safeGetItem<Record<string, string[]>>(STORAGE_KEYS.LIKED_POSTS, {});
  const userLikes = likedMap[userId] || [];
  const isLiked = userLikes.includes(karaokeId);

  let newUserLikes: string[];
  if (isLiked) {
    newUserLikes = userLikes.filter((id) => id !== karaokeId);
  } else {
    newUserLikes = [...userLikes, karaokeId];
  }
  likedMap[userId] = newUserLikes;
  safeSetItem(STORAGE_KEYS.LIKED_POSTS, likedMap);

  const all = getKaraokes();
  const item = all.find((k) => k.id === karaokeId);
  let count = item?.likesCount || 0;
  if (item) {
    item.likesCount = Math.max(0, count + (isLiked ? -1 : 1));
    count = item.likesCount;
    safeSetItem(STORAGE_KEYS.KARAOKES, all);
  }

  return { isLiked: !isLiked, count };
}

export function hasUserLiked(karaokeId: string, userId?: string): boolean {
  if (!userId) return false;
  const likedMap = safeGetItem<Record<string, string[]>>(STORAGE_KEYS.LIKED_POSTS, {});
  const userLikes = likedMap[userId] || [];
  return userLikes.includes(karaokeId);
}

export function getUserLikedKaraokeIds(userId: string): string[] {
  const likedMap = safeGetItem<Record<string, string[]>>(STORAGE_KEYS.LIKED_POSTS, {});
  return likedMap[userId] || [];
}

// ---------------- COMMENTS ----------------

export function getComments(karaokeId: string): Comment[] {
  const all = safeGetItem<Comment[]>(STORAGE_KEYS.COMMENTS, []);
  if (!all || all.length === 0) {
    safeSetItem(STORAGE_KEYS.COMMENTS, INITIAL_COMMENTS);
    return INITIAL_COMMENTS.filter((c) => c.karaokeId === karaokeId);
  }
  return all.filter((c) => c.karaokeId === karaokeId);
}

export function addComment(comment: Comment): Comment {
  const all = safeGetItem<Comment[]>(STORAGE_KEYS.COMMENTS, INITIAL_COMMENTS);
  const updated = [comment, ...all];
  safeSetItem(STORAGE_KEYS.COMMENTS, updated);
  return comment;
}

export function deleteComment(id: string): boolean {
  const all = safeGetItem<Comment[]>(STORAGE_KEYS.COMMENTS, INITIAL_COMMENTS);
  const updated = all.filter((c) => c.id !== id);
  safeSetItem(STORAGE_KEYS.COMMENTS, updated);
  return true;
}

// ---------------- USERS ----------------

export function getUsers(): User[] {
  const items = safeGetItem<User[]>(STORAGE_KEYS.USERS, []);
  if (!items || items.length === 0) {
    safeSetItem(STORAGE_KEYS.USERS, INITIAL_USERS);
    return INITIAL_USERS;
  }
  return items;
}

export function getUserById(id: string): User | undefined {
  const users = getUsers();
  return users.find((u) => u.id === id);
}

export function saveUser(user: User): User {
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === user.id);
  let updated: User[];
  if (idx >= 0) {
    updated = [...users];
    updated[idx] = user;
  } else {
    updated = [...users, user];
  }
  safeSetItem(STORAGE_KEYS.USERS, updated);
  return user;
}

export function deleteUser(id: string): boolean {
  const users = getUsers();
  const updated = users.filter((u) => u.id !== id);
  safeSetItem(STORAGE_KEYS.USERS, updated);
  return true;
}

export function updateUserRole(id: string, newRole: 'user' | 'admin'): User | null {
  const users = getUsers();
  const u = users.find((x) => x.id === id);
  if (!u) return null;
  u.role = newRole;
  safeSetItem(STORAGE_KEYS.USERS, users);

  // If current user is modified, update current user too
  const curr = getCurrentUser();
  if (curr && curr.id === id) {
    curr.role = newRole;
    safeSetItem(STORAGE_KEYS.CURRENT_USER, curr);
  }
  return u;
}

export function getCurrentUser(): User | null {
  return safeGetItem<User | null>(STORAGE_KEYS.CURRENT_USER, INITIAL_USERS[0]); // default to admin for seamless test
}

export function setCurrentUser(user: User | null): void {
  safeSetItem(STORAGE_KEYS.CURRENT_USER, user);
}
