import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import './ui.css';
import { AuthProvider } from '@/context/AuthContext';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import AuthPrompt from '@/components/ui/AuthPrompt';
import DataProvider from '@/components/DataProvider';

export const metadata: Metadata = {
  title: 'KaraokeCraft — караоке-анимации',
  description: 'Покажите песню так, как вы её слышите. Создавайте караоке-анимации в стиле Spotify Lyrics с динамической синхронизацией строк и экспортом видео с водяным знаком.',
};

// Defaults plus the popular fonts offered in the editor. Other fonts are loaded on demand (lib/fonts.ts).
const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600&family=Unbounded:wght@500;700' +
  '&family=Inter:wght@400;600;700&family=Outfit:wght@400;600;700&family=Space+Grotesk:wght@400;600;700' +
  '&family=Montserrat:wght@500;700&family=Poppins:wght@500;700&family=Roboto:wght@500;700' +
  '&family=Playfair+Display:wght@500;700&family=Bebas+Neue&family=Oswald:wght@500;700&family=Pacifico&display=swap';

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
        <link href={FONTS_URL} rel="stylesheet" />
      </head>
      <body>
        <DataProvider>
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
          <AuthPrompt />
        </AuthProvider>
        </DataProvider>
      </body>
    </html>
  );
}
