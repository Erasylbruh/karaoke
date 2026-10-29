'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { KaraokePlayer, PlayerSkeleton } from '@/components/player/KaraokePlayer';

// With cacheComponents `useParams` suspends on this route, so it lives below the page's <Suspense>.
function PlayerRoute() {
  const { id } = useParams<{ id: string }>();
  return <KaraokePlayer key={id} id={id} />;
}

export default function KaraokePage() {
  return (
    <Suspense fallback={<PlayerSkeleton />}>
      <PlayerRoute />
    </Suspense>
  );
}
