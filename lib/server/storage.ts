/**
 * Server side of file storage (used by app/api/storage/upload and app/api/storage/delete). Never import it from client
 * code: it reads SUPABASE_SERVICE_ROLE_KEY.
 *
 * Uploads: the browser asks POST /api/storage/upload for a one-time signed upload URL and then
 * PUTs the file straight to Supabase, so files never pass through Vercel (its functions accept
 * request bodies of a few MB only). The route checks the Firebase ID token, a confirmed email and
 * the ban status first, and it alone picks the object path: `{folder}/{uid}/{name}`.
 *
 * Deleting: POST /api/storage/delete removes the caller's own files (the uid in the path) or, for
 * admins, any file in the bucket's known folders.
 *
 * No path aliases and no Next imports here, so the module can be tested with plain Node.
 */

const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'karaoke-craft';
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBIPxWfy5kQVl-VRNgBdceiT_Xh0MYzP58';
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://alspedwglexctjkztcof.supabase.co').replace(/\/+$/, '');
export const SUPABASE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'uploads';

export const UPLOAD_FOLDERS = ['audio', 'covers', 'fonts', 'uploads'] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

const ALLOWED_MIMES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/opus',
  'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/flac', 'audio/x-flac', 'audio/webm',
  'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
  'application/font-woff', 'application/font-woff2', 'application/x-font-ttf', 'application/x-font-opentype',
  'image/jpeg', 'image/png', 'image/webp',
]);

/** Declared-size limits per folder. The bucket's own file_size_limit (40 MB) is what Supabase enforces. */
const FOLDER_MAX_BYTES: Record<UploadFolder, number> = {
  audio: 40 * 1024 * 1024,
  uploads: 40 * 1024 * 1024,
  covers: 5 * 1024 * 1024,
  fonts: 2 * 1024 * 1024,
};

/** `{folder}/{owner uid or "anon"}/{name}`: the only object paths these routes create or delete. */
const OBJECT_PATH = /^(audio|covers|fonts|uploads)\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9._-]{1,200})$/;

const json = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (error: string, status: number) => json({ error }, status);

const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

/** New `sb_secret_…` keys go in `apikey` only (they are not JWTs); legacy service_role JWTs also need Bearer. */
function serviceHeaders(key: string): Record<string, string> {
  return key.startsWith('sb_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}

function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

const isFolder = (value: unknown): value is UploadFolder =>
  typeof value === 'string' && (UPLOAD_FOLDERS as readonly string[]).includes(value);

interface Account {
  uid: string;
  emailVerified: boolean;
}
interface Failure {
  error: string;
  status: number;
}

/** Checks a Firebase ID token with Identity Toolkit (accounts:lookup), which also reports the email state. */
async function verifyFirebaseToken(idToken: string): Promise<Account | Failure> {
  if (!idToken) return { error: 'Требуется вход в аккаунт', status: 401 };
  let res: Response;
  try {
    res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
      cache: 'no-store',
    });
  } catch {
    return { error: 'Не удалось проверить вход, попробуйте позже', status: 503 };
  }
  if (!res.ok) return { error: 'Сессия устарела: выйдите и войдите снова', status: 401 };
  const body = (await res.json().catch(() => ({}))) as {
    users?: Array<{ localId?: string; disabled?: boolean; emailVerified?: boolean }>;
  };
  const account = body.users?.[0];
  if (!account?.localId || account.disabled) return { error: 'Аккаунт недоступен', status: 403 };
  return { uid: account.localId, emailVerified: account.emailVerified === true };
}

interface PublicProfile {
  role?: string;
  status?: string;
  banUntilMs?: number;
  uid?: string;
}

type FsField = { stringValue?: string; integerValue?: string; doubleValue?: number };

/** Reads the public profile users/{uid}: null when there is none, 'error' when it could not be read. */
async function readProfile(uid: string): Promise<PublicProfile | null | 'error'> {
  const fields = ['role', 'status', 'banUntilMs', 'uid'].map((f) => `mask.fieldPaths=${f}`).join('&');
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/(default)/documents/users/${encodeURIComponent(uid)}?${fields}`,
      { cache: 'no-store' }
    );
    if (res.status === 404) return null;
    if (!res.ok) return 'error';
    const doc = (await res.json()) as { fields?: Record<string, FsField> };
    const f = doc.fields ?? {};
    const ms = f.banUntilMs?.integerValue ?? f.banUntilMs?.doubleValue;
    return {
      role: f.role?.stringValue,
      status: f.status?.stringValue,
      banUntilMs: ms === undefined ? undefined : Number(ms),
      uid: f.uid?.stringValue,
    };
  } catch {
    return 'error';
  }
}

/** Same reading of a ban as firestore.rules: a temporary ban without an end date counts as active. */
function banError(profile: PublicProfile | null): string | null {
  if (!profile) return null;
  if (profile.status === 'banned_perm') return 'Аккаунт заблокирован';
  if (profile.status === 'banned_temp' && (profile.banUntilMs === undefined || profile.banUntilMs > Date.now())) {
    return 'Аккаунт временно заблокирован';
  }
  return null;
}

const isAdminProfile = (profile: PublicProfile | null | 'error', uid: string) =>
  !!profile && profile !== 'error' && profile.role === 'admin' && (!profile.uid || profile.uid === uid);

/** The object path of a public file URL from this bucket, or null for anything else. */
export function objectFromPublicUrl(url: unknown): { path: string; owner: string } | null {
  const prefix = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/`;
  if (typeof url !== 'string' || !url.startsWith(prefix)) return null;
  let path: string;
  try {
    path = decodeURIComponent(url.slice(prefix.length).split(/[?#]/)[0]);
  } catch {
    return null;
  }
  const match = OBJECT_PATH.exec(path);
  return match ? { path, owner: match[2] } : null;
}

/** Turns the `url` from Supabase's sign answer into an absolute URL on the project's own origin. */
function absoluteSignedUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  const origin = new URL(SUPABASE_URL).origin;
  let url: URL;
  try {
    if (/^https?:\/\//.test(raw)) url = new URL(raw);
    else if (raw.startsWith('/storage/v1/')) url = new URL(origin + raw);
    else url = new URL(`${SUPABASE_URL}/storage/v1${raw.startsWith('/') ? '' : '/'}${raw}`);
  } catch {
    return null;
  }
  return url.origin === origin && url.searchParams.get('token') ? url.toString() : null;
}

/** POST /api/storage/upload — body `{ folder, contentType, size }`, answer `{ uploadUrl, publicUrl }`. */
export async function signUpload(request: Request): Promise<Response> {
  const key = serviceKey();
  // 501 tells the client the server key is not set yet, so it may use the old direct upload.
  if (!key) return fail('service_key_not_configured', 501);

  let body: { folder?: unknown; contentType?: unknown; size?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail('Некорректный запрос', 400);
  }
  const folder = body.folder ?? 'uploads';
  if (!isFolder(folder)) return fail('Недопустимая папка загрузки', 400);
  const contentType = typeof body.contentType === 'string' ? body.contentType.split(';')[0].trim().toLowerCase() : '';
  if (!ALLOWED_MIMES.has(contentType)) return fail('Недопустимый формат файла', 415);
  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) return fail('Недопустимый размер файла', 400);
  if (size > FOLDER_MAX_BYTES[folder]) return fail('Файл превышает допустимый размер', 413);

  const account = await verifyFirebaseToken(bearerToken(request));
  if ('error' in account) return fail(account.error, account.status);
  if (!account.emailVerified) return fail('Подтвердите email, чтобы загружать файлы', 403);

  const profile = await readProfile(account.uid);
  if (profile === 'error') return fail('Не удалось проверить аккаунт, попробуйте позже', 503);
  const ban = banError(profile);
  if (ban) return fail(ban, 403);

  const objectPath = `${folder}/${account.uid}/${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/${SUPABASE_BUCKET}/${objectPath}`, {
      method: 'POST',
      headers: { ...serviceHeaders(key), 'Content-Type': 'application/json' },
      body: '{}',
      cache: 'no-store',
    });
  } catch {
    return fail('Хранилище недоступно, попробуйте позже', 502);
  }
  if (!res.ok) return fail(`Хранилище отказало (${res.status})`, 502);
  const data = (await res.json().catch(() => ({}))) as { url?: unknown };
  const uploadUrl = absoluteSignedUrl(data.url);
  if (!uploadUrl) return fail('Хранилище не выдало ссылку для загрузки', 502);

  return json({
    uploadUrl,
    publicUrl: `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${objectPath}`,
    contentType,
  });
}

/** Deletes object paths in chunks of 100. False when Supabase refused or could not be reached. */
async function removePaths(key: string, paths: string[]): Promise<boolean> {
  for (let i = 0; i < paths.length; i += 100) {
    try {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}`, {
        method: 'DELETE',
        headers: { ...serviceHeaders(key), 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: paths.slice(i, i + 100) }),
        cache: 'no-store',
      });
      if (!res.ok) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** Every file in the caller's own folders (`{folder}/{uid}/…`), or null when listing failed. */
async function listOwnObjects(key: string, uid: string): Promise<string[] | null> {
  const paths: string[] = [];
  for (const folder of UPLOAD_FOLDERS) {
    const prefix = `${folder}/${uid}`;
    for (let offset = 0; offset < 10000; offset += 100) {
      let items: Array<{ name?: string; id?: string | null }> | null;
      try {
        const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${SUPABASE_BUCKET}`, {
          method: 'POST',
          headers: { ...serviceHeaders(key), 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }),
          cache: 'no-store',
        });
        if (!res.ok) return null;
        items = await res.json().catch(() => null);
      } catch {
        return null;
      }
      if (!Array.isArray(items)) return null;
      // Folders come back with id null; only files are deleted, and only valid {folder}/{uid}/{name} paths.
      for (const it of items) {
        const path = `${prefix}/${it.name}`;
        if (it.id && it.name && OBJECT_PATH.test(path)) paths.push(path);
      }
      if (items.length < 100) break;
    }
  }
  return paths;
}

/**
 * POST /api/storage/delete
 * - `{ urls: string[] }` → deletes those files (own, or any for admins); answer `{ deleted, refused }`.
 *   An empty list just answers 200, or 501 while the server key is missing (clients use it as a check).
 * - `{ purgeOwn: true }` → deletes every file in the caller's own folders (account deletion).
 */
export async function deleteObjects(request: Request): Promise<Response> {
  const key = serviceKey();
  if (!key) return fail('service_key_not_configured', 501);

  let body: { urls?: unknown; purgeOwn?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail('Некорректный запрос', 400);
  }

  if (body.purgeOwn === true) {
    const account = await verifyFirebaseToken(bearerToken(request));
    if ('error' in account) return fail(account.error, account.status);
    const paths = await listOwnObjects(key, account.uid);
    if (!paths) return fail('Не удалось получить список файлов в хранилище', 502);
    if (!(await removePaths(key, paths))) return fail('Хранилище не удалило файлы, попробуйте позже', 502);
    return json({ deleted: paths.length, refused: [] });
  }

  const urls = Array.isArray(body.urls) ? body.urls.filter((u): u is string => typeof u === 'string').slice(0, 50) : [];
  if (urls.length === 0) return json({ deleted: 0, refused: [] });

  const account = await verifyFirebaseToken(bearerToken(request));
  if ('error' in account) return fail(account.error, account.status);

  const targets = urls.map((url) => ({ url, object: objectFromPublicUrl(url) }));
  const othersFiles = targets.some((t) => t.object && t.object.owner !== account.uid);
  const admin = othersFiles && isAdminProfile(await readProfile(account.uid), account.uid);

  const paths: string[] = [];
  const refused: string[] = [];
  for (const t of targets) {
    if (t.object && (t.object.owner === account.uid || admin)) paths.push(t.object.path);
    else refused.push(t.url);
  }
  const unique = [...new Set(paths)];
  if (unique.length > 0 && !(await removePaths(key, unique))) {
    return fail('Хранилище не удалило файлы, попробуйте позже', 502);
  }
  return json({ deleted: unique.length, refused });
}
