'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Karaoke, User } from '@/lib/types';
import { getKaraokes, getUsers, effectiveStatus } from '@/lib/storage';
import Tabs from '@/components/ui/Tabs';

type Tab = 'overview' | 'top' | 'new';

export default function AdminAnalytics() {
  const [tab, setTab] = useState<Tab>('overview');
  const [karaokes, setKaraokes] = useState<Karaoke[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    setKaraokes(getKaraokes().filter((k) => k.status === 'active'));
    setUsers(getUsers());
  }, []);

  const views = karaokes.reduce((s, k) => s + k.viewsCount, 0);
  const likes = karaokes.reduce((s, k) => s + k.likesCount, 0);
  const banned = users.filter((u) => ['banned_temp', 'banned_perm'].includes(effectiveStatus(u))).length;
  const top = [...karaokes].sort((a, b) => b.viewsCount - a.viewsCount).slice(0, 10);
  const newest = [...users].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 10);

  return (
    <>
      <h1 className="pg-h">Аналитика</h1>
      <p className="pg-sub">Состояние платформы.</p>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        label="Разделы аналитики"
        tabs={[
          { id: 'overview', label: 'Обзор' },
          { id: 'top', label: 'Топ треков' },
          { id: 'new', label: 'Новые пользователи' },
        ]}
      />

      {tab === 'overview' && (
        <div className="kpis">
          <div className="kpi"><b>{karaokes.length}</b><span>Активных треков</span></div>
          <div className="kpi"><b>{users.length}</b><span>Пользователей</span></div>
          <div className="kpi"><b>{views.toLocaleString('ru-RU')}</b><span>Прослушиваний</span></div>
          <div className="kpi"><b>{likes.toLocaleString('ru-RU')}</b><span>Лайков</span></div>
          <div className="kpi"><b>{karaokes.filter((k) => k.isFeatured).length}</b><span>Рекомендованных</span></div>
          <div className="kpi"><b>{banned}</b><span>Забанено</span></div>
        </div>
      )}

      {tab === 'top' && (
        <div className="tw">
          <table className="tbl">
            <thead><tr><th>#</th><th>Трек</th><th>Прослушивания</th><th>Лайки</th></tr></thead>
            <tbody>
              {top.map((k, i) => (
                <tr key={k.id}>
                  <td>{i + 1}</td>
                  <td><Link href={`/karaoke/${k.id}`} className="lk"><b>{k.title}</b></Link> <span className="mu sm">{k.artist}</span></td>
                  <td>{k.viewsCount.toLocaleString('ru-RU')}</td>
                  <td>{k.likesCount.toLocaleString('ru-RU')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'new' && (
        <div className="tw">
          <table className="tbl">
            <thead><tr><th>Пользователь</th><th>Регистрация</th></tr></thead>
            <tbody>
              {newest.map((u) => (
                <tr key={u.id}>
                  <td><Link href={`/u/${u.username}`} className="lk"><b>{u.name}</b></Link> <span className="mu sm">@{u.username}</span></td>
                  <td>{new Date(u.createdAt).toLocaleDateString('ru-RU')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
