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

## Как устроены данные

`lib/store.ts` держит в памяти копию каждой коллекции (onSnapshot) и пишет изменения в Firestore в фоне.
Благодаря этому `lib/storage.ts` сохранил синхронный API, а изменения от других людей приходят в реальном времени (колокольчик, графики).
Такой подход подходит для тестирования и небольших объёмов. Когда данных станет много, переходите на запросы по страницам.

| Коллекция | Документ | Что хранит |
|---|---|---|
| `users/{id}` | `User` | Профиль. Поле `uid` связывает его с аккаунтом Firebase Auth. Для новых пользователей `id == uid` |
| `karaokes/{id}` | `Karaoke` | Трек, тайминги, стиль, `visibility`, `status`, `recommendationScore` |
| `comments/{id}` | `Comment` | Комментарии |
| `playlists/{id}` | `Playlist` | Плейлисты (`ownerId`) |
| `follows/{userId}` | `{ followers: [] }` | Подписчики автора |
| `likes/{userId}` | `{ ids: [] }` | Лайки пользователя |
| `interactions/{karaoke\|actor\|type}` | `{ at }` | Одно действие засчитывается в рекомендации один раз |
| `notifications/{id}` | `AppNotification` | Уведомления: лайк, комментарий, плейлист, подписка, скачивание, предупреждение, бан |
| `events/{author_type_day}` | `DailyStat` | Дневные счётчики для графиков: прослушивания, подписки, скачивания |

## Перед публичным запуском

`firestore.rules` сейчас в тестовом режиме: читать и писать может кто угодно до 31.12.2026. Так проще проверять, потому что гости тоже пишут статистику. Перед запуском нужно:

- Разрешить запись в `users/{id}` только владельцу. Поля `role` и `status` должен менять только администратор (custom claims через Cloud Function).
- `recommendationScore`, `likesCount`, `viewsCount`, `events`, `notifications` считать в Cloud Functions, а не на клиенте. Иначе их можно накрутить прямыми запросами.
- Уникальность тега гарантировать коллекцией `usernames/{tag}` в транзакции. Сейчас тег проверяется по загруженному списку пользователей.

## Хостинг

Сайт деплоится на Vercel, Firebase используется только как бэкенд. Инструкция: [DEPLOY.md](DEPLOY.md).
