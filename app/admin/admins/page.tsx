'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { User } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { getUsers, updateUserRole, normalizeUsername } from '@/lib/storage';

export default function AdminAdmins() {
  const { user: me } = useAuth();
  const [admins, setAdmins] = useState<User[]>([]);
  const [query, setQuery] = useState('');

  const reload = useCallback(() => setAdmins(getUsers().filter((u) => u.role === 'admin')), []);
  useEffect(reload, [reload]);

  const q = normalizeUsername(query);
  const rows = admins.filter((u) => !q || u.username.toLowerCase().includes(q) || u.name.toLowerCase().includes(q));

  const revoke = (u: User) => {
    if (admins.length <= 1) return window.alert('Нельзя забрать права у последнего администратора');
    if (!window.confirm(`Забрать права администратора у @${u.username}?`)) return;
    updateUserRole(u.id, 'user');
    reload();
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
                    <img src={u.avatar} alt="" className="av" />
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
