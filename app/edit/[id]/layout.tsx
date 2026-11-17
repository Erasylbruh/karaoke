import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Редактирование караоке — KaraokeCraft',
  robots: { index: false, follow: false },
};

export default function EditKaraokeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
