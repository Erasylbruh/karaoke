'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { KaraokePlayer, PlayerSkeleton } from '@/components/player/KaraokePlayer';

/** The route param comes percent-encoded (`%D1%82…` for Cyrillic ids); a malformed one is kept as is. */
function decodeId(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

// With cacheComponents `useParams` suspends on this route, so it lives below the page's <Suspense>.
function PlayerRoute() {
  const id = decodeId(useParams<{ id: string }>().id);
  return <KaraokePlayer key={id} id={id} />;
}

export default function KaraokePage() {
  return (
    <Suspense fallback={<PlayerSkeleton />}>
      <PlayerRoute />
    </Suspense>
  );
}
