'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useDataVersion } from '@/components/DataProvider';
import { privateProfileLoaded } from '@/lib/storage';
import { LEGAL_DATE, LEGAL_VERSION } from '@/lib/legal';

/**
 * Asks a signed-in person to accept the current terms and privacy policy when their recorded
 * acceptance is missing (accounts registered before consent was recorded) or older than LEGAL_VERSION.
 */
export default function ConsentBanner() {
  useDataVersion(); // the private profile (with the accepted version) arrives after sign-in
  const { user, acceptTerms } = useAuth();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  if (!user || !privateProfileLoaded() || user.termsVersion === LEGAL_VERSION) return null;

  const accept = async () => {
    setBusy(true);
    const ok = await acceptTerms();
    setBusy(false);
    if (!ok) setNote('Не удалось сохранить. Проверьте подключение и попробуйте ещё раз.');
  };

  return (
    <div className="verify-bar" role="status">
      <span>
        {user.termsVersion ? 'Мы обновили документы сайта' : 'Подтвердите согласие с документами сайта'}:{' '}
        <Link href="/terms" style={{ color: 'var(--ac)' }}>Пользовательское соглашение</Link> и{' '}
        <Link href="/privacy" style={{ color: 'var(--ac)' }}>Политику конфиденциальности</Link> (редакция от {LEGAL_DATE}).
        Нажимая «Принимаю», вы соглашаетесь с ними и даёте согласие на обработку персональных данных на их условиях.
        {note && <span className="mu"> {note}</span>}
      </span>
      <span className="row" style={{ gap: 8 }}>
        <button type="button" className="bt sm pr" onClick={accept} disabled={busy}>
          {busy ? 'Сохраняем…' : 'Принимаю'}
        </button>
      </span>
    </div>
  );
}
