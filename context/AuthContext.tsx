'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../lib/types';
import { getCurrentUser, setCurrentUser, getUsers, saveUser } from '../lib/storage';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<boolean>;
  register: (data: { username: string; name: string; email: string; avatar?: string; bio?: string }) => Promise<boolean>;
  logout: () => void;
  switchUser: (userId: string) => void;
  updateProfile: (data: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Hydrate current user on client mount
    const saved = getCurrentUser();
    setUser(saved);
    setIsLoading(false);
  }, []);

  const login = async (email: string): Promise<boolean> => {
    const users = getUsers();
    const found = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (found) {
      setUser(found);
      setCurrentUser(found);
      return true;
    }
    // If user not found, create a simple profile
    const newUser: User = {
      id: 'user-' + Date.now(),
      username: email.split('@')[0],
      name: email.split('@')[0],
      email: email,
      avatar: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80`,
      role: email.includes('admin') ? 'admin' : 'user',
      createdAt: new Date().toISOString(),
    };
    saveUser(newUser);
    setUser(newUser);
    setCurrentUser(newUser);
    return true;
  };

  const register = async (data: { username: string; name: string; email: string; avatar?: string; bio?: string }): Promise<boolean> => {
    const newUser: User = {
      id: 'user-' + Date.now(),
      username: data.username.toLowerCase().replace(/\s+/g, '_'),
      name: data.name,
      email: data.email,
      avatar: data.avatar || `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80`,
      bio: data.bio || '',
      role: 'user',
      createdAt: new Date().toISOString(),
    };
    saveUser(newUser);
    setUser(newUser);
    setCurrentUser(newUser);
    return true;
  };

  const logout = () => {
    setUser(null);
    setCurrentUser(null);
  };

  const switchUser = (userId: string) => {
    const users = getUsers();
    const target = users.find((u) => u.id === userId);
    if (target) {
      setUser(target);
      setCurrentUser(target);
    }
  };

  const updateProfile = (data: Partial<User>) => {
    if (!user) return;
    const updated: User = { ...user, ...data };
    setUser(updated);
    saveUser(updated);
    setCurrentUser(updated);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        isLoading,
        login,
        register,
        logout,
        switchUser,
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
  return context;
}
