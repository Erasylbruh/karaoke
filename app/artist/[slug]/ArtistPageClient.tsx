'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Karaoke } from '@/lib/types';
import { getKaraokesByArtist, getAuthor, songSlug, artistSlug } from '@/lib/storage';
import { safeDecode, pluralRu } from '@/lib/format';
import { useDataVersion } from '@/components/DataProvider';
import KaraokeTile from '@/components/karaoke/KaraokeTile';

export default function ArtistPage() {
  const params = useParams();
  const slug = safeDecode(params?.slug as string);
  const version = useDataVersion();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => getKaraokesByArtist(slug), [slug, version]);

  const songs = useMemo(() => {
    const map = new Map<string, Karaoke[]>();
    items.forEach((k) => {
      const key = songSlug(k.title);
      map.set(key, [...(map.get(key) || []), k]);
    });
    return [...map.entries()].map(([key, versions]) => ({
      key,
      versions: versions.sort((a, b) => b.recommendationScore - a.recommendationScore),
    }));
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="pg">
        <h1 className="pg-h">Исполнитель не найден</h1>
        <p className="pg-sub">Пока нет опубликованных караоке этого исполнителя.</p>
        <Link href="/" className="bt pr">В каталог</Link>
      </div>
    );
  }

  const artistName = items[0]?.artist ?? '';
  const uniqueAuthors = new Set(items.map((k) => k.authorId)).size;

  return (
    <div className="pg">
      <p className="mu sm" style={{ margin: 0 }}>Исполнитель</p>
      <h1 className="pg-h">{artistName}</h1>
      <p className="pg-sub">
        {pluralRu(songs.length, 'песня', 'песни', 'песен', true)} · {items.length} караоке
        {uniqueAuthors > 1 ? ` от ${pluralRu(uniqueAuthors, 'автора', 'авторов', 'авторов', true)}` : ''}
      </p>

      <div className="gr" style={{ padding: 0 }}>
        {songs.map(({ key, versions }) => {
          const top = versions[0];
          const multi = versions.length > 1;
          return (
            <KaraokeTile
              key={key}
              karaoke={top}
              authorName={multi ? undefined : getAuthor(top).name}
              versions={versions.length}
              href={multi ? `/artist/${encodeURIComponent(artistSlug(top.artist))}/${encodeURIComponent(key)}` : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
