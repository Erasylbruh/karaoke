import React from 'react';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="site-ft">
      <div className="site-ft-in">
        <div className="site-ft-grid">
          <div className="stack" style={{ gap: 10 }}>
            <Link href="/" className="lg" style={{ margin: 0, width: 'fit-content' }}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="var(--ac)" aria-hidden="true">
                <rect x="2" y="9" width="4" height="11" rx="2" />
                <rect x="9" y="2" width="4" height="18" rx="2" />
                <rect x="16" y="6" width="4" height="14" rx="2" />
              </svg>
              <span>KaraokeCraft</span>
            </Link>
            <p className="mu sm" style={{ margin: 0, maxWidth: 320, lineHeight: 1.55 }}>
              Студия создания караоке-анимаций с синхронной подсветкой строк, гибкой настройкой визуального стиля и экспортом видео 9:16 и 16:9.
            </p>
          </div>

          <div>
            <h2 className="site-ft-h">Разделы</h2>
            <ul className="site-ft-list">
              <li><Link href="/">Каталог караоке</Link></li>
              <li><Link href="/create">Создать караоке</Link></li>
              <li><Link href="/studio">Creator Studio</Link></li>
            </ul>
          </div>

          <div>
            <h2 className="site-ft-h">Документы и правила</h2>
            <ul className="site-ft-list">
              <li><Link href="/terms">Пользовательское соглашение</Link></li>
              <li><Link href="/privacy">Политика конфиденциальности</Link></li>
              <li><Link href="/copyright">Правообладателям</Link></li>
            </ul>
          </div>
        </div>

        <div className="site-ft-bottom">
          <span>© 2026 KaraokeCraft</span>
          <span>Сделано для авторов, музыкантов и любителей караоке</span>
        </div>
      </div>
    </footer>
  );
}
