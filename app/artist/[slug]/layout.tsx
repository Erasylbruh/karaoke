import type { Metadata } from 'next';
import { safeDecode } from '@/lib/format';
import { SITE_URL } from '@/lib/server-meta';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const decoded = safeDecode(slug).replace(/-/g, ' ');
  const title = `${decoded} — караоке и тексты песен | KaraokeCraft`;
  const description = `Все версии караоке исполнителя ${decoded} с синхронной подсветкой строк на KaraokeCraft.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/artist/${encodeURIComponent(safeDecode(slug))}`,
      siteName: 'KaraokeCraft',
      locale: 'ru_RU',
    },
  };
}

export default function ArtistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
