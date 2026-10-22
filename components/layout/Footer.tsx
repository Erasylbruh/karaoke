import React from 'react';
import Link from 'next/link';
import { Mic2 } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-zinc-800 bg-zinc-950 text-zinc-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          
          {/* Brand */}
          <div className="md:col-span-1 space-y-3">
            <Link href="/" className="flex items-center gap-2">
              <Mic2 className="w-5 h-5 text-green-500" />
              <span className="font-semibold text-base text-zinc-100 tracking-tight">KaraokeCraft</span>
            </Link>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Платформа создания караоке-анимаций в стиле Spotify Lyrics с синхронизацией текста, настройкой стилей и экспортом видео.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-3">Навигация</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/" className="hover:text-zinc-200 transition-colors">Главная / Каталог</Link>
              </li>
              <li>
                <Link href="/create" className="hover:text-green-500 transition-colors">Создать караоке</Link>
              </li>
              <li>
                <Link href="/admin" className="hover:text-zinc-200 transition-colors">Администрирование</Link>
              </li>
              <li>
                <Link href="/profile" className="hover:text-zinc-200 transition-colors">Мой профиль</Link>
              </li>
            </ul>
          </div>

          {/* Features */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-3">Возможности</h4>
            <ul className="space-y-2 text-xs text-zinc-400">
              <li>Синхронизация текста песни</li>
              <li>Экспорт видео с водяным знаком</li>
              <li>Настройка шрифтов и цветов</li>
              <li>Каталог и поиск треков</li>
            </ul>
          </div>

          {/* Tech & Watermark Notice */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-3">Водяной знак</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Все экспортированные видео содержат отметку <span className="text-zinc-200 font-medium">«✦ KaraokeCraft»</span>.
            </p>
            <div className="text-[11px] text-zinc-500 pt-2">
              Next.js • Tailwind CSS • Web Audio API
            </div>
          </div>

        </div>

        <div className="mt-8 pt-6 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <p>© 2026 KaraokeCraft. Все права защищены.</p>
          <p>Сделано для любителей музыки и караоке</p>
        </div>
      </div>
    </footer>
  );
}
