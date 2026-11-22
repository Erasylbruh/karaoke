# Firebase

Сайт работает на Firebase: Authentication (вход) и Firestore (данные). Аудио и шрифты хранятся в Supabase Storage (см. [DEPLOY.md](DEPLOY.md)).
Конфиг проекта `karaoke-craft` лежит в `lib/firebase.ts`. Его можно переопределить через `NEXT_PUBLIC_FIREBASE_*` в `.env.local`.

## Что включить в Firebase Console (один раз)

1. **Authentication → Sign-in method → Email/Password → Enable.** Без этого вход и регистрация выдают ошибку «не включён вход по email/паролю».
2. **Firestore Database → Create database.** Регион любой, например `eur3`, режим production. Пока базы нет, сайт ждёт 12 секунд и показывает красную плашку «Нет связи с Firestore»; изменения при этом не сохраняются.
3. Опубликовать правила из репозитория:

```bash
firebase login
firebase deploy --only firestore:rules
```

## Администратор

Новые аккаунты получают роль `user`. Роль `admin` выдаётся вручную: в Firestore → `users/{id}` поле `role: "admin"`, или другим администратором в разделе «Пользователи» админки.

Перед публикацией правил модерации проверьте существующие роли и привязки `uid` в Firebase Console, если база ранее использовала открытые правила. Для старого профиля с `id`, отличным от Firebase Auth UID, сохраните настоящий UID в поле `uid`. При первом входе приложение также может привязать такой профиль без UID по подтверждённому email.

## Как устроены данные

`lib/store.ts` держит в памяти копию каждой коллекции (onSnapshot) и пишет изменения в Firestore в фоне.
Благодаря этому `lib/storage.ts` сохранил синхронный API, а изменения от других людей приходят в реальном времени (колокольчик, графики).
Такой подход подходит для тестирования и небольших объёмов. Когда данных станет много, переходите на запросы по страницам.

| Коллекция | Документ | Что хранит |
|---|---|---|
| `users/{id}` | `User` | Публичный профиль. Поле `uid` связывает его с аккаунтом Firebase Auth. Для новых пользователей `id == uid` |
| `usernames/{tag}` | `{ uid }` | Резерв @тега. Правила пускают тег в профиль, только если резерв принадлежит владельцу (`lib/account.ts`) |
| `userPrivate/{id}` | email, `contactEmail`, `warnings`, `banReason`, `termsVersion`, `consentAt` | Закрытая часть профиля: владелец и админы. `termsVersion`/`consentAt` — принятая редакция документов (`lib/legal.ts`) |
| `karaokes/{id}` | `Karaoke` | Трек, тайминги, стиль, `visibility`, `status`, `recommendationScore` |
| `comments/{id}` | `Comment` | Комментарии |
| `playlists/{id}` | `Playlist` | Плейлисты (`ownerId`) |
| `follows/{userId}` | `{ followers: [] }` | Подписчики автора |
| `likes/{userId}` | `{ ids: [] }` | Лайки пользователя |
| `interactions/{karaoke\|actor\|type}` | `{ at }` | Одно действие засчитывается в рекомендации один раз |
| `notifications/{id}` | `AppNotification` | Уведомления: лайк, комментарий, плейлист, подписка, скачивание; от админов — предупреждение, бан, ответ на жалобу (`report`). Текст от пользователей сайт не показывает, а собирает из типа и настоящих имён (`lib/notification-text.ts`) |
| `events/{author_type_day}` | `DailyStat` | Дневные счётчики для графиков: прослушивания, подписки, скачивания |
| `projectReports/{id}` | `ProjectReport` | Жалобы на проекты, доступные для просмотра администраторам |
| `users/{authorId}/projectWarnings/{id}` | `ProjectWarning` | Предупреждения по проектам, доступные автору и администраторам |
| `legacyAdminProfiles/{uid}` | `{ profileId }` | Ссылка на профиль администратора со старым идентификатором |

Жалобы и предупреждения хранятся отдельно от общего кэша сайта. Автор видит предупреждения в колокольчике, а администратор может открыть историю из формы предупреждения. Перед обновлением сайта опубликуйте правила Firestore командой выше.

## Перед публичным запуском

Тестового режима больше нет (с 16.11.2026):
- `userPrivate/{id}` хранит email, `warnings` и `banReason` и читается только владельцем и администратором;
- `notifications`, `downloads`, `events` и `likes` читаются только их владельцем;
- писать в чужие отзывы, плейлисты и подписки нельзя;
- счётчики треков меняются только на один шаг за раз.

С 21.11.2026 дополнительно:
- тег в профиле должен быть зарезервирован владельцем в `usernames/{tag}`; теги старых профилей резервирует админ кнопкой «Зарезервировать теги» в `/admin/users`;
- новые треки и отзывы принимаются только от подтверждённой почты (`email_verified` в токене);
- имя и аватар в отзыве, имя и название трека в уведомлении должны совпадать с настоящими;
- владелец может удалить свой аккаунт целиком (`lib/account.ts`): треки, профиль, `userPrivate`, свои уведомления, статистику и список подписчиков.

Тесты правил лежат в `tests/firestore.rules.test.mjs`. Что ещё стоит сделать:

- `recommendationScore`, `likesCount`, `viewsCount`, `events`, `notifications` считать в Cloud Functions, а не на клиенте. Сейчас правила ограничивают каждый шаг (+1 и т. п.), но много шагов подряд всё ещё возможны.
- Принудительную проверку App Check для Firestore (Enforce) включать только после того, как вызовы REST без токена App Check будут переведены: `lib/server-meta.ts`, проверка бана в `lib/server/storage.ts`, запись адреса в `aligner/src/tunnel.rs`. Иначе роут загрузки, не сумев прочитать профиль, будет отклонять все загрузки.

## App Check (только наблюдение)

Клиентская часть готова (`lib/firebase.ts`) и включается переменной `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`:

1. [Google reCAPTCHA Admin](https://www.google.com/recaptcha/admin) → создать ключ **reCAPTCHA v3**, домены: `karaokecraft.vercel.app` и свой домен, если есть.
2. Firebase Console → **App Check** → Apps → веб-приложение → **reCAPTCHA v3** → вставить **секретный** ключ reCAPTCHA.
3. Vercel → Environment Variables → `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` = **ключ сайта** (публичный) → Redeploy. CSP разрешит скрипты reCAPTCHA сам (`next.config.ts`).
4. Firebase Console → App Check → APIs → Cloud Firestore: смотреть метрики, сколько запросов приходит без подтверждения. **Не нажимать Enforce** (см. выше).

## Хостинг

Сайт деплоится на Vercel, Firebase используется только как бэкенд. Инструкция: [DEPLOY.md](DEPLOY.md).
