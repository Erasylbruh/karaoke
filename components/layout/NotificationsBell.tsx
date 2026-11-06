'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useDataVersion } from '@/components/DataProvider';
import { getNotifications, markNotificationsRead, getUserById } from '@/lib/storage';
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
  if (n.karaokeId) return `/karaoke/${n.karaokeId}${n.commentId ? `#c-${n.commentId}` : ''}`;
  if (n.type === 'follow' && n.actorId) {
    const u = getUserById(n.actorId);
    return u ? `/u/${u.username}` : null;
  }
  return null;
}

export default function NotificationsBell() {
  const { user } = useAuth();
  useDataVersion(); // live: re-render on new notifications
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!user) return null;
  const items = getNotifications(user.id);
  const unread = items.filter((n) => !n.read).length;

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
              <button className="lk mu sm" onClick={() => markNotificationsRead(user.id)}>
                Прочитать все
              </button>
            )}
          </div>
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
                    <span className="nb-tx">
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
