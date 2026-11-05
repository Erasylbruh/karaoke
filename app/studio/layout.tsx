'use client';

import React from 'react';
import Link from 'next/link';
import { LayoutDashboard, Film, BarChart3, Settings } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import SideNav from '@/components/layout/SideNav';

const ICON = { width: 16, height: 16 };

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  // Keep the page in the tree while auth loads (hidden), so the route still renders a static shell.
  if (isLoading) {
    return (
      <div className="shell" aria-busy="true">
        <div />
        <div className="main" style={{ visibility: 'hidden' }}>{children}</div>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="pg">
        <h1 className="pg-h">Creator Studio</h1>
        <p className="pg-sub">Войдите, чтобы управлять своими караоке, смотреть статистику и настраивать профиль.</p>
        <Link href="/login" className="bt pr">Войти</Link>
      </div>
    );
  }

  return (
    <div className="shell">
      <SideNav
        title="Creator Studio"
        items={[
          { href: '/studio', label: 'Обзор', icon: <LayoutDashboard {...ICON} />, exact: true },
          { href: '/studio/content', label: 'Контент', icon: <Film {...ICON} /> },
          { href: '/studio/analytics', label: 'Аналитика', icon: <BarChart3 {...ICON} /> },
          { href: '/studio/settings', label: 'Настройки', icon: <Settings {...ICON} /> },
        ]}
      />
      <div className="main">{children}</div>
    </div>
  );
}
