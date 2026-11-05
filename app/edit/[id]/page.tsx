'use client';

import { useParams } from 'next/navigation';
import KaraokeCreator from '@/components/karaoke/KaraokeCreator';

export default function EditKaraokePage() {
  const params = useParams();
  const raw = (params?.id as string) || '';
  let id = raw;
  try {
    id = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }
  return <KaraokeCreator editId={id} />;
}
