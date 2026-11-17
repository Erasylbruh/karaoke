import type { Metadata } from 'next';
import { safeDecode } from '@/lib/format';
import { SITE_URL } from '@/lib/server-meta';

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const { tag } = await params;
  const cleanTag = safeDecode(tag).replace(/^@/, '');
  const title = `@${cleanTag} — профиль автора | KaraokeCraft`;
  const description = `Караоке-проекты и плейлисты автора @${cleanTag} на платформе KaraokeCraft.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/u/${encodeURIComponent(cleanTag)}`,
      siteName: 'KaraokeCraft',
      locale: 'ru_RU',
      type: 'profile',
    },
  };
}

export default function UserProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
