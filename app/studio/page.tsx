'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { getAuthorStats, getKaraokesByAuthor, visibilityRating } from '@/lib/storage';
import { Karaoke } from '@/lib/types';
import Tutorial from '@/components/ui/Tutorial';

const fmt = (n: number) => n.toLocaleString('ru-RU');

export default function StudioOverview() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ tracks: 0, views: 0, likes: 0, followers: 0, featured: 0 });
  const [recent, setRecent] = useState<Karaoke[]>([]);

  useEffect(() => {
    if (!user) return;
    setStats(getAuthorStats(user.id));
    setRecent(
      getKaraokesByAuthor(user.id)
        .filter((k) => k.status === 'active')
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
        .slice(0, 5)
    );
  }, [user]);

  if (!user) return null;

  return (
    <>
      <Tutorial
        page="studio"
        steps={[
          { title: 'Creator Studio', text: 'Ваш рабочий кабинет: статистика, контент, аналитика и настройки профиля.' },
          { title: 'Контент', text: 'В разделе «Контент» меняйте доступ к караоке: публично, по ссылке или только для вас.' },
          { title: 'Видимость', text: 'Видимость показывает, насколько активно сайт показывает трек: Отличная (7–10), Хорошая (4–6), Плохая (1–3). Она растёт от реакции слушателей.' },
        ]}
      />
      <h1 className="pg-h">Добро пожаловать, {user.name}</h1>
      <p className="pg-sub">Сводка по вашим караоке.</p>

      <div className="kpis">
        <div className="kpi"><b>{fmt(stats.tracks)}</b><span>Караоке</span></div>
        <div className="kpi"><b>{fmt(stats.views)}</b><span>Прослушивания</span></div>
        <div className="kpi"><b>{fmt(stats.likes)}</b><span>Лайки</span></div>
        <div className="kpi"><b>{fmt(stats.followers)}</b><span>Слушатели</span></div>
        <div className="kpi"><b>{fmt(stats.featured)}</b><span>Рекомендованы сайтом</span></div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ font: '700 18px var(--fd)', margin: 0 }}>Последние публикации</h2>
        <Link href="/create" className="bt pr sm">Создать караоке</Link>
      </div>

      {recent.length === 0 ? (
        <div className="card em2">Здесь появятся ваши караоке. Создайте первое!</div>
      ) : (
        <div className="tw">
          <table className="tbl">
            <thead>
              <tr><th>Караоке</th><th>Прослушивания</th><th>Лайки</th><th>Видимость</th></tr>
            </thead>
            <tbody>
              {recent.map((k) => (
                <tr key={k.id}>
                  <td><Link href={`/edit/${k.id}`} className="lk"><b>{k.title}</b></Link> <span className="mu sm">{k.artist}</span></td>
                  <td>{fmt(k.viewsCount)}</td>
                  <td>{fmt(k.likesCount)}</td>
                  <td>
                    {(() => {
                      const v = visibilityRating(k.recommendationScore);
                      return <span className={`pill ${v.kind}`}>{v.label} · {v.value}/10</span>;
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
