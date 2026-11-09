'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, Music, ShieldCheck, BarChart3, Flag } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import SideNav from '@/components/layout/SideNav';
import Tutorial from '@/components/ui/Tutorial';
import { db } from '@/lib/firebase';

const ICON = { width: 16, height: 16 };

function LegacyAdminAccess({ uid, profileId, children }: { uid: string; profileId: string; children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let current = true;
    void setDoc(doc(db, 'legacyAdminProfiles', uid), { profileId }).then(
      () => { if (current) setStatus('ready'); },
      () => { if (current) setStatus('error'); },
    );
    return () => { current = false; };
  }, [uid, profileId]);

  if (status === 'ready') return children;
  if (status === 'error') return <p role="alert">Не удалось подтвердить права администратора. Обновите страницу.</p>;
  return <p role="status">Проверяем права администратора…</p>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isLoading } = useAuth();

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
          { title: 'Панель модерации', text: 'Выберите раздел в боковой панели: пользователи, треки, жалобы, администраторы или аналитика.' },
          { title: 'Горизонтальные вкладки', text: 'Внутри раздела вкладки переключают статус: например, предупреждения и баны у пользователей.' },
          { title: 'Поиск', text: 'Пользователей ищите по нику или тегу (@admin), треки — по названию или автору.' },
        ]}
      />
      <SideNav
        title="Администрирование"
        items={[
          { href: '/admin/users', label: 'Пользователи', icon: <Users {...ICON} /> },
          { href: '/admin/tracks', label: 'Треки', icon: <Music {...ICON} /> },
          { href: '/admin/reports', label: 'Жалобы', icon: <Flag {...ICON} /> },
          { href: '/admin/admins', label: 'Админы', icon: <ShieldCheck {...ICON} /> },
          { href: '/admin/analytics', label: 'Аналитика', icon: <BarChart3 {...ICON} /> },
        ]}
      />
      <div className="main">
        {user?.uid && user.uid !== user.id ? (
          <LegacyAdminAccess key={user.uid} uid={user.uid} profileId={user.id}>{children}</LegacyAdminAccess>
        ) : children}
      </div>
    </div>
  );
}
