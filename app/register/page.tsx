'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { normalizeUsername, validateUsername } from '@/lib/storage';
import { OPERATOR_NAME } from '@/lib/legal';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptData, setAcceptData] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const consent = acceptTerms && acceptData;

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
    if (!consent) {
      setError('Отметьте оба пункта ниже: без них регистрация невозможна');
      return;
    }
    setBusy(true);
    const res = await register({ username, name, email, password, consent });
    setBusy(false);
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
          <input type="text" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Лиза Ветер" />
        </label>

        <label className="fld">
          Тег
          <input
            type="text"
            maxLength={21}
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
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="email" />
        </label>

        <label className="fld">
          Пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Не короче 6 символов"
            autoComplete="new-password"
          />
        </label>

        <label className="row sm" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 10, lineHeight: 1.45 }}>
          <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} style={{ marginTop: 3, flex: 'none' }} />
          <span style={{ flex: 1 }}>
            Принимаю{' '}
            <Link href="/terms" target="_blank" style={{ color: 'var(--ac)' }}>Пользовательское соглашение</Link>. Мне исполнилось
            18 лет, или у меня есть согласие родителей (законных представителей).
          </span>
        </label>

        <label className="row sm" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 10, lineHeight: 1.45 }}>
          <input type="checkbox" checked={acceptData} onChange={(e) => setAcceptData(e.target.checked)} style={{ marginTop: 3, flex: 'none' }} />
          <span style={{ flex: 1 }}>
            Даю согласие оператору {OPERATOR_NAME} на сбор и обработку моих персональных данных, их передачу сервисам-обработчикам,
            в том числе на серверы за пределами Республики Казахстан, и на показ данных профиля в открытом доступе — на условиях{' '}
            <Link href="/privacy" target="_blank" style={{ color: 'var(--ac)' }}>Политики конфиденциальности</Link>.
          </span>
        </label>

        {error && <div className="fld"><span className="err">{error}</span></div>}

        <button type="submit" className="bt pr" disabled={busy || !!tagError || !consent}>
          {busy ? 'Создаём аккаунт…' : 'Зарегистрироваться'}
        </button>
      </form>

      <p className="mu sm" style={{ textAlign: 'center', marginTop: 18 }}>
        Уже есть аккаунт? <Link href="/login" style={{ color: 'var(--ac)' }}>Войти</Link>
      </p>
    </div>
  );
}
