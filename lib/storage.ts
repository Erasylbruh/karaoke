/**
 * Data layer. Shared data lives in Firestore and is read through the synchronous cache in
 * lib/store.ts; only per-browser things (guest plays, guests' seen tutorials) stay in localStorage.
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
  DownloadRecord,
} from './types';
import { cols, Col, createOnce, fetchSingleKaraoke, emitStore } from './store';
import { uploadPublicFile } from './blob-store';

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
const KS = cols.scopedKaraokes as Col<Karaoke>;
const KD = cols.directKaraokes as Map<string, Karaoke>;
const U = cols.users as Col<User>;
const CM = cols.comments as Col<Comment>;
const PL = cols.playlists as Col<Playlist>;
const NT = cols.notifications as Col<AppNotification>;
const ST = cols.events as Col<DailyStat>;
const DL = cols.downloads as Col<DownloadRecord>;

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

function mergedKaraokesMap(): Map<string, Karaoke> {
  const merged = new Map<string, Karaoke>();
  for (const [id, item] of KD.entries()) merged.set(id, item);
  for (const [id, item] of K.map.entries()) merged.set(id, item);
  for (const [id, item] of KS.map.entries()) merged.set(id, item);
  return merged;
}

function rawKaraoke(id: string): Karaoke | undefined {
  return KS.get(id) ?? K.get(id) ?? KD.get(id);
}

/** All karaokes visible to the current session. Use getPublicKaraokes() for public catalog pages. */
export function getKaraokes(): Karaoke[] {
  return [...mergedKaraokesMap().values()]
    .map(normalizeKaraoke)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function getPublicKaraokes(): Karaoke[] {
  return getKaraokes().filter((k) => k.status === 'active' && k.visibility === 'public');
}

export function getKaraokeById(id: string): Karaoke | undefined {
  const k = rawKaraoke(id);
  return k ? normalizeKaraoke(k) : undefined;
}

/** Fetches a karaoke document directly by ID when it is not yet in the catalog cache (e.g. unlisted link). */
export async function fetchKaraokeById(id: string): Promise<Karaoke | undefined> {
  const cached = getKaraokeById(id);
  if (cached) return cached;
  const loaded = await fetchSingleKaraoke<Karaoke>(id);
  return loaded ? normalizeKaraoke(loaded) : undefined;
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
  KS.map.set(karaoke.id, karaoke);
  if (karaoke.status === 'active' && karaoke.visibility === 'public') {
    void K.set(karaoke).catch(() => undefined);
  } else {
    void KS.set(karaoke).catch(() => undefined);
  }
  return karaoke;
}

export function updateKaraoke(id: string, patch: Partial<Karaoke>) {
  const cur = rawKaraoke(id);
  if (!cur) return undefined;
  const next = { ...cur, ...patch } as Karaoke;
  for (const [k, v] of Object.entries(patch)) if (v === undefined) delete (next as unknown as Record<string, unknown>)[k];
  if (KS.map.has(id)) KS.map.set(id, next);
  if (KD.has(id)) KD.set(id, next);
  if (next.status === 'active' && next.visibility === 'public') {
    K.map.set(id, next);
  } else {
    K.map.delete(id);
  }
  // Send the Firestore update once via the primary collection helper.
  if (!K.map.has(id) && KS.map.has(id)) return KS.patch(id, patch);
  if (!K.map.has(id)) {
    // Track transitioned out of public catalog: ensure KS holds cur before patching.
    KS.map.set(id, cur);
    return KS.patch(id, patch);
  }
  return K.patch(id, patch);
}

function incrementKaraokeField(id: string, field: keyof Karaoke & string, by = 1) {
  const cur = rawKaraoke(id);
  if (!cur) return;
  const updated = { ...cur, [field]: (Number(cur[field]) || 0) + by } as Karaoke;
  if (KS.map.has(id)) KS.map.set(id, updated);
  if (KD.has(id)) KD.set(id, updated);
  if (K.map.has(id)) {
    K.increment(id, field, by);
  } else if (KS.map.has(id)) {
    KS.map.set(id, cur);
    KS.increment(id, field, by);
  } else {
    // Direct unlisted track: update local map and fire atomic increment via K.
    K.map.set(id, cur);
    K.increment(id, field, by);
    K.map.delete(id);
  }
}

export function setKaraokeVisibility(id: string, visibility: Visibility) {
  return updateKaraoke(id, { visibility });
}

export const softDeleteKaraoke = (id: string) => updateKaraoke(id, { status: 'deleted' });
export const blockKaraoke = (id: string) => updateKaraoke(id, { status: 'blocked' });
export const restoreKaraoke = (id: string) => updateKaraoke(id, { status: 'active' });

export function deleteKaraoke(id: string): boolean {
  KS.map.delete(id);
  KD.delete(id);
  K.remove(id);
  emitStore();
  return true;
}

/** True when the cover is stored inside the track document (data URL) instead of as a file. */
export const hasInlineCover = (k: Karaoke) => !!k.style?.coverImage?.startsWith('data:');

export async function moveCoverToStorage(id: string): Promise<boolean> {
  const k = rawKaraoke(id);
  if (!k || !hasInlineCover(k)) return false;
  const blob = await (await fetch(k.style.coverImage!)).blob();
  const url = await uploadPublicFile(blob, 'covers');
  const cur = rawKaraoke(id);
  if (cur) updateKaraoke(id, { style: { ...cur.style, coverImage: url } });
  return true;
}

// ---------------- GENRES ----------------

export const DEFAULT_GENRES = [
  'поп', 'рок', 'инди', 'альтернатива', 'хип-хоп', 'рэп', 'р&б', 'соул', 'фанк', 'джаз', 'блюз',
  'электроника', 'электропоп', 'синти-поп', 'хаус', 'техно', 'лоу-фай', 'метал', 'панк', 'фолк',
  'народная', 'кантри', 'регги', 'латино', 'к-поп', 'джей-поп', 'аниме', 'саундтрек', 'мюзикл',
  'классика', 'акустика', 'эстрада', 'шансон', 'диско', 'детская',
];
export const MAX_GENRES = 6;

const CFG = cols.config as Col<{ id: string; list?: string[] }>;

export const normalizeGenre = (g: string) =>
  g.trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-').slice(0, 30);

export function getGenres(): string[] {
  const list = CFG.get('genres')?.list;
  return list?.length ? list : DEFAULT_GENRES;
}

export function saveGenres(list: string[]) {
  const clean = [...new Set(list.map(normalizeGenre).filter(Boolean))];
  void CFG.set({ id: 'genres', list: clean }).catch(() => undefined);
  return clean;
}

export function genreUsage(): Map<string, number> {
  const m = new Map<string, number>();
  getKaraokes()
    .filter((k) => k.status === 'active')
    .forEach((k) => k.tags.forEach((t) => m.set(t, (m.get(t) || 0) + 1)));
  return m;
}

// ---------------- NOTIFICATIONS ----------------

export function notify(
  userId: string,
  type: NotificationType,
  text: string,
  extra: { actorId?: string; actorName?: string; karaokeId?: string; karaokeTitle?: string; commentId?: string } = {}
) {
  if (!userId || (extra.actorId && extra.actorId === userId)) return;
  void NT.set({ id: 'nt-' + uid(), userId, type, text, createdAt: new Date().toISOString(), read: false, ...extra }).catch(() => undefined);
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

function actorName(actorId: string) {
  return getUserById(actorId)?.name ?? 'Гость';
}

function notifyAuthor(karaokeId: string, actorId: string, type: NotificationType, verb: string) {
  const k = rawKaraoke(karaokeId);
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
  ST.upsertIncrement(`${authorId}_${type}_${day}`, { authorId, type, day, count: 0 }, 'count', by);
}

export function getDailyStats(authorId: string, type: StatType, days = 30): { day: string; count: number }[] {
  const out: { day: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    out.push({ day, count: ST.get(`${authorId}_${type}_${day}`)?.count || 0 });
  }
  return out;
}

export const LISTEN_SHARE = 0.45;

export function registerListen(karaokeId: string, actorId: string) {
  const k = rawKaraoke(karaokeId);
  if (!k || k.authorId === actorId) return;
  incrementKaraokeField(karaokeId, 'viewsCount');
  bumpStat(k.authorId, 'listen');
}

export function registerDownload(karaokeId: string, actorId: string) {
  const k = rawKaraoke(karaokeId);
  if (!k || k.authorId === actorId) return;
  bumpStat(k.authorId, 'download');
  notifyAuthor(karaokeId, actorId, 'download', 'скачал(а) видео');
}

// ---------------- RECOMMENDATION SCORE ----------------

const countedInteractions = new Set<string>();

export function registerInteraction(karaokeId: string, actorId: string, type: InteractionType): void {
  const k = getKaraokeById(karaokeId);
  if (!k || k.authorId === actorId || k.status !== 'active' || k.visibility !== 'public') return;
  const key = `${karaokeId}|${actorId}|${type}`;
  if (countedInteractions.has(key)) return;
  countedInteractions.add(key);
  void createOnce('interactions', key, { at: new Date().toISOString() }).then((created) => {
    const cur = rawKaraoke(karaokeId);
    if (!created || !cur) return;
    const score = typeof cur.recommendationScore === 'number' ? cur.recommendationScore : 10;
    const add = Math.min(100, score + INTERACTION_WEIGHT[type]) - score;
    if (add > 0) incrementKaraokeField(karaokeId, 'recommendationScore', add);
    if (!cur.isFeatured && score + add >= RECOMMEND_THRESHOLD) updateKaraoke(karaokeId, { isFeatured: true });
  });
}

// ---------------- LIKES ----------------

export function toggleKaraokeLike(karaokeId: string, userId: string): { isLiked: boolean; count: number } {
  const userLikes = cols.likes.get(userId)?.ids || [];
  const isLiked = userLikes.includes(karaokeId);
  void cols.likes.set({ id: userId, ids: isLiked ? userLikes.filter((id) => id !== karaokeId) : [...userLikes, karaokeId] }).catch(() => undefined);

  const k = rawKaraoke(karaokeId);
  let count = k?.likesCount || 0;
  if (k) {
    if (!(isLiked && count <= 0)) incrementKaraokeField(karaokeId, 'likesCount', isLiked ? -1 : 1);
    count = Math.max(0, count + (isLiked ? -1 : 1));
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

// ---------------- COMMENTS ----------------

export function getComments(karaokeId: string): Comment[] {
  return CM.all()
    .filter((c) => c.karaokeId === karaokeId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function addComment(comment: Comment): Comment {
  void CM.set(comment).catch(() => undefined);
  registerInteraction(comment.karaokeId, comment.userId, 'comment');
  const k = rawKaraoke(comment.karaokeId);
  const parent = comment.parentId ? CM.get(comment.parentId) : undefined;
  if (parent) {
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

const PRIVATE_KEYS = ['email', 'contactEmail', 'warnings', 'banReason'] as const;
type PrivateUser = Pick<User, 'id' | (typeof PRIVATE_KEYS)[number]>;
const UP = cols.userPrivate as Col<PrivateUser>;

export const privateProfileLoaded = () => UP.loaded;

function withPrivate(u: User | undefined): User | undefined {
  if (!u) return u;
  const p = UP.get(u.id);
  if (!p) return u;
  const merged: User = { ...u, ...p, id: u.id };
  // Restore hidden contact email draft for the owner/admin when showEmail is off.
  if (p.contactEmail && !merged.contacts?.email) {
    merged.contacts = { ...(merged.contacts ?? {}), email: p.contactEmail };
  }
  return merged;
}

function changed<T extends object>(cur: T, next: T): Partial<T> {
  const out: Record<string, unknown> = {};
  const a = cur as Record<string, unknown>;
  const b = next as Record<string, unknown>;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k !== 'id' && JSON.stringify(a[k]) !== JSON.stringify(b[k])) out[k] = b[k];
  }
  return out as Partial<T>;
}

export function getUsers(): User[] {
  return U.all()
    .map((u) => withPrivate(u)!)
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
}

export function getUserById(id: string): User | undefined {
  return withPrivate(U.get(id));
}

export function getUserByUid(authUid: string): User | undefined {
  return withPrivate(U.get(authUid) ?? U.all().find((u) => u.uid === authUid));
}

export function getUserByUsername(tag: string): User | undefined {
  const t = normalizeUsername(tag);
  return U.all().find((u) => u.username.toLowerCase() === t);
}

export function isUsernameTaken(tag: string, exceptUserId?: string): boolean {
  const t = normalizeUsername(tag);
  return U.all().some((u) => u.username.toLowerCase() === t && u.id !== exceptUserId);
}

export function validateUsername(tag: string, exceptUserId?: string): string | null {
  const t = normalizeUsername(tag);
  if (!USERNAME_RE.test(t)) return 'Тег: 3–20 символов, латиница, цифры и «_»';
  if (isUsernameTaken(t, exceptUserId)) return 'Этот тег уже занят';
  return null;
}

/** Splits public vs private user fields, ensuring hidden contact emails never enter public `users`. */
function splitUserFields(user: User): { pub: Record<string, unknown>; priv: Record<string, unknown> } {
  const pub = { ...user } as Record<string, unknown>;
  const priv: Record<string, unknown> = { id: user.id };

  // Never keep `contacts.email` in the public document when `showEmail` is false.
  if (user.contacts) {
    const cleanContacts = { ...user.contacts };
    if (!cleanContacts.showEmail) {
      if (cleanContacts.email) priv.contactEmail = cleanContacts.email;
      delete cleanContacts.email;
    } else {
      priv.contactEmail = cleanContacts.email || undefined;
    }
    pub.contacts = cleanContacts;
  }

  for (const k of PRIVATE_KEYS) {
    if (pub[k] !== undefined && priv[k] === undefined) priv[k] = pub[k];
    delete pub[k];
  }
  return { pub, priv };
}

/** Saves a profile: public fields to `users`, email and moderation details to `userPrivate`. */
export function saveUser(user: User): User {
  void saveUserAsync(user).catch(() => undefined);
  return user;
}

/** Async variant used during registration so we know the profile document is persisted. */
export async function saveUserAsync(user: User): Promise<User> {
  const { pub, priv } = splitUserFields(user);
  const writes: Promise<unknown>[] = [];

  const cur = U.get(user.id) as Record<string, unknown> | undefined;
  if (!cur) {
    writes.push(U.set(pub as unknown as User));
  } else {
    const diff = changed(cur, pub);
    for (const k of PRIVATE_KEYS) if (k in cur) diff[k] = undefined;
    if (Object.keys(diff).length) U.patch(user.id, diff as Partial<User>);
  }

  const curP = UP.get(user.id) as Record<string, unknown> | undefined;
  if (!curP) {
    const cleanPriv = Object.fromEntries(Object.entries(priv).filter(([, v]) => v !== undefined));
    if (Object.keys(cleanPriv).length > 1) writes.push(UP.set(cleanPriv as unknown as PrivateUser));
  } else {
    const diff = changed(curP, priv);
    if (Object.keys(diff).length) UP.patch(user.id, diff as Partial<PrivateUser>);
  }

  await Promise.all(writes);
  return user;
}

export const usersWithPublicPrivateData = () =>
  U.all().filter(
    (u) =>
      PRIVATE_KEYS.some((k) => (u as unknown as Record<string, unknown>)[k] !== undefined) ||
      (!!u.contacts?.email && !u.contacts?.showEmail)
  );

export function movePrivateUserData(): number {
  const list = usersWithPublicPrivateData();
  for (const u of list) saveUser({ ...u, ...(UP.get(u.id) ?? {}), ...pickPrivate(u) });
  return list.length;
}

function pickPrivate(u: User): Partial<User> {
  const out: Record<string, unknown> = {};
  for (const k of PRIVATE_KEYS) {
    const v = (u as unknown as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<User>;
}

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
    case 'ban_temp': {
      const untilMs = Date.now() + (opts.days ?? 7) * 86400000;
      next.status = 'banned_temp';
      next.banUntil = new Date(untilMs).toISOString();
      next.banUntilMs = untilMs;
      next.banReason = opts.reason;
      notify(id, 'ban', `Аккаунт заблокирован на ${opts.days ?? 7} дн.${why}`, { actorId: opts.moderatorId });
      break;
    }
    case 'ban_perm':
      next.status = 'banned_perm';
      next.banUntil = undefined;
      next.banUntilMs = undefined;
      next.banReason = opts.reason;
      notify(id, 'ban', `Аккаунт заблокирован навсегда${why}`, { actorId: opts.moderatorId });
      break;
    case 'clear':
      next.status = 'active';
      next.banUntil = undefined;
      next.banUntilMs = undefined;
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
  void cols.follows.set({ id: targetId, followers: next }).catch(() => undefined);
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
    name: (name.trim() || 'Новый плейлист').slice(0, 100),
    karaokeIds: karaokeId ? [karaokeId] : [],
    createdAt: new Date().toISOString(),
  };
  void PL.set(p).catch(() => undefined);
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
  if (p) PL.patch(playlistId, { name: (name.trim() || p.name).slice(0, 100) });
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

// ---------------- TUTORIAL ----------------

const localTutorials = () => localGet<Record<string, boolean>>(LOCAL_KEYS.TUTORIAL, {});

export function isTutorialSeen(userKey: string, page: string): boolean {
  const local = localTutorials();
  const user = userKey === 'guest' ? undefined : U.get(userKey);
  if (!user) return !!local[`${userKey}:${page}`];
  if (user.seenTutorials?.includes(page)) return true;
  if (local[`${userKey}:${page}`] || local[`guest:${page}`]) {
    markTutorialSeen(userKey, page);
    return true;
  }
  return false;
}

export function markTutorialSeen(userKey: string, page: string) {
  const user = userKey === 'guest' ? undefined : U.get(userKey);
  if (user) {
    if (!user.seenTutorials?.includes(page)) U.patch(user.id, { seenTutorials: [...(user.seenTutorials ?? []), page] });
    return;
  }
  const m = localTutorials();
  m[`${userKey}:${page}`] = true;
  localSet(LOCAL_KEYS.TUTORIAL, m);
}

export function resetTutorials(userKey: string) {
  const m = localTutorials();
  Object.keys(m).forEach((k) => (k.startsWith(userKey + ':') || k.startsWith('guest:')) && delete m[k]);
  localSet(LOCAL_KEYS.TUTORIAL, m);
  if (U.get(userKey)) U.patch(userKey, { seenTutorials: [] });
}

// ---------------- DOWNLOAD HISTORY ----------------

export function addDownloadRecord(record: DownloadRecord) {
  void DL.set(record).catch(() => undefined);
}

export function getDownloadHistory(userId: string | undefined): DownloadRecord[] {
  if (!userId) return [];
  return DL.all()
    .filter((d) => d.userId === userId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function deleteDownloadRecord(id: string) {
  DL.remove(id);
}
