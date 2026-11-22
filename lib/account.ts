/**
 * Account-level Firestore operations: @tag reservations (`usernames/{tag}`), the record of accepted
 * terms (`userPrivate/{uid}.termsVersion` / `consentAt`) and full account deletion.
 *
 * firestore.rules let a profile carry a tag only while `usernames/{tag}` belongs to its owner, so a
 * tag is always reserved before the profile is written.
 */
import { EmailAuthProvider, deleteUser, reauthenticateWithCredential } from 'firebase/auth';
import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { clearLocalBlobs, deleteAllMyFiles, storageDeletionAvailable } from './blob-store';
import { CONTACT_EMAIL, LEGAL_VERSION } from './legal';

export type ClaimResult = 'ok' | 'taken' | 'error';

const TAG_RE = /^[a-z0-9_]{3,20}$/;
const MODERATION_TYPES = ['warning', 'ban'];

/** Reserves `usernames/{tag}` for `uid` (no-op when it is already theirs). */
export async function reserveUsername(tag: string, uid: string): Promise<ClaimResult> {
  if (!TAG_RE.test(tag)) return 'error';
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'usernames', tag);
      const snap = await tx.get(ref);
      if (snap.exists()) {
        if (snap.data()?.uid !== uid) throw new Error('TAKEN');
        return;
      }
      tx.set(ref, { uid });
    });
    return 'ok';
  } catch (e) {
    return e instanceof Error && e.message === 'TAKEN' ? 'taken' : 'error';
  }
}

/** Frees a tag the person no longer uses. Best effort: a leftover reservation only blocks the tag. */
export async function releaseUsername(tag: string, uid: string): Promise<void> {
  try {
    const ref = doc(db, 'usernames', tag);
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data()?.uid === uid) await deleteDoc(ref);
  } catch {
    /* ignore */
  }
}

/** Records that the signed-in person accepted the current terms and privacy policy. */
export async function recordConsent(uid: string): Promise<boolean> {
  try {
    await setDoc(
      doc(db, 'userPrivate', uid),
      { id: uid, termsVersion: LEGAL_VERSION, consentAt: new Date().toISOString() },
      { merge: true }
    );
    return true;
  } catch (e) {
    console.warn('[consent] could not record acceptance', e);
    return false;
  }
}

/**
 * Admin: creates `usernames/{tag}` for profiles registered before reservations existed, so nobody
 * can take their tag. Tags already reserved by someone else come back in `conflicts`.
 */
export async function backfillUsernameReservations(
  users: Array<{ id: string; uid?: string; username: string }>
): Promise<{ created: number; conflicts: string[] }> {
  const snap = await getDocs(collection(db, 'usernames'));
  const owners = new Map(snap.docs.map((d) => [d.id, String(d.data().uid ?? '')]));
  let created = 0;
  const conflicts: string[] = [];
  for (const u of users) {
    const tag = (u.username || '').toLowerCase();
    const owner = u.uid || u.id;
    if (!TAG_RE.test(tag)) continue;
    const current = owners.get(tag);
    if (current === owner) continue;
    if (current) {
      conflicts.push(tag);
      continue;
    }
    try {
      await setDoc(doc(db, 'usernames', tag), { uid: owner });
      owners.set(tag, owner);
      created++;
    } catch {
      conflicts.push(tag);
    }
  }
  return { created, conflicts };
}

let deleting = false;
/** True while deleteAccountCompletely runs: AuthContext must not re-save the profile or email meanwhile. */
export const accountDeletionInProgress = () => deleting;

export class AccountDeleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountDeleteError';
  }
}

const code = (e: unknown) => String((e as { code?: string })?.code ?? '');
const contactHint = `Если не получится, напишите на ${CONTACT_EMAIL}, и мы удалим аккаунт вручную.`;

/**
 * Deletes the account and everything it owns: files in storage, tracks, reviews (and replies to
 * them), playlists, likes, follows, notifications, download history, stats, the tag, the profile,
 * the private data and finally the Firebase Auth account.
 *
 * The first deletion is one that only the current firestore.rules allow, so with outdated rules
 * nothing is removed. Every step is safe to repeat; on failure the error names the step.
 */
export async function deleteAccountCompletely(opts: {
  password: string;
  profileId: string;
  onStep?: (label: string) => void;
}): Promise<void> {
  const account = auth.currentUser;
  if (!account?.email) throw new AccountDeleteError('Нужно войти в аккаунт');
  const uid = account.uid;
  if (opts.profileId !== uid) {
    throw new AccountDeleteError(`Этот профиль связан со старой учётной записью. Напишите на ${CONTACT_EMAIL}, и мы удалим его вручную.`);
  }
  const step = (label: string) => opts.onStep?.(label);
  const run = async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
    step(label);
    try {
      return await fn();
    } catch (e) {
      if (e instanceof AccountDeleteError) throw e;
      const detail = e instanceof Error ? e.message : String(e);
      throw new AccountDeleteError(`Не удалось выполнить шаг «${label}» (${detail}). Повторите попытку. ${contactHint}`);
    }
  };

  step('Проверяем пароль');
  try {
    await reauthenticateWithCredential(account, EmailAuthProvider.credential(account.email, opts.password));
  } catch (e) {
    const c = code(e);
    if (c.includes('wrong-password') || c.includes('invalid-credential')) throw new AccountDeleteError('Неверный пароль');
    if (c.includes('too-many-requests')) throw new AccountDeleteError('Слишком много попыток, попробуйте позже');
    throw new AccountDeleteError('Не удалось проверить пароль. Проверьте подключение и попробуйте снова');
  }

  deleting = true;
  try {
    await deleteEverything(uid, step, run);
  } catch (e) {
    deleting = false;
    throw e;
  }

  step('Удаляем учётную запись');
  try {
    await deleteUser(account);
  } catch {
    deleting = false;
    throw new AccountDeleteError(`Данные удалены, но не удалось закрыть учётную запись входа. Войдите снова и повторите удаление. ${contactHint}`);
  }
}

async function deleteEverything(
  uid: string,
  step: (label: string) => void,
  run: <T>(label: string, fn: () => Promise<T>) => Promise<T>
): Promise<void> {
  // Nothing is deleted until both checks pass: the server can delete files (SUPABASE_SERVICE_ROLE_KEY is
  // set) and the current rules are published.
  step('Проверяем хранилище');
  let storageReady: boolean;
  try {
    storageReady = await storageDeletionAvailable();
  } catch {
    throw new AccountDeleteError(`Не удалось связаться с сервером. Проверьте подключение. ${contactHint}`);
  }
  if (!storageReady) throw new AccountDeleteError(`Удаление аккаунта пока недоступно: на сервере не настроено удаление файлов. ${contactHint}`);

  // Allowed only by the current rules: with outdated rules deletion stops here, before any data is gone.
  step('Проверяем доступ');
  try {
    await deleteDoc(doc(db, 'follows', uid));
  } catch (e) {
    if (code(e).includes('permission-denied')) {
      throw new AccountDeleteError(`Удаление аккаунта временно недоступно: сервер ещё не обновлён. ${contactHint}`);
    }
    throw new AccountDeleteError(`Не удалось связаться с сервером. Проверьте подключение. ${contactHint}`);
  }

  const tracks = await run('Ищем ваши караоке', async () =>
    (await getDocs(query(collection(db, 'karaokes'), where('authorId', '==', uid)))).docs
  );

  // Every file in the person's own folders: track audio, covers and fonts, the avatar, and also replaced
  // pictures or uploads no track points to any more.
  await run('Удаляем файлы', () => deleteAllMyFiles());

  await run('Удаляем караоке', async () => {
    for (const d of tracks) await deleteDoc(d.ref);
  });

  await run('Удаляем отзывы', async () => {
    const mine = (await getDocs(query(collection(db, 'comments'), where('userId', '==', uid)))).docs;
    // Replies to the person's reviews go first: the rules look up the parent review to allow it.
    for (const c of mine.filter((d) => !d.data().parentId)) {
      const replies = (await getDocs(query(collection(db, 'comments'), where('parentId', '==', c.id)))).docs;
      for (const r of replies) if (r.data().userId !== uid) await deleteDoc(r.ref);
    }
    for (const c of mine) await deleteDoc(c.ref);
  });

  await run('Удаляем плейлисты, лайки и историю', async () => {
    for (const p of (await getDocs(query(collection(db, 'playlists'), where('ownerId', '==', uid)))).docs) await deleteDoc(p.ref);
    await deleteDoc(doc(db, 'likes', uid));
    for (const d of (await getDocs(query(collection(db, 'downloads'), where('userId', '==', uid)))).docs) await deleteDoc(d.ref);
    for (const e of (await getDocs(query(collection(db, 'events'), where('authorId', '==', uid)))).docs) await deleteDoc(e.ref);
  });

  await run('Удаляем подписки', async () => {
    const following = (await getDocs(query(collection(db, 'follows'), where('followers', 'array-contains', uid)))).docs;
    for (const f of following) await updateDoc(f.ref, { followers: arrayRemove(uid) });
  });

  const notifications = await run('Удаляем уведомления', async () => {
    const all = (await getDocs(query(collection(db, 'notifications'), where('userId', '==', uid)))).docs;
    for (const n of all) if (!MODERATION_TYPES.includes(n.data().type)) await deleteDoc(n.ref);
    return all.filter((n) => MODERATION_TYPES.includes(n.data().type));
  });

  await run('Освобождаем тег', async () => {
    for (const t of (await getDocs(query(collection(db, 'usernames'), where('uid', '==', uid)))).docs) await deleteDoc(t.ref);
  });

  // The profile goes before the private data: while a profile exists, the app may write the email back.
  await run('Удаляем профиль', () => deleteDoc(doc(db, 'users', uid)));

  // Moderation notices can be removed only once the profile is gone (the rules check that).
  for (const n of notifications) await deleteDoc(n.ref).catch(() => undefined);

  await run('Удаляем личные данные', async () => {
    const ref = doc(db, 'userPrivate', uid);
    await deleteDoc(ref);
    // A save that was already on its way could have recreated it: check once more.
    if ((await getDoc(ref)).exists()) await deleteDoc(ref);
  });

  await clearLocalBlobs();
}
