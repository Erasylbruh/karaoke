import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { fontVariables } from './fonts';
import { AuthProvider } from '@/context/AuthContext';
import { Logo } from '@/components/layout/Logo';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';

export const metadata: Metadata = {
  title: {
    default: 'KaraokeCraft — караоке-анимации',
    template: '%s — KaraokeCraft',
  },
  description: 'Покажите песню так, как вы её слышите. Создавайте караоке-анимации в стиле Spotify Lyrics с динамической синхронизацией строк и экспортом видео с водяным знаком.',
};

export const viewport: Viewport = {
  themeColor: '#0B0A10',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className={fontVariables}>
      <body className="flex min-h-dvh flex-col">
        <AuthProvider>
          <Suspense
            fallback={
              <header className="sticky top-0 z-40 h-16 border-b border-line bg-ink/75 backdrop-blur-xl">
                <div className="wrap flex h-full items-center">
                  <Logo />
                </div>
              </header>
            }
          >
            <SiteHeader />
          </Suspense>
          <main className="flex-1">
            <Suspense fallback={<div style={{ minHeight: '60vh' }} />}>
              {children}
            </Suspense>
          </main>
          <Suspense fallback={null}>
            <SiteFooter />
          </Suspense>
        </AuthProvider>
      </body>
    </html>
  );
}
