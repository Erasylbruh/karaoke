'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { createPlaylist, getPlaylists, togglePlaylistItem } from '@/lib/storage';

/** Popup: add a karaoke (own or someone else's) to one of the user's playlists. */
export default function PlaylistPicker({
  karaokeId,
  onClose,
  onChange,
}: {
  karaokeId: string;
  onClose: () => void;
  onChange?: (msg: string) => void;
}) {
  const { user } = useAuth();
  const [lists, setLists] = useState(() => (user ? getPlaylists(user.id) : []));
  const [name, setName] = useState('');

  if (!user) return null;
  const refresh = () => setLists(getPlaylists(user.id));

  return (
    <div className="mdl" onClick={onClose} role="dialog" aria-modal="true" aria-label="Добавить в плейлист">
      <div onClick={(e) => e.stopPropagation()}>
        <h3>Добавить в плейлист</h3>
        <div className="stack" style={{ marginBottom: 16 }}>
          {lists.length === 0 && <p style={{ margin: 0 }}>У вас пока нет плейлистов. Создайте первый ниже.</p>}
          {lists.map((p) => {
            const has = p.karaokeIds.includes(karaokeId);
            return (
              <button
                key={p.id}
                className="bt"
                style={{ justifyContent: 'space-between' }}
                onClick={() => {
                  const added = togglePlaylistItem(p.id, karaokeId);
                  onChange?.(added ? `Добавлено в «${p.name}»` : `Убрано из «${p.name}»`);
                  refresh();
                }}
              >
                <span>{p.name}</span>
                <span className={has ? 'pill ok' : 'pill'}>{has ? 'Добавлено' : `${p.karaokeIds.length} трек.`}</span>
              </button>
            );
          })}
        </div>
        <form
          className="row"
          style={{ flexWrap: 'nowrap' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createPlaylist(user.id, name, karaokeId);
            onChange?.(`Плейлист «${name.trim()}» создан`);
            setName('');
            refresh();
          }}
        >
          <input className="in" placeholder="Новый плейлист" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="bt pr" type="submit">Создать</button>
        </form>
        <button className="lk mu sm" style={{ display: 'block', margin: '16px auto 0' }} onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
