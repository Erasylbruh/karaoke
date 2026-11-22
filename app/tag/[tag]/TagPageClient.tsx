'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getKaraokesByTag, getAuthor } from '@/lib/storage';
import { safeDecode } from '@/lib/format';
import { useDataVersion } from '@/components/DataProvider';
import KaraokeTile from '@/components/karaoke/KaraokeTile';

/** All public karaokes with one genre tag, laid out like the catalog. */
export default function TagPage() {
  const params = useParams();
  const tag = safeDecode(params?.tag as string);
  const version = useDataVersion();

  const items = useMemo(
    () => getKaraokesByTag(tag).sort((a, b) => b.recommendationScore - a.recommendationScore),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tag, version]
  );

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
