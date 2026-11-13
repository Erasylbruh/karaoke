'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useDataVersion } from '@/components/DataProvider';
import ProjectWarningDialog from '@/components/admin/ProjectWarningDialog';
import { Karaoke } from '@/lib/types';
import { getKaraokes, blockKaraoke, restoreKaraoke, softDeleteKaraoke, deleteKaraoke, getAuthor, RECOMMEND_THRESHOLD, hasInlineCover, moveCoverToStorage } from '@/lib/storage';
import Tabs from '@/components/ui/Tabs';
import ActionMenu from '@/components/ui/ActionMenu';

type Tab = 'active' | 'blocked' | 'deleted';

export default function AdminTracks() {
  const { user } = useAuth();
  useDataVersion();
  const [tab, setTab] = useState<Tab>('active');
  const [query, setQuery] = useState('');
  const [warningTarget, setWarningTarget] = useState<Karaoke | null>(null);
  const [notice, setNotice] = useState('');
  const [moving, setMoving] = useState<{ done: number; total: number } | null>(null);

  const items = user ? getKaraokes() : [];
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
  const inline = items.filter(hasInlineCover);

  /** One-off move of covers stored inside track documents to Supabase Storage. */
  const moveCovers = async () => {
    const list = inline.map((k) => k.id);
    let ok = 0;
    let failed = 0;
    setNotice('');
    setMoving({ done: 0, total: list.length });
    for (const id of list) {
      try {
        if (await moveCoverToStorage(id)) ok++;
      } catch (e) {
        failed++;
        console.warn('[covers] could not move', id, e);
      }
      setMoving({ done: ok + failed, total: list.length });
    }
    setMoving(null);
    setNotice(
      failed
        ? `Перенесено обложек: ${ok}. Не удалось: ${failed} — проверьте, что бакет Supabase принимает картинки (supabase/storage.sql).`
        : `Перенесено обложек: ${ok}.`
    );
  };

  return (
    <>
      <h1 className="pg-h">Треки</h1>
      <p className="pg-sub">Предупреждения авторам, блокировка и восстановление проектов.</p>

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
      {inline.length > 0 && (
        <div className="card row" style={{ marginBottom: 16, justifyContent: 'space-between', padding: 14 }}>
          <span className="sm">
            Обложек внутри записей треков: {inline.length}. Если перенести их в хранилище файлом, каталог будет открываться быстрее.
          </span>
          <button type="button" className="bt sm" disabled={!!moving} onClick={moveCovers}>
            {moving ? `Переносим… ${moving.done} из ${moving.total}` : 'Перенести обложки'}
          </button>
        </div>
      )}
      {notice && <p className="mb-4 text-sm" role="status">{notice}</p>}

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
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        {user && tab !== 'deleted' && (
                          <button type="button" className="bt sm" aria-haspopup="dialog"
                            aria-label={`Предупредить автора проекта «${k.title}»`}
                            onClick={() => {
                              setNotice('');
                              setWarningTarget(k);
                            }}>Предупредить</button>
                        )}
                        <ActionMenu
                          items={tab === 'active'
                            ? [
                                { label: 'Заблокировать', danger: true, onSelect: () => blockKaraoke(k.id) },
                                { label: 'Удалить', onSelect: () => { if (window.confirm(`Удалить «${k.title}»?`)) softDeleteKaraoke(k.id); } },
                              ]
                            : [
                                { label: 'Восстановить', onSelect: () => restoreKaraoke(k.id) },
                                ...(tab === 'deleted'
                                  ? [{ label: 'Удалить навсегда', danger: true, onSelect: () => { if (window.confirm(`Удалить «${k.title}» навсегда?`)) deleteKaraoke(k.id); } }]
                                  : []),
                              ]}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {user && warningTarget && (
        <ProjectWarningDialog key={warningTarget.id} project={warningTarget} moderatorId={user.id}
          onClose={() => setWarningTarget(null)} onSent={() => {
            setWarningTarget(null);
            setNotice('Предупреждение отправлено автору проекта.');
          }} />
      )}
    </>
  );
}
