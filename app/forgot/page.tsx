'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

/** «Забыли пароль»: Firebase sends a letter with a link to set a new password. */
export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const res = await resetPassword(email);
    setBusy(false);
    if (res.ok) setSentTo(email.trim());
    else setError(res.error);
  };

  return (
    <div className="pg" style={{ maxWidth: 440, paddingTop: 56 }}>
      <h1 className="pg-h">Восстановление пароля</h1>
      {sentTo ? (
        <div className="stack card" role="status">
          <p style={{ margin: 0 }}>
            Если адрес <b>{sentTo}</b> зарегистрирован, на него пришло письмо со ссылкой. Перейдите по ней и задайте новый пароль.
          </p>
          <p className="mu sm" style={{ margin: 0 }}>Письма нет несколько минут? Проверьте папку «Спам» или отправьте ещё раз.</p>
          <div className="row">
            <Link href="/login" className="bt pr">Ко входу</Link>
            <button type="button" className="bt" onClick={() => setSentTo('')}>Отправить ещё раз</button>
          </div>
        </div>
      ) : (
        <>
          <p className="pg-sub">Укажите email, с которым вы регистрировались. Мы пришлём ссылку для нового пароля.</p>
          <form className="stack card" onSubmit={submit}>
            <label className="fld">
              Email
              <input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
                required
              />
            </label>
            {error && <div className="fld"><span className="err">{error}</span></div>}
            <button type="submit" className="bt pr" disabled={busy}>
              {busy ? 'Отправляем…' : 'Прислать ссылку'}
            </button>
          </form>
          <p className="mu sm" style={{ textAlign: 'center', marginTop: 18 }}>
            Вспомнили пароль? <Link href="/login" style={{ color: 'var(--ac)' }}>Войти</Link>
          </p>
        </>
      )}
    </div>
  );
}
