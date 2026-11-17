import type { Metadata } from 'next';
import { safeDecode } from '@/lib/format';
import { SITE_URL } from '@/lib/server-meta';

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const { tag } = await params;
  const genre = safeDecode(tag);
  const title = `Караоке в жанре «${genre}» | KaraokeCraft`;
  const description = `Подборка караоке-анимаций в жанре «${genre}» с синхронизацией строк на KaraokeCraft.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/tag/${encodeURIComponent(genre)}`,
      siteName: 'KaraokeCraft',
      locale: 'ru_RU',
    },
  };
}

export default function TagLayout({ children }: { children: React.ReactNode }) {
  return children;
}
