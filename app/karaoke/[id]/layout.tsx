import type { Metadata } from 'next';
import { fetchTrackMeta, SITE_URL } from '@/lib/server-meta';

type Props = {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const track = await fetchTrackMeta(id);

  if (!track || track.visibility === 'private' || track.status !== 'active') {
    return {
      title: 'Караоке — KaraokeCraft',
      robots: { index: false, follow: false },
    };
  }

  const fullTitle = track.artist ? `${track.title} — ${track.artist}` : track.title;
  const description =
    track.description || `Пойте «${track.title}» (${track.artist || 'караоке'}) с синхронной подсветкой строк на KaraokeCraft.`;
  const url = `${SITE_URL}/karaoke/${encodeURIComponent(track.id)}`;

  return {
    title: `${fullTitle} | KaraokeCraft`,
    description,
    robots: track.visibility === 'unlisted' ? { index: false, follow: false } : undefined,
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: 'KaraokeCraft',
      locale: 'ru_RU',
      type: 'music.song',
      images: track.coverImage ? [{ url: track.coverImage, width: 768, height: 768, alt: fullTitle }] : undefined,
    },
    twitter: {
      card: track.coverImage ? 'summary_large_image' : 'summary',
      title: fullTitle,
      description,
      images: track.coverImage ? [track.coverImage] : undefined,
    },
  };
}

export default function KaraokeTrackLayout({ children }: Props) {
  return children;
}
