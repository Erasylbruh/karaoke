import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Политика конфиденциальности — KaraokeCraft',
  description: 'Какие данные обрабатывает KaraokeCraft и как обеспечивается их защита.',
};

export default function PrivacyPage() {
  return (
    <div className="pg" style={{ maxWidth: 780 }}>
      <h1 className="pg-h">Политика конфиденциальности</h1>
      <p className="pg-sub">Редакция от 18 ноября 2026 г.</p>

      <div className="card stack" style={{ lineHeight: 1.65, fontSize: 15 }}>
        <section>
          <h2 style={{ font: '700 18px var(--fd)', margin: '0 0 8px' }}>1. Какие данные собираются</h2>
          <p className="mu" style={{ margin: 0 }}>
            Для работы учётной записи платформа хранит адрес электронной почты (в закрытой части базы данных, недоступной другим посетителям),
            выбранный публичный тег (`@username`), отображаемое имя, загруженный аватар, а также созданные вами проекты, плейлисты, лайки,
            отзывы и историю экспортов видео в личном кабинете.
          </p>
        </section>

        <section>
          <h2 style={{ font: '700 18px var(--fd)', margin: '0 0 8px' }}>2. Цели обработки</h2>
          <p className="mu" style={{ margin: 0 }}>
            Данные используются исключительно для аутентификации, восстановления доступа, отображения авторства ваших работ, работы уведомлений,
            статистики Creator Studio и модерации нарушений. Мы не продаём и не передаём адреса электронной почты рекламным сетям.
          </p>
        </section>

        <section>
          <h2 style={{ font: '700 18px var(--fd)', margin: '0 0 8px' }}>3. Локальное хранение в браузере</h2>
          <p className="mu" style={{ margin: 0 }}>
            В `localStorage` и `IndexedDB` вашего браузера сохраняются технические настройки (выбранное качество экспорта видео, отметки о просмотренных
            подсказках и черновые локальные медиафайлы). Вы можете очистить их в настройках браузера в любой момент.
          </p>
        </section>

        <section>
          <h2 style={{ font: '700 18px var(--fd)', margin: '0 0 8px' }}>4. Инфраструктура и защита</h2>
          <p className="mu" style={{ margin: 0 }}>
            Аутентификация и хранение структурированных данных обеспечиваются сервисами Google Firebase (с разграничением доступа владельца),
            хранение медиафайлов — облачным хранилищем Supabase Storage, хостинг веб-приложения — платформой Vercel по защищённому протоколу HTTPS.
          </p>
        </section>

        <section>
          <h2 style={{ font: '700 18px var(--fd)', margin: '0 0 8px' }}>5. Управление данными и удаление</h2>
          <p className="mu" style={{ margin: 0 }}>
            Вы можете в любой момент изменить данные профиля, скрыть контактную почту, перевести свои караоке в закрытый режим («Только я»)
            или удалить их в разделе <Link href="/studio/content" style={{ color: 'var(--ac)' }}>Creator Studio</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
