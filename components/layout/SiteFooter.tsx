'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './Logo';

const FOOTER_LINKS = [
  { href: '/', label: 'Каталог' },
  { href: '/create', label: 'Студия' },
  { href: '/profile', label: 'Профиль' },
];

/** One-line site footer; hidden on the player (`/karaoke/*`). */
export function SiteFooter() {
  const pathname = usePathname();
  if (pathname.startsWith('/karaoke/')) return null;

  return (
    <footer className="border-t border-line">
      <div className="wrap flex flex-col items-center gap-3 py-8 text-[13px] text-fg-subtle sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Logo compact />
          <span>© 2026 KaraokeCraft</span>
        </div>
        <nav aria-label="Ссылки в подвале" className="flex items-center gap-5">
          {FOOTER_LINKS.map(({ href, label }) => (
            <Link key={href} href={href} className="rounded transition-colors hover:text-fg">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
