import { NextRequest } from 'next/server';

const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'karaoke-craft';
const FIREBASE_API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBIPxWfy5kQVl-VRNgBdceiT_Xh0MYzP58';
const SUPABASE_URL = (
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://alspedwglexctjkztcof.supabase.co'
).replace(/\/+$/, '');
const SUPABASE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'uploads';

const ALLOWED_FOLDERS = new Set(['audio', 'covers', 'fonts', 'uploads']);

const ALLOWED_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/ogg',
  'audio/opus',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/flac',
  'audio/x-flac',
  'audio/webm',
  'font/ttf',
  'font/otf',
  'font/woff',
  'font/woff2',
  'application/font-woff',
  'application/font-woff2',
  'application/x-font-ttf',
  'application/x-font-opentype',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const FOLDER_MAX_BYTES: Record<string, number> = {
  audio: 40 * 1024 * 1024,
  uploads: 40 * 1024 * 1024,
  covers: 5 * 1024 * 1024,
  fonts: 2 * 1024 * 1024,
};

async function verifyFirebaseUser(idToken: string): Promise<{ uid: string } | { error: string; status: number }> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
      cache: 'no-store',
    }
  );
  if (!res.ok) return { error: 'Недействительный токен авторизации', status: 401 };
  const body = (await res.json()) as {
    users?: Array<{ localId?: string; disabled?: boolean }>;
  };
  const account = body.users?.[0];
  if (!account?.localId || account.disabled) {
    return { error: 'Аккаунт недоступен', status: 403 };
  }

  // Check Firestore profile ban status before accepting uploads.
  try {
    const profRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        FIREBASE_PROJECT_ID
      )}/databases/(default)/documents/users/${encodeURIComponent(account.localId)}`,
      { cache: 'no-store' }
    );
    if (profRes.ok) {
      const doc = (await profRes.json()) as {
        fields?: {
          status?: { stringValue?: string };
          banUntil?: { stringValue?: string };
        };
      };
      const st = doc.fields?.status?.stringValue;
      const until = doc.fields?.banUntil?.stringValue;
      if (st === 'banned_perm') {
        return { error: 'Аккаунт заблокирован', status: 403 };
      }
      if (st === 'banned_temp' && until && new Date(until).getTime() > Date.now()) {
        return { error: 'Аккаунт временно заблокирован', status: 403 };
      }
    }
  } catch {
    // Allow if profile read fails transiently; IdentityToolkit already verified the account.
  }

  return { uid: account.localId };
}

export async function POST(request: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) {
    return Response.json({ error: 'service_key_not_configured' }, { status: 501 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return Response.json({ error: 'Требуется вход в аккаунт' }, { status: 401 });
  }

  const folder = (request.nextUrl.searchParams.get('folder') || 'uploads').trim();
  if (!ALLOWED_FOLDERS.has(folder)) {
    return Response.json({ error: 'Недопустимая папка загрузки' }, { status: 400 });
  }

  const contentType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_MIMES.has(contentType)) {
    return Response.json({ error: 'Недопустимый формат файла' }, { status: 415 });
  }

  const maxBytes = FOLDER_MAX_BYTES[folder] ?? 40 * 1024 * 1024;
  const declaredLen = Number(request.headers.get('content-length') || '0');
  if (declaredLen > maxBytes) {
    return Response.json({ error: 'Файл превышает допустимый размер' }, { status: 413 });
  }

  const verified = await verifyFirebaseUser(token);
  if ('error' in verified) {
    return Response.json({ error: verified.error }, { status: verified.status });
  }

  const buffer = await request.arrayBuffer();
  if (buffer.byteLength === 0 || buffer.byteLength > maxBytes) {
    return Response.json({ error: 'Недопустимый размер файла' }, { status: 413 });
  }

  const name = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const objectPath = `${folder}/${verified.uid}/${name}`;

  const headers: Record<string, string> = {
    apikey: serviceKey,
    'Content-Type': contentType,
    'x-upsert': 'false',
  };
  if (!serviceKey.startsWith('sb_')) {
    headers.Authorization = `Bearer ${serviceKey}`;
  }

  const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${objectPath}`, {
    method: 'POST',
    headers,
    body: buffer,
  });

  if (!upRes.ok) {
    const errText = (await upRes.text()).slice(0, 200);
    return Response.json({ error: `Ошибка хранилища (${upRes.status}): ${errText}` }, { status: 502 });
  }

  return Response.json({
    url: `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${objectPath}`,
  });
}
