/**
 * Storage for large user uploads (audio, covers, custom fonts).
 *
 * Upload: the browser asks `/api/storage/upload` for a signed upload URL (the route checks the
 * Firebase ID token, a confirmed email and bans, and picks the path `{folder}/{uid}/{name}`), then
 * PUTs the file straight to Supabase. Only while the server key is not configured (HTTP 501) does it
 * fall back to the old direct upload with the publishable key, which needs the anonymous upload
 * policy from supabase/storage.dev.sql. Without a cloud upload the file stays in IndexedDB
 * (`idb:<id>`), visible in this browser only.
 *
 * Delete: `deleteCloudFiles` asks `/api/storage/delete` to remove files (own files, or any for admins).
 */
import { auth } from './firebase';
import { safeMediaUrl } from './format';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://alspedwglexctjkztcof.supabase.co').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_jypnDexN-2p-3V48-y2F8Q_Hhciy5lc';
const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'uploads';
export const supabaseConfigured = !!SUPABASE_URL && !!SUPABASE_KEY;

const PUBLIC_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const FOLDERS = ['audio', 'covers', 'fonts', 'uploads'];

/** Upload progress callback: share of the file sent, 0..1. */
export type UploadProgress = (share: number) => void;

/** The server refused the upload or deletion (sign-in, confirmed email, ban, format, size). */
export class StorageRefusedError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'StorageRefusedError';
  }
}

const EXT_MIMES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  webm: 'audio/webm',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Infers a strict MIME type when the browser leaves `file.type` empty (common for .ttf/.woff2). */
async function inferMimeType(file: Blob, folder: string): Promise<string> {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const named = (file as File).name;
  if (named) {
    const ext = named.split('.').pop()?.toLowerCase() || '';
    if (EXT_MIMES[ext]) return EXT_MIMES[ext];
  }
  if (file.size >= 4) {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    const tag = String.fromCharCode(...head);
    if (tag === 'wOFF') return 'font/woff';
    if (tag === 'wOF2') return 'font/woff2';
    if (tag === 'OTTO') return 'font/otf';
    if (tag === 'true' || (head[0] === 0 && head[1] === 1 && head[2] === 0 && head[3] === 0)) return 'font/ttf';
  }
  if (folder === 'covers') return 'image/jpeg';
  if (folder === 'fonts') return 'font/ttf';
  return 'audio/mpeg';
}

/** Headers for the browser's own calls to Supabase with the publishable key. */
function publicKeyHeaders(): Record<string, string> {
  if (!SUPABASE_KEY) return {};
  return SUPABASE_KEY.startsWith('sb_') ? { apikey: SUPABASE_KEY } : { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
}

type SignResult = { kind: 'ok'; uploadUrl: string; publicUrl: string } | { kind: 'unconfigured' } | { kind: 'error'; error: Error };

async function requestSignedUpload(folder: string, mimeType: string, size: number, idToken: string): Promise<SignResult> {
  let res: Response;
  try {
    res = await fetch('/api/storage/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder, contentType: mimeType, size }),
    });
  } catch {
    return { kind: 'error', error: new Error('Сеть недоступна') };
  }
  if (res.status === 501) return { kind: 'unconfigured' };
  const data = (await res.json().catch(() => ({}))) as { uploadUrl?: string; publicUrl?: string; error?: string };
  if (res.ok && data.uploadUrl && data.publicUrl) return { kind: 'ok', uploadUrl: data.uploadUrl, publicUrl: data.publicUrl };
  return { kind: 'error', error: new StorageRefusedError(data.error || `Upload HTTP ${res.status}`, res.status) };
}

/** Sends the file body to a Supabase URL with progress (signed upload: PUT; old direct upload: POST). */
function sendToSupabase(method: 'PUT' | 'POST', url: string, file: Blob, mimeType: string, onProgress?: UploadProgress): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [k, v] of Object.entries(publicKeyHeaders())) xhr.setRequestHeader(k, v);
    xhr.setRequestHeader('Content-Type', mimeType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Supabase ${xhr.status}: ${xhr.responseText.slice(0, 200)}`));
    xhr.onerror = () => reject(new Error('Сеть недоступна'));
    xhr.send(file);
  });
}

async function uploadCloudBlob(file: Blob, folder: string, onProgress?: UploadProgress): Promise<string> {
  const safeFolder = FOLDERS.includes(folder) ? folder : 'uploads';
  const mimeType = await inferMimeType(file, safeFolder);
  const currentUser = auth.currentUser;
  if (!currentUser) throw new StorageRefusedError('Войдите, чтобы загружать файлы', 401);

  const signed = await requestSignedUpload(safeFolder, mimeType, file.size, await currentUser.getIdToken());
  if (signed.kind === 'ok') {
    await sendToSupabase('PUT', signed.uploadUrl, file, mimeType, onProgress);
    return signed.publicUrl;
  }
  if (signed.kind === 'error') throw signed.error;

  // HTTP 501: SUPABASE_SERVICE_ROLE_KEY is not set on the server yet, so use the old direct upload.
  // It works only while the anonymous upload policy exists (supabase/storage.dev.sql).
  if (!supabaseConfigured) throw new Error('Supabase is not configured');
  const path = `${safeFolder}/${currentUser.uid}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await sendToSupabase('POST', `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, file, mimeType, onProgress);
  return PUBLIC_PREFIX + path;
}

/** True for a public URL of a file in this project's bucket. */
export function isCloudFileUrl(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith(PUBLIC_PREFIX);
}

/**
 * Deletes files from the bucket. Only the person's own files (or any file, for admins) are removed;
 * the rest come back in `refused`. Throws StorageRefusedError(501) while the server key is not set.
 */
export async function deleteCloudFiles(urls: Array<string | undefined | null>): Promise<{ deleted: number; refused: string[] }> {
  const list = [...new Set(urls.filter(isCloudFileUrl))];
  if (list.length === 0) return { deleted: 0, refused: [] };
  const currentUser = auth.currentUser;
  if (!currentUser) throw new StorageRefusedError('Нужно войти', 401);
  let res: Response;
  try {
    res = await fetch('/api/storage/delete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await currentUser.getIdToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: list }),
    });
  } catch {
    throw new Error('Сеть недоступна');
  }
  const data = (await res.json().catch(() => ({}))) as { deleted?: number; refused?: string[]; error?: string };
  if (res.status === 501) throw new StorageRefusedError('Удаление файлов ещё не настроено на сервере', 501);
  if (!res.ok) throw new StorageRefusedError(data.error || `Delete HTTP ${res.status}`, res.status);
  return { deleted: data.deleted ?? 0, refused: data.refused ?? [] };
}

/** False while the server can't delete files (no SUPABASE_SERVICE_ROLE_KEY); throws when unreachable. */
export async function storageDeletionAvailable(): Promise<boolean> {
  const res = await fetch('/api/storage/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: [] }),
  });
  if (res.status === 501) return false;
  if (!res.ok) throw new Error(`Delete check HTTP ${res.status}`);
  return true;
}

/** Deletes every file in the signed-in person's own storage folders (used when the account is deleted). */
export async function deleteAllMyFiles(): Promise<number> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new StorageRefusedError('Нужно войти', 401);
  const res = await fetch('/api/storage/delete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await currentUser.getIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ purgeOwn: true }),
  });
  const data = (await res.json().catch(() => ({}))) as { deleted?: number; error?: string };
  if (!res.ok) throw new StorageRefusedError(data.error || `Delete HTTP ${res.status}`, res.status);
  return data.deleted ?? 0;
}

const DB_NAME = 'karaokecraft_blobs';
const STORE = 'blobs';
const PREFIX = 'idb:';

const urlCache = new Map<string, string>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Removes every file kept only in this browser (used when the account is deleted). */
export function clearLocalBlobs(): Promise<void> {
  urlCache.forEach((url) => URL.revokeObjectURL(url));
  urlCache.clear();
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function isBlobRef(ref?: string): ref is string {
  return !!ref && ref.startsWith(PREFIX);
}

/**
 * Uploads to Supabase and returns the public URL; throws instead of falling back to this browser
 * (for files that must be visible to everyone, like covers and avatars).
 */
export async function uploadPublicFile(file: Blob, folder: string): Promise<string> {
  return uploadCloudBlob(file, folder);
}

export async function putBlob(file: Blob, folder = 'uploads', onProgress?: UploadProgress): Promise<string> {
  if (supabaseConfigured) {
    try {
      return await uploadCloudBlob(file, folder, onProgress);
    } catch (e) {
      // A final refusal (ban, unconfirmed email, account quota, format) is shown to the person as is;
      // keeping the file in this browser would only hide it.
      if (e instanceof StorageRefusedError && [403, 413, 415].includes(e.status)) throw e;
      console.warn('[storage] upload failed, keeping the file in this browser only:', e);
    }
  }
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return PREFIX + id;
}

export async function resolveBlobUrl(ref?: string): Promise<string | null> {
  if (!ref) return null;
  if (!isBlobRef(ref)) return safeMediaUrl(ref) ?? null;
  const cached = urlCache.get(ref);
  if (cached) return cached;
  try {
    const db = await openDb();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(ref.slice(PREFIX.length));
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlCache.set(ref, url);
    return url;
  } catch {
    return null;
  }
}

export async function uploadLocalBlob(ref: string | undefined, folder = 'uploads'): Promise<string | null> {
  if (!isBlobRef(ref) || !supabaseConfigured) return null;
  const blob = await getBlob(ref);
  if (!blob) return null;
  try {
    return await uploadCloudBlob(blob, folder);
  } catch (e) {
    console.warn('[storage] could not move a local file to Supabase:', e);
    return null;
  }
}

export async function getBlob(ref?: string): Promise<Blob | null> {
  const url = await resolveBlobUrl(ref);
  if (!url) return null;
  try {
    return await (await fetch(url)).blob();
  } catch {
    return null;
  }
}
