'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Karaoke } from '@/lib/types';
import { getPublicKaraokes, getAuthor } from '@/lib/storage';
import KaraokeTile from '@/components/karaoke/KaraokeTile';
import Tutorial from '@/components/ui/Tutorial';

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

type Sort = 'rec' | 'pop' | 'new' | 'old';

function CatalogContent() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || '';

  const [karaokes, setKaraokes] = useState<Karaoke[]>([]);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [sort, setSort] = useState<Sort>('rec');
  const [tickerIndex, setTickerIndex] = useState(0);

  useEffect(() => {
    setKaraokes(getPublicKaraokes());
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTickerIndex((prev) => (prev + 1) % TICKER_LINES.length), 4000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (searchParams.get('search')) setSearchQuery(searchParams.get('search') || '');
  }, [searchParams]);

  const filteredKaraokes = useMemo(() => {
    const k = searchQuery.trim().toLowerCase();
    const result = karaokes.filter((x) => {
      if (!k) return true;
      return (x.title + ' ' + x.artist + ' ' + x.tags.join(' ')).toLowerCase().includes(k);
    });

    switch (sort) {
      case 'rec':
        // "Recommended" is the site-wide list: only tracks that reached the score threshold.
        return result.filter((x) => x.isFeatured).sort((a, b) => b.recommendationScore - a.recommendationScore);
      case 'pop':
        return result.sort((a, b) => b.viewsCount - a.viewsCount);
      case 'new':
        return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      case 'old':
        return result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
  }, [karaokes, searchQuery, sort]);

  const chips: { id: Sort; label: string }[] = [
    { id: 'rec', label: 'Рекомендованные' },
    { id: 'pop', label: 'Популярные' },
    { id: 'new', label: 'Новые' },
    { id: 'old', label: 'Старые' },
  ];

  return (
    <section id="home">
      <Tutorial
        page="home"
        steps={[
          { title: 'Каталог караоке', text: 'Наведите курсор на обложку: строки песни запустятся как беззвучное караоке.' },
          { title: 'Поиск и сортировка', text: 'Ищите по названию, исполнителю или тегу. «Рекомендованные» — треки, которые набрали популярность у слушателей.' },
          { title: 'Свои караоке', text: 'Кнопка «Создать» в шапке открывает редактор: загрузите трек, расставьте тайминги и опубликуйте.' },
        ]}
      />
      <div className="hero">
        <div>
          <h1>Покажите песню так, как вы её слышите</h1>
          <p className="sub">
            Загрузите трек, расставьте строки по времени и опубликуйте караоке со своим шрифтом и цветами.
          </p>
          <label className="sr">
            <svg className="ic" aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              id="q"
              type="search"
              placeholder="Найти песню, артиста или тег"
              aria-label="Поиск"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="tk">
          <p className="wp">
            <span key={tickerIndex}>{TICKER_LINES[tickerIndex]}</span>
          </p>
          <small>Так строки подсвечиваются в плеере</small>
        </div>
      </div>

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
            {searchQuery
              ? `Ничего не нашли по запросу «${searchQuery}». Попробуйте другое название или тег.`
              : 'Пока нет рекомендованных треков — загляните в «Новые» или «Популярные».'}
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
