import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { fontVariables } from './fonts';
import { AuthProvider } from '@/context/AuthContext';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';

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
          <Suspense fallback={<header className="hd"><div className="lg">KaraokeCraft</div></header>}>
            <Navbar />
          </Suspense>
          <main className="flex-1">
            <Suspense fallback={<div style={{ minHeight: '60vh' }} />}>
              {children}
            </Suspense>
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
