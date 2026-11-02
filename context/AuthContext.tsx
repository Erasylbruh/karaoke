'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { User } from '../lib/types';
import { getCurrentUser, setCurrentUser, getUsers, saveUser } from '../lib/storage';
import { useStoredCurrentUser } from '../lib/store';
import { buildUserFromIdentifier, findUserByIdentifier, normalizeUsername, uniqueUsername } from '../lib/login';

export type AuthStatus = 'loading' | 'guest' | 'user';

export type RegisterResult =
  | { ok: true; user: User }
  | { ok: false; field: 'email' | 'username'; message: string };

interface AuthContextType {
  user: User | null;
  status: AuthStatus;
  isAdmin: boolean;
  isAuthenticated: boolean; // совместимость со старыми страницами
  isLoading: boolean; // совместимость со старыми страницами
  login(identifier: string, password?: string): User;
  register(data: { username?: string; name: string; email: string }): RegisterResult;
  logout(): void;
  switchUser(userId: string): void;
  updateProfile(data: Partial<Pick<User, 'name' | 'bio' | 'avatar'>>): void;
}

/** Signs in an existing user by email or username, or creates one for an identifier nobody has used. The password is not checked (demo). */
function login(identifier: string): User {
  const value = identifier.trim();
  if (value === '' || value.startsWith('@')) {
    throw new Error('Введите имя пользователя или email');
  }
  const users = getUsers();
  let user = findUserByIdentifier(users, value);
  if (!user) {
    user = buildUserFromIdentifier(value, users, 'user-' + Date.now(), new Date().toISOString());
    saveUser(user);
  }
  setCurrentUser(user);
  return user;
}

function register(data: { username?: string; name: string; email: string }): RegisterResult {
  const users = getUsers();
  const email = data.email.trim().toLowerCase();
  if (users.some((u) => u.email.toLowerCase() === email)) {
    return { ok: false, field: 'email', message: 'Этот email уже зарегистрирован' };
  }

  let username: string;
  const requested = data.username?.trim();
  if (requested) {
    username = normalizeUsername(requested);
    if (users.some((u) => u.username.toLowerCase() === username)) {
      return { ok: false, field: 'username', message: 'Имя пользователя занято' };
    }
  } else {
    username = uniqueUsername(normalizeUsername(email.split('@')[0]), users);
  }

  const user: User = {
    id: 'user-' + Date.now(),
    username,
    name: data.name.trim(),
    email,
    avatar: '',
    bio: '',
    role: 'user',
    createdAt: new Date().toISOString(),
  };
  saveUser(user);
  setCurrentUser(user);
  return { ok: true, user };
}

function logout(): void {
  setCurrentUser(null);
}

function switchUser(userId: string): void {
  const target = getUsers().find((u) => u.id === userId);
  if (target) setCurrentUser(target);
}

function updateProfile(data: Partial<Pick<User, 'name' | 'bio' | 'avatar'>>): void {
  const current = getCurrentUser();
  if (!current) return;
  const updated: User = { ...current, ...data };
  saveUser(updated);
  setCurrentUser(updated);
}

const ACTIONS = { login, register, logout, switchUser, updateProfile };

const AuthContext = createContext<typeof ACTIONS | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthContext.Provider value={ACTIONS}>{children}</AuthContext.Provider>;
}

/**
 * Each consumer reads the current user itself. If the provider held it, the client value would reach
 * Suspense boundaries that have not hydrated yet (the header) through context and break hydration.
 */
export function useAuth(): AuthContextType {
  const actions = useContext(AuthContext);
  const stored = useStoredCurrentUser();
  const value = useMemo<AuthContextType | undefined>(() => {
    if (!actions) return undefined;
    const user = stored ?? null;
    const status: AuthStatus = stored === undefined ? 'loading' : stored === null ? 'guest' : 'user';
    return {
      ...actions,
      user,
      status,
      isAdmin: user?.role === 'admin',
      isAuthenticated: user !== null,
      isLoading: status === 'loading',
    };
  }, [actions, stored]);
  if (!value) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return value;
}
