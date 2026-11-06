/**
 * Data layer. Shared data lives in Firestore and is read through the synchronous cache in
 * lib/store.ts; only per-browser things (guest plays, seen tutorials) stay in localStorage.
 * See docs/FIREBASE.md for the collection layout.
 */
import {
  Karaoke,
  Comment,
  User,
  UserStatus,
  Playlist,
  InteractionType,
  Visibility,
  AppNotification,
  NotificationType,
  DailyStat,
  StatType,
} from './types';
import { cols, Col } from './store';

const LOCAL_KEYS = {
  GUEST: 'karaokecraft_v2_guest',
  TUTORIAL: 'karaokecraft_v2_tutorial',
};

export const RECOMMEND_THRESHOLD = 60;
export const GUEST_PLAY_LIMIT = 3;

const INTERACTION_WEIGHT: Record<InteractionType, number> = {
  listen: 1,
  finish: 3,
  like: 3,
  playlist: 4,
  comment: 2,
  share: 1,
};

function localGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function localSet<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked */
  }
}

const K = cols.karaokes as Col<Karaoke>;
const U = cols.users as Col<User>;
const CM = cols.comments as Col<Comment>;
const PL = cols.playlists as Col<Playlist>;
const NT = cols.notifications as Col<AppNotification>;
const ST = cols.events as Col<DailyStat>;

// ---------------- HELPERS ----------------

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

/** Short unique suffix for ids and generated names. */
export const uid = () => Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5);

export const artistSlug = (artist: string) => slugify(artist) || 'unknown';
export const songSlug = (title: string) => slugify(title) || 'song';
const today = () => new Date().toISOString().slice(0, 10);

function normalizeKaraoke(k: Karaoke): Karaoke {
  const score = typeof k.recommendationScore === 'number' ? k.recommendationScore : 10;
  return {
    ...k,
    visibility: k.visibility ?? 'public',
    status: k.status ?? 'active',
    recommendationScore: score,
    isFeatured: !!k.isFeatured || score >= RECOMMEND_THRESHOLD,
  };
}

/** Recommendation score (0-100) shown to authors as a 1-10 visibility grade. */
export function visibilityRating(score: number): { value: number; label: string; kind: 'ok' | 'wn' | 'dg' } {
  const value = Math.max(1, Math.min(10, Math.round(score / 10)));
  if (value >= 7) return { value, label: 'Отличная', kind: 'ok' };
  if (value >= 4) return { value, label: 'Хорошая', kind: 'wn' };
  return { value, label: 'Плохая', kind: 'dg' };
}

// ---------------- KARAOKES ----------------

/** All karaokes of every status. Use getPublicKaraokes() for anything shown to visitors. */
export function getKaraokes(): Karaoke[] {
  return K.all().map(normalizeKaraoke).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function getPublicKaraokes(): Karaoke[] {
  return getKaraokes().filter((k) => k.status === 'active' && k.visibility === 'public');
}

export function getKaraokeById(id: string): Karaoke | undefined {
  const k = K.get(id);
  return k ? normalizeKaraoke(k) : undefined;
}

export function canViewKaraoke(k: Karaoke, viewer: User | null): boolean {
  if (viewer?.role === 'admin') return true;
  if (k.status !== 'active') return false;
  if (k.visibility === 'private') return viewer?.id === k.authorId;
  return true; // public and unlisted (by link)
}

export function getKaraokesByAuthor(authorId: string, opts: { publicOnly?: boolean } = {}): Karaoke[] {
  const all = getKaraokes().filter((k) => k.authorId === authorId && k.status !== 'deleted');
  return opts.publicOnly ? all.filter((k) => k.status === 'active' && k.visibility === 'public') : all;
}

export function getKaraokesByArtist(slug: string): Karaoke[] {
  return getPublicKaraokes().filter((k) => artistSlug(k.artist) === slug);
}

export function getKaraokesByTag(tag: string): Karaoke[] {
  const t = tag.toLowerCase();
  return getPublicKaraokes().filter((k) => k.tags.some((x) => x.toLowerCase() === t));
}

export function getAuthor(k: Karaoke): { id: string; name: string; username?: string; avatar?: string } {
  const u = getUserById(k.authorId);
  if (u) return { id: u.id, name: u.name, username: u.username, avatar: u.avatar };
  return { id: k.authorId, name: k.authorName, avatar: k.authorAvatar };
}

export function initialRecommendationScore(authorId: string): number {
  return getFollowersCount(authorId) >= 3 ? 20 : 10;
}

export function saveKaraoke(karaoke: Karaoke): Karaoke {
  K.set(karaoke);
  return karaoke;
}

export function updateKaraoke(id: string, patch: Partial<Karaoke>) {
  return K.patch(id, patch);
}

export function setKaraokeVisibility(id: string, visibility: Visibility) {
  return K.patch(id, { visibility });
}

export const softDeleteKaraoke = (id: string) => K.patch(id, { status: 'deleted' });
export const blockKaraoke = (id: string) => K.patch(id, { status: 'blocked' });
export const restoreKaraoke = (id: string) => K.patch(id, { status: 'active' });

export function deleteKaraoke(id: string): boolean {
  K.remove(id);
  return true;
}

export function incrementViewCount(id: string): void {
  const k = K.get(id);
  if (k) K.patch(id, { viewsCount: (k.viewsCount || 0) + 1 });
}

// ---------------- NOTIFICATIONS ----------------

export function notify(
  userId: string,
  type: NotificationType,
  text: string,
  extra: { actorId?: string; actorName?: string; karaokeId?: string; karaokeTitle?: string; commentId?: string } = {}
) {
  if (!userId || (extra.actorId && extra.actorId === userId)) return;
  NT.set({ id: 'nt-' + uid(), userId, type, text, createdAt: new Date().toISOString(), read: false, ...extra });
}

export function getNotifications(userId: string): AppNotification[] {
  return NT.all()
    .filter((n) => n.userId === userId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function markNotificationsRead(userId: string) {
  getNotifications(userId)
    .filter((n) => !n.read)
    .forEach((n) => NT.patch(n.id, { read: true }));
}

/** Name of whoever did the action; guests are "Гость". */
function actorName(actorId: string) {
  return getUserById(actorId)?.name ?? 'Гость';
}

function notifyAuthor(karaokeId: string, actorId: string, type: NotificationType, verb: string) {
  const k = K.get(karaokeId);
  if (!k) return;
  const name = actorName(actorId);
  notify(k.authorId, type, `${name} ${verb} «${k.title}»`, {
    actorId,
    actorName: name,
    karaokeId,
    karaokeTitle: k.title,
  });
}

// ---------------- DAILY STATS (charts) ----------------

export function bumpStat(authorId: string, type: StatType, by = 1) {
  const day = today();
  const id = `${authorId}_${type}_${day}`;
  const cur = ST.get(id);
  ST.set({ id, authorId, type, day, count: (cur?.count || 0) + by });
}

/** Counts per day for the last `days` days, oldest first. */
export function getDailyStats(authorId: string, type: StatType, days = 30): { day: string; count: number }[] {
  const out: { day: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    out.push({ day, count: ST.get(`${authorId}_${type}_${day}`)?.count || 0 });
  }
  return out;
}

export function registerListen(karaokeId: string, actorId: string) {
  const k = K.get(karaokeId);
  if (!k || k.authorId === actorId) return;
  bumpStat(k.authorId, 'listen');
}

export function registerDownload(karaokeId: string, actorId: string) {
  const k = K.get(karaokeId);
  if (!k || k.authorId === actorId) return;
  bumpStat(k.authorId, 'download');
  notifyAuthor(karaokeId, actorId, 'download', 'скачал(а) видео');
}

// ---------------- RECOMMENDATION SCORE ----------------

/**
 * Each (actor, karaoke, type) counts once, and the author's own actions never count,
 * so the score can't be pumped by repeating the same action.
 */
export function registerInteraction(karaokeId: string, actorId: string, type: InteractionType): number | null {
  const k = getKaraokeById(karaokeId);
  if (!k || k.authorId === actorId || k.status !== 'active' || k.visibility !== 'public') return null;

  const key = `${karaokeId}|${actorId}|${type}`;
  if (cols.interactions.get(key)) return k.recommendationScore;
  cols.interactions.set({ id: key, at: new Date().toISOString() });

  const score = Math.min(100, k.recommendationScore + INTERACTION_WEIGHT[type]);
  K.patch(karaokeId, { recommendationScore: score, isFeatured: k.isFeatured || score >= RECOMMEND_THRESHOLD });
  return score;
}

// ---------------- LIKES ----------------

export function toggleKaraokeLike(karaokeId: string, userId: string): { isLiked: boolean; count: number } {
  const userLikes = cols.likes.get(userId)?.ids || [];
  const isLiked = userLikes.includes(karaokeId);
  cols.likes.set({ id: userId, ids: isLiked ? userLikes.filter((id) => id !== karaokeId) : [...userLikes, karaokeId] });

  const k = K.get(karaokeId);
  let count = k?.likesCount || 0;
  if (k) {
    count = Math.max(0, count + (isLiked ? -1 : 1));
    K.patch(karaokeId, { likesCount: count });
    if (!isLiked) {
      registerInteraction(karaokeId, userId, 'like');
      notifyAuthor(karaokeId, userId, 'like', 'оценил(а)');
    }
  }
  return { isLiked: !isLiked, count };
}

export function hasUserLiked(karaokeId: string, userId?: string): boolean {
  if (!userId) return false;
  return (cols.likes.get(userId)?.ids || []).includes(karaokeId);
}

export function getUserLikedKaraokeIds(userId: string): string[] {
  return cols.likes.get(userId)?.ids || [];
}

// ---------------- COMMENTS ----------------

export function getComments(karaokeId: string): Comment[] {
  return CM.all()
    .filter((c) => c.karaokeId === karaokeId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function addComment(comment: Comment): Comment {
  CM.set(comment);
  registerInteraction(comment.karaokeId, comment.userId, 'comment');
  const k = K.get(comment.karaokeId);
  const parent = comment.parentId ? CM.get(comment.parentId) : undefined;
  if (parent) {
    // Reply: tell the person who was answered, quoting the reply and linking to it.
    const quote = comment.content.length > 80 ? comment.content.slice(0, 80) + '…' : comment.content;
    notify(parent.userId, 'reply', `${comment.userName} ответил(а) на ваш отзыв: «${quote}»`, {
      actorId: comment.userId,
      actorName: comment.userName,
      karaokeId: comment.karaokeId,
      karaokeTitle: k?.title,
      commentId: comment.id,
    });
  }
  if (k && k.authorId !== parent?.userId) {
    notify(k.authorId, 'comment', `${comment.userName} оставил(а) отзыв о «${k.title}»`, {
      actorId: comment.userId,
      actorName: comment.userName,
      karaokeId: comment.karaokeId,
      karaokeTitle: k.title,
      commentId: comment.id,
    });
  }
  return comment;
}

/** Track author or admin pins a top-level review; only one stays pinned per track. */
export function togglePinComment(id: string) {
  const c = CM.get(id);
  if (!c) return;
  const pin = !c.pinned;
  if (pin) CM.all().filter((x) => x.karaokeId === c.karaokeId && x.pinned && x.id !== id).forEach((x) => CM.patch(x.id, { pinned: false }));
  CM.patch(id, { pinned: pin });
}

export function deleteComment(id: string): boolean {
  CM.all().filter((c) => c.parentId === id).forEach((c) => CM.remove(c.id));
  CM.remove(id);
  return true;
}

// ---------------- USERS ----------------

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@/, '').toLowerCase();
}

export function getUsers(): User[] {
  return U.all().sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
}

export function getUserById(id: string): User | undefined {
  return U.get(id);
}

export function getUserByUid(authUid: string): User | undefined {
  return U.get(authUid) ?? U.all().find((u) => u.uid === authUid);
}

export function getUserByEmail(email: string): User | undefined {
  const e = email.trim().toLowerCase();
  return U.all().find((u) => u.email.toLowerCase() === e);
}

export function getUserByUsername(tag: string): User | undefined {
  const t = normalizeUsername(tag);
  return U.all().find((u) => u.username.toLowerCase() === t);
}

export function isUsernameTaken(tag: string, exceptUserId?: string): boolean {
  const t = normalizeUsername(tag);
  return U.all().some((u) => u.username.toLowerCase() === t && u.id !== exceptUserId);
}

/** Returns an error message or null when the tag is valid and free. */
export function validateUsername(tag: string, exceptUserId?: string): string | null {
  const t = normalizeUsername(tag);
  if (!USERNAME_RE.test(t)) return 'Тег: 3–20 символов, латиница, цифры и «_»';
  if (isUsernameTaken(t, exceptUserId)) return 'Этот тег уже занят';
  return null;
}

export function saveUser(user: User): User {
  U.set(user);
  return user;
}

export function deleteUser(id: string): boolean {
  U.remove(id);
  return true;
}

/** A temporary ban that has run out counts as active again. */
export function effectiveStatus(u: User): UserStatus {
  const s = u.status ?? 'active';
  if (s === 'banned_temp' && u.banUntil && new Date(u.banUntil).getTime() <= Date.now()) return 'active';
  return s;
}

export function updateUserRole(id: string, newRole: 'user' | 'admin'): User | null {
  return U.patch(id, { role: newRole }) ?? null;
}

export const WARNING_REASONS = [
  'Спам',
  'Оскорбления',
  'Нарушение авторских прав',
  'Неприемлемый контент',
  'Накрутка рекомендаций',
  'Выдача себя за другого',
] as const;

export function moderateUser(
  id: string,
  action: 'warn' | 'ban_temp' | 'ban_perm' | 'clear',
  opts: { days?: number; reason?: string; moderatorId?: string } = {}
): User | null {
  const u = getUserById(id);
  if (!u) return null;
  const next: User = { ...u };
  const why = opts.reason ? `: ${opts.reason}` : '';
  switch (action) {
    case 'warn':
      next.status = 'warned';
      next.warnings = (u.warnings || 0) + 1;
      next.banReason = opts.reason;
      notify(id, 'warning', `Вы получили предупреждение${why}`, { actorId: opts.moderatorId });
      break;
    case 'ban_temp':
      next.status = 'banned_temp';
      next.banUntil = new Date(Date.now() + (opts.days ?? 7) * 86400000).toISOString();
      next.banReason = opts.reason;
      notify(id, 'ban', `Аккаунт заблокирован на ${opts.days ?? 7} дн.${why}`, { actorId: opts.moderatorId });
      break;
    case 'ban_perm':
      next.status = 'banned_perm';
      next.banUntil = undefined;
      next.banReason = opts.reason;
      notify(id, 'ban', `Аккаунт заблокирован навсегда${why}`, { actorId: opts.moderatorId });
      break;
    case 'clear':
      next.status = 'active';
      next.banUntil = undefined;
      next.banReason = undefined;
      break;
  }
  return saveUser(next);
}

// ---------------- FOLLOWS ----------------

export function getFollowersCount(targetId: string): number {
  return (cols.follows.get(targetId)?.followers || []).length;
}

export function isFollowing(followerId: string | undefined, targetId: string): boolean {
  if (!followerId) return false;
  return (cols.follows.get(targetId)?.followers || []).includes(followerId);
}

export function toggleFollow(followerId: string, targetId: string): { following: boolean; count: number } {
  const list = cols.follows.get(targetId)?.followers || [];
  const following = list.includes(followerId);
  const next = following ? list.filter((id) => id !== followerId) : [...list, followerId];
  cols.follows.set({ id: targetId, followers: next });
  if (!following) {
    bumpStat(targetId, 'follow');
    const name = actorName(followerId);
    notify(targetId, 'follow', `${name} подписался(-ась) на вас`, { actorId: followerId, actorName: name });
  }
  return { following: !following, count: next.length };
}

// ---------------- PLAYLISTS ----------------

export function getPlaylists(ownerId?: string): Playlist[] {
  const all = PL.all().sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  return ownerId ? all.filter((p) => p.ownerId === ownerId) : all;
}

function onAddedToPlaylist(karaokeId: string, ownerId: string) {
  registerInteraction(karaokeId, ownerId, 'playlist');
  notifyAuthor(karaokeId, ownerId, 'playlist', 'добавил(а) в плейлист');
}

export function createPlaylist(ownerId: string, name: string, karaokeId?: string): Playlist {
  const p: Playlist = {
    id: 'pl-' + uid(),
    ownerId,
    name: name.trim() || 'Новый плейлист',
    karaokeIds: karaokeId ? [karaokeId] : [],
    createdAt: new Date().toISOString(),
  };
  PL.set(p);
  if (karaokeId) onAddedToPlaylist(karaokeId, ownerId);
  return p;
}

export function togglePlaylistItem(playlistId: string, karaokeId: string): boolean {
  const p = PL.get(playlistId);
  if (!p) return false;
  const has = p.karaokeIds.includes(karaokeId);
  PL.patch(playlistId, { karaokeIds: has ? p.karaokeIds.filter((id) => id !== karaokeId) : [...p.karaokeIds, karaokeId] });
  if (!has) onAddedToPlaylist(karaokeId, p.ownerId);
  return !has;
}

export function renamePlaylist(playlistId: string, name: string) {
  const p = PL.get(playlistId);
  if (p) PL.patch(playlistId, { name: name.trim() || p.name });
}

export function deletePlaylist(playlistId: string) {
  PL.remove(playlistId);
}

// ---------------- GUEST LIMITS (per browser) ----------------

interface GuestState {
  id: string;
  played: string[];
}

function readGuest(): GuestState {
  const g = localGet<GuestState | null>(LOCAL_KEYS.GUEST, null);
  if (g) return g;
  const fresh = { id: 'guest-' + Math.random().toString(36).slice(2, 10), played: [] };
  localSet(LOCAL_KEYS.GUEST, fresh);
  return fresh;
}

export const getGuestId = () => readGuest().id;

export function guestPlaysLeft(karaokeId?: string): number {
  const g = readGuest();
  if (karaokeId && g.played.includes(karaokeId)) return GUEST_PLAY_LIMIT - g.played.length + 1;
  return Math.max(0, GUEST_PLAY_LIMIT - g.played.length);
}

/** Records the start of playback. Returns false if the guest has used all free plays. */
export function registerGuestPlay(karaokeId: string): boolean {
  const g = readGuest();
  if (g.played.includes(karaokeId)) return true;
  if (g.played.length >= GUEST_PLAY_LIMIT) return false;
  g.played.push(karaokeId);
  localSet(LOCAL_KEYS.GUEST, g);
  return true;
}

// ---------------- STUDIO STATS ----------------

export function getAuthorStats(authorId: string) {
  const live = getKaraokesByAuthor(authorId).filter((k) => k.status === 'active');
  return {
    tracks: live.length,
    views: live.reduce((s, k) => s + (k.viewsCount || 0), 0),
    likes: live.reduce((s, k) => s + (k.likesCount || 0), 0),
    followers: getFollowersCount(authorId),
    featured: live.filter((k) => k.isFeatured).length,
  };
}

// ---------------- TUTORIAL (per browser) ----------------

export function isTutorialSeen(userKey: string, page: string): boolean {
  return !!localGet<Record<string, boolean>>(LOCAL_KEYS.TUTORIAL, {})[`${userKey}:${page}`];
}

export function markTutorialSeen(userKey: string, page: string) {
  const m = localGet<Record<string, boolean>>(LOCAL_KEYS.TUTORIAL, {});
  m[`${userKey}:${page}`] = true;
  localSet(LOCAL_KEYS.TUTORIAL, m);
}

export function resetTutorials(userKey: string) {
  const m = localGet<Record<string, boolean>>(LOCAL_KEYS.TUTORIAL, {});
  Object.keys(m).forEach((k) => k.startsWith(userKey + ':') && delete m[k]);
  localSet(LOCAL_KEYS.TUTORIAL, m);
}

