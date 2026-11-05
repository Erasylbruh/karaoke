'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Karaoke } from '@/lib/types';
import { getKaraokes, blockKaraoke, restoreKaraoke, softDeleteKaraoke, deleteKaraoke, getAuthor, RECOMMEND_THRESHOLD } from '@/lib/storage';
import Tabs from '@/components/ui/Tabs';
import ActionMenu from '@/components/ui/ActionMenu';

type Tab = 'active' | 'blocked' | 'deleted';

export default function AdminTracks() {
  const [items, setItems] = useState<Karaoke[]>([]);
  const [tab, setTab] = useState<Tab>('active');
  const [query, setQuery] = useState('');

  const reload = useCallback(() => setItems(getKaraokes()), []);
  useEffect(reload, [reload]);

  const q = query.trim().toLowerCase();
  const rows = items
    .filter((k) => k.status === tab)
    .filter((k) => {
      if (!q) return true;
      const a = getAuthor(k);
      return (
        k.title.toLowerCase().includes(q) ||
        k.artist.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.username ?? '').toLowerCase().includes(q.replace(/^@/, ''))
      );
    });

  const count = (s: Tab) => items.filter((k) => k.status === s).length;

  return (
    <>
      <h1 className="pg-h">Треки</h1>
      <p className="pg-sub">Модерация каталога: блокировка и восстановление.</p>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        label="Статус треков"
        tabs={[
          { id: 'active', label: 'Треки', count: count('active') },
          { id: 'blocked', label: 'Заблокированные', count: count('blocked') },
          { id: 'deleted', label: 'Удалённые', count: count('deleted') },
        ]}
      />

      <input
        className="in"
        style={{ maxWidth: 360, marginBottom: 16 }}
        type="search"
        placeholder="Поиск по названию или автору"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Поиск треков"
      />

      {rows.length === 0 ? (
        <div className="card em2">Ничего не найдено.</div>
      ) : (
        <div className="tw">
          <table className="tbl">
            <thead>
              <tr><th>Трек</th><th>Автор</th><th>Доступ</th><th>Балл</th><th className="ac">Действия</th></tr>
            </thead>
            <tbody>
              {rows.map((k) => {
                const a = getAuthor(k);
                return (
                  <tr key={k.id}>
                    <td>
                      <Link href={`/karaoke/${k.id}`} className="lk"><b>{k.title}</b></Link>
                      <div className="mu sm">{k.artist}</div>
                    </td>
                    <td>
                      {a.username ? <Link href={`/u/${a.username}`} className="lk">{a.name}</Link> : a.name}
                      {a.username && <div className="mu sm">@{a.username}</div>}
                    </td>
                    <td className="sm">{{ public: 'Публично', unlisted: 'По ссылке', private: 'Только автор' }[k.visibility]}</td>
                    <td>
                      {k.recommendationScore}
                      {k.recommendationScore >= RECOMMEND_THRESHOLD && <span className="pill ok" style={{ marginLeft: 6 }}>рекоменд.</span>}
                    </td>
                    <td className="ac">
                      <ActionMenu
                        items={
                          tab === 'active'
                            ? [
                                { label: 'Заблокировать', danger: true, onSelect: () => { blockKaraoke(k.id); reload(); } },
                                { label: 'Удалить', onSelect: () => { if (window.confirm(`Удалить «${k.title}»?`)) { softDeleteKaraoke(k.id); reload(); } } },
                              ]
                            : [
                                { label: 'Восстановить', onSelect: () => { restoreKaraoke(k.id); reload(); } },
                                ...(tab === 'deleted'
                                  ? [{ label: 'Удалить навсегда', danger: true, onSelect: () => { if (window.confirm(`Удалить «${k.title}» навсегда?`)) { deleteKaraoke(k.id); reload(); } } }]
                                  : []),
                              ]
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
