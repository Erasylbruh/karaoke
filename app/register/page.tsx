'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { normalizeUsername, validateUsername } from '@/lib/storage';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Live check, so the tag is verified before the form is even submitted.
  const tagError = useMemo(() => (username ? validateUsername(username) : null), [username]);
  const tagOk = !!username && !tagError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !email.trim() || !username.trim()) {
      setError('Заполните имя, тег и email');
      return;
    }
    if (password.length < 6) {
      setError('Пароль должен быть не короче 6 символов');
      return;
    }
    const res = await register({ username, name, email, password });
    if (res.ok) router.push('/');
    else setError(res.error);
  };

  return (
    <div className="pg" style={{ maxWidth: 440, paddingTop: 56 }}>
      <h1 className="pg-h">Регистрация</h1>
      <p className="pg-sub">Создайте аккаунт, чтобы публиковать караоке и собирать плейлисты.</p>

      <form className="stack card" onSubmit={handleSubmit}>
        <label className="fld">
          Имя
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Лиза Ветер" />
        </label>

        <label className="fld">
          Тег
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="@liza_veter"
            autoComplete="off"
          />
          {tagError && <span className="err">{tagError}</span>}
          {tagOk && <span className="ok">@{normalizeUsername(username)} свободен</span>}
          {!username && <span className="sm">Уникальный, 3–20 символов: латиница, цифры, «_»</span>}
        </label>

        <label className="fld">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </label>

        <label className="fld">
          Пароль
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Не короче 6 символов" />
        </label>

        {error && <div className="fld"><span className="err">{error}</span></div>}

        <button type="submit" className="bt pr" disabled={!!tagError}>
          Зарегистрироваться
        </button>
      </form>

      <p className="mu sm" style={{ textAlign: 'center', marginTop: 18 }}>
        Уже есть аккаунт? <Link href="/login" style={{ color: 'var(--ac)' }}>Войти</Link>
      </p>
    </div>
  );
}
