'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorPage({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error('[KaraokeCraft error boundary]', error);
  }, [error]);

  return (
    <div className="pg" style={{ maxWidth: 560, textAlign: 'center', paddingTop: 96 }}>
      <p className="pill dg" style={{ marginBottom: 14 }}>Сбой страницы</p>
      <h1 className="pg-h">Что-то пошло не так</h1>
      <p className="pg-sub" style={{ maxWidth: 420, margin: '8px auto 24px' }}>
        Не удалось отобразить эту страницу. Попробуйте повторить загрузку или вернитесь в каталог.
      </p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button type="button" className="bt pr" onClick={() => retry()}>
          Попробовать снова
        </button>
        <Link href="/" className="bt">В каталог</Link>
      </div>
    </div>
  );
}
