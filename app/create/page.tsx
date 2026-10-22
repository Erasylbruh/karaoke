import React from 'react';
import { Metadata } from 'next';
import KaraokeCreator from '@/components/karaoke/KaraokeCreator';

export const metadata: Metadata = {
  title: 'Создать караоке — KaraokeCraft',
  description: 'Создайте свою караоке-анимацию в стиле Spotify Lyrics с настройкой цвета, шрифта, фона и таймингов.',
};

export default function CreateKaraokePage() {
  return (
    <div className="min-h-screen bg-[#08080d]">
      <KaraokeCreator />
    </div>
  );
}
