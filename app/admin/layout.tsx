'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, Music, ShieldCheck, BarChart3, Flag, Tags } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { useDataVersion } from '@/components/DataProvider';
import SideNav from '@/components/layout/SideNav';
import { db } from '@/lib/firebase';
import { allUsersLoaded } from '@/lib/store';

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
  useDataVersion();
  // Admins get every profile (lib/store setSyncScope); the pages count and check them, so they wait for the whole list.
  const usersReady = allUsersLoaded();

  if (isLoading) {
    return (
      <div className="shell" aria-busy="true">
        <div />
        <div className="main" />
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
      <SideNav
        title="Администрирование"
        items={[
          { href: '/admin/users', label: 'Пользователи', icon: <Users {...ICON} /> },
          { href: '/admin/tracks', label: 'Треки', icon: <Music {...ICON} /> },
          { href: '/admin/reports', label: 'Жалобы', icon: <Flag {...ICON} /> },
          { href: '/admin/genres', label: 'Жанры', icon: <Tags {...ICON} /> },
          { href: '/admin/admins', label: 'Админы', icon: <ShieldCheck {...ICON} /> },
          { href: '/admin/analytics', label: 'Аналитика', icon: <BarChart3 {...ICON} /> },
        ]}
      />
      <div className="main">
        {!usersReady ? (
          <p className="mu" role="status">Загружаем профили…</p>
        ) : user?.uid && user.uid !== user.id ? (
          <LegacyAdminAccess key={user.uid} uid={user.uid} profileId={user.id}>{children}</LegacyAdminAccess>
        ) : children}
      </div>
    </div>
  );
}
