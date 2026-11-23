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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptData, setAcceptData] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const consent = acceptTerms && acceptData;

  const tagError = useMemo(() => (username ? validateUsername(username) : null), [username]);
  const tagOk = !!username && !tagError;
  const passwordLongEnough = password.length >= 6;
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const passwordMismatch = confirmPassword.length > 0 && !passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !email.trim() || !username.trim()) {
      setError('Заполните имя, тег и email');
      return;
    }
    if (!passwordLongEnough) {
      setError('Пароль должен быть не короче 6 символов');
      return;
    }
    if (!passwordsMatch) {
      setError('Пароли не совпадают');
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
    <div className="pg registration-page">
      <h1 className="pg-h">Регистрация</h1>
      <p className="pg-sub">Создайте аккаунт, чтобы публиковать караоке и собирать плейлисты.</p>

      <form className="card registration-form" onSubmit={handleSubmit}>
        <div className="registration-columns">
          <section className="stack registration-fields" aria-labelledby="registration-fields-title">
            <h2 id="registration-fields-title" className="registration-heading">Личные данные</h2>
            <label className="fld">
              Имя
              <input type="text" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Лиза Ветер" autoComplete="name" />
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
          </section>

          <section className="stack registration-fields" aria-labelledby="registration-password-title">
            <h2 id="registration-password-title" className="registration-heading">Пароль и безопасность</h2>
            <label className="fld">
              Пароль
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Не короче 6 символов"
                autoComplete="new-password"
                aria-describedby="registration-password-rules"
              />
            </label>
            <label className="fld">
              Повтор пароля
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Введите пароль ещё раз"
                autoComplete="new-password"
                aria-invalid={passwordMismatch || undefined}
                aria-describedby={passwordMismatch ? 'registration-password-rules registration-password-error' : 'registration-password-rules'}
              />
              {passwordMismatch && <span className="err" id="registration-password-error">Пароли не совпадают</span>}
            </label>
            <ul className="registration-password-rules" id="registration-password-rules" aria-label="Требования к паролю">
              <li className={passwordLongEnough ? 'is-valid' : undefined}>
                <span aria-hidden="true">{passwordLongEnough ? '✓' : '○'}</span>
                Не менее 6 символов
              </li>
              <li className={passwordsMatch ? 'is-valid' : undefined}>
                <span aria-hidden="true">{passwordsMatch ? '✓' : '○'}</span>
                Пароли совпадают
              </li>
            </ul>
          </section>
        </div>

        <section className="stack registration-consent" aria-labelledby="registration-consent-title">
          <h2 id="registration-consent-title" className="registration-heading">Согласия с документами</h2>
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

          {error && <div className="fld" role="alert"><span className="err">{error}</span></div>}

          <div className="registration-submit">
            <button type="submit" className="bt pr" disabled={busy || !!tagError || !consent || !passwordLongEnough || !passwordsMatch}>
              {busy ? 'Создаём аккаунт…' : 'Зарегистрироваться'}
            </button>
          </div>
        </section>
      </form>

      <p className="mu sm" style={{ textAlign: 'center', marginTop: 18 }}>
        Уже есть аккаунт? <Link href="/login" style={{ color: 'var(--ac)' }}>Войти</Link>
      </p>
    </div>
  );
}
