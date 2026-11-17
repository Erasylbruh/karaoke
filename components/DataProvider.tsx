'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { startSync, subscribeStore, getStoreVersion, connectionFailed } from '@/lib/store';

/** Re-renders the caller whenever any Firestore collection changes. */
export function useDataVersion() {
  return useSyncExternalStore(subscribeStore, getStoreVersion, () => 0);
}

/**
 * Starts the Firestore sync and keeps the app hidden until the first snapshot arrived.
 */
export default function DataProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useDataVersion();

  useEffect(() => {
    let alive = true;
    void startSync().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      {!ready && (
        <div className="pg" style={{ textAlign: 'center', paddingTop: 120 }}>
          <p className="mu">Загрузка каталога…</p>
        </div>
      )}
      {ready && connectionFailed && (
        <div className="sync-err" role="alert">
          <b>Нет соединения с сервером данных.</b>{' '}
          <span className="mu">Проверьте подключение к интернету и обновите страницу — пока связь не восстановится, изменения могут не сохраняться.</span>
        </div>
      )}
      <div key={ready ? 'ready' : 'loading'} hidden={!ready}>
        {children}
      </div>
    </>
  );
}
