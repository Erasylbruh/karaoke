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
import { deleteDoc, doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
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
  isUsernameTaken,
  uid as shortId,
} from '../lib/storage';
import { cols, setSyncScope } from '../lib/store';
import { useDataVersion } from '../components/DataProvider';

export type AuthResult = { ok: true } | { ok: false; error: string };

interface RegisterData {
  username: string;
  name: string;
  email: string;
  password: string;
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
  updateProfile: (data: Partial<User>) => AuthResult;
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

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80';

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

/** Reserves `usernames/{tag}` transactionally when rules support it; ignores gracefully on older deployed rules. */
async function claimUsernameTag(tag: string, ownerUid: string, previousTag?: string): Promise<boolean> {
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'usernames', tag);
      const existing = await tx.get(ref);
      if (existing.exists() && existing.data()?.uid !== ownerUid) {
        throw new Error('TAKEN');
      }
      tx.set(ref, { uid: ownerUid });
      if (previousTag && previousTag !== tag) {
        const oldRef = doc(db, 'usernames', previousTag);
        const oldSnap = await tx.get(oldRef);
        if (oldSnap.exists() && oldSnap.data()?.uid === ownerUid) {
          tx.delete(oldRef);
        }
      }
    });
    return true;
  } catch (e) {
    if (e instanceof Error && e.message === 'TAKEN') return false;
    // Older deployed rules without /usernames: allow and rely on profile check until rules are deployed.
    return !isUsernameTaken(tag, ownerUid);
  }
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
          let candidate = basePrefix.length >= 3 ? basePrefix : `user_${basePrefix}`;
          if (isUsernameTaken(candidate)) candidate = `${candidate.slice(0, 13)}_${shortId().slice(0, 5)}`;
          const recovered: User = {
            id: account.uid,
            uid: account.uid,
            username: candidate,
            name: (account.displayName || account.email?.split('@')[0] || 'Автор').slice(0, 80),
            email: account.email ?? undefined,
            avatar: DEFAULT_AVATAR,
            bio: '',
            role: 'user',
            status: 'active',
            createdAt: new Date().toISOString(),
          };
          await saveUserAsync(recovered);
          void setDoc(doc(db, 'usernames', candidate), { uid: account.uid }).catch(() => undefined);
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

    try {
      const cred = await createUserWithEmailAndPassword(auth, data.email.trim(), data.password);
      const claimed = await claimUsernameTag(tag, cred.user.uid);
      const finalTag = claimed ? tag : `${tag.slice(0, 13)}_${shortId().slice(0, 5)}`;
      if (!claimed) {
        void setDoc(doc(db, 'usernames', finalTag), { uid: cred.user.uid }).catch(() => undefined);
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
    } catch (e) {
      if (String((e as { code?: string })?.code).includes('user-token-expired')) await signOut(auth);
      return false;
    }
    setEmailVerified(account.emailVerified);
    setAuthEmail(account.email);
    return account.emailVerified;
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
    if (!user || !authEmail || !privateReady) return;
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

  const updateProfile = (data: Partial<User>): AuthResult => {
    if (!user) return { ok: false, error: 'Нужно войти' };
    if (data.username !== undefined) {
      const tagError = validateUsername(data.username, user.id);
      if (tagError) return { ok: false, error: tagError };
      const nextTag = normalizeUsername(data.username);
      const prevTag = user.username;
      data = { ...data, username: nextTag };
      if (nextTag !== prevTag) {
        void claimUsernameTag(nextTag, user.id, prevTag).then((ok) => {
          if (!ok) void deleteDoc(doc(db, 'usernames', nextTag)).catch(() => undefined);
        });
      }
    }
    if (data.name !== undefined) {
      const trimmed = data.name.trim().slice(0, 80);
      if (!trimmed) return { ok: false, error: 'Имя не может быть пустым' };
      data = { ...data, name: trimmed };
    }
    if (data.bio !== undefined) {
      data = { ...data, bio: data.bio.slice(0, 1000) };
    }
    saveUser({ ...user, ...data });
    return { ok: true };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        isLoading: !authReady,
        openAuthPrompt: (reason) => setAuthPrompt({ open: true, reason }),
        authPrompt,
        closeAuthPrompt: () => setAuthPrompt({ open: false }),
        login,
        register,
        logout,
        updateProfile,
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
