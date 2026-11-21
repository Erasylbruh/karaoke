'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { CONTACT_EMAIL } from '@/lib/legal';

const CONFIRM_WORD = 'УДАЛИТЬ';

/** Settings → Аккаунт: deletes the account and all its data (lib/account.ts) after re-checking the password. */
export default function DeleteAccountForm() {
  const { deleteAccount } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [word, setWord] = useState('');
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    // Set on every mount: in development React mounts effects twice, and the first cleanup would leave it false.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (word.trim().toUpperCase() !== CONFIRM_WORD || !password) return;
    setBusy(true);
    setError('');
    const res = await deleteAccount(password, (label) => mounted.current && setStep(label));
    if (res.ok) {
      // A full reload (not router.push) drops every cached copy of the deleted data in this tab.
      window.location.replace(`${window.location.origin}/?account=deleted`);
      return;
    }
    // The form disappears once the profile is gone, so late errors fall back to an alert.
    if (mounted.current) {
      setBusy(false);
      setStep('');
      setError(res.error);
    } else {
      window.alert(res.error);
    }
  };

  return (
    <div className="card stack">
      <div>
        <b>Удаление аккаунта</b>
        <p className="mu sm" style={{ margin: '6px 0 0', lineHeight: 1.5 }}>
          Удаляются профиль и тег, email, ваши караоке, все загруженные вами файлы (аудио, обложки, шрифты, аватары), отзывы и ответы
          на них, плейлисты, лайки, подписки, уведомления, история скачиваний и статистика. Отменить это нельзя. Жалобы, которые вы
          отправляли, и записи модерации остаются без вашего email.
        </p>
      </div>
      {!open ? (
        <button type="button" className="bt" style={{ color: '#f87171', alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>
          Удалить аккаунт…
        </button>
      ) : (
        <form className="stack" onSubmit={submit}>
          <label className="fld">
            Текущий пароль
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" disabled={busy} />
          </label>
          <label className="fld">
            Введите «{CONFIRM_WORD}», чтобы подтвердить
            <input type="text" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" disabled={busy} />
          </label>
          {step && <p className="mu sm" role="status" style={{ margin: 0 }}>{step}…</p>}
          {error && <p className="err" role="alert" style={{ margin: 0 }}>{error}</p>}
          <div className="row">
            <button
              type="submit"
              className="bt pr"
              style={{ background: '#b91c1c', borderColor: '#b91c1c' }}
              disabled={busy || !password || word.trim().toUpperCase() !== CONFIRM_WORD}
            >
              {busy ? 'Удаляем…' : 'Удалить навсегда'}
            </button>
            <button type="button" className="bt" disabled={busy} onClick={() => { setOpen(false); setPassword(''); setWord(''); setError(''); }}>
              Отмена
            </button>
          </div>
          <p className="mu sm" style={{ margin: 0 }}>
            Не получается удалить? Напишите на <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--ac)' }}>{CONTACT_EMAIL}</a>.
          </p>
        </form>
      )}
    </div>
  );
}
