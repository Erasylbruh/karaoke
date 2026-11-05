# Бесплатный деплой: Vercel + Firebase + Supabase

| Часть | Сервис | Тариф |
|---|---|---|
| Сайт (Next.js) | Vercel | Hobby, бесплатно (некоммерческие проекты) |
| Вход и база | Firebase Authentication + Firestore | Spark, бесплатно |
| Аудио и шрифты | Supabase Storage | Free, 1 ГБ |

Карта ни для одного из них не нужна.

## 1. Firebase (вход и база)

1. [Firebase Console](https://console.firebase.google.com/) → проект `karaoke-craft`.
2. **Authentication → Sign-in method → Email/Password → Enable.**
3. **Firestore Database → Create database** (режим production, регион любой).
4. Опубликовать правила из репозитория:
   ```bash
   firebase login
   firebase deploy --only firestore:rules
   ```
5. **Authentication → Settings → Authorized domains → Add domain**: добавить домен Vercel, например `karaoke-craft.vercel.app`. Без этого вход на опубликованном сайте не сработает.

Подробности о данных и правилах лежат в [FIREBASE.md](FIREBASE.md).

## 2. Supabase (файлы)

1. [supabase.com](https://supabase.com/) → New project (бесплатный тариф).
2. **SQL Editor** → вставить и выполнить [supabase/storage.sql](../supabase/storage.sql). Скрипт создаёт публичный бакет `uploads` (до 40 МБ на файл).
3. **Project Settings → API**: скопировать `Project URL` и ключ `anon public`.
4. Создать в корне проекта файл `.env.local` по образцу [.env.example](../.env.example):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   NEXT_PUBLIC_SUPABASE_BUCKET=uploads
   ```
5. Перезапустить `npm run dev`. Загруженное в редакторе аудио теперь попадает в Supabase и проигрывается у всех.

Пока переменные не заданы, файлы сохраняются только в браузере автора, а остальной сайт работает как обычно.

## 3. Vercel (сайт)

1. Залить проект на GitHub.
2. [vercel.com](https://vercel.com/) → Add New → Project → выбрать репозиторий. Framework определится как Next.js, настройки сборки менять не нужно.
3. **Environment Variables**: добавить те же три `NEXT_PUBLIC_SUPABASE_*`.
4. Deploy. После каждого push в `main` сайт пересобирается сам.

Вариант без GitHub, через CLI:
```bash
npm i -g vercel
vercel login
vercel
```

## Что важно перед публичным запуском

- **Firestore** открыт на запись до 31.12.2026 (тестовый режим). Как закрыть, описано в FIREBASE.md.
- **Supabase**: публичный ключ позволяет загружать файлы любому, кто его знает. Для продакшена загрузку стоит вести через API-роут Vercel: роут проверяет Firebase ID-токен и пишет в Supabase сервисным ключом, а политику для `anon` после этого нужно удалить.
- **Лимиты бесплатных тарифов**: Supabase — 1 ГБ хранилища и около 2 ГБ трафика в месяц, этого хватит примерно на 200 треков по 5 МБ. Firebase Spark — 50 000 чтений и 20 000 записей в день. Сейчас сайт при каждом открытии загружает все коллекции целиком, поэтому чтения расходуются быстро. При росте нужно перейти на запросы по страницам.
