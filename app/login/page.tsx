'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

/** Shown after an email change ended the old session (see AuthContext). */
function EmailChangedNote() {
  const params = useSearchParams();
  if (!params.get('email-changed')) return null;
  return (
    <p className="card sm" role="status" style={{ marginBottom: 14 }}>
      Почта изменена. Войдите с новой почтой и прежним паролем.
    </p>
  );
}

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
      <Suspense fallback={null}>
        <EmailChangedNote />
      </Suspense>
      <p className="pg-sub">Войдите, чтобы создавать караоке, собирать плейлисты и подписываться на авторов.</p>

      <form
        className="stack card"
        onSubmit={(e) => {
          e.preventDefault();
          void run(login(identifier, password));
        }}
      >
        <label className="fld">
          Email
          <input
            type="email"
            placeholder="name@example.com"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="email"
            inputMode="email"
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
        <Link href="/forgot" className="lk mu sm" style={{ alignSelf: 'center' }}>Забыли пароль?</Link>
      </form>

      <p className="mu sm" style={{ textAlign: 'center', marginTop: 18 }}>
        Нет аккаунта? <Link href="/register" style={{ color: 'var(--ac)' }}>Зарегистрироваться</Link>
      </p>
    </div>
  );
}
