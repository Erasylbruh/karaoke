'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { useDataVersion } from '@/components/DataProvider';
import { getAuthorStats, getDailyStats } from '@/lib/storage';
import DailyChart from '@/components/ui/DailyChart';

export default function StudioAnalytics() {
  const { user } = useAuth();
  useDataVersion(); // charts update live as listens / follows / downloads arrive
  if (!user) return null;

  const stats = getAuthorStats(user.id);
  const er = stats.views ? ((stats.likes / stats.views) * 100).toFixed(1) : '0';

  return (
    <>
      <h1 className="pg-h">Аналитика</h1>
      <p className="pg-sub">Как слушатели реагируют на ваши караоке за последние 30 дней.</p>

      <div className="kpis">
        <div className="kpi"><b>{stats.views.toLocaleString('ru-RU')}</b><span>Всего прослушиваний</span></div>
        <div className="kpi"><b>{stats.likes.toLocaleString('ru-RU')}</b><span>Всего лайков</span></div>
        <div className="kpi"><b>{er}%</b><span>Лайков на прослушивание</span></div>
        <div className="kpi"><b>{stats.followers}</b><span>Слушателей</span></div>
      </div>

      <div className="charts">
        <DailyChart title="Прослушивания" data={getDailyStats(user.id, 'listen')} />
        <DailyChart title="Новые подписчики" data={getDailyStats(user.id, 'follow')} color="#4ade80" />
        <DailyChart title="Скачивания видео" data={getDailyStats(user.id, 'download')} color="#93c5fd" />
      </div>
    </>
  );
}
