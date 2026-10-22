'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { 
  Mic2, 
  Compass, 
  PlusCircle, 
  ShieldCheck, 
  User, 
  LogOut, 
  Menu, 
  X, 
  Search
} from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAdmin, logout, switchUser } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/?search=${encodeURIComponent(searchQuery.trim())}`);
      setMobileMenuOpen(false);
    }
  };

  const navLinks = [
    { href: '/', label: 'Главная', icon: Compass },
    { href: '/create', label: 'Создать караоке', icon: PlusCircle, highlight: true },
  ];

  if (isAdmin) {
    navLinks.push({ href: '/admin', label: 'Админ-панель', icon: ShieldCheck });
  }

  return (
    <header className="sticky top-0 z-50 w-full bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Minimalist Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Mic2 className="w-5 h-5 text-green-500" />
            <span className="font-semibold text-base text-zinc-100 tracking-tight">
              KaraokeCraft
            </span>
          </Link>

          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="hidden md:flex flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Поиск по песням, артистам, тегам..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-green-500 transition-colors"
              />
            </div>
          </form>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-2">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    link.highlight
                      ? 'bg-green-500 hover:bg-green-600 text-black font-medium'
                      : isActive
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* User Auth Section */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2.5 p-1.5 pl-2.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors focus:outline-none"
                >
                  <span className="text-xs font-medium text-zinc-200">{user.name}</span>
                  {user.role === 'admin' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-500 font-medium uppercase">
                      Admin
                    </span>
                  )}
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-7 h-7 rounded-full object-cover border border-zinc-700"
                  />
                </button>

                {/* Dropdown Menu */}
                {userDropdownOpen && (
                  <div 
                    className="absolute right-0 mt-2 w-56 rounded-xl bg-zinc-900 border border-zinc-800 shadow-xl py-1.5 z-50"
                    onMouseLeave={() => setUserDropdownOpen(false)}
                  >
                    <div className="px-4 py-2 border-b border-zinc-800">
                      <p className="text-xs text-zinc-500">Вы вошли как</p>
                      <p className="text-sm font-medium text-zinc-100 truncate">{user.email}</p>
                    </div>

                    <Link
                      href="/profile"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                    >
                      <User className="w-4 h-4 text-zinc-400" />
                      Мой профиль
                    </Link>

                    <Link
                      href="/create"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                    >
                      <PlusCircle className="w-4 h-4 text-green-500" />
                      Создать анимацию
                    </Link>

                    {isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-sm text-green-500 hover:bg-zinc-800 transition-colors"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        Панель администратора
                      </Link>
                    )}

                    {/* Role quick switch for demonstration */}
                    <div className="px-4 py-2 border-t border-b border-zinc-800 my-1">
                      <p className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-1.5">
                        Быстрый переключатель
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => { switchUser('user-admin'); setUserDropdownOpen(false); }}
                          className={`text-xs px-2.5 py-1 rounded transition-colors ${user.role === 'admin' ? 'bg-zinc-800 text-green-400 font-medium' : 'text-zinc-400 hover:bg-zinc-800'}`}
                        >
                          Админ
                        </button>
                        <button
                          onClick={() => { switchUser('user-aleksei'); setUserDropdownOpen(false); }}
                          className={`text-xs px-2.5 py-1 rounded transition-colors ${user.role === 'user' ? 'bg-zinc-800 text-green-400 font-medium' : 'text-zinc-400 hover:bg-zinc-800'}`}
                        >
                          Пользователь
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={() => { logout(); setUserDropdownOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left"
                    >
                      <LogOut className="w-4 h-4" />
                      Выйти
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="px-3.5 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  Войти
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 transition-colors"
                >
                  Регистрация
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu toggle */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-zinc-800 bg-zinc-950 px-4 pt-3 pb-6 space-y-4">
          <form onSubmit={handleSearchSubmit} className="relative w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Поиск по караоке..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-green-500"
            />
          </form>

          <div className="flex flex-col space-y-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    link.highlight
                      ? 'bg-green-500 text-black font-medium'
                      : isActive
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {link.label}
                </Link>
              );
            })}
          </div>

          <div className="pt-3 border-t border-zinc-800">
            {user ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 px-2 py-1">
                  <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full object-cover" />
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{user.name}</p>
                    <p className="text-xs text-zinc-500">{user.email}</p>
                  </div>
                </div>
                <Link
                  href="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 rounded-lg"
                >
                  <User className="w-4 h-4 text-zinc-400" />
                  Мой профиль
                </Link>
                <button
                  onClick={() => { logout(); setMobileMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg text-left"
                >
                  <LogOut className="w-4 h-4" />
                  Выйти
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-center py-2 rounded-lg bg-zinc-800 text-zinc-200 font-medium text-sm"
                >
                  Войти
                </Link>
                <Link
                  href="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-center py-2 rounded-lg bg-green-500 text-black font-medium text-sm"
                >
                  Регистрация
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
