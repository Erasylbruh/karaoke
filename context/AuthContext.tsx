'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  verifyBeforeUpdateEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { auth, db } from '../lib/firebase';
import { User } from '../lib/types';
import {
  saveUser,
  saveUserAsync,
  getUserByUid,
  validateUsername,
  normalizeUsername,
  effectiveStatus,
  privateProfileLoaded,
  isUsernameFree,
  getKaraokesByAuthor,
  updateKaraoke,
  uid as shortId,
} from '../lib/storage';
import { cols, ownProfileSettled, setSyncScope } from '../lib/store';
import { accountDeletionInProgress, deleteAccountCompletely, recordConsent, releaseUsername, reserveUsername } from '../lib/account';
import { useDataVersion } from '../components/DataProvider';

export type AuthResult = { ok: true } | { ok: false; error: string };

interface RegisterData {
  username: string;
  name: string;
  email: string;
  password: string;
  /** The person ticked acceptance of the terms and consent to personal data processing. */
  consent: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  /** Opens the shared "sign in / register" popup. `reason` is shown above the buttons. */
  openAuthPrompt: (reason?: string) => void;
  authPrompt: { open: boolean; reason?: string };
  closeAuthPrompt: () => void;
  login: (identifier: string, password: string) => Promise<AuthResult>;
  register: (data: RegisterData) => Promise<AuthResult>;
  logout: () => void;
  /** Saves profile fields other than the tag (use changeUsername for that). */
  updateProfile: (data: Partial<User>) => AuthResult;
  /** Reserves the new @tag, then moves the profile to it and frees the old one. */
  changeUsername: (tag: string) => Promise<AuthResult>;
  /**
   * True once the email is confirmed and the session token says so (the rules read the token).
   * Re-checks with Firebase when the cached state says it is not confirmed yet.
   */
  ensureVerified: () => Promise<boolean>;
  /** Records acceptance of the current terms and privacy policy (lib/legal.ts LEGAL_VERSION). */
  acceptTerms: () => Promise<boolean>;
  /** Deletes the account and all its data after re-checking the password (lib/account.ts). */
  deleteAccount: (password: string, onStep?: (label: string) => void) => Promise<AuthResult>;
  /** Email of the signed-in account and whether its owner confirmed it by the link in the letter. */
  authEmail: string | null;
  emailVerified: boolean;
  /** Sends the confirmation letter again. */
  sendVerification: () => Promise<AuthResult>;
  /** Re-reads the account after the person clicked the link; resolves to the new verified state. */
  refreshVerification: () => Promise<boolean>;
  /** Sends a letter with a link to set a new password. */
  resetPassword: (email: string) => Promise<AuthResult>;
  /**
   * Starts an email change: checks the current password, then Firebase sends a link to the new
   * address; the email changes only once that link is opened.
   */
  changeEmail: (newEmail: string, password: string) => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Local picture, so new profiles don't load images from a third-party site. */
const DEFAULT_AVATAR = '/brand/karaokecraft-app-icon.svg';

const noopSubscribe = () => () => {};
const useHydrated = () => useSyncExternalStore(noopSubscribe, () => true, () => false);

function banMessage(u: User): string | null {
  const s = effectiveStatus(u);
  if (s === 'banned_perm') return 'Аккаунт заблокирован навсегда' + (u.banReason ? `: ${u.banReason}` : '');
  if (s === 'banned_temp' && u.banUntil) {
    return `Аккаунт заблокирован до ${new Date(u.banUntil).toLocaleDateString('ru-RU')}` + (u.banReason ? `: ${u.banReason}` : '');
  }
  return null;
}

function actionSettings(path: string) {
  return typeof window === 'undefined' ? undefined : { url: window.location.origin + path };
}

function authError(e: unknown): string {
  const code = (e as { code?: string })?.code || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
    return 'Неверный email или пароль';
  if (code.includes('email-already-in-use')) return 'Этот email уже зарегистрирован';
  if (code.includes('weak-password')) return 'Пароль слишком простой: минимум 6 символов';
  if (code.includes('invalid-email')) return 'Некорректный email';
  if (code.includes('operation-not-allowed') || code.includes('configuration-not-found'))
    return 'Вход по email и паролю временно недоступен';
  if (code.includes('too-many-requests')) return 'Слишком много попыток, попробуйте позже';
  if (code.includes('requires-recent-login') || code.includes('user-token-expired'))
    return 'Сессия устарела: выйдите и войдите снова, затем повторите';
  if (code.includes('unauthorized-continue-uri') || code.includes('unauthorized-domain'))
    return 'Не удалось отправить письмо подтверждения для этого домена';
  return 'Не удалось выполнить запрос. Проверьте подключение и попробуйте снова';
}

/** Reserves `tag`, or `tag_xxxxx` when it was taken meanwhile. Resolves to the reserved tag or null. */
async function reserveTagOrVariant(tag: string, ownerUid: string): Promise<string | null> {
  const first = await reserveUsername(tag, ownerUid);
  if (first === 'ok') return tag;
  if (first === 'error') return null;
  const variant = `${tag.slice(0, 13)}_${shortId().slice(0, 5)}`;
  return (await reserveUsername(variant, ownerUid)) === 'ok' ? variant : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authUid, setAuthUid] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [authPrompt, setAuthPrompt] = useState<{ open: boolean; reason?: string }>({ open: false });
  const version = useDataVersion();
  const router = useRouter();

  useEffect(
    () =>
      onAuthStateChanged(auth, (fbUser) => {
        setAuthUid(fbUser?.uid ?? null);
        setAuthEmail(fbUser?.email ?? null);
        setEmailVerified(!!fbUser?.emailVerified);
        setAuthReady(true);
      }),
    []
  );

  const user = useMemo(() => {
    if (!authUid) return null;
    const u = getUserByUid(authUid) ?? null;
    return u && !banMessage(u) ? u : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUid, version]);

  const isAdminRole = authUid ? getUserByUid(authUid)?.role === 'admin' : false;
  useEffect(() => {
    setSyncScope(authUid ? { uid: authUid, admin: isAdminRole } : null);
  }, [authUid, isAdminRole]);

  const finishSignIn = async (account: FirebaseUser): Promise<AuthResult> => {
    let profile = getUserByUid(account.uid) ?? null;

    if (!profile) {
      // Check Firestore directly in case the cache hasn't received the snapshot yet, or recover an orphaned Auth user.
      try {
        const snap = await getDoc(doc(db, 'users', account.uid));
        if (snap.exists()) {
          const data = { ...(snap.data() as User), id: snap.id };
          cols.users.map.set(snap.id, data);
          profile = data;
        } else {
          // Recover from an interrupted earlier registration so the email is never permanently bricked.
          const basePrefix = (account.email?.split('@')[0] || 'user')
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '')
            .slice(0, 12) || 'user';
          const candidate = basePrefix.length >= 3 ? basePrefix : `user_${basePrefix}`;
          // The tag is reserved before the profile is written (the rules require it); a taken one gets a variant.
          const reserved = await reserveTagOrVariant(candidate, account.uid);
          if (!reserved) throw new Error('tag reservation failed');
          const recovered: User = {
            id: account.uid,
            uid: account.uid,
            username: reserved,
            name: (account.displayName || account.email?.split('@')[0] || 'Автор').slice(0, 80),
            email: account.email ?? undefined,
            avatar: DEFAULT_AVATAR,
            bio: '',
            role: 'user',
            status: 'active',
            createdAt: new Date().toISOString(),
          };
          await saveUserAsync(recovered);
          profile = recovered;
        }
      } catch {
        await signOut(auth);
        return { ok: false, error: 'Не удалось загрузить профиль. Проверьте интернет и попробуйте снова' };
      }
    }

    // Load `userPrivate` before building the ban message so `banReason` is included immediately.
    if (effectiveStatus(profile) === 'banned_perm' || effectiveStatus(profile) === 'banned_temp') {
      try {
        const privSnap = await getDoc(doc(db, 'userPrivate', profile.id));
        if (privSnap.exists()) {
          profile = { ...profile, ...(privSnap.data() as Partial<User>) };
        }
      } catch {
        /* ignore */
      }
    }

    const ban = banMessage(profile);
    if (ban) {
      await signOut(auth);
      return { ok: false, error: ban };
    }
    return { ok: true };
  };

  const login = async (identifier: string, password: string): Promise<AuthResult> => {
    const id = identifier.trim();
    if (!id || !password) return { ok: false, error: 'Введите email и пароль' };
    if (!id.includes('@') || id.startsWith('@')) return { ok: false, error: 'Войдите по email: вход по тегу больше не поддерживается' };
    try {
      const cred = await signInWithEmailAndPassword(auth, id, password);
      return await finishSignIn(cred.user);
    } catch (e) {
      return { ok: false, error: authError(e) };
    }
  };

  const register = async (data: RegisterData): Promise<AuthResult> => {
    const tag = normalizeUsername(data.username);
    const tagError = validateUsername(tag);
    if (tagError) return { ok: false, error: tagError };
    const cleanName = data.name.trim().slice(0, 80);
    if (!cleanName) return { ok: false, error: 'Введите отображаемое имя' };
    if (!data.consent) return { ok: false, error: 'Нужно принять соглашение и дать согласие на обработку данных' };
    // Checked against the reservation before the account exists; if someone takes the tag in the
    // next moment, reserveTagOrVariant below still gives a variant rather than failing.
    if (!(await isUsernameFree(tag))) return { ok: false, error: 'Этот тег уже занят' };

    try {
      const cred = await createUserWithEmailAndPassword(auth, data.email.trim(), data.password);
      const finalTag = await reserveTagOrVariant(tag, cred.user.uid);
      if (!finalTag) {
        await signOut(auth);
        return {
          ok: false,
          error: 'Аккаунт создан, но не удалось закрепить тег. Войдите с этим email и паролем — мы закончим настройку профиля',
        };
      }
      await saveUserAsync({
        id: cred.user.uid,
        uid: cred.user.uid,
        username: finalTag,
        name: cleanName,
        email: cred.user.email ?? data.email.trim(),
        avatar: DEFAULT_AVATAR,
        bio: '',
        role: 'user',
        status: 'active',
        createdAt: new Date().toISOString(),
      });
      // Written separately, so registration still works while older rules without these fields are deployed;
      // if it fails, ConsentBanner asks again.
      void recordConsent(cred.user.uid);
      void sendEmailVerification(cred.user, actionSettings('/')).catch(() => undefined);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: authError(e) };
    }
  };

  const logout = () => {
    void signOut(auth);
  };

  const sendVerification = async (): Promise<AuthResult> => {
    const account = auth.currentUser;
    if (!account) return { ok: false, error: 'Нужно войти' };
    try {
      await sendEmailVerification(account, actionSettings('/'));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: authError(e) };
    }
  };

  const refreshVerification = async (): Promise<boolean> => {
    const account = auth.currentUser;
    if (!account) return false;
    try {
      await account.reload();
      // reload() updates the account but not the session token, and the rules read the token.
      if (account.emailVerified) await account.getIdToken(true);
    } catch (e) {
      if (String((e as { code?: string })?.code).includes('user-token-expired')) await signOut(auth);
      return false;
    }
    setEmailVerified(account.emailVerified);
    setAuthEmail(account.email);
    return account.emailVerified;
  };

  const ensureVerified = async (): Promise<boolean> => {
    const account = auth.currentUser;
    if (!account) return false;
    if (!account.emailVerified) return refreshVerification();
    try {
      // Confirmed in another tab: the account knows, but this tab's token may not yet.
      const token = await account.getIdTokenResult();
      if (token.claims.email_verified !== true) await account.getIdToken(true);
    } catch {
      /* keep the cached state */
    }
    return true;
  };

  const acceptTerms = async (): Promise<boolean> => (authUid ? recordConsent(authUid) : false);

  const deleteAccount = async (password: string, onStep?: (label: string) => void): Promise<AuthResult> => {
    if (!user) return { ok: false, error: 'Нужно войти' };
    if (!password) return { ok: false, error: 'Введите пароль' };
    try {
      await deleteAccountCompletely({ password, profileId: user.id, onStep });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Не удалось удалить аккаунт' };
    }
  };

  const changeEmail = async (newEmail: string, password: string): Promise<AuthResult> => {
    const account = auth.currentUser;
    const next = newEmail.trim();
    if (!account?.email) return { ok: false, error: 'Нужно войти' };
    if (!next.includes('@')) return { ok: false, error: 'Введите новый email' };
    if (next.toLowerCase() === account.email.toLowerCase()) return { ok: false, error: 'Это и так ваш текущий email' };
    if (!password) return { ok: false, error: 'Введите текущий пароль' };
    try {
      await reauthenticateWithCredential(account, EmailAuthProvider.credential(account.email, password));
    } catch (e) {
      const code = (e as { code?: string })?.code || '';
      if (code.includes('wrong-password') || code.includes('invalid-credential')) return { ok: false, error: 'Неверный текущий пароль' };
      return { ok: false, error: authError(e) };
    }
    try {
      await verifyBeforeUpdateEmail(account, next, actionSettings('/login'));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: authError(e) };
    }
  };

  const storedEmail = user?.email;
  const privateReady = privateProfileLoaded();
  useEffect(() => {
    // During account deletion the private data disappears on purpose: don't write the email back.
    if (!user || !authEmail || !privateReady || accountDeletionInProgress()) return;
    if (storedEmail && storedEmail.toLowerCase() === authEmail.toLowerCase()) return;
    let alive = true;
    void auth.currentUser
      ?.getIdToken(true)
      .then(() => alive && saveUser({ ...user, email: authEmail }))
      .catch(async (e) => {
        console.warn('[auth] could not refresh the session for the new email', e);
        const code = String((e as { code?: string })?.code);
        if (code.includes('user-token-expired') || code.includes('invalid-user-token') || code.includes('user-disabled')) {
          await signOut(auth);
          router.push('/login?email-changed=1');
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authEmail, storedEmail, privateReady]);

  const resetPassword = async (email: string): Promise<AuthResult> => {
    const e = email.trim();
    if (!e.includes('@')) return { ok: false, error: 'Введите email, с которым вы регистрировались' };
    try {
      await sendPasswordResetEmail(auth, e, actionSettings('/login'));
      return { ok: true };
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code.includes('user-not-found')) return { ok: true };
      return { ok: false, error: authError(err) };
    }
  };

  const changeUsername = async (input: string): Promise<AuthResult> => {
    if (!user || !authUid) return { ok: false, error: 'Нужно войти' };
    const next = normalizeUsername(input);
    const tagError = validateUsername(next);
    if (tagError) return { ok: false, error: tagError };
    if (next === user.username) return { ok: true };
    const claim = await reserveUsername(next, authUid);
    if (claim === 'taken') return { ok: false, error: 'Этот тег уже занят' };
    if (claim === 'error') return { ok: false, error: 'Не удалось закрепить тег. Проверьте подключение и попробуйте снова' };
    try {
      await updateDoc(doc(db, 'users', user.id), { username: next });
    } catch {
      void releaseUsername(next, authUid);
      return { ok: false, error: 'Не удалось сменить тег. Попробуйте ещё раз' };
    }
    void releaseUsername(user.username, authUid);
    return { ok: true };
  };

  const updateProfile = (data: Partial<User>): AuthResult => {
    if (!user) return { ok: false, error: 'Нужно войти' };
    if (data.username !== undefined) {
      // The tag changes only through changeUsername, which reserves it first.
      data = { ...data };
      delete data.username;
    }
    if (data.name !== undefined) {
      const trimmed = data.name.trim().slice(0, 80);
      if (!trimmed) return { ok: false, error: 'Имя не может быть пустым' };
      data = { ...data, name: trimmed };
    }
    if (data.bio !== undefined) {
      data = { ...data, bio: data.bio.slice(0, 1000) };
    }
    const next = { ...user, ...data };
    saveUser(next);
    // Catalog tiles and other lists show the author copy stored in each track (profiles are read
    // only on demand), so a new name or avatar goes into the person's own tracks too.
    if (next.name !== user.name || next.avatar !== user.avatar) {
      getKaraokesByAuthor(user.id)
        .filter((k) => k.authorName !== next.name || k.authorAvatar !== next.avatar)
        .forEach((k) => updateKaraoke(k.id, { authorName: next.name, authorAvatar: next.avatar }));
    }
    return { ok: true };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        isLoading: !authReady || (!!authUid && !ownProfileSettled(authUid)),
        openAuthPrompt: (reason) => setAuthPrompt({ open: true, reason }),
        authPrompt,
        closeAuthPrompt: () => setAuthPrompt({ open: false }),
        login,
        register,
        logout,
        updateProfile,
        changeUsername,
        ensureVerified,
        acceptTerms,
        deleteAccount,
        authEmail,
        emailVerified,
        sendVerification,
        refreshVerification,
        resetPassword,
        changeEmail,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  const hydrated = useHydrated();
  return useMemo(
    () => (hydrated ? context : { ...context, user: null, isAuthenticated: false, isAdmin: false, isLoading: true }),
    [hydrated, context]
  );
}
