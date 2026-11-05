'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

/** Old URL: forwards to the public profile of the signed-in user. */
export default function ProfileRedirect() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) router.replace(`/u/${user.username}`);
  }, [user, isLoading, router]);

  if (!isLoading && !user) {
    return (
      <div className="pg">
        <h1 className="pg-h">Вы не авторизованы</h1>
        <p className="pg-sub">Войдите в аккаунт, чтобы открыть свой профиль.</p>
        <Link href="/login" className="bt pr">Войти</Link>
      </div>
    );
  }
  return <div style={{ minHeight: '60vh' }} />;
}
