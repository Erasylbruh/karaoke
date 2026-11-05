'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Karaoke } from '@/lib/types';
import { getKaraokesByTag, getAuthor } from '@/lib/storage';
import KaraokeTile from '@/components/karaoke/KaraokeTile';

/** All public karaokes with one genre tag, laid out like the catalog. */
export default function TagPage() {
  const params = useParams();
  const tag = decodeURIComponent((params?.tag as string) || '');
  const [items, setItems] = useState<Karaoke[]>([]);

  useEffect(() => {
    setItems(getKaraokesByTag(tag).sort((a, b) => b.recommendationScore - a.recommendationScore));
  }, [tag]);

  return (
    <div className="pg">
      <p className="mu sm" style={{ margin: 0 }}>Жанр</p>
      <h1 className="pg-h">{tag}</h1>
      <p className="pg-sub">{items.length} караоке</p>
      {items.length === 0 ? (
        <p className="em2">
          Пока нет караоке в этом жанре. <Link href="/" style={{ color: 'var(--ac)' }}>В каталог</Link>
        </p>
      ) : (
        <div className="gr" style={{ padding: 0 }}>
          {items.map((k) => (
            <KaraokeTile key={k.id} karaoke={k} authorName={getAuthor(k).name} badge={k.isFeatured ? 'Рекомендовано' : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}
