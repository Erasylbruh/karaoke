/**
 * Storage for large user uploads (audio, fonts).
 *
 * Files go to a public Supabase Storage bucket and the public URL is stored on the karaoke.
 * If Supabase is not configured (no NEXT_PUBLIC_SUPABASE_* env) or the upload fails, the file falls
 * back to this browser's IndexedDB with an `idb:<id>` reference, which only this browser can play.
 */
import { auth } from './firebase';

// Defaults keep uploads working when the hosting has no env vars set (that is how files ended up
// only in the author's browser). A publishable key is public by design, like the Firebase config:
// the bucket's policies decide what it may do (insert + public read only).
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://alspedwglexctjkztcof.supabase.co').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_jypnDexN-2p-3V48-y2F8Q_Hhciy5lc';
const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'uploads';
export const supabaseConfigured = !!SUPABASE_URL && !!SUPABASE_KEY;

/** Upload progress callback: share of the file sent, 0..1. */
export type UploadProgress = (share: number) => void;

/**
 * Uploads through the Storage REST API and returns the public URL.
 * XMLHttpRequest instead of fetch, because only it reports upload progress.
 */
function uploadToSupabase(file: Blob, path: string, onProgress?: UploadProgress): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`);
    xhr.setRequestHeader('apikey', SUPABASE_KEY);
    // New-style keys (sb_publishable_…) are not JWTs and go in `apikey` only; legacy anon keys also need the Bearer header.
    if (!SUPABASE_KEY.startsWith('sb_')) xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_KEY}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
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
 * (for files that must be visible to everyone, like covers).
 */
export async function uploadPublicFile(file: Blob, folder: string): Promise<string> {
  if (!supabaseConfigured) throw new Error('Supabase is not configured');
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return uploadToSupabase(file, `${folder}/${auth.currentUser?.uid ?? 'anon'}/${name}`);
}

export async function putBlob(file: Blob, folder = 'uploads', onProgress?: UploadProgress): Promise<string> {
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  if (supabaseConfigured) {
    try {
      return await uploadToSupabase(file, `${folder}/${auth.currentUser?.uid ?? 'anon'}/${name}`, onProgress);
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
  if (!isBlobRef(ref)) return ref; // plain URL / data URL
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

/**
 * Moves a file that only lives in this browser (`idb:` ref) to Supabase and returns the public
 * URL, or null when there is nothing to move (not a local ref, file not in this browser, or the
 * upload failed).
 */
export async function uploadLocalBlob(ref: string | undefined, folder = 'uploads'): Promise<string | null> {
  if (!isBlobRef(ref) || !supabaseConfigured) return null;
  const blob = await getBlob(ref);
  if (!blob) return null;
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    return await uploadToSupabase(blob, `${folder}/${auth.currentUser?.uid ?? 'anon'}/${name}`);
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
