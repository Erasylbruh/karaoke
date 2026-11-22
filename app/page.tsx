'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { getPublicKaraokes, getAuthor } from '@/lib/storage';
import { useDataVersion } from '@/components/DataProvider';
import KaraokeTile from '@/components/karaoke/KaraokeTile';

const TICKER_LINES = [
  'Город гаснет за стеклом',
  'Фонари плывут рекой',
  'Я держу твой голос в кармане',
  'Как проездной на всю зиму',
  'Ехать, ехать, не домой',
  'Просто ехать за тобой',
  'Остановка — это мы',
  'Свет внутри, а снаружи дым',
  'Пой со мной, пока не рассвело',
  'Пусть услышит весь район',
];

const HERO_SCENES = [
  { id: 'amber', label: 'Янтарь', bg: '#181410', accent: '#ffb547', text: '#f4f4f5' },
  { id: 'vinyl', label: 'Винил', bg: '#1e1318', accent: '#fb7185', text: '#fff1f2' },
  { id: 'indie', label: 'Инди', bg: '#101b24', accent: '#38bdf8', text: '#f0f9ff' },
] as const;

type Sort = 'pop' | 'new' | 'old';

const RECOMMENDED_COUNT = 6;

function CatalogContent() {
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get('search') || '';
  const version = useDataVersion();

  const [searchInput, setSearchInput] = useState<string | null>(null);
  const searchQuery = searchInput ?? urlSearch;
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('pop');
  const [tickerIndex, setTickerIndex] = useState(0);
  const [sceneIdx, setSceneIdx] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const karaokes = useMemo(() => getPublicKaraokes(), [version]);

  useEffect(() => {
    const timer = setInterval(() => setTickerIndex((prev) => (prev + 1) % TICKER_LINES.length), 4000);
    return () => clearInterval(timer);
  }, []);

  const topGenres = useMemo(() => {
    const counts = new Map<string, number>();
    karaokes.forEach((k) => {
      k.tags
        .filter((t) => t && t.toLowerCase() !== 'караоке')
        .forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([g]) => g);
  }, [karaokes]);

  const filteredKaraokes = useMemo(() => {
    const k = searchQuery.trim().toLowerCase();
    const result = karaokes.filter((x) => {
      if (selectedGenre && !x.tags.some((t) => t.toLowerCase() === selectedGenre.toLowerCase())) {
        return false;
      }
      if (!k) return true;
      return (x.title + ' ' + x.artist + ' ' + x.tags.join(' ')).toLowerCase().includes(k);
    });

    switch (sort) {
      case 'pop':
        return [...result].sort((a, b) => b.viewsCount - a.viewsCount);
      case 'new':
        return [...result].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      case 'old':
        return [...result].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
  }, [karaokes, searchQuery, selectedGenre, sort]);

  const recommended = useMemo(() => {
    const byScore = [...karaokes].sort((a, b) => b.recommendationScore - a.recommendationScore);
    const featured = byScore.filter((x) => x.isFeatured);
    return (featured.length > 0 ? featured : byScore).slice(0, RECOMMENDED_COUNT);
  }, [karaokes]);

  const filtering = searchQuery.trim().length > 0 || !!selectedGenre;
  const scene = HERO_SCENES[sceneIdx];

  const chips: { id: Sort; label: string }[] = [
    { id: 'pop', label: 'Популярные' },
    { id: 'new', label: 'Новые' },
    { id: 'old', label: 'Старые' },
  ];

  return (
    <section id="home">
      <div className="hero">
        <div className="hero-copy">
          <h1>Покажите песню так, как вы её слышите</h1>
          <div className="hero-actions">
            <label className="sr">
              <svg className="ic" aria-hidden="true" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                id="q"
                type="search"
                placeholder="Найти песню, артиста или жанр"
                aria-label="Поиск"
                value={searchQuery}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </label>
            <Link href="/create" className="bt pr hero-cta">
              <Plus size={16} aria-hidden="true" />
              Создать своё караоке
            </Link>
          </div>
        </div>

        <div
          className="tk"
          style={
            {
              background: scene.bg,
              color: scene.text,
              '--wa': scene.accent,
              border: '1px solid rgba(255, 255, 255, 0.09)',
            } as React.CSSProperties
          }
        >
          <div className="tk-top">
            <span className="tk-pill" style={{ color: scene.accent }}>● Превью сцены</span>
            <div className="tk-scenes" role="group" aria-label="Стиль превью">
              {HERO_SCENES.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  className={idx === sceneIdx ? 'on' : ''}
                  onClick={() => setSceneIdx(idx)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <p className="wp">
            <span key={`${scene.id}-${tickerIndex}`} onClick={() => setTickerIndex((p) => (p + 1) % TICKER_LINES.length)} style={{ cursor: 'pointer' }}>
              {TICKER_LINES[tickerIndex]}
            </span>
          </p>
          <small>Нажмите на строку или переключите тему оформления</small>
        </div>
      </div>

      {!filtering && recommended.length > 0 && (
        <section className="home-sec" aria-labelledby="rec-title">
          <h2 id="rec-title" className="home-h">Рекомендованные</h2>
          <div className="rec-row">
            {recommended.map((item) => (
              <KaraokeTile key={item.id} karaoke={item} authorName={getAuthor(item).name} />
            ))}
          </div>
        </section>
      )}

      <div className="home-sec-head">
        <h2 className="home-h">
          {selectedGenre ? `Жанр: ${selectedGenre}` : searchQuery.trim() ? 'Результаты поиска' : 'Все работы'}
        </h2>
      </div>

      {topGenres.length > 0 && (
        <div className="genre-strip" role="group" aria-label="Фильтр по жанру">
          <button
            type="button"
            className="ch"
            aria-pressed={selectedGenre === null}
            onClick={() => setSelectedGenre(null)}
          >
            Все жанры
          </button>
          {topGenres.map((g) => (
            <button
              key={g}
              type="button"
              className="ch"
              aria-pressed={selectedGenre === g}
              onClick={() => setSelectedGenre(selectedGenre === g ? null : g)}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      <div className="bar" id="sorts" role="group" aria-label="Сортировка">
        {chips.map((c) => (
          <button key={c.id} className="ch" aria-pressed={sort === c.id} onClick={() => setSort(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="gr" id="gr">
        {filteredKaraokes.length > 0 ? (
          filteredKaraokes.map((item) => (
            <KaraokeTile
              key={item.id}
              karaoke={item}
              authorName={getAuthor(item).name}
              badge={item.isFeatured ? 'Рекомендовано' : undefined}
            />
          ))
        ) : (
          <p className="em">
            {filtering
              ? 'Ничего не нашли по выбранному фильтру. Сбросьте жанр или попробуйте другой запрос.'
              : 'Пока нет опубликованных работ. Создайте первую!'}
          </p>
        )}
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '60vh' }} />}>
      <CatalogContent />
    </Suspense>
  );
}
