'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ShieldCheck, LogOut, User as UserIcon, LayoutDashboard, Plus } from 'lucide-react';
import NotificationsBell from '@/components/layout/NotificationsBell';

const menuItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  padding: '8px 12px',
  fontSize: '13px',
  borderRadius: '8px',
  color: 'var(--tx)',
  textDecoration: 'none',
  background: 'none',
  border: 'none',
  textAlign: 'left',
};

export default function Navbar() {
  const pathname = usePathname();
  const { user, isAdmin, logout } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setShowDropdown(false);
  }, [pathname]);

  useEffect(() => {
    if (!showDropdown) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showDropdown]);

  const is = (p: string) => (p === '/' ? pathname === '/' : pathname.startsWith(p));

  return (
    <header className="hd">
      <Link href="/" className="lg" aria-label="KaraokeCraft, на главную">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="var(--ac)" aria-hidden="true">
          <rect x="2" y="9" width="4" height="11" rx="2" />
          <rect x="9" y="2" width="4" height="18" rx="2" />
          <rect x="16" y="6" width="4" height="14" rx="2" />
        </svg>
        <span className="hd-brand">KaraokeCraft</span>
      </Link>

      <nav className="hd-nav" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Link href="/" className={`nv ${is('/') ? 'active' : ''}`} aria-current={is('/') ? 'page' : undefined}>
          Главная
        </Link>
      </nav>

      <span className="hd-space" style={{ flex: 1 }} />

      <Link href="/create" className="bt pr hd-create" aria-label="Создать караоке" aria-current={is('/create') ? 'page' : undefined}>
        <Plus style={{ width: 16, height: 16 }} aria-hidden="true" />
        <span className="hd-label">Создать</span>
      </Link>
      <NotificationsBell />

      {user ? (
        <div style={{ position: 'relative' }} ref={menuRef}>
          <button
            className="bt hd-user"
            onClick={() => setShowDropdown(!showDropdown)}
            aria-label={`Меню профиля: ${user.name}`}
            aria-haspopup="menu"
            aria-expanded={showDropdown}
          >
            {user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar} alt="" className="av" style={{ width: 24, height: 24 }} />
            ) : (
              <UserIcon style={{ width: '16px', height: '16px' }} />
            )}
            <span className="hd-label" style={{ fontSize: '13px' }}>{user.name}</span>
          </button>

          {showDropdown && (
            <div
              role="menu"
              style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 8px)',
                background: 'var(--s1)',
                border: '1px solid var(--ln)',
                borderRadius: '16px',
                padding: '8px',
                minWidth: '220px',
                zIndex: 40,
                boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--ln)', marginBottom: '6px' }}>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>{user.name}</div>
                <div style={{ color: 'var(--mu)', fontSize: '12px' }}>@{user.username}</div>
                {isAdmin && <span className="pill ac" style={{ marginTop: 6 }}>Администратор</span>}
              </div>

              <Link href={`/u/${user.username}`} style={menuItem} role="menuitem">
                <UserIcon style={{ width: 15, height: 15 }} />
                Мой профиль
              </Link>
              <Link href="/studio" style={menuItem} role="menuitem">
                <LayoutDashboard style={{ width: 15, height: 15, color: 'var(--ac)' }} />
                Creator Studio
              </Link>
              {isAdmin && (
                <Link href="/admin" style={menuItem} role="menuitem">
                  <ShieldCheck style={{ width: 15, height: 15, color: 'var(--ac)' }} />
                  Панель модерации
                </Link>
              )}

              <button
                style={{ ...menuItem, color: '#ef4444' }}
                role="menuitem"
                onClick={() => {
                  logout();
                  setShowDropdown(false);
                }}
              >
                <LogOut style={{ width: 15, height: 15 }} />
                Выйти
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="row" style={{ gap: 8 }}>
          <Link href="/login" className="bt">
            Войти
          </Link>
          <Link href="/register" className="bt hd-reg">
            Регистрация
          </Link>
        </div>
      )}
    </header>
  );
}
