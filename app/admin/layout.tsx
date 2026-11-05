'use client';

import React from 'react';
import Link from 'next/link';
import { Users, Music, ShieldCheck, BarChart3 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import SideNav from '@/components/layout/SideNav';
import Tutorial from '@/components/ui/Tutorial';

const ICON = { width: 16, height: 16 };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoading } = useAuth();

  // Keep the page in the tree while auth loads (hidden), so the route still renders a static shell.
  if (isLoading) {
    return (
      <div className="shell" aria-busy="true">
        <div />
        <div className="main" style={{ visibility: 'hidden' }}>{children}</div>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="pg" style={{ maxWidth: 520 }}>
        <h1 className="pg-h">Нужны права администратора</h1>
        <p className="pg-sub">Этот раздел доступен только администраторам.</p>
        <Link href="/login" className="bt pr">Войти</Link>
      </div>
    );
  }

  return (
    <div className="shell">
      <Tutorial
        page="admin"
        steps={[
          { title: 'Панель модерации', text: 'Выберите раздел в боковой панели: пользователи, треки, администраторы или аналитика.' },
          { title: 'Горизонтальные вкладки', text: 'Внутри раздела вкладки переключают статус: например, предупреждения и баны у пользователей.' },
          { title: 'Поиск', text: 'Пользователей ищите по нику или тегу (@admin), треки — по названию или автору.' },
        ]}
      />
      <SideNav
        title="Администрирование"
        items={[
          { href: '/admin/users', label: 'Пользователи', icon: <Users {...ICON} /> },
          { href: '/admin/tracks', label: 'Треки', icon: <Music {...ICON} /> },
          { href: '/admin/admins', label: 'Админы', icon: <ShieldCheck {...ICON} /> },
          { href: '/admin/analytics', label: 'Аналитика', icon: <BarChart3 {...ICON} /> },
        ]}
      />
      <div className="main">{children}</div>
    </div>
  );
}
