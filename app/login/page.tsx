'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const [busy, setBusy] = useState(false);

  const run = async (p: Promise<{ ok: true } | { ok: false; error: string }>) => {
    setBusy(true);
    setError('');
    const res = await p;
    setBusy(false);
    if (res.ok) router.push('/');
    else setError(res.error);
  };

  return (
    <div className="pg" style={{ maxWidth: 440, paddingTop: 56 }}>
      <h1 className="pg-h">Вход</h1>
      <p className="pg-sub">Войдите, чтобы создавать караоке, собирать плейлисты и подписываться на авторов.</p>

      <form
        className="stack card"
        onSubmit={(e) => {
          e.preventDefault();
          void run(login(identifier, password));
        }}
      >
        <label className="fld">
          Тег или email
          <input
            type="text"
            placeholder="@liza_veter"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="fld">
          Пароль
          <input
            type="password"
            placeholder="Ваш пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <div className="fld"><span className="err">{error}</span></div>}
        <button type="submit" className="bt pr" disabled={busy}>
          {busy ? 'Входим…' : 'Войти'}
        </button>
      </form>

      <p className="mu sm" style={{ textAlign: 'center', marginTop: 18 }}>
        Нет аккаунта? <Link href="/register" style={{ color: 'var(--ac)' }}>Зарегистрироваться</Link>
      </p>
    </div>
  );
}
