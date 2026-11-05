'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

/** Shared popup shown whenever a guest tries an action that needs an account. */
export default function AuthPrompt() {
  const { authPrompt, closeAuthPrompt } = useAuth();
  if (!authPrompt.open) return null;

  return (
    <div className="mdl" onClick={closeAuthPrompt} role="dialog" aria-modal="true" aria-label="Требуется вход">
      <div onClick={(e) => e.stopPropagation()}>
        <h3>Войдите, чтобы продолжить</h3>
        <p>
          {authPrompt.reason ||
            'Вход нужен, чтобы слушать без ограничений, ставить лайки, собирать плейлисты и создавать свои караоке.'}
        </p>
        <div className="stack">
          <Link href="/register" className="bt pr" onClick={closeAuthPrompt}>
            Зарегистрироваться
          </Link>
          <Link href="/login" className="bt" onClick={closeAuthPrompt}>
            Войти
          </Link>
          <button className="lk mu sm" style={{ textAlign: 'center' }} onClick={closeAuthPrompt}>
            Не сейчас
          </button>
        </div>
      </div>
    </div>
  );
}
