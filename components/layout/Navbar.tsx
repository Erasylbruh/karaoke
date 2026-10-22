'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ShieldCheck, LogOut, User as UserIcon } from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const { user, isAdmin, login, logout, switchUser } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const success = await login(usernameInput, passwordInput);
    if (success) {
      setShowAuthModal(false);
      setUsernameInput('');
      setPasswordInput('');
    } else {
      setAuthError('Неверное имя пользователя или пароль');
    }
  };

  const handleQuickLogin = async (username: string) => {
    setAuthError('');
    const success = await login(username, 'password123');
    if (success) {
      setShowAuthModal(false);
    }
  };

  return (
    <>
      <header className="hd">
        <Link href="/" className="lg" aria-label="KaraokeCraft, на главную">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="var(--ac)" aria-hidden="true">
            <rect x="2" y="9" width="4" height="11" rx="2" />
            <rect x="9" y="2" width="4" height="18" rx="2" />
            <rect x="16" y="6" width="4" height="14" rx="2" />
          </svg>
          <span>KaraokeCraft</span>
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Link
            href="/"
            className={`nv ${pathname === '/' ? 'active' : ''}`}
            aria-current={pathname === '/' ? 'page' : undefined}
          >
            Главная
          </Link>
          <Link
            href="/create"
            className={`nv ${pathname === '/create' ? 'active' : ''}`}
            aria-current={pathname === '/create' ? 'page' : undefined}
          >
            Создать
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className={`nv ${pathname === '/admin' ? 'active' : ''}`}
              aria-current={pathname === '/admin' ? 'page' : undefined}
            >
              Админка
            </Link>
          )}
        </nav>

        <span style={{ flex: 1 }} />

        {user ? (
          <div style={{ position: 'relative' }}>
            <button
              className="bt"
              onClick={() => setShowDropdown(!showDropdown)}
              style={{ padding: '6px 14px 6px 8px' }}
            >
              {user.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar}
                  alt={user.name}
                  style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <UserIcon style={{ width: '16px', height: '16px' }} />
              )}
              <span style={{ fontSize: '13px' }}>{user.name}</span>
            </button>

            {showDropdown && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 8px)',
                  background: 'var(--s1)',
                  border: '1px solid var(--ln)',
                  borderRadius: '16px',
                  padding: '8px',
                  minWidth: '200px',
                  zIndex: 40,
                  boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
                }}
              >
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--ln)', marginBottom: '6px' }}>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>{user.name}</div>
                  <div style={{ color: 'var(--mu)', fontSize: '12px' }}>@{user.username}</div>
                  {isAdmin && (
                    <span
                      style={{
                        display: 'inline-block',
                        marginTop: '4px',
                        fontSize: '11px',
                        background: 'rgba(255, 181, 71, 0.15)',
                        color: 'var(--ac)',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontWeight: 600,
                      }}
                    >
                      Администратор
                    </span>
                  )}
                </div>

                {isAdmin && (
                  <Link
                    href="/admin"
                    onClick={() => setShowDropdown(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      fontSize: '13px',
                      borderRadius: '8px',
                      color: 'var(--tx)',
                      textDecoration: 'none',
                    }}
                  >
                    <ShieldCheck style={{ width: '15px', height: '15px', color: 'var(--ac)' }} />
                    Панель модерации
                  </Link>
                )}

                <button
                  onClick={() => {
                    switchUser(isAdmin ? 'user-liza' : 'user-admin');
                    setShowDropdown(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    color: 'var(--mu)',
                    background: 'none',
                    border: 'none',
                    textAlign: 'left',
                  }}
                >
                  <UserIcon style={{ width: '15px', height: '15px' }} />
                  Сменить роль ({isAdmin ? 'на Пользователя' : 'на Админа'})
                </button>

                <button
                  onClick={() => {
                    logout();
                    setShowDropdown(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    color: '#ef4444',
                    background: 'none',
                    border: 'none',
                    textAlign: 'left',
                  }}
                >
                  <LogOut style={{ width: '15px', height: '15px' }} />
                  Выйти
                </button>
              </div>
            )}
          </div>
        ) : (
          <button className="bt" id="login" onClick={() => setShowAuthModal(true)}>
            Войти
          </button>
        )}
      </header>

      {/* Auth Modal */}
      {showAuthModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(9, 9, 11, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 100,
            padding: '20px',
          }}
          onClick={() => setShowAuthModal(false)}
        >
          <div
            style={{
              background: 'var(--s1)',
              border: '1px solid var(--ln)',
              borderRadius: '24px',
              padding: '32px',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <svg width="24" height="24" viewBox="0 0 22 22" fill="var(--ac)" aria-hidden="true">
                <rect x="2" y="9" width="4" height="11" rx="2" />
                <rect x="9" y="2" width="4" height="18" rx="2" />
                <rect x="16" y="6" width="4" height="14" rx="2" />
              </svg>
              <h3 style={{ margin: 0, font: '700 20px var(--fd)' }}>Вход в KaraokeCraft</h3>
            </div>

            <p style={{ color: 'var(--mu)', fontSize: '14px', marginBottom: '24px' }}>
              Войдите, чтобы создавать свои караоке-анимации, ставить лайки и экспортировать видео.
            </p>

            <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--mu)', marginBottom: '6px' }}>
                  Имя пользователя
                </label>
                <input
                  type="text"
                  placeholder="admin или liza_veter"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--s2)',
                    border: '1px solid var(--ln)',
                    borderRadius: '12px',
                    padding: '10px 14px',
                    color: 'var(--tx)',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', color: 'var(--mu)', marginBottom: '6px' }}>
                  Пароль
                </label>
                <input
                  type="password"
                  placeholder="Любой пароль для демо"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--s2)',
                    border: '1px solid var(--ln)',
                    borderRadius: '12px',
                    padding: '10px 14px',
                    color: 'var(--tx)',
                    outline: 'none',
                  }}
                />
              </div>

              {authError && (
                <div style={{ color: '#ef4444', fontSize: '13px' }}>{authError}</div>
              )}

              <button type="submit" className="bt pr" style={{ marginTop: '8px' }}>
                Войти
              </button>
            </form>

            <div style={{ margin: '20px 0 14px', textAlign: 'center', color: 'var(--mu)', fontSize: '13px' }}>
              Быстрый вход для тестирования:
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                type="button"
                className="bt"
                onClick={() => handleQuickLogin('liza_veter')}
                style={{ fontSize: '13px', padding: '8px' }}
              >
                Лиза Ветер (User)
              </button>
              <button
                type="button"
                className="bt"
                onClick={() => handleQuickLogin('admin')}
                style={{ fontSize: '13px', padding: '8px', color: 'var(--ac)' }}
              >
                Администратор
              </button>
            </div>

            <button
              onClick={() => setShowAuthModal(false)}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                color: 'var(--mu)',
                fontSize: '13px',
                marginTop: '16px',
                padding: '6px',
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </>
  );
}
