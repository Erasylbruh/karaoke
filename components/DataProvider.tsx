'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { startSync, subscribeStore, getStoreVersion, connectionFailed, retain } from '@/lib/store';

/** Re-renders the caller whenever any Firestore collection changes. */
export function useDataVersion() {
  return useSyncExternalStore(subscribeStore, getStoreVersion, () => 0);
}

/**
 * Keeps the on-demand listeners for `keys` (e.g. `user:{id}`, `comments:{trackId}`, see lib/store
 * retain) while the caller is mounted; falsy entries are skipped. Read the data with the usual
 * getters; they fill in as the listeners answer.
 */
export function useWatch(keys: ReadonlyArray<string | false | null | undefined>) {
  const signature = JSON.stringify([...new Set(keys.filter((k): k is string => !!k))].sort());
  useEffect(() => {
    const list = JSON.parse(signature) as string[];
    if (list.length === 0) return;
    const releases = list.map(retain);
    return () => releases.forEach((release) => release());
  }, [signature]);
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
