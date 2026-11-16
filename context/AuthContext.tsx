'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { User } from '../lib/types';
import { saveUser, getUserByUid, validateUsername, normalizeUsername, effectiveStatus } from '../lib/storage';
import { setSyncScope } from '../lib/store';
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80';

/** false while hydrating (matches the server render), true afterwards. */
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

function authError(e: unknown): string {
  const code = (e as { code?: string })?.code || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
    return 'Неверный email или пароль';
  if (code.includes('email-already-in-use')) return 'Этот email уже зарегистрирован';
  if (code.includes('weak-password')) return 'Пароль слишком простой: минимум 6 символов';
  if (code.includes('invalid-email')) return 'Некорректный email';
  if (code.includes('operation-not-allowed') || code.includes('configuration-not-found'))
    return 'В Firebase Console не включён вход по email/паролю (Authentication → Sign-in method)';
  if (code.includes('too-many-requests')) return 'Слишком много попыток, попробуйте позже';
  return e instanceof Error ? e.message : 'Не удалось выполнить вход';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authUid, setAuthUid] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authPrompt, setAuthPrompt] = useState<{ open: boolean; reason?: string }>({ open: false });
  const version = useDataVersion();

  useEffect(
    () =>
      onAuthStateChanged(auth, (fbUser) => {
        setAuthUid(fbUser?.uid ?? null);
        setAuthReady(true);
      }),
    []
  );

  // The profile is read from the live cache, so role/ban changes made by admins apply immediately.
  const user = useMemo(() => {
    if (!authUid) return null;
    const u = getUserByUid(authUid) ?? null;
    return u && !banMessage(u) ? u : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUid, version]);

  // Personal data (notifications, downloads, likes, stats, private profile) is loaded only for
  // the signed-in person; admins also get every profile's private data.
  const isAdminRole = authUid ? getUserByUid(authUid)?.role === 'admin' : false;
  useEffect(() => {
    setSyncScope(authUid ? { uid: authUid, admin: isAdminRole } : null);
  }, [authUid, isAdminRole]);

  const finishSignIn = async (account: FirebaseUser): Promise<AuthResult> => {
    const profile = getUserByUid(account.uid) ?? null;
    if (!profile) {
      await signOut(auth);
      return { ok: false, error: 'Профиль не найден. Зарегистрируйтесь заново' };
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
    // Sign-in by tag would need everyone's email in public data, so it is email only.
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
    try {
      const cred = await createUserWithEmailAndPassword(auth, data.email.trim(), data.password);
      saveUser({
        id: cred.user.uid,
        uid: cred.user.uid,
        username: tag,
        name: data.name.trim(),
        // As Firebase stored it: the rules compare it with the token's email.
        email: cred.user.email ?? data.email.trim(),
        avatar: DEFAULT_AVATAR,
        bio: '',
        role: 'user',
        status: 'active',
        createdAt: new Date().toISOString(),
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: authError(e) };
    }
  };

  const logout = () => {
    void signOut(auth);
  };

  const updateProfile = (data: Partial<User>): AuthResult => {
    if (!user) return { ok: false, error: 'Нужно войти' };
    if (data.username !== undefined) {
      const tagError = validateUsername(data.username, user.id);
      if (tagError) return { ok: false, error: tagError };
      data = { ...data, username: normalizeUsername(data.username) };
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
  // Checked in every consumer (not only in the provider): a Suspense boundary can hydrate after the
  // provider has already loaded the saved user, and it must still match the signed-out server HTML.
  const hydrated = useHydrated();
  return useMemo(
    () => (hydrated ? context : { ...context, user: null, isAuthenticated: false, isAdmin: false, isLoading: true }),
    [hydrated, context]
  );
}
