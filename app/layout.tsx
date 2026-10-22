import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: 'KaraokeCraft — Генератор караоке-анимаций в стиле Spotify Lyrics',
  description: 'Создавайте, настраивайте и скачивайте видео караоке в стиле Spotify Lyrics с водяным знаком. Синхронизация текста, темная тема, кастомизация и сообщество.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className="dark h-full">
      <body className="min-h-full flex flex-col bg-[#08080d] text-slate-100 antialiased selection:bg-[#1ed760] selection:text-black">
        <AuthProvider>
          <Suspense fallback={<div className="h-16 border-b border-white/10 bg-[#08080d]" />}>
            <Navbar />
          </Suspense>
          <main className="flex-1 flex flex-col">
            <Suspense fallback={<div className="min-h-[60vh] bg-[#08080d]" />}>
              {children}
            </Suspense>
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
