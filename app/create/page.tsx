import React from 'react';
import { Metadata } from 'next';
import KaraokeCreator from '@/components/karaoke/KaraokeCreator';

export const metadata: Metadata = {
  title: 'Создать караоке — KaraokeCraft',
  description: 'Создайте свою караоке-анимацию с синхронной подсветкой строк, настройкой шрифта, цветов и экспортом видео.',
};

export default function CreateKaraokePage() {
  return (
    <div style={{ minHeight: '100vh' }}>
      <KaraokeCreator />
    </div>
  );
}
