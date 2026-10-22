'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Karaoke } from '@/lib/types';
import { getKaraokes } from '@/lib/storage';

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

const fmt = (n: number) =>
  n >= 1000
    ? (n / 1000).toFixed(1).replace('.0', '').replace('.', ',') + ' тыс.'
    : '' + n;

function CatalogContent() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || '';

  const [karaokes, setKaraokes] = useState<Karaoke[]>([]);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [sort, setSort] = useState<'rec' | 'pop' | 'new' | 'old'>('rec');
  const [tickerIndex, setTickerIndex] = useState(0);

  useEffect(() => {
    setKaraokes(getKaraokes());
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTickerIndex((prev) => (prev + 1) % TICKER_LINES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (searchParams.get('search')) {
      setSearchQuery(searchParams.get('search') || '');
    }
  }, [searchParams]);

  const filteredKaraokes = useMemo(() => {
    const k = searchQuery.trim().toLowerCase();
    let result = karaokes.filter((x) => {
      if (!k) return true;
      const combined = (x.title + ' ' + x.artist + ' ' + x.tags.join(' ')).toLowerCase();
      return combined.includes(k);
    });

    switch (sort) {
      case 'rec':
        result.sort((a, b) => (b.recommendationScore ?? (b.isFeatured ? 10 : 5)) - (a.recommendationScore ?? (a.isFeatured ? 10 : 5)));
        break;
      case 'pop':
        result.sort((a, b) => b.viewsCount - a.viewsCount);
        break;
      case 'new':
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'old':
        result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
    }

    return result;
  }, [karaokes, searchQuery, sort]);

  return (
    <section id="home">
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
        <button
          className="ch"
          aria-pressed={sort === 'rec'}
          onClick={() => setSort('rec')}
        >
          Рекомендованные
        </button>
        <button
          className="ch"
          aria-pressed={sort === 'pop'}
          onClick={() => setSort('pop')}
        >
          Популярные
        </button>
        <button
          className="ch"
          aria-pressed={sort === 'new'}
          onClick={() => setSort('new')}
        >
          Новые
        </button>
        <button
          className="ch"
          aria-pressed={sort === 'old'}
          onClick={() => setSort('old')}
        >
          Старые
        </button>
      </div>

      <div className="gr" id="gr">
        {filteredKaraokes.length > 0 ? (
          filteredKaraokes.map((item) => {
            const bg = item.style?.backgroundColor || '#1d1b3a';
            const ac = item.style?.activeColor || '#ffb547';
            return (
              <Link href={`/karaoke/${item.id}`} key={item.id} className="cd">
                <div
                  className="cv"
                  style={{
                    background: `linear-gradient(145deg, ${bg}, ${ac})`,
                  }}
                >
                  {item.title[0]}
                </div>
                <b>{item.title}</b>
                <small>{item.artist}</small>
                <div className="st">
                  <span>
                    <svg className="ic" viewBox="0 0 24 24">
                      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                    </svg>
                    {fmt(item.likesCount)}
                  </span>
                  <span>
                    <svg className="ic" viewBox="0 0 24 24">
                      <polygon points="6 3 20 12 6 21 6 3" />
                    </svg>
                    {fmt(item.viewsCount)}
                  </span>
                </div>
              </Link>
            );
          })
        ) : (
          <p className="em">
            Ничего не нашли по запросу «{searchQuery}». Попробуйте другое название или тег.
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
