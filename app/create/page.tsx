import type { Metadata } from 'next';
import { Studio } from '@/components/studio/Studio';

export const metadata: Metadata = {
  title: 'Студия',
  description: 'Создайте свою караоке-анимацию в стиле Spotify Lyrics с настройкой цвета, шрифта, фона и таймингов.',
};

export default function CreateKaraokePage() {
  return <Studio />;
}
