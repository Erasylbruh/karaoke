'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

/** Reminds a signed-in person to confirm their email by the link in the letter. */
export default function VerifyEmailBanner() {
  const { isAuthenticated, emailVerified, authEmail, sendVerification, refreshVerification } = useAuth();
  const [hidden, setHidden] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isAuthenticated || emailVerified || hidden) return null;

  const resend = async () => {
    setBusy(true);
    const res = await sendVerification();
    setBusy(false);
    setNote(res.ok ? 'Письмо отправлено ещё раз.' : res.error);
  };

  const check = async () => {
    setBusy(true);
    const ok = await refreshVerification();
    setBusy(false);
    if (!ok) setNote('Почта пока не подтверждена. Откройте письмо и перейдите по ссылке.');
  };

  return (
    <div className="verify-bar" role="status">
      <span>
        Подтвердите почту: мы отправили ссылку на <b>{authEmail}</b>. Подтверждённый адрес защищает аккаунт и нужен для полноценной работы с публикациями.
        {note && <span className="mu"> {note}</span>}
      </span>
      <span className="row" style={{ gap: 8 }}>
        <button type="button" className="bt sm" onClick={check} disabled={busy}>Я подтвердил</button>
        <button type="button" className="bt sm gh" onClick={resend} disabled={busy}>Отправить ещё раз</button>
        <button type="button" className="bt sm gh" onClick={() => setHidden(true)} aria-label="Скрыть напоминание">Позже</button>
      </span>
    </div>
  );
}
