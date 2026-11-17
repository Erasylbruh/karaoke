'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getKaraokesByArtist, getAuthor, songSlug } from '@/lib/storage';
import { safeDecode, pluralRu } from '@/lib/format';
import { useDataVersion } from '@/components/DataProvider';
import KaraokeTile from '@/components/karaoke/KaraokeTile';

/** All karaoke versions of one song, laid out like the catalog. */
export default function SongVersionsPage() {
  const params = useParams();
  const slug = safeDecode(params?.slug as string);
  const song = safeDecode(params?.song as string);
  const version = useDataVersion();

  const items = useMemo(
    () =>
      getKaraokesByArtist(slug)
        .filter((k) => songSlug(k.title) === song)
        .sort((a, b) => b.recommendationScore - a.recommendationScore),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slug, song, version]
  );

  if (items.length === 0) {
    return (
      <div className="pg">
        <h1 className="pg-h">Песня не найдена</h1>
        <Link href={`/artist/${encodeURIComponent(slug)}`} className="bt pr">К исполнителю</Link>
      </div>
    );
  }

  const uniqueAuthors = new Set(items.map((k) => k.authorId)).size;

  return (
    <div className="pg">
      <p className="mu sm" style={{ margin: 0 }}>
        <Link href={`/artist/${encodeURIComponent(slug)}`} className="lk">{items[0].artist}</Link>
      </p>
      <h1 className="pg-h">{items[0].title}</h1>
      <p className="pg-sub">
        {items.length === 1
          ? '1 версия караоке'
          : `Выберите версию караоке — ${pluralRu(items.length, 'работа', 'работы', 'работ', true)}${
              uniqueAuthors > 1 ? ' от разных авторов' : ''
            }`}
      </p>

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
