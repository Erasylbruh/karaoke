'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mic2, Lock, Mail, ArrowRight, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Введите email адрес');
      return;
    }
    await login(email, password);
    router.push('/');
  };

  const handleQuickLogin = async (userEmail: string) => {
    await login(userEmail);
    router.push('/');
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl bg-zinc-900 border border-zinc-800 p-6 space-y-5">
        
        {/* Header */}
        <div className="text-center space-y-1.5">
          <Mic2 className="w-6 h-6 text-green-500 mx-auto" />
          <h1 className="text-xl font-bold text-zinc-100">Вход в KaraokeCraft</h1>
          <p className="text-xs text-zinc-400">
            Войдите для создания и сохранения анимаций
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-green-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1">Пароль</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-green-500 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2 rounded-lg bg-green-500 hover:bg-green-600 text-black font-medium text-sm transition-colors flex items-center justify-center gap-1.5"
          >
            Войти
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Demo Logins for Testing */}
        <div className="pt-2 border-t border-zinc-800 space-y-2">
          <p className="text-[10px] text-zinc-500 uppercase font-medium tracking-wider text-center">
            Быстрый тестовый вход
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin('admin@karaoke.craft')}
              className="p-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 flex items-center justify-center gap-1.5 transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
              Админ
            </button>

            <button
              type="button"
              onClick={() => handleQuickLogin('demo@karaoke.craft')}
              className="p-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 flex items-center justify-center gap-1.5 transition-colors"
            >
              <User className="w-3.5 h-3.5 text-zinc-400" />
              Пользователь
            </button>
          </div>
        </div>

        {/* Switch to Register */}
        <div className="text-center text-xs text-zinc-500">
          Нет аккаунта?{' '}
          <Link href="/register" className="text-green-500 hover:underline">
            Регистрация
          </Link>
        </div>

      </div>
    </div>
  );
}
