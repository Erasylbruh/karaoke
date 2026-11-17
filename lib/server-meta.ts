import { cacheLife } from 'next/cache';
import { safeDecode, safeMediaUrl } from './format';

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'karaoke-craft';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
  PROJECT_ID
)}/databases/(default)/documents`;

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
  'https://karaokecraft.vercel.app'
).replace(/\/+$/, '');

interface FsValue {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  mapValue?: { fields?: Record<string, FsValue> };
  arrayValue?: { values?: FsValue[] };
}

const str = (f?: FsValue) => f?.stringValue ?? '';

export interface PublicTrackMeta {
  id: string;
  title: string;
  artist: string;
  description: string;
  visibility: string;
  status: string;
  coverImage?: string;
  createdAt?: string;
  tags: string[];
}

export async function fetchTrackMeta(rawId: string): Promise<PublicTrackMeta | null> {
  'use cache';
  cacheLife('minutes');
  const id = safeDecode(rawId);
  if (!id) return null;
  try {
    const res = await fetch(`${FIRESTORE_BASE}/karaokes/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const doc = (await res.json()) as { fields?: Record<string, FsValue> };
    const f = doc.fields;
    if (!f) return null;
    const status = str(f.status) || 'active';
    const visibility = str(f.visibility) || 'public';
    if (status !== 'active' || (visibility !== 'public' && visibility !== 'unlisted')) {
      return { id, title: '', artist: '', description: '', visibility: 'private', status, tags: [] };
    }
    const styleFields = f.style?.mapValue?.fields;
    const rawCover = str(styleFields?.coverImage);
    const coverImage = rawCover.startsWith('https://') ? safeMediaUrl(rawCover) : undefined;
    const tags = (f.tags?.arrayValue?.values ?? []).map((v) => str(v)).filter(Boolean);
    return {
      id,
      title: str(f.title),
      artist: str(f.artist),
      description: str(f.description),
      visibility,
      status,
      coverImage,
      createdAt: str(f.createdAt),
      tags,
    };
  } catch {
    return null;
  }
}

export async function fetchCatalogForSeo(): Promise<{
  tracks: PublicTrackMeta[];
  usernames: string[];
}> {
  'use cache';
  cacheLife('hours');
  const tracks: PublicTrackMeta[] = [];
  const usernames: string[] = [];
  try {
    const [kRes, uRes] = await Promise.all([
      fetch(`${FIRESTORE_BASE}:runQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'karaokes' }],
            where: {
              compositeFilter: {
                op: 'AND',
                filters: [
                  { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'active' } } },
                  { fieldFilter: { field: { fieldPath: 'visibility' }, op: 'EQUAL', value: { stringValue: 'public' } } },
                ],
              },
            },
            limit: 300,
          },
        }),
      }),
      fetch(`${FIRESTORE_BASE}/users?pageSize=200`),
    ]);

    if (kRes.ok) {
      const rows = (await kRes.json()) as Array<{ document?: { name?: string; fields?: Record<string, FsValue> } }>;
      for (const row of rows) {
        const f = row.document?.fields;
        if (!f) continue;
        const id = str(f.id) || row.document?.name?.split('/').pop() || '';
        if (!id) continue;
        const tags = (f.tags?.arrayValue?.values ?? []).map((v) => str(v)).filter(Boolean);
        tracks.push({
          id,
          title: str(f.title),
          artist: str(f.artist),
          description: str(f.description),
          visibility: 'public',
          status: 'active',
          createdAt: str(f.createdAt),
          tags,
        });
      }
    }

    if (uRes.ok) {
      const data = (await uRes.json()) as { documents?: Array<{ fields?: Record<string, FsValue> }> };
      for (const d of data.documents ?? []) {
        const tag = str(d.fields?.username).toLowerCase();
        if (tag && /^[a-z0-9_]{3,20}$/.test(tag)) usernames.push(tag);
      }
    }
  } catch {
    /* fallback to static routes if offline during build */
  }
  return { tracks, usernames: [...new Set(usernames)] };
}
