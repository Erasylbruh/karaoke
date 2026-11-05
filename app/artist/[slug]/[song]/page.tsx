'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Karaoke } from '@/lib/types';
import { getKaraokesByArtist, getAuthor, songSlug } from '@/lib/storage';
import KaraokeTile from '@/components/karaoke/KaraokeTile';

/** All karaoke versions of one song, laid out like the catalog. */
export default function SongVersionsPage() {
  const params = useParams();
  const slug = decodeURIComponent((params?.slug as string) || '');
  const song = decodeURIComponent((params?.song as string) || '');
  const [items, setItems] = useState<Karaoke[]>([]);

  useEffect(() => {
    setItems(
      getKaraokesByArtist(slug)
        .filter((k) => songSlug(k.title) === song)
        .sort((a, b) => b.recommendationScore - a.recommendationScore)
    );
  }, [slug, song]);

  if (items.length === 0) {
    return (
      <div className="pg">
        <h1 className="pg-h">Песня не найдена</h1>
        <Link href={`/artist/${encodeURIComponent(slug)}`} className="bt pr">К исполнителю</Link>
      </div>
    );
  }

  return (
    <div className="pg">
      <p className="mu sm" style={{ margin: 0 }}>
        <Link href={`/artist/${encodeURIComponent(slug)}`} className="lk">{items[0].artist}</Link>
      </p>
      <h1 className="pg-h">{items[0].title}</h1>
      <p className="pg-sub">Выберите версию караоке — {items.length} от разных авторов</p>

      <div className="gr" style={{ padding: 0 }}>
        {items.map((k) => (
          <KaraokeTile
            key={k.id}
            karaoke={k}
            authorName={getAuthor(k).name}
            badge={k.isFeatured ? 'Рекомендовано' : undefined}
          />
        ))}
      </div>
    </div>
  );
}
