'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Karaoke, SortOption } from '@/lib/types';
import { getKaraokes } from '@/lib/storage';
import KaraokeCard from '@/components/karaoke/KaraokeCard';

function HomeContent() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || '';

  const [karaokes, setKaraokes] = useState<Karaoke[]>([]);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('recommended');

  useEffect(() => {
    setKaraokes(getKaraokes());
  }, []);

  useEffect(() => {
    if (searchParams.get('search')) {
      setSearchQuery(searchParams.get('search') || '');
    }
  }, [searchParams]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    karaokes.forEach((k) => k.tags.forEach((t) => set.add(t)));
    return ['all', ...Array.from(set)];
  }, [karaokes]);

  const filteredKaraokes = useMemo(() => {
    let result = [...karaokes];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (k) =>
          k.title.toLowerCase().includes(q) ||
          k.artist.toLowerCase().includes(q) ||
          k.description.toLowerCase().includes(q) ||
          k.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    if (selectedTag !== 'all') {
      result = result.filter((k) => k.tags.includes(selectedTag));
    }

    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'oldest':
        result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case 'popular':
        result.sort((a, b) => (b.likesCount * 3 + b.viewsCount) - (a.likesCount * 3 + a.viewsCount));
        break;
      case 'recommended':
        result.sort((a, b) => {
          if (a.isFeatured && !b.isFeatured) return -1;
          if (!a.isFeatured && b.isFeatured) return 1;
          return b.likesCount - a.likesCount;
        });
        break;
    }

    return result;
  }, [karaokes, searchQuery, selectedTag, sortBy]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-20">
      
      {/* Minimalist Hero Section */}
      <section className="pt-16 pb-16 md:pt-20 md:pb-20 border-b border-zinc-800">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center space-y-4">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-zinc-100">
            Создавай караоке-анимации
          </h1>

          <p className="text-sm sm:text-base text-zinc-400 max-w-xl mx-auto leading-relaxed">
            Синхронизируй текст с музыкой, настрой стиль и поделись с друзьями. Скачивай готовые видео с водяным знаком.
          </p>

          <div className="flex items-center justify-center gap-3 pt-2">
            <Link
              href="/create"
              className="bg-green-500 hover:bg-green-600 text-black font-medium text-sm px-5 py-2.5 rounded-lg transition-colors"
            >
              Создать караоке
            </Link>

            <a
              href="#catalog"
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm px-5 py-2.5 rounded-lg border border-zinc-700 transition-colors"
            >
              Смотреть каталог
            </a>
          </div>
        </div>
      </section>

      {/* Main Catalog & Discovery Section */}
      <section id="catalog" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        
        {/* Controls Bar: Search & Sort Tabs */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-zinc-800">
          
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Поиск по названию, артисту или тегам..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-green-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-200"
              >
                Очистить
              </button>
            )}
          </div>

          {/* Clean Text-only Sort Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-zinc-900 border border-zinc-800 overflow-x-auto">
            {[
              { id: 'recommended', label: 'Рекомендованные' },
              { id: 'popular', label: 'Популярные' },
              { id: 'newest', label: 'Новые' },
              { id: 'oldest', label: 'Старые' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSortBy(tab.id as SortOption)}
                className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  sortBy === tab.id
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

        </div>

        {/* Tag Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto py-4">
          <span className="text-xs text-zinc-500 shrink-0 mr-1">Теги:</span>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-3 py-1 rounded-full text-xs transition-colors capitalize shrink-0 ${
                selectedTag === tag
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 font-medium'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {tag === 'all' ? 'Все' : `#${tag}`}
            </button>
          ))}
        </div>

        {/* Karaokes Grid */}
        {filteredKaraokes.length === 0 ? (
          <div className="text-center py-16 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
            <h3 className="font-medium text-base text-zinc-200">Ничего не найдено</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Попробуйте изменить поисковый запрос или выберите другой тег.
            </p>
            <button
              onClick={() => { setSearchQuery(''); setSelectedTag('all'); }}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700"
            >
              Сбросить фильтры
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pt-2">
            {filteredKaraokes.map((item) => (
              <KaraokeCard key={item.id} karaoke={item} />
            ))}
          </div>
        )}

      </section>

    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <HomeContent />
    </Suspense>
  );
}
