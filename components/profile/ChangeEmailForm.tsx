'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

/**
 * Sign-in email change. Firebase sends a link to the new address; the email changes only after it
 * is opened, so a typo can't lock anyone out. The current password is asked again first.
 */
export default function ChangeEmailForm() {
  const { authEmail, emailVerified, changeEmail, refreshVerification } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkNote, setCheckNote] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const res = await changeEmail(email, password);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setSentTo(email.trim());
    setPassword('');
  };

  const check = async () => {
    setBusy(true);
    await refreshVerification();
    setBusy(false);
    setCheckNote('Если почта ещё старая, откройте письмо на новом адресе и перейдите по ссылке.');
  };

  return (
    <div className="stack card">
      <div>
        <b>Почта для входа</b>
        <p className="mu sm" style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>
          Сейчас: {authEmail ?? '—'} {authEmail && (emailVerified ? '· подтверждена' : '· не подтверждена')}
        </p>
      </div>
      {sentTo ? (
        <div className="stack" role="status" style={{ gap: 10 }}>
          <p className="sm" style={{ margin: 0 }}>
            Мы отправили письмо на <b>{sentTo}</b>. Перейдите по ссылке в нём, и почта сменится. До этого входите со старой почтой.
          </p>
          <p className="mu sm" style={{ margin: 0 }}>
            После перехода по ссылке сайт может попросить войти заново — уже с новой почтой.
          </p>
          {checkNote && <p className="mu sm" style={{ margin: 0 }}>{checkNote}</p>}
          <div className="row">
            <button type="button" className="bt sm" onClick={check} disabled={busy}>Я перешёл по ссылке</button>
            <button type="button" className="bt sm gh" onClick={() => setSentTo('')}>Указать другую почту</button>
          </div>
        </div>
      ) : (
        <form className="stack" onSubmit={submit} style={{ gap: 12 }}>
          <label className="fld">
            Новый email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              autoComplete="email"
              inputMode="email"
              required
            />
          </label>
          <label className="fld">
            Текущий пароль
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <span className="err sm" role="alert" style={{ color: '#f87171' }}>{error}</span>}
          <button type="submit" className="bt pr" disabled={busy}>{busy ? 'Отправляем…' : 'Сменить почту'}</button>
        </form>
      )}
    </div>
  );
}
