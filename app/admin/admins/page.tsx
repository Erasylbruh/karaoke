'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { User } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { useDataVersion } from '@/components/DataProvider';
import { getUsers, updateUserRole, normalizeUsername } from '@/lib/storage';
import { safeMediaUrl } from '@/lib/format';

export default function AdminAdmins() {
  const { user: me } = useAuth();
  const version = useDataVersion();
  const [query, setQuery] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const admins = useMemo(() => getUsers().filter((u) => u.role === 'admin'), [version]);

  const q = normalizeUsername(query);
  const rows = admins.filter((u) => !q || u.username.toLowerCase().includes(q) || u.name.toLowerCase().includes(q));

  const revoke = (u: User) => {
    if (admins.length <= 1) return window.alert('Нельзя забрать права у последнего администратора');
    if (!window.confirm(`Забрать права администратора у @${u.username}?`)) return;
    updateUserRole(u.id, 'user');
  };

  return (
    <>
      <h1 className="pg-h">Администраторы</h1>
      <p className="pg-sub">Новых администраторов назначают в разделе «Пользователи».</p>

      <input
        className="in"
        style={{ maxWidth: 360, marginBottom: 16 }}
        type="search"
        placeholder="Поиск по нику или тегу"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Поиск администраторов"
      />

      <div className="tw">
        <table className="tbl">
          <thead>
            <tr><th>Администратор</th><th>Регистрация</th><th className="ac">Действия</th></tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="who">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={safeMediaUrl(u.avatar) || '/brand/karaokecraft-app-icon.svg'} alt="" className="av" />
                    <div>
                      <Link href={`/u/${u.username}`} className="lk"><b>{u.name}</b></Link>
                      <small>@{u.username}</small>
                    </div>
                  </div>
                </td>
                <td>{new Date(u.createdAt).toLocaleDateString('ru-RU')}</td>
                <td className="ac">
                  {u.id === me?.id ? (
                    <span className="mu sm">это вы</span>
                  ) : (
                    <button className="bt sm dg" onClick={() => revoke(u)}>Забрать права</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
