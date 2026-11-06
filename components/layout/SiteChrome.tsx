'use client';

import { usePathname } from 'next/navigation';

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return pathname.startsWith('/karaoke/') ? null : children;
}
