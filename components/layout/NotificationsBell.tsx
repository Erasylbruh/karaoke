'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useDataVersion } from '@/components/DataProvider';
import { getKaraokeById, getNotifications, markNotificationsRead, getUserById } from '@/lib/storage';
import { markProjectWarningsRead, subscribeProjectWarningNotifications } from '@/lib/project-moderation';
import { AppNotification } from '@/lib/types';

const ICON: Record<AppNotification['type'], string> = {
  like: '♥',
  comment: '✎',
  reply: '↩',
  playlist: '＋',
  follow: '★',
  download: '↓',
  warning: '!',
  ban: '⛔',
};

function ago(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - +new Date(iso)) / 1000));
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  return new Date(iso).toLocaleDateString('ru-RU');
}

function linkFor(n: AppNotification): string | null {
  if (n.type === 'warning' && n.karaokeId) {
    const project = getKaraokeById(n.karaokeId);
    if (!project || project.status === 'deleted') return null;
    if (project.status === 'blocked') return `/edit/${n.karaokeId}`;
  }
  if (n.karaokeId) return `/karaoke/${n.karaokeId}${n.commentId ? `#c-${n.commentId}` : ''}`;
  if (n.type === 'follow' && n.actorId) {
    const u = getUserById(n.actorId);
    return u ? `/u/${u.username}` : null;
  }
  return null;
}

export default function NotificationsBell() {
  const { user } = useAuth();
  return user ? <AccountNotifications key={user.id} userId={user.id} /> : null;
}

function AccountNotifications({ userId }: { userId: string }) {
  useDataVersion(); // live: re-render on new notifications
  const [open, setOpen] = useState(false);
  const [projectWarnings, setProjectWarnings] = useState<AppNotification[]>([]);
  const [warningError, setWarningError] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => subscribeProjectWarningNotifications(userId, setProjectWarnings, () => {
    setWarningError('Не удалось загрузить предупреждения по проектам.');
  }), [userId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const items = [...getNotifications(userId), ...projectWarnings].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const unread = items.filter((n) => !n.read).length;

  function markAllRead() {
    markNotificationsRead(userId);
    void markProjectWarningsRead(userId, projectWarnings).catch(() => {
      setWarningError('Не удалось отметить предупреждения прочитанными.');
    });
  }

  return (
    <div className="nb" ref={ref}>
      <button
        className="bt nb-btn"
        aria-label={unread ? `Уведомления: ${unread} новых` : 'Уведомления'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Bell style={{ width: 16, height: 16 }} />
        {unread > 0 && <span className="nb-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="nb-menu" role="dialog" aria-label="Уведомления">
          <div className="nb-head">
            <b>Уведомления</b>
            {unread > 0 && (
              <button className="lk mu sm" onClick={markAllRead}>
                Прочитать все
              </button>
            )}
          </div>
          {warningError && <p className="mu sm px-3 py-2" role="alert">{warningError}</p>}
          {items.length === 0 ? (
            <p className="mu sm" style={{ padding: '16px 14px', margin: 0 }}>
              Пока пусто. Здесь появятся лайки, комментарии, подписки и сообщения модерации.
            </p>
          ) : (
            <ul>
              {items.slice(0, 30).map((n) => {
                const href = linkFor(n);
                const body = (
                  <>
                    <span className={`nb-ic ${n.type === 'warning' || n.type === 'ban' ? 'dg' : ''}`}>{ICON[n.type]}</span>
                    <span className="nb-tx wrap-anywhere">
                      {n.text}
                      <small>{ago(n.createdAt)}</small>
                    </span>
                    {!n.read && <i className="nb-new" aria-label="новое" />}
                  </>
                );
                return (
                  <li key={n.id}>
                    {href ? (
                      <Link href={href} onClick={() => setOpen(false)}>
                        {body}
                      </Link>
                    ) : (
                      <div>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
