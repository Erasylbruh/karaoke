/**
 * Storage for large user uploads (audio, fonts).
 *
 * Files go to a public Supabase Storage bucket and the public URL is stored on the karaoke.
 * If Supabase is not configured (no NEXT_PUBLIC_SUPABASE_* env) or the upload fails, the file falls
 * back to this browser's IndexedDB with an `idb:<id>` reference, which only this browser can play.
 */
import { auth } from './firebase';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'uploads';
export const supabaseConfigured = !!SUPABASE_URL && !!SUPABASE_KEY;

/** Uploads through the Storage REST API and returns the public URL. */
async function uploadToSupabase(file: Blob, path: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'false',
    },
    body: file,
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
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

export async function putBlob(file: Blob, folder = 'uploads'): Promise<string> {
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  if (supabaseConfigured) {
    try {
      return await uploadToSupabase(file, `${folder}/${auth.currentUser?.uid ?? 'anon'}/${name}`);
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

export async function getBlob(ref?: string): Promise<Blob | null> {
  const url = await resolveBlobUrl(ref);
  if (!url) return null;
  try {
    return await (await fetch(url)).blob();
  } catch {
    return null;
  }
}
