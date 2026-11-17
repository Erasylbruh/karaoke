'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { User, UserStatus } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { useDataVersion } from '@/components/DataProvider';
import { getUsers, moderateUser, effectiveStatus, updateUserRole, normalizeUsername, usersWithPublicPrivateData, movePrivateUserData } from '@/lib/storage';
import { pluralRu, safeMediaUrl } from '@/lib/format';
import Tabs from '@/components/ui/Tabs';
import ActionMenu, { ActionItem } from '@/components/ui/ActionMenu';
import ModerationModal, { ModerationKind } from '@/components/admin/ModerationModal';

type Tab = 'all' | 'warned' | 'banned_temp' | 'banned_perm';

const STATUS_PILL: Record<UserStatus, { cls: string; label: string }> = {
  active: { cls: 'ok', label: 'Активен' },
  warned: { cls: 'wn', label: 'Предупреждён' },
  banned_temp: { cls: 'dg', label: 'Временный бан' },
  banned_perm: { cls: 'dg', label: 'Перманентный бан' },
};

export default function AdminUsers() {
  const { user: me } = useAuth();
  const version = useDataVersion();
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<{ kind: ModerationKind; user: User } | null>(null);
  const [moved, setMoved] = useState<number | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const users = useMemo(() => getUsers(), [version]);
  const withStatus = useMemo(() => users.map((u) => ({ u, s: effectiveStatus(u) })), [users]);
  const countOf = (t: Tab) => (t === 'all' ? users.length : withStatus.filter((x) => x.s === t).length);

  const q = normalizeUsername(query);
  const rows = withStatus.filter(({ u, s }) => {
    if (tab !== 'all' && s !== tab) return false;
    if (!q) return true;
    const raw = query.trim().toLowerCase();
    return u.username.toLowerCase().includes(q) || u.name.toLowerCase().includes(q) || (!!u.email && !!raw && u.email.toLowerCase().includes(raw));
  });

  const actionsFor = (u: User, s: UserStatus): ActionItem[] => {
    const items: ActionItem[] = [
      { label: 'Предупредить', onSelect: () => setModal({ kind: 'warn', user: u }) },
      { label: 'Бан на срок', onSelect: () => setModal({ kind: 'ban_temp', user: u }) },
      { label: 'Бан навсегда', danger: true, onSelect: () => setModal({ kind: 'ban_perm', user: u }) },
    ];
    if (s !== 'active') items.push({ label: 'Снять ограничения', onSelect: () => moderateUser(u.id, 'clear') });
    if (u.role !== 'admin') items.push({ label: 'Сделать админом', onSelect: () => updateUserRole(u.id, 'admin') });
    return items;
  };

  return (
    <>
      <h1 className="pg-h">Пользователи</h1>
      <p className="pg-sub">Предупреждения, временные и перманентные блокировки.</p>

      {usersWithPublicPrivateData().length > 0 && (
        <div className="card row" style={{ marginBottom: 16, justifyContent: 'space-between', padding: 14 }}>
          <span className="sm">
            У {pluralRu(usersWithPublicPrivateData().length, 'профиля', 'профилей', 'профилей', true)} email или скрытые контакты всё ещё лежат в открытой части. Перенесите их в закрытую.
          </span>
          <button type="button" className="bt sm" onClick={() => setMoved(movePrivateUserData())}>
            Скрыть личные данные
          </button>
        </div>
      )}
      {moved !== null && <p className="mb-4 text-sm" role="status">Перенесено профилей: {moved}.</p>}

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        label="Статус пользователей"
        tabs={[
          { id: 'all', label: 'Пользователи', count: countOf('all') },
          { id: 'warned', label: 'Предупреждение', count: countOf('warned') },
          { id: 'banned_temp', label: 'Временный бан', count: countOf('banned_temp') },
          { id: 'banned_perm', label: 'Перманентный бан', count: countOf('banned_perm') },
        ]}
      />

      <input
        className="in"
        style={{ maxWidth: 360, marginBottom: 16 }}
        type="search"
        placeholder="Поиск по имени, тегу или почте"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Поиск пользователей"
      />

      {rows.length === 0 ? (
        <div className="card em2">Никого не найдено.</div>
      ) : (
        <div className="tw">
          <table className="tbl">
            <thead>
              <tr><th>Пользователь</th><th>Статус</th><th>Регистрация</th><th className="ac">Действия</th></tr>
            </thead>
            <tbody>
              {rows.map(({ u, s }) => {
                const pill = STATUS_PILL[s];
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="who">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={safeMediaUrl(u.avatar) || '/brand/karaokecraft-app-icon.svg'} alt="" className="av" />
                        <div>
                          <Link href={`/u/${u.username}`} className="lk"><b>{u.name}</b></Link>
                          <small>@{u.username}{u.role === 'admin' && ' · админ'}</small>
                          {/* Private: admins read every userPrivate document for moderation. */}
                          {u.email ? (
                            <a href={`mailto:${u.email}`} className="lk mu sm" style={{ display: 'block', overflowWrap: 'anywhere' }}>{u.email}</a>
                          ) : (
                            <small className="mu">почта не указана</small>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`pill ${pill.cls}`}>{pill.label}</span>
                      {s === 'banned_temp' && u.banUntil && (
                        <div className="mu sm">до {new Date(u.banUntil).toLocaleDateString('ru-RU')}</div>
                      )}
                      {!!u.warnings && <div className="mu sm">предупреждений: {u.warnings}</div>}
                      {u.banReason && <div className="mu sm">{u.banReason}</div>}
                    </td>
                    <td>{new Date(u.createdAt).toLocaleDateString('ru-RU')}</td>
                    <td className="ac">
                      {u.id === me?.id ? <span className="mu sm">это вы</span> : <ActionMenu items={actionsFor(u, s)} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ModerationModal
          kind={modal.kind}
          target={modal.user.username}
          onCancel={() => setModal(null)}
          onConfirm={({ reason, days }) => {
            moderateUser(modal.user.id, modal.kind, { reason, days, moderatorId: me?.id });
            setModal(null);
          }}
        />
      )}
    </>
  );
}
