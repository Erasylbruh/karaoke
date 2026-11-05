'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { buttonStyles } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { iconButtonStyles } from '@/components/ui/icon-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Logo } from './Logo';
import { UserMenu } from './UserMenu';

const NAV_LINKS = [
  { href: '/', label: 'Каталог' },
  { href: '/create', label: 'Студия' },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/** Sticky site header. On the player (`/karaoke/*`) it floats transparent over the track colour, desktop only. */
export function SiteHeader() {
  const pathname = usePathname();
  const { status } = useAuth();
  const onPlayer = pathname.startsWith('/karaoke/');
  const onAuthPage = pathname === '/login' || pathname === '/register';

  return (
    <header
      className={cn(
        'z-40 h-16 border-b',
        onPlayer
          ? 'fixed inset-x-0 top-0 hidden lg:block bg-transparent border-transparent'
          : 'sticky top-0 border-line bg-ink/75 backdrop-blur-xl',
      )}
    >
      <div className="wrap flex h-full items-center gap-2">
        <Link href="/" aria-label="KaraokeCraft — на главную" className="mr-2 inline-flex shrink-0 rounded-full py-1 md:mr-4">
          <Logo />
        </Link>

        <nav aria-label="Основная навигация" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map(({ href, label }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-9 items-center rounded-full px-3.5 text-[14px] font-medium transition-colors',
                  active ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:text-fg',
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        <Link href="/create" className={cn(buttonStyles({ variant: 'primary', size: 'sm' }), 'max-md:hidden')}>
          <Plus aria-hidden="true" />
          Создать
        </Link>
        <Link href="/create" aria-label="Создать караоке" title="Создать караоке" className={cn(iconButtonStyles(), 'md:hidden')}>
          <Plus aria-hidden="true" />
        </Link>

        <div className="ml-1 flex min-w-9 items-center justify-end md:ml-2">
          {status === 'loading' && <Skeleton className="size-9 rounded-full" />}
          {status === 'guest' && !onAuthPage && (
            <Link href={`/login?next=${encodeURIComponent(pathname)}`} className={buttonStyles({ size: 'sm' })}>
              Войти
            </Link>
          )}
          {status === 'user' && <UserMenu />}
        </div>
      </div>
    </header>
  );
}
