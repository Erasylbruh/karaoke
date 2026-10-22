import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: 'KaraokeCraft — караоке-анимации',
  description: 'Покажите песню так, как вы её слышите. Создавайте караоке-анимации в стиле Spotify Lyrics с динамической синхронизацией строк и экспортом видео с водяным знаком.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600&family=Unbounded:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>
          <Suspense fallback={<header className="hd"><div className="lg">KaraokeCraft</div></header>}>
            <Navbar />
          </Suspense>
          <main>
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
