'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { startSync, subscribeStore, getStoreVersion, syncErrors } from '@/lib/store';

/** Re-renders the caller whenever any Firestore collection changes. */
export function useDataVersion() {
  return useSyncExternalStore(subscribeStore, getStoreVersion, () => 0);
}

/**
 * Starts the Firestore sync and keeps the app hidden until the first snapshot arrived.
 * The tree stays mounted (hidden) while loading and is remounted once data is ready, so every
 * page's mount effects read real data.
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
          <p className="mu">Загрузка данных…</p>
        </div>
      )}
      {ready && syncErrors.length > 0 && (
        <div className="sync-err" role="alert">
          <b>Нет связи с Firestore — данные не загружены, изменения не сохраняются.</b>{' '}
          <span className="mu">{syncErrors[0]}. Создайте базу Firestore в Firebase Console и опубликуйте firestore.rules (docs/FIREBASE.md).</span>
        </div>
      )}
      <div key={ready ? 'ready' : 'loading'} hidden={!ready}>
        {children}
      </div>
    </>
  );
}
