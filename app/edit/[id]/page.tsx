'use client';

import { useParams } from 'next/navigation';
import KaraokeCreator from '@/components/karaoke/KaraokeCreator';
import { safeDecode } from '@/lib/format';

export default function EditKaraokePage() {
  const params = useParams();
  const id = safeDecode(params?.id as string);
  return <KaraokeCreator editId={id} />;
}
