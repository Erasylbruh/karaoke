/**
 * Storage for large user uploads (audio, covers, custom fonts).
 *
 * Preferred path: authenticated server upload via `/api/storage/upload` (verifies Firebase ID token
 * and writes with SUPABASE_SERVICE_ROLE_KEY). When the server key is not set yet (HTTP 501), falls
 * back to direct Supabase upload with the publishable key, or to IndexedDB (`idb:<id>`) offline.
 */
import { auth } from './firebase';
import { safeMediaUrl } from './format';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://alspedwglexctjkztcof.supabase.co').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_jypnDexN-2p-3V48-y2F8Q_Hhciy5lc';
const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'uploads';
export const supabaseConfigured = !!SUPABASE_URL && !!SUPABASE_KEY;

/** Upload progress callback: share of the file sent, 0..1. */
export type UploadProgress = (share: number) => void;

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

type ServerUploadResult = { kind: 'ok'; url: string } | { kind: 'unconfigured' } | { kind: 'error'; error: Error };

function uploadViaServerRoute(
  file: Blob,
  folder: string,
  mimeType: string,
  idToken: string,
  onProgress?: UploadProgress
): Promise<ServerUploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/storage/upload?folder=${encodeURIComponent(folder)}`);
    xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);
    xhr.setRequestHeader('Content-Type', mimeType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status === 501) return resolve({ kind: 'unconfigured' });
      try {
        const data = JSON.parse(xhr.responseText) as { url?: string; error?: string };
        if (xhr.status >= 200 && xhr.status < 300 && data.url) {
          return resolve({ kind: 'ok', url: data.url });
        }
        return resolve({ kind: 'error', error: new Error(data.error || `Upload HTTP ${xhr.status}`) });
      } catch {
        return resolve({ kind: 'error', error: new Error(`Upload HTTP ${xhr.status}`) });
      }
    };
    xhr.onerror = () => resolve({ kind: 'error', error: new Error('Сеть недоступна') });
    xhr.send(file);
  });
}

function uploadDirectToSupabase(file: Blob, path: string, mimeType: string, onProgress?: UploadProgress): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`);
    xhr.setRequestHeader('apikey', SUPABASE_KEY);
    if (!SUPABASE_KEY.startsWith('sb_')) xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_KEY}`);
    xhr.setRequestHeader('Content-Type', mimeType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`)
        : reject(new Error(`Supabase ${xhr.status}: ${xhr.responseText.slice(0, 200)}`));
    xhr.onerror = () => reject(new Error('Сеть недоступна'));
    xhr.send(file);
  });
}

async function uploadCloudBlob(file: Blob, folder: string, onProgress?: UploadProgress): Promise<string> {
  const safeFolder = ['audio', 'covers', 'fonts', 'uploads'].includes(folder) ? folder : 'uploads';
  const mimeType = await inferMimeType(file, safeFolder);
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const token = await currentUser.getIdToken();
      const serverRes = await uploadViaServerRoute(file, safeFolder, mimeType, token, onProgress);
      if (serverRes.kind === 'ok') return serverRes.url;
      if (serverRes.kind === 'error') throw serverRes.error;
    } catch (e) {
      // Only rethrow auth/ban rejections; fall back if route is unreachable in static export/dev.
      if (e instanceof Error && /заблокирован|вход|формат|размер/i.test(e.message)) throw e;
    }
  }
  if (!supabaseConfigured) throw new Error('Supabase is not configured');
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return uploadDirectToSupabase(file, `${safeFolder}/${currentUser?.uid ?? 'anon'}/${name}`, mimeType, onProgress);
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
