# KaraokeCraft «Сцена» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести все страницы KaraokeCraft на единую дизайн-систему «Сцена», исправить баги удобства и реализовать режим «На слух».

**Architecture:**
- Чистая логика (форматирование, LRC, тайминги, тапы, вход, каталог) живёт в `lib/*.ts` и покрыта тестами `node --test`.
- Всё, что лежит в localStorage, читается только через `lib/store.ts` (`useSyncExternalStore`, серверный снимок «неизвестно»). Так нет ни ошибок гидратации, ни миганий.
- Визуал — Tailwind v4 с токенами в `@theme` и общими компонентами `components/ui/`. Обложка трека `LyricCover` используется на всех страницах.

**Tech Stack:** Next.js 16.4.2 (App Router, `cacheComponents`), React 19.3, Tailwind CSS 4.3 (`@tailwindcss/turbopack`), lucide-react, `next/font/google`, Web Audio (`lib/audio-synthesizer.ts`), Node 24 `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-28-karaokecraft-redesign-design.md`

## Global Constraints

- Перед использованием API Next.js читать соответствующий раздел `node_modules/next/dist/docs/` (требование `AGENTS.md`). Настройки `cacheComponents: true` и `partialPrefetching: true` в `next.config.ts` не трогать.
- При `cacheComponents` хуки `usePathname`, `useParams` и `useSearchParams` на маршруте `/karaoke/[id]` приостанавливают рендер. Компоненты с ними — шапку, футер и страницы — оборачивать в `<Suspense>` с заглушкой той же высоты.
- Новых зависимостей не добавлять. Тесты — встроенный `node --test`, файлы `lib/*.test.ts`, импорт модулей с расширением `./x.ts`.
- `lib/types.ts` и ключи localStorage `karaokecraft_*` не менять. Тип `FontFamily` только расширяется: `'Playfair' | 'Caveat' | 'Russo'`.
- Весь текст интерфейса — по-русски, тема только тёмная.
- Цвета интерфейса берутся только из токенов (спека §3.1): `ink`, `surface-1/2/3`, `line`, `line-strong`, `fg`, `fg-muted`, `fg-subtle`, `accent`, `accent-ink`, `accent-soft`, `danger`, `success`.
  - Запрещены классы `zinc-*`, `green-*`, `red-*` и hex-цвета в разметке.
  - Исключения: цвета стиля трека (пользовательские данные, inline-стили), палитра фонов аватаров в `avatar.tsx`, пресеты в `lib/palettes.ts`.
- Минимальный размер текста — 13px. Классы `text-xs`, `text-[10px]`, `text-[11px]` не использовать.
- Шрифты подключать только через `app/fonts.ts` и `lib/fonts.ts`. Литералы `"Onest"` и `"Unbounded"` в `font-family` и `ctx.font` запрещены.
- Во время рендера localStorage читается только через хуки `lib/store.ts`. Прямые вызовы `getKaraokes()`, `getCurrentUser()` и подобных допустимы только в обработчиках событий.
- Брейкпоинты:
  - `sm` 640px — с него каталог в 3 колонки;
  - `md` 768px — ниже мобильная шапка и таблицы-карточки;
  - `lg` 1024px — с него двухколоночные плеер и студия.
- При `prefers-reduced-motion: reduce` анимации и плавная прокрутка отключаются.
- Каждая задача заканчивается коммитом в ветку `redesign/stage`. Сообщение коммита завершается строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Dev-сервер уже запущен соседней сессией на `http://localhost:3000` и подхватывает изменения. Новый не запускать.

## Review Focus

1. **LRC-файлы из Windows.** Переводы строк `\r\n`, BOM в начале, несколько меток на строке (`[00:01.00][00:20.00] припев`), метаданные `[ar:…]`, трёхзначные миллисекунды. Разбор не должен терять строки и оставлять `\r` в тексте. Тест — в задаче 2.
2. **Горячие клавиши во время набора.** Пробел в поле отзыва не ставит плеер на паузу, «/» внутри поиска печатается как символ. Проверка — в задачах 9 и 11.
3. **Старые или неполные данные в localStorage.** Неизвестный ключ шрифта (`Inter`), трек без тегов, трек с 0–2 строками. Каталог, плеер и обложка не падают, шрифт откатывается на Onest. Тест — в задаче 5, проверка — в задаче 9.
4. **Браузер без webm (Safari) или без `MediaRecorder`.** Экспорт выбирает `video/mp4` или показывает понятное сообщение, а не падает. Проверка — в задаче 11.
5. **Небезопасный `?next=` и дубликаты пользователей.** `//evil.com` и `https://evil.com` ведут на `/`. Повторный вход тем же неизвестным именем (с пробелами, в другом регистре) не создаёт второго пользователя. Тест — в задаче 4.

---

### Task 1: Тестовый раннер и `lib/format.ts`

**Files:**
- Modify: `package.json` (scripts), `tsconfig.json` (compilerOptions)
- Create: `lib/format.ts`, `lib/format.test.ts`

**Interfaces:**
- Produces:
  - `formatCount(n: number): string`
  - `formatTime(seconds: number): string`
  - `formatDate(iso: string, timeZone?: string): string`
  - `plural(n: number, forms: [string, string, string]): string` — формы для 1, 2 и 5.

- [ ] **Step 1:** Добавить в `scripts` строку `"test": "node --test"`, в `compilerOptions` — `"allowImportingTsExtensions": true`.
- [ ] **Step 2: Написать падающий тест `lib/format.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCount, formatTime, formatDate, plural } from './format.ts';

test('formatCount', () => {
  assert.equal(formatCount(0), '0');
  assert.equal(formatCount(960), '960');
  assert.equal(formatCount(1000), '1 тыс.');
  assert.equal(formatCount(1840), '1,8 тыс.');
  assert.equal(formatCount(110300), '110,3 тыс.');
  assert.equal(formatCount(999950), '1 млн');
  assert.equal(formatCount(2_400_000), '2,4 млн');
});

test('formatTime', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(4.9), '0:04');
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(600), '10:00');
  assert.equal(formatTime(-3), '0:00');
  assert.equal(formatTime(Number.NaN), '0:00');
});

test('formatDate', () => {
  assert.equal(formatDate('2026-10-14T20:00:00Z', 'UTC'), '14 окт. 2026');
  assert.equal(formatDate('not a date'), '');
});

test('plural', () => {
  const f: [string, string, string] = ['трек', 'трека', 'треков'];
  assert.equal(plural(1, f), '1 трек');
  assert.equal(plural(3, f), '3 трека');
  assert.equal(plural(7, f), '7 треков');
  assert.equal(plural(11, f), '11 треков');
  assert.equal(plural(21, f), '21 трек');
  assert.equal(plural(0, f), '0 треков');
});
```

- [ ] **Step 3:** `npm test` → FAIL (`ERR_MODULE_NOT_FOUND` для `./format.ts`).
- [ ] **Step 4: Реализовать `lib/format.ts`.**
  - `formatCount`:
    - тысячи считаются как `Math.round(n / 100) / 10`; если результат ≥ 1000 — переход к миллионам (`Math.round(n / 100_000) / 10`);
    - дробь форматируется через `toLocaleString('ru-RU', { maximumFractionDigits: 1 })`, суффиксы « тыс.» и « млн»;
    - значения меньше 1000 — `String(n)`.
  - `formatTime`: отрицательное или NaN → 0, формат `m:ss`, округление вниз.
  - `formatDate`: `toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone })` без хвоста « г.». Неверная дата → `''`.
  - `plural`: через `new Intl.PluralRules('ru').select(n)`: `one` → `forms[0]`, `few` → `forms[1]`, остальное → `forms[2]`.
- [ ] **Step 5:** `npm test` → PASS, 4 теста. Предупреждение `MODULE_TYPELESS_PACKAGE_JSON` ожидаемо, на результат не влияет.
- [ ] **Step 6:** Коммит: `git add package.json tsconfig.json lib/format.ts lib/format.test.ts && git commit -m "feat: тестовый раннер и форматирование чисел, времени и дат"`.

### Task 2: LRC и тайминги строк

**Files:**
- Create: `lib/lrc.ts`, `lib/lrc.test.ts`, `lib/lyrics.ts`, `lib/lyrics.test.ts`

**Interfaces:**
- Consumes: `LyricLine` из `lib/types.ts` (через `import type`).
- Produces:
  - `parseLrc(text: string): LyricLine[]` — строки отсортированы по времени, `id` вида `l-0`, `l-1`…
  - `formatLrcTimestamp(seconds: number): string` — формат `[mm:ss.xx]`.
  - `toLrc(lines: LyricLine[]): string` — строки вида `"[mm:ss.xx] текст"` через `\n`.
  - `activeLineIndex(lines: LyricLine[], time: number): number` — номер активной строки, `-1`, если ни одна ещё не началась.
  - `lineProgress(lines: LyricLine[], index: number, time: number, duration: number): number` — заливка от 0 до 1.
  - `trackDuration(lines: LyricLine[]): number` — `max(10, время последней строки + 4)`.

- [ ] **Step 1: Написать падающие тесты**

```ts
// lib/lrc.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc, toLrc, formatLrcTimestamp } from './lrc.ts';

test('parseLrc reads lines and skips metadata, junk and empty text', () => {
  const lines = parseLrc('[ar:Лиза Ветер]\n[00:00.00] Город гаснет\n\nпросто текст\n[00:04.5] Фонари\n[00:08.00]   ');
  assert.deepEqual(lines.map((l) => [l.time, l.text]), [[0, 'Город гаснет'], [4.5, 'Фонари']]);
  assert.deepEqual(lines.map((l) => l.id), ['l-0', 'l-1']);
});

test('parseLrc handles CRLF, BOM, milliseconds and several stamps per line', () => {
  const text = '﻿[00:10.00]Второй\r\n[00:01.234][00:20.00] Припев\r\n';
  assert.deepEqual(parseLrc(text).map((l) => [l.time, l.text]), [
    [1.234, 'Припев'], [10, 'Второй'], [20, 'Припев'],
  ]);
});

test('formatLrcTimestamp rounds to centiseconds', () => {
  assert.equal(formatLrcTimestamp(0), '[00:00.00]');
  assert.equal(formatLrcTimestamp(65.5), '[01:05.50]');
  assert.equal(formatLrcTimestamp(3.456), '[00:03.46]');
  assert.equal(formatLrcTimestamp(59.999), '[01:00.00]');
});

test('toLrc round-trips through parseLrc', () => {
  const src = [{ id: 'a', time: 0, text: 'Раз' }, { id: 'b', time: 4.25, text: 'Два' }];
  assert.equal(toLrc(src), '[00:00.00] Раз\n[00:04.25] Два');
  assert.deepEqual(parseLrc(toLrc(src)).map((l) => [l.time, l.text]), [[0, 'Раз'], [4.25, 'Два']]);
});
```

```ts
// lib/lyrics.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeLineIndex, lineProgress, trackDuration } from './lyrics.ts';

const lines = [
  { id: '1', time: 0, text: 'a' },
  { id: '2', time: 4, text: 'b' },
  { id: '3', time: 8, text: 'c' },
];

test('activeLineIndex', () => {
  assert.equal(activeLineIndex(lines, -1), -1);
  assert.equal(activeLineIndex(lines, 0), 0);
  assert.equal(activeLineIndex(lines, 5), 1);
  assert.equal(activeLineIndex(lines, 100), 2);
  assert.equal(activeLineIndex([], 5), -1);
});

test('lineProgress fills over 90% of the line', () => {
  assert.equal(lineProgress(lines, 0, 0, 12), 0);
  assert.ok(Math.abs(lineProgress(lines, 0, 1.8, 12) - 0.5) < 1e-9);
  assert.equal(lineProgress(lines, 0, 3.6, 12), 1);
  assert.equal(lineProgress(lines, 2, 11.6, 12), 1);
  assert.equal(lineProgress(lines, -1, 3, 12), 0);
  assert.equal(lineProgress([], 0, 3, 12), 0);
  assert.equal(lineProgress([{ id: 'x', time: 2, text: 'x' }, { id: 'y', time: 2, text: 'y' }], 0, 2, 10), 1);
});

test('trackDuration', () => {
  assert.equal(trackDuration([]), 10);
  assert.equal(trackDuration(lines), 12);
  assert.equal(trackDuration([{ id: 'x', time: 36, text: 'z' }]), 40);
  assert.equal(trackDuration([{ id: 'x', time: 3, text: 'z' }]), 10);
});
```

- [ ] **Step 2:** `npm test` → FAIL: модулей нет.
- [ ] **Step 3: Реализовать `lib/lrc.ts`.**
  - `parseLrc`: убрать BOM, разбить текст по `/\r?\n/`.
  - В начале каждой строки собрать все метки `\[(\d{1,3}):(\d{1,2}(?:\.\d{1,3})?)\]` регулярным выражением с флагом `y`. Текстом считается остаток после меток без пробелов по краям.
  - Пропустить строку, если меток нет или текст пуст. Иначе выдать по одной строке караоке на каждую метку.
  - Устойчиво отсортировать по времени, затем назначить `id` по номеру после сортировки.
  - `formatLrcTimestamp`: перевести время в целые сотые (`Math.round(sec * 100)`) и разложить на минуты, секунды и сотые.
- [ ] **Step 4: Реализовать `lib/lyrics.ts`.**
  - `lineProgress`: `(time − start) / ((end − start) · 0.9)`, ограниченное диапазоном 0…1.
  - `end` — время следующей строки или `duration`.
  - Если `end ≤ start`, вернуть 1. Если `index < 0` или такой строки нет, вернуть 0.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6:** Коммит: `feat: разбор LRC и расчёт активной строки`.

### Task 3: Сессия записи «На слух»

**Files:**
- Create: `lib/tap-sync.ts`, `lib/tap-sync.test.ts`

**Interfaces:**
- Produces:
  - `interface TapSession { readonly texts: string[]; readonly marks: number[] }`
  - `textToLines(text: string): string[]`
  - `createTapSession(texts: string[]): TapSession`
  - `tap(session: TapSession, time: number): TapSession` — возвращает **тот же** объект, если запись завершена или `time` меньше последней отметки.
  - `undoTap(session: TapSession): TapSession`
  - `isComplete(session: TapSession): boolean`
  - `nextLineIndex(session: TapSession): number` — номер строки, которую отметит следующий тап (равен `marks.length`).
  - `toLyricLines(session: TapSession): LyricLine[]` — только отмеченные строки, `id` вида `t-${i}`, время округлено до сотых.

- [ ] **Step 1: Написать падающий тест**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textToLines, createTapSession, tap, undoTap, isComplete, nextLineIndex, toLyricLines } from './tap-sync.ts';

test('textToLines trims and drops empty lines', () => {
  assert.deepEqual(textToLines('  Раз \r\n\n Два\n   \nТри'), ['Раз', 'Два', 'Три']);
});

test('tap marks lines in order and completes', () => {
  let s = createTapSession(['Раз', 'Два']);
  assert.equal(nextLineIndex(s), 0);
  s = tap(s, 1.2);
  s = tap(s, 3.456);
  assert.equal(isComplete(s), true);
  assert.equal(nextLineIndex(s), 2);
  assert.deepEqual(toLyricLines(s), [
    { id: 't-0', time: 1.2, text: 'Раз' },
    { id: 't-1', time: 3.46, text: 'Два' },
  ]);
});

test('taps after completion or earlier than the last mark are ignored', () => {
  let s = tap(createTapSession(['Раз', 'Два']), 5);
  assert.equal(tap(s, 4), s);
  s = tap(s, 6);
  assert.equal(tap(s, 7), s);
});

test('undoTap removes the last mark', () => {
  const s = tap(tap(createTapSession(['Раз', 'Два', 'Три']), 1), 2);
  assert.deepEqual(undoTap(s).marks, [1]);
  assert.deepEqual(undoTap(createTapSession(['Раз'])).marks, []);
});

test('toLyricLines on an incomplete session returns only marked lines', () => {
  const s = tap(createTapSession(['Раз', 'Два']), 1);
  assert.deepEqual(toLyricLines(s).map((l) => l.text), ['Раз']);
});
```

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Реализовать `lib/tap-sync.ts`: неизменяемые обновления, `textToLines` разбивает по `/\r?\n/`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Коммит: `feat: логика записи таймингов «На слух»`.

### Task 4: Логика входа

**Files:**
- Create: `lib/login.ts`, `lib/login.test.ts`

**Interfaces:**
- Consumes: `User` из `lib/types.ts` (через `import type`).
- Produces:
  - `normalizeUsername(value: string): string` — обрезать пробелы по краям, перевести в нижний регистр, заменить серии пробелов на `_`.
  - `uniqueUsername(base: string, users: User[]): string` — если `base` занят, добавляет число: `admin` → `admin2` → `admin3`.
  - `findUserByIdentifier(users: User[], identifier: string): User | undefined`
  - `buildUserFromIdentifier(identifier: string, users: User[], id: string, createdAt: string): User` — `role: 'user'`, `avatar: ''`, `bio: ''`.
  - `safeNextPath(next: string | null | undefined): string`

- [ ] **Step 1: Написать падающий тест**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { User } from './types';
import { findUserByIdentifier, buildUserFromIdentifier, safeNextPath } from './login.ts';

const base = { avatar: '', createdAt: '2026-01-01T00:00:00Z' };
const users: User[] = [
  { ...base, id: 'user-admin', username: 'admin', name: 'Администратор', email: 'admin@karaokecraft.ru', role: 'admin' },
  { ...base, id: 'user-liza', username: 'liza_veter', name: 'Лиза Ветер', email: 'liza@karaokecraft.ru', role: 'user' },
];

test('findUserByIdentifier matches username or email ignoring case and spaces', () => {
  assert.equal(findUserByIdentifier(users, 'Admin')?.id, 'user-admin');
  assert.equal(findUserByIdentifier(users, '  LIZA@karaokecraft.ru ')?.id, 'user-liza');
  assert.equal(findUserByIdentifier(users, 'liza veter')?.id, 'user-liza');
  assert.equal(findUserByIdentifier(users, 'nobody'), undefined);
  assert.equal(findUserByIdentifier(users, '   '), undefined);
});

test('buildUserFromIdentifier from a username can be found again', () => {
  const u = buildUserFromIdentifier('Vasya Pupkin', users, 'user-1', '2026-10-28T00:00:00Z');
  assert.deepEqual(
    { id: u.id, username: u.username, email: u.email, name: u.name, role: u.role },
    { id: 'user-1', username: 'vasya_pupkin', email: 'vasya_pupkin@karaokecraft.demo', name: 'Vasya Pupkin', role: 'user' },
  );
  assert.equal(findUserByIdentifier([...users, u], 'VASYA pupkin')?.id, 'user-1');
});

test('buildUserFromIdentifier from an email keeps usernames unique', () => {
  const u = buildUserFromIdentifier('Admin@Other.com', users, 'user-2', '2026-10-28T00:00:00Z');
  assert.equal(u.email, 'admin@other.com');
  assert.equal(u.username, 'admin2');
  assert.equal(u.name, 'Admin');
  assert.equal(findUserByIdentifier([...users, u], 'admin@other.com')?.id, 'user-2');
});

test('safeNextPath allows only same-site paths', () => {
  assert.equal(safeNextPath('/profile'), '/profile');
  assert.equal(safeNextPath('/karaoke/x?y=1'), '/karaoke/x?y=1');
  assert.equal(safeNextPath(null), '/');
  assert.equal(safeNextPath('//evil.com'), '/');
  assert.equal(safeNextPath('https://evil.com'), '/');
  assert.equal(safeNextPath('/\\evil.com'), '/');
});
```

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3: Реализовать `lib/login.ts`.**
  - Если идентификатор содержит «@», сравнивать его с email в нижнем регистре.
  - Иначе сравнивать `normalizeUsername(identifier)` с `username` в нижнем регистре.
  - Имя (`name`) — сам идентификатор без пробелов по краям; для email — часть до «@» в исходном регистре.
  - `safeNextPath` пропускает только строки, которые начинаются с `/`, если второй символ — не `/` и не `\`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Коммит: `feat: поиск и создание пользователя при входе, безопасный next`.

### Task 5: Логика каталога

**Files:**
- Create: `lib/catalog.ts`, `lib/catalog.test.ts`

**Interfaces:**
- Consumes: `Karaoke` из `lib/types.ts` (через `import type`).
- Produces:
  - `type SortKey = 'rec' | 'pop' | 'new' | 'old'`
  - `interface CatalogQuery { q: string; tag: string | null; sort: SortKey }`
  - `parseCatalogQuery(params: URLSearchParams): CatalogQuery` — по умолчанию `{ q: '', tag: null, sort: 'rec' }`; неизвестный `sort` → `'rec'`.
  - `catalogQueryToString(query: CatalogQuery): string` — значения по умолчанию опускаются; если всё по умолчанию — `''`.
  - `filterAndSort(items: Karaoke[], query: CatalogQuery): Karaoke[]` — не меняет входной массив.
  - `collectTags(items: Karaoke[]): string[]` — по частоте по убыванию, при равенстве по алфавиту (`localeCompare(b, 'ru')`).
  - `pickShowcase(items: Karaoke[]): Karaoke | undefined` — рекомендованный трек с наибольшим баллом, иначе трек с наибольшим баллом среди всех.

- [ ] **Step 1: Написать падающий тест**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Karaoke } from './types';
import { parseCatalogQuery, catalogQueryToString, filterAndSort, collectTags, pickShowcase, type CatalogQuery } from './catalog.ts';

function track(id: string, over: Partial<Karaoke>): Karaoke {
  return {
    id, title: id, artist: 'A', description: '', tags: [], lyrics: [], duration: 40,
    style: { font: 'Onest', textColor: '#fff', activeColor: '#fb0', backgroundColor: '#000' },
    authorId: 'u', authorName: 'U', likesCount: 0, viewsCount: 0, createdAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const items = [
  track('night', { title: 'Ночной автобус', tags: ['поп', 'ночь'], viewsCount: 50, recommendationScore: 9, isFeatured: true, createdAt: '2026-10-14T00:00:00Z' }),
  track('salt', { title: 'Соль на губах', artist: 'Мэй и Море', tags: ['поп', 'лето'], viewsCount: 90, recommendationScore: 10, isFeatured: true, createdAt: '2026-08-21T00:00:00Z' }),
  track('rock', { title: 'Панельный рай', tags: ['рок'], viewsCount: 70, createdAt: '2026-09-11T00:00:00Z' }),
  track('legacy', { title: 'Старая ёлка', tags: undefined as unknown as string[], viewsCount: 5, createdAt: '2026-01-02T00:00:00Z' }),
];
const q = (over: Partial<CatalogQuery>): CatalogQuery => ({ q: '', tag: null, sort: 'rec', ...over });
const ids = (list: Karaoke[]) => list.map((k) => k.id);

test('query parsing and serialization', () => {
  assert.deepEqual(parseCatalogQuery(new URLSearchParams('sort=bogus')), q({}));
  assert.equal(catalogQueryToString(q({})), '');
  const full = q({ q: 'ночь', tag: 'поп', sort: 'pop' });
  assert.deepEqual(parseCatalogQuery(new URLSearchParams(catalogQueryToString(full))), full);
});

test('sorting', () => {
  assert.deepEqual(ids(filterAndSort(items, q({}))), ['salt', 'night', 'rock', 'legacy']);
  assert.deepEqual(ids(filterAndSort(items, q({ sort: 'pop' }))), ['salt', 'rock', 'night', 'legacy']);
  assert.deepEqual(ids(filterAndSort(items, q({ sort: 'new' }))), ['night', 'rock', 'salt', 'legacy']);
  assert.deepEqual(ids(filterAndSort(items, q({ sort: 'old' }))), ['legacy', 'salt', 'rock', 'night']);
  assert.deepEqual(ids(items), ['night', 'salt', 'rock', 'legacy']);
});

test('search and tag filter', () => {
  assert.deepEqual(ids(filterAndSort(items, q({ q: 'МОРЕ' }))), ['salt']);
  assert.deepEqual(ids(filterAndSort(items, q({ q: '  поп ' }))), ['salt', 'night']);
  assert.deepEqual(ids(filterAndSort(items, q({ q: 'елка' }))), ['legacy']);
  assert.deepEqual(ids(filterAndSort(items, q({ tag: 'поп' }))), ['salt', 'night']);
  assert.deepEqual(ids(filterAndSort(items, q({ tag: 'рок', q: 'нет такого' }))), []);
});

test('collectTags and pickShowcase', () => {
  assert.deepEqual(collectTags(items), ['поп', 'лето', 'ночь', 'рок']);
  assert.equal(pickShowcase(items)?.id, 'salt');
  assert.equal(pickShowcase([items[2], items[3]])?.id, 'rock');
  assert.equal(pickShowcase([]), undefined);
});
```

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3: Реализовать `lib/catalog.ts`.**
  - Поиск идёт по названию, артисту, автору и тегам. Строки сравниваются в нижнем регистре с заменой «ё» на «е», запрос обрезается по краям.
  - `tags` может отсутствовать — тогда это `[]`.
  - Балл для сортировки «Рекомендуем»: `recommendationScore ?? (isFeatured ? 10 : 5)`.
  - Сортировка устойчивая, по копии массива.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Коммит: `feat: фильтрация, сортировка и URL-состояние каталога`.

### Task 6: Основа — шрифты, токены, базовые стили

**Files:**
- Create: `app/fonts.ts`, `lib/fonts.ts`
- Modify: `app/globals.css`, `app/layout.tsx`, `app/create/page.tsx` (метаданные), `lib/types.ts:8-17`

**Interfaces:**
- Produces:
  - `app/fonts.ts` — объекты `next/font/google`:
    - шрифты интерфейса (`preload: true`): `onest` (`--font-onest`) и `unbounded` (`--font-unbounded`);
    - шрифты стилей (`preload: false`): `playfair` (`--font-playfair`), `caveat` (`--font-caveat`), `russoOne` (`--font-russo`, `weight: '400'`), `jetbrainsMono` (`--font-jetbrains`);
    - у всех `subsets: ['latin', 'cyrillic']` и `display: 'swap'`;
    - `fontVariables: string` — все `variable` через пробел.
  - `lib/fonts.ts`:
    - `type StyleFontKey = 'Onest' | 'Unbounded' | 'Playfair' | 'Caveat' | 'Russo' | 'Georgia' | 'Mono'`
    - `STYLE_FONTS: ReadonlyArray<{ key: StyleFontKey; label: string; family: string }>` в этом порядке. Подписи: Onest, Unbounded, Playfair, Caveat, Russo One, Georgia, Моно.
    - `family` берётся из `font.style.fontFamily`. Для Georgia — `Georgia, "Times New Roman", serif`; для Моно — JetBrains Mono.
    - `fontFamilyFor(key: string | undefined): string` — неизвестный ключ → семейство Onest.
    - `DISPLAY_FONT: string` — семейство Unbounded.
  - Утилиты Tailwind из токенов §3.1 спеки:
    - цвета: `bg-ink`, `bg-surface-1/2/3`, `border-line`, `border-line-strong`, `text-fg`, `text-fg-muted`, `text-fg-subtle`, `bg-accent`, `text-accent`, `text-accent-ink`, `bg-accent-soft`, `text-danger`, `text-success`;
    - шрифты: `font-sans`, `font-display`, `font-mono`;
    - прочее: `rounded-field` (10px), `shadow-pop`, `wrap`.
  - Классы эффектов:
    - `lyric-wipe` — читает `--progress`, `--wipe-color`, `--wipe-rest`;
    - `sing` — анимация `--progress` от 0% до 100%;
    - `mask-fade-y`;
    - `range` — ползунок; заполненная часть задаётся через `--fill`;
    - `animate-shimmer`.

- [ ] **Step 1:** В `lib/types.ts` добавить в `FontFamily` ключи `'Playfair' | 'Caveat' | 'Russo'`.
- [ ] **Step 2:** Создать `app/fonts.ts` и `lib/fonts.ts` по интерфейсу выше. Перед этим прочитать `node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md`.
- [ ] **Step 3: Переписать начало `app/globals.css`** в таком порядке:
  1. `@import "tailwindcss";`
  2. `@theme` — токены из §3.1 спеки, а также `--radius-field: 10px` и `--shadow-pop: 0 12px 32px rgb(0 0 0 / .45)`.
  3. `@theme inline` — `--font-sans: var(--font-onest), system-ui, sans-serif`, `--font-display: var(--font-unbounded), var(--font-onest), sans-serif`, `--font-mono: var(--font-jetbrains), ui-monospace, monospace`.
  4. `@utility wrap` — `max-width: 1280px`, `margin-inline: auto`, поля 16px, с 640px — 24px, с 1024px — 40px.
  5. `@layer base`:
     - `html` — `bg-ink`, `color-scheme: dark`;
     - `body` — `font-sans`, `text-fg`, `antialiased`;
     - `:focus-visible` — обводка 2px акцентом со смещением 2px;
     - `::selection` — `accent-soft`;
     - `html:has(dialog[open]) { overflow: hidden }`;
     - общее правило `prefers-reduced-motion`.
  6. Эффекты: `@property --progress` (`<percentage>`, начальное значение 0%), `.lyric-wipe`, `@keyframes sing`, `.mask-fade-y`, `@keyframes shimmer`, `.range`.
  7. Блок `/* legacy — удалить в Task 17 */`: все текущие правила без изменений, кроме двух.
     - Удалить старое правило `body` целиком (вместе с `overflow-x: hidden`).
     - Переопределить переменные: `--fd: var(--font-unbounded), var(--font-onest), sans-serif` и `--fb: var(--font-onest), system-ui, sans-serif`.
- [ ] **Step 4: Обновить `app/layout.tsx`.**
  - `<html lang="ru" className={fontVariables}>`, без `<link>` на Google Fonts и без `data-theme`.
  - `<body className="flex min-h-dvh flex-col">`, `<main className="flex-1">`.
  - `metadata.title = { default: 'KaraokeCraft — караоке-анимации', template: '%s — KaraokeCraft' }`.
  - `export const viewport: Viewport = { themeColor: '#0B0A10' }`.
  - `Navbar` и `Footer` пока остаются.
  - В `app/create/page.tsx` заголовок страницы — `'Студия'`.
- [ ] **Step 5:** `npx tsc --noEmit` → без ошибок.
- [ ] **Step 6: Проверить в браузере** на `http://localhost:3000/` и `/create`.
  - `getComputedStyle(document.body).fontFamily` содержит имя, которое сгенерировал `next/font` для Onest.
  - Нет запросов к `fonts.googleapis.com`.
  - Страницы выглядят как раньше.
  - В консоли нет ошибок.
- [ ] **Step 7:** Коммит: `feat: дизайн-токены «Сцена» и шрифты через next/font`.

### Task 7: Хранилище и вход без мигания

**Files:**
- Modify: `lib/storage.ts`, `context/AuthContext.tsx`, `app/login/page.tsx` (кнопки быстрого входа)
- Create: `lib/store.ts`

**Interfaces:**
- Consumes: Task 4 — `findUserByIdentifier`, `buildUserFromIdentifier`, `uniqueUsername`, `normalizeUsername`.
- Produces:
  - `lib/storage.ts`:
    - `export const STORAGE_KEYS`.
    - `subscribeStorage(onChange: () => void): () => void` — оповещает об изменениях: каждый `safeSetItem` в этой вкладке и событие `storage` из других вкладок. При первой подписке досеивает отсутствующие ключи (вызовы `getKaraokes()`, `getUsers()`, `getComments('')`).
  - `lib/store.ts`:
    - `GUEST_USER_ID = 'guest-user'`
    - `useStoredKaraokes(): Karaoke[] | null`
    - `useStoredUsers(): User[] | null`
    - `useStoredCurrentUser(): User | null | undefined` — `undefined` значит «неизвестно», `null` — гость.
    - `useStoredComments(karaokeId: string): Comment[] | null`
    - `useStoredLikedIds(userId: string): string[] | null`
  - `context/AuthContext.tsx` → `useAuth()`:

```ts
type AuthStatus = 'loading' | 'guest' | 'user';
type RegisterResult = { ok: true; user: User } | { ok: false; field: 'email' | 'username'; message: string };
interface AuthContextType {
  user: User | null; status: AuthStatus; isAdmin: boolean;
  isAuthenticated: boolean; isLoading: boolean; // совместимость со старыми страницами
  login(identifier: string, password?: string): User;
  register(data: { username?: string; name: string; email: string }): RegisterResult;
  logout(): void;
  switchUser(userId: string): void;
  updateProfile(data: Partial<Pick<User, 'name' | 'bio' | 'avatar'>>): void;
}
```

- [ ] **Step 1: Добавить в `lib/storage.ts` оповещения.** Набор слушателей и вызов `notify()` в `safeSetItem`. Ключи и формат данных не меняются.
- [ ] **Step 2: Создать `lib/store.ts`.**
  - Каждый хук — это `useSyncExternalStore(subscribeStorage, getSnapshot, getServerSnapshot)`.
  - `getSnapshot` разбирает сырую строку из localStorage и кеширует результат по этой строке. Он никогда не пишет в хранилище.
  - Если ключа нет: треки, пользователи и отзывы → `INITIAL_*`, текущий пользователь → `INITIAL_USERS[0]`.
  - Сохранённое значение `null` для текущего пользователя → `null`.
  - Серверный снимок: `null`, а для текущего пользователя — `undefined`.
- [ ] **Step 3: Переписать `AuthContext`.**
  - Пользователь берётся из `useStoredCurrentUser()`, без `useState` и `useEffect`.
  - `login`: найти пользователя через `findUserByIdentifier(getUsers(), identifier)`, иначе создать через `buildUserFromIdentifier(identifier, users, 'user-' + Date.now(), new Date().toISOString())` и сохранить (`saveUser`). Затем `setCurrentUser`.
  - `register`, занятый email → `{ ok: false, field: 'email', message: 'Этот email уже зарегистрирован' }`.
  - `register`, занятое имя пользователя → `{ ok: false, field: 'username', message: 'Имя пользователя занято' }`.
  - `register` без имени пользователя → `uniqueUsername(normalizeUsername(часть email до «@»), users)`.
  - `updateProfile` сохраняет и запись пользователя, и текущего пользователя.
- [ ] **Step 4:** В `app/login/page.tsx` кнопки быстрого входа вызывают `login('admin')` и `login('liza_veter')`.
- [ ] **Step 5:** `npm test` → PASS, `npx tsc --noEmit` → без ошибок.
- [ ] **Step 6: Проверить в браузере.**
  - Перезагрузить `/`, `/karaoke/nochnoy-avtobus`, `/create`, `/profile`, `/admin`, `/login`.
  - `read_console_messages` (только ошибки) не содержит «Hydration failed».
  - На `/login` число `JSON.parse(localStorage.karaokecraft_users).length` не меняется после нажатий «Админ» и «Пользователь», а шапка показывает выбранного пользователя.
- [ ] **Step 7:** Коммит: `fix: состояние входа через useSyncExternalStore — без ошибок гидратации и дубликатов`.

### Task 8: Шапка, меню пользователя, футер

**Files:**
- Create:
  - `components/ui/cn.ts`, `components/ui/button.tsx`, `components/ui/icon-button.tsx`, `components/ui/menu.tsx`, `components/ui/avatar.tsx`, `components/ui/skeleton.tsx`;
  - `components/layout/Logo.tsx`, `components/layout/SiteHeader.tsx`, `components/layout/UserMenu.tsx`, `components/layout/SiteFooter.tsx`.
- Modify: `app/layout.tsx`
- Delete: `components/layout/Navbar.tsx`, `components/layout/Footer.tsx`

**Interfaces:**
- Consumes: Task 7 — `useAuth()`.
- Produces:
  - `cn(...parts: Array<string | false | null | undefined>): string`
  - `type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'glass'`, `type ButtonSize = 'sm' | 'md' | 'lg'`. Высота 32/40/48px, текст 13/14/16px. `glass` — `bg-white/10 hover:bg-white/20 text-current`, для экранов в цвете трека.
  - `buttonStyles(opts?: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean }): string` — по умолчанию `secondary`, `md`.
  - `Button(props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; icon?: ReactNode })` — `type` по умолчанию `'button'`.
  - `iconButtonStyles(opts?: { variant?: ButtonVariant; size?: ButtonSize }): string`
  - `IconButton(props: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: ButtonVariant; size?: ButtonSize; pressed?: boolean })` — круглая; `aria-label` и `title` равны `label`; `aria-pressed` ставится, если передан `pressed`.
  - `Menu(props: { label: string; button: ReactNode; buttonClassName?: string; align?: 'start' | 'end'; children: ReactNode })`, а также `MenuItem(props: { href?: string; onSelect?: () => void; icon?: ReactNode; tone?: 'default' | 'danger'; children: ReactNode })`, `MenuSeparator()`, `MenuHeader(props: { children: ReactNode })`.
  - `Avatar(props: { name: string; src?: string; size?: number; className?: string })` — размер по умолчанию 32. Инициалы — первые буквы двух первых слов. Фон — `hash(name) % 8` из палитры `['#7c3aed','#db2777','#ea580c','#0891b2','#16a34a','#4f46e5','#c026d3','#0d9488']`, белый текст. Если `src` пустой или картинка не загрузилась, показываются инициалы.
  - `Skeleton(props: { className?: string })`
  - `Logo(props: { compact?: boolean })` — текущая SVG-иконка из трёх полосок в `accent` и надпись «KaraokeCraft» шрифтом `font-display` 15px; `compact` скрывает надпись.

- [ ] **Step 1:** Создать UI-компоненты по интерфейсам.
  - `Menu`:
    - у кнопки `aria-haspopup="menu"` и `aria-expanded`, у списка `role="menu"`, у пунктов `role="menuitem"`;
    - при открытии фокус на первом пункте, ↑/↓ переключают пункты;
    - Esc закрывает меню и возвращает фокус на кнопку;
    - `pointerdown` снаружи закрывает, выбор пункта закрывает.
- [ ] **Step 2: Создать `SiteHeader`.**
  - Высота 64px, `sticky top-0 z-40 border-b border-line bg-ink/75 backdrop-blur-xl`, внутри `wrap`.
  - На маршрутах `/karaoke/*`: `fixed inset-x-0 top-0 hidden lg:block bg-transparent border-transparent`. На телефоне у плеера своя верхняя строка (Task 10).
  - Слева направо:
    - `Logo`;
    - ссылки «Каталог» (`/`) и «Студия» (`/create`), видны с `md`. Активная ссылка — `aria-current="page"`, `bg-surface-2 text-fg`; остальные — `text-fg-muted hover:text-fg`;
    - пустое место;
    - на `md+` — ссылка «Создать» (`buttonStyles({ variant: 'primary', size: 'sm' })`, иконка Plus);
    - ниже `md` — ссылка-иконка «+» (`iconButtonStyles()`, `aria-label="Создать караоке"`);
    - блок входа: при `status === 'loading'` — `Skeleton` 36×36, круглый; при `guest` — ссылка «Войти» на `/login?next=${encodeURIComponent(pathname)}`, которую не показывать на `/login` и `/register`; при `user` — `UserMenu`.
- [ ] **Step 3: Создать `UserMenu`.**
  - Кнопка: `Avatar` 32px, на `md+` первое слово имени (до 140px, с обрезкой) и `ChevronDown`.
  - `MenuHeader`: имя, @username и бейдж «Администратор» для админа.
  - Пункты:
    - «Профиль» → `/profile`;
    - «Админка» → `/admin` (только для админа);
    - «Сменить роль (демо)» → `switchUser(isAdmin ? 'user-liza' : 'user-admin')`;
    - разделитель;
    - «Выйти» (`tone="danger"`) → `logout()`.
- [ ] **Step 4: Создать `SiteFooter`.**
  - На `/karaoke/*` не показывается.
  - `border-t border-line`, внутри `wrap flex flex-col items-center gap-3 py-8 text-[13px] text-fg-subtle sm:flex-row sm:justify-between`.
  - Слева `Logo compact` и «© 2026 KaraokeCraft», справа ссылки «Каталог», «Студия», «Профиль».
- [ ] **Step 5: Подключить в `app/layout.tsx`.**
  - `SiteHeader` — в `<Suspense>`; заглушка — `<header>` высотой 64px с `Logo`.
  - `SiteFooter` — в `<Suspense fallback={null}>`.
  - Удалить `Navbar.tsx` и `Footer.tsx`.
- [ ] **Step 6:** `npx tsc --noEmit` и `npx eslint components/ui components/layout app/layout.tsx` → без ошибок.
- [ ] **Step 7: Проверить в браузере.**
  - На 375×812 для `/`, `/create`, `/profile`, `/admin`, `/login` и `/karaoke/nochnoy-avtobus`: `document.documentElement.scrollWidth === document.documentElement.clientWidth`.
  - Меню открывается; Esc закрывает его и возвращает фокус; клик снаружи закрывает.
  - «Профиль» ведёт на `/profile`.
  - «Выйти» → в шапке «Войти» со ссылкой с `next`.
  - В консоли нет ошибок.
- [ ] **Step 8:** Коммит: `feat: новая шапка, меню пользователя и футер`.

### Task 9: Каталог

**Files:**
- Create:
  - `components/ui/segmented.tsx`, `components/ui/chip.tsx`;
  - `components/karaoke/LyricCover.tsx`, `components/karaoke/TrackCard.tsx`;
  - `components/catalog/Catalog.tsx`, `components/catalog/Showcase.tsx`, `components/catalog/CatalogSkeleton.tsx`.
- Modify: `app/page.tsx` — серверный компонент, `<Suspense fallback={<CatalogSkeleton withHero />}><Catalog /></Suspense>`.

**Interfaces:**
- Consumes:
  - Task 5 — `parseCatalogQuery`, `catalogQueryToString`, `filterAndSort`, `collectTags`, `pickShowcase`, `SortKey`;
  - Task 1 — `formatCount`, `formatTime`, `plural`;
  - Task 6 — `fontFamilyFor`;
  - Task 7 — `useStoredKaraokes`;
  - Task 8 — `Button`, `Skeleton`, `cn`.
- Produces:
  - `Segmented<T extends string>(props: { label: string; value: T; options: ReadonlyArray<{ value: T; label: ReactNode }>; onChange: (value: T) => void; mode?: 'radio' | 'tabs'; idPrefix?: string; size?: 'sm' | 'md'; className?: string })`
    - `radio` → `role="radiogroup"` и `role="radio"`; `tabs` → `role="tablist"`, `role="tab"`, `id={`${idPrefix}-tab-${value}`}`, `aria-controls={`${idPrefix}-panel-${value}`}`;
    - фокус перемещается внутри группы (roving tabindex), ←/→ меняют значение.
  - `tabPanelProps(idPrefix: string, value: string): { id: string; role: 'tabpanel'; 'aria-labelledby': string }`
  - `Chip(props: ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean; size?: 'sm' | 'md' })`
  - `LyricCover(props: { track: Pick<Karaoke, 'title' | 'lyrics' | 'style'>; variant?: 'card' | 'hero' | 'thumb'; animate?: 'always' | 'hover' | 'never'; className?: string })` — по умолчанию `card`/`never`. Без хуков и без `'use client'`, чтобы работал и в серверных компонентах.
  - `TrackCard(props: { track: Karaoke })`
  - `Showcase(props: { track: Karaoke })`
  - `CatalogSkeleton(props: { withHero?: boolean })`

- [ ] **Step 1:** Создать `Segmented` и `Chip`.
- [ ] **Step 2: Создать `LyricCover`.**
  - Фон — `style.backgroundColor` и сверху `radial-gradient(120% 90% at 85% 0%, color-mix(in srgb, <active> 28%, transparent), transparent 60%)`.
  - Цвет текста — `style.textColor`, шрифт — `fontFamilyFor(style.font)`.
  - `card` и `hero`:
    - контейнер `@container`; `card` всегда квадратный (`aspect-square`), а пропорции `hero` задаёт вызывающий код через `className`;
    - три строки: `lyrics[1]`, `lyrics[2]` и `lyrics[3]`;
    - средняя строка — `.lyric-wipe` с `--wipe-color` = акцент и `--wipe-rest` = цвет текста с прозрачностью 35%;
    - крайние строки с `opacity: .4`;
    - если строк меньше трёх — показать имеющиеся; если 0 — название как одна активная строка;
    - размер текста: `card` — `8.5cqw`, `hero` — `7cqw`.
  - `thumb` — первая буква названия акцентным цветом, 45% размера блока.
  - Анимация:
    - `always` — `animation: sing 3.2s linear infinite`;
    - `hover` — та же анимация, но на паузе, запускается по `group-hover` и `group-focus-visible`;
    - `never` — статичное значение `--progress: 60%`.
- [ ] **Step 3: Создать `TrackCard`.**
  - `Link` с классом `group` на `/karaoke/${id}`, внутри `LyricCover` с `animate="hover"`.
  - Бейджи: слева сверху «★ Выбор редакции» (если `isFeatured`), справа сверху `formatTime(duration)`. Оба на `bg-ink/60 backdrop-blur`.
  - Круглая кнопка ▶ 44px (`bg-accent text-accent-ink`) справа снизу, видна по hover и фокусу.
  - Под обложкой:
    - название — 15px, `font-semibold`, с обрезкой;
    - артист — 14px, `text-fg-muted`, с обрезкой;
    - строка 13px `text-fg-subtle`: Heart `formatCount(likesCount)` и Play `formatCount(viewsCount)`.
  - При наведении карточка поднимается: `-translate-y-1`.
- [ ] **Step 4: Создать `Showcase`.** Ссылка на трек: `LyricCover` в варианте `hero` с `animate="always"` и `className="aspect-[16/10] lg:aspect-square"` (на телефоне ниже), подпись «Выбор редакции · {title} — {artist}». Первый экран — `grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end`; до `lg` витрина стоит под поиском и чипами.
- [ ] **Step 5: Создать `Catalog` и `CatalogSkeleton`.**
  - **Состояние:**
    - `query = parseCatalogQuery(useSearchParams())`;
    - строка поиска — локальное состояние, оно синхронизируется с `query.q` при внешней смене адреса;
    - адрес — `pathname` + `?` + `catalogQueryToString(...)`; поиск пишет его через `history.replaceState` с задержкой 300 мс, тег и сортировка — через `history.pushState`.
  - **Клавиша «/»** ставит фокус в поиск, кроме случаев, когда фокус уже в input, textarea, select или contenteditable.
  - **Первый экран:**
    - h1 «Покажите песню так, как вы её слышите» (`font-display`, `text-[clamp(32px,5vw,56px)]`);
    - подзаголовок — текущий текст;
    - поиск: `rounded-full bg-surface-1 border border-line`, иконка Search, плейсхолдер «Песня, артист или тег», подсказка `kbd` «/» на `md+`;
    - до 8 чипов из `collectTags`: нажатый — текущий тег, клик включает или снимает тег;
    - справа `Showcase(pickShowcase(...))`.
  - **Панель:**
    - `Segmented` (режим `radio`, label «Сортировка»): «Рекомендуем», «Популярные», «Новые», «Старые»;
    - если выбран тег — нажатый `Chip` «#тег ×», снимает тег;
    - справа `plural(n, ['трек','трека','треков'])`.
  - **Сетка:** `grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`.
  - **Пока данные `null`** — 8 скелетон-карточек.
  - **Пусто:** «Ничего не нашлось» и «Попробуйте другое название, артиста или тег.», кнопка «Сбросить фильтры» очищает поиск и тег, сортировку оставляет.
- [ ] **Step 6:** `npx tsc --noEmit` → без ошибок.
- [ ] **Step 7: Проверить в браузере.**
  - Жёсткая перезагрузка `/` → скелетоны, затем 7 карточек. «Ничего не нашлось» не мелькает.
  - `/?tag=поп&sort=pop` → Blinding Lights, Соль на губах, Ночной автобус — именно в этом порядке.
  - Ввод «море» → одна карточка «Соль на губах», через ~300 мс в адресе `q=`.
  - Выбрать тег, затем «Назад» → прежний фильтр.
  - «/» вне поля фокусирует поиск, «/» внутри поля печатается (Review Focus 2).
  - Наведение на карточку → строка «поётся», видна ▶.
  - На 375×812: 2 колонки, нет горизонтальной прокрутки.
  - **Review Focus 3:** записать в localStorage трек с `style.font = 'Inter'`, без `tags` и с `lyrics: []`, перезагрузить. Страница рендерится, карточка показывает название шрифтом Onest.
  - В консоли нет ошибок.
- [ ] **Step 8:** Коммит: `feat: каталог с обложками-кадрами, фильтрами в URL и витриной`.

### Task 10: Плеер — воспроизведение и раскладка

**Files:**
- Create:
  - `components/ui/toast.tsx`;
  - `components/player/usePlayback.ts`, `components/player/LyricsView.tsx`, `components/player/PlayerControls.tsx`, `components/player/KaraokePlayer.tsx`.
- Modify:
  - `app/layout.tsx` — `ToastProvider` внутри `AuthProvider`;
  - `app/karaoke/[id]/page.tsx` — тонкая клиентская страница: `useParams` → `<KaraokePlayer id={id} />` внутри `<Suspense>` со скелетоном.

**Interfaces:**
- Consumes:
  - Task 2 — `activeLineIndex`, `lineProgress`;
  - Task 1 — `formatTime`, `formatCount`;
  - Task 6 — `fontFamilyFor`;
  - Task 7 — `useStoredKaraokes`, `useStoredLikedIds`, `GUEST_USER_ID`, `useAuth`;
  - Task 8 — `Button`, `IconButton`, `Menu`, `Avatar`, `Skeleton`;
  - Task 9 — `LyricCover`;
  - `synthPlayer` из `lib/audio-synthesizer.ts`.
- Produces:
  - `ToastProvider`, `useToast(): { show(message: string, tone?: 'default' | 'success' | 'error'): void }`
  - `usePlayback(opts: { duration: number; preset?: Karaoke['audioPreset'] }): Playback`, где:

```ts
interface Playback {
  time: number; isPlaying: boolean; volume: number; muted: boolean;
  play(): void; pause(): void; toggle(): void;
  seek(time: number): void; skip(delta: number): void;
  setVolume(volume: number): void; toggleMute(): void;
}
```

  - `LyricsView(props: { lines: LyricLine[]; time: number; duration: number; fontFamily: string; activeColor: string; textColor: string; onSeekLine: (index: number) => void; className?: string })`
  - `PlayerControls(props: { playback: Playback; duration: number; accent: string })`
  - `KaraokePlayer(props: { id: string })`

- [ ] **Step 1: Создать `ToastProvider`.**
  - Один тост за раз, `fixed top-20 left-1/2 -translate-x-1/2 z-[60]`, исчезает через 2600 мс.
  - `role="status"`, `aria-live="polite"`.
  - Оттенки: `default` — `bg-surface-3`, `success` — иконка Check акцентом, `error` — `text-danger`.
- [ ] **Step 2: Создать `usePlayback`.**
  - Часы — `requestAnimationFrame` и `performance.now()`.
  - На `duration` — пауза, `time = duration`. `play()` при `time ≥ duration` начинает с нуля.
  - Звук:
    - `play` → `synthPlayer?.playPreset(preset ?? 'synthwave', time)`;
    - пауза и размонтирование → `synthPlayer?.stop()`;
    - перемотка во время игры → `playPreset(preset, t)`.
  - Громкость: после каждого `playPreset` и при изменении вызывать `synthPlayer?.setVolume(muted ? 0 : volume * 0.5)`. Начальная `volume` — 0.8.
- [ ] **Step 3: Создать `LyricsView`.**
  - Каждая строка — `<button>`. Клик или Enter вызывают `onSeekLine(i)`.
  - Активная строка — `.lyric-wipe` с `--progress: lineProgress·100%`, прошедшие — `opacity .5`, будущие — `.3`, при наведении — `.7`.
  - Размер текста: `text-[clamp(26px,7.5vw,36px)] lg:text-[clamp(30px,3.2vw,48px)]`, `font-bold leading-[1.15] max-w-[22ch]`.
  - Контейнер — `overflow-y-auto mask-fade-y`, сверху и снизу отступ `40vh`, полоса прокрутки скрыта.
  - **Автоцентрирование** активной строки (`scrollTo`, плавно, без анимации при reduced motion) срабатывает:
    - при смене активной строки;
    - при скачке времени больше 1,5 с между кадрами (перемотка).
  - Если пользователь сам прокрутил контейнер (`wheel`, `touchmove`), автоцентрирование ждёт 3000 мс.
- [ ] **Step 4: Создать `PlayerControls`.**
  - Фиксированная панель внизу: `z-30 bg-black/35 backdrop-blur-xl border-t border-white/10 text-white`, внутри `wrap flex h-[72px] items-center gap-2 sm:gap-3`, плюс отступ `env(safe-area-inset-bottom)`.
  - Кнопки:
    - `IconButton` «Назад на 5 секунд» (RotateCcw);
    - круглая ▶/❚❚ 48px (`bg-white text-black`, подписи «Играть»/«Пауза»);
    - «Вперёд на 5 секунд» (RotateCw).
  - Прогресс: время `formatTime` (13px, `tabular-nums`), `input.range` (0…duration, шаг 0.1, `--fill` в %, `aria-label="Перемотка"`, `accent-color` = акцент трека), длительность.
  - Звук: кнопка «Выключить звук»/«Включить звук» (Volume2/VolumeX) и ползунок громкости 0…1 с шагом 0.05 (`aria-label="Громкость"`, скрыт на `<sm`).
- [ ] **Step 5: Создать `KaraokePlayer`.**
  - **Данные:** `useStoredKaraokes()`; пока `null` — скелетон; трека нет — «Караоке не найдено», «Возможно, его удалили или ссылка неверна.» и ссылка «В каталог» (primary).
  - **Просмотры:** `incrementViewCount(id)` один раз за монтирование.
  - **Фон:** корневой `section` на всю высоту, `min-h-dvh`, фон и цвет текста — из стиля трека. Слой свечения: `radial-gradient(60% 50% at 75% 25%, color-mix(in srgb, <active> 24%, transparent), transparent 70%)`.
  - **Раскладка от `lg`:**
    - `wrap grid grid-cols-[340px_minmax(0,1fr)] gap-16 pt-24 pb-28`;
    - aside `sticky top-24 self-start`: `LyricCover` (`card`, статичный);
    - h1 — `font-display`, 26px; артист — `opacity .75`; «Автор: …» с `Avatar` 20px;
    - теги — ссылки на `/?tag=<тег>` (`bg-white/10`);
    - кнопки (`variant="glass"`): лайк (Heart с заливкой акцентом, если лайкнуто, и `formatCount`), «Поделиться» (Share2), «Скачать видео» (Download).
  - **Раскладка до `lg`:**
    - верхняя строка `sticky top-0 h-14`: `IconButton` «В каталог» → `/`, `LyricCover` `thumb` 44px, название и артист с обрезкой, лайк (`IconButton` glass с `pressed`), `Menu` «Ещё» (MoreHorizontal) с пунктами «Поделиться» и «Скачать видео»;
    - высота текста: `h-[calc(100dvh-56px-72px)]`.
  - **Лайк:** `toggleKaraokeLike(track.id, user?.id ?? GUEST_USER_ID)`. Состояние — из `useStoredLikedIds(user?.id ?? GUEST_USER_ID)`.
  - **«Поделиться»:** `navigator.clipboard.writeText(location.href)` → тост «Ссылка скопирована» (`success`), при ошибке — «Не удалось скопировать ссылку» (`error`).
  - **«Скачать видео»:** открывает текущий `VideoDownloaderModal` с `initialFormat`: `'16:9'` или `'h'` → `'landscape'`, иначе `'reel'`.
  - **Клавиши** (на `window`):
    - Пробел — `preventDefault()` и `toggle()`;
    - ←/→ — `skip(∓5)`;
    - не срабатывают, если `event.target` — input, textarea, select или contenteditable, а также при открытом `dialog[open]`.
- [ ] **Step 6:** `npx tsc --noEmit` → без ошибок.
- [ ] **Step 7: Проверить в браузере** (1366 и 375).
  - Перезагрузка `/karaoke/nochnoy-avtobus` → скелетон, затем плеер, ошибок гидратации нет.
  - ▶ → строка заливается плавно; пауза работает.
  - Перемотка на 16 с (через `HTMLInputElement` setter и событие `input`): через 1 с центр строки «Ехать, ехать, не домой» в пределах ±40px от центра контейнера.
  - Клик по 3-й строке → время 8.0, идёт воспроизведение.
  - Пробел ставит паузу и снимает её, в том числе после клика по строке; ←/→ перематывают на ±5 с.
  - Лайк меняет `aria-pressed`, а в localStorage меняется `likesCount`.
  - «Поделиться» показывает тост.
  - На 375: шапки сайта нет, видны своя верхняя строка и панель управления, нет горизонтальной прокрутки.
  - В конце поставить на паузу.
- [ ] **Step 8:** Коммит: `feat: плеер в цвете трека, плавная подсветка и горячие клавиши`.

### Task 11: Диалоги — модалка, отзывы, экспорт видео

**Files:**
- Create: `components/ui/modal.tsx`, `components/ui/field.tsx`
- Modify:
  - `components/karaoke/CommentsSection.tsx`, `components/karaoke/VideoDownloaderModal.tsx`;
  - `components/player/KaraokePlayer.tsx`;
  - `components/karaoke/KaraokeCreator.tsx` — только место вызова: `isOpen` → `open`; сам файл заменяется в Task 13.

**Interfaces:**
- Consumes:
  - Task 6 — `fontFamilyFor`, `DISPLAY_FONT`;
  - Task 7 — `useStoredComments`;
  - Task 8 — `Avatar`, `Button`, `IconButton`, `buttonStyles`;
  - Task 1 — `formatDate`;
  - Task 10 — `useToast`.
- Produces:
  - `Field(props: { label: string; hint?: string; error?: string; className?: string; children: (control: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true }) => ReactNode })`
  - `inputStyles(invalid?: boolean): string`; `Input`, `Textarea` и `Select` — обёртки над нативными элементами, все пропсы передаются дальше. Стиль: `rounded-field bg-surface-2 border border-line`, при фокусе `border-accent`, при ошибке `border-danger`.
  - `Modal(props: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; placement?: 'center' | 'side'; size?: 'sm' | 'md' | 'lg' })` — ширина `center` 400/520/680px.
  - `VideoDownloaderModal(props: { karaoke: Karaoke; open: boolean; onClose: () => void; initialFormat?: 'reel' | 'landscape' })` — `initialFormat` по умолчанию из `karaoke.style.aspectRatio`; формат сбрасывается к нему при каждом открытии.
  - `CommentsSection(props: { karaokeId: string })`

- [ ] **Step 0:** Создать `field.tsx` по интерфейсу. Подсказка и ошибка выводятся под полем (13px; ошибка — `text-danger`), их `id` передаётся в `aria-describedby`.
- [ ] **Step 1: Создать `Modal`** на нативном `<dialog>`.
  - `open` → `showModal()`, иначе `close()`.
  - Событие `cancel` (Esc) → `preventDefault()` и `onClose()`.
  - Клик, у которого цель — сам `<dialog>` (подложка), → `onClose()`.
  - После закрытия фокус возвращается туда, где был до открытия.
  - Шапка модалки: заголовок (`font-display`, 18px), описание, `IconButton` «Закрыть» (X).
  - `side`: на `md+` правая панель `h-dvh w-[min(100vw,420px)]`, на `<md` нижняя шторка `max-h-[85dvh] w-full rounded-t-3xl`.
- [ ] **Step 2: Переписать `CommentsSection`.**
  - Данные — `useStoredComments`, без собственной рамки карточки.
  - Для гостя — поле имени, плейсхолдер «Как вас зовут?».
  - Поле отзыва — `Textarea`, 3 строки, плейсхолдер «Что вы думаете о треке?». Пустой отзыв → ошибка «Напишите отзыв» у поля.
  - Кнопка «Отправить» (primary, sm). Аватар нового отзыва — `user?.avatar ?? ''`.
  - Элемент списка: `Avatar` 32px, имя, `formatDate(createdAt)`, текст. Для автора или админа — `IconButton` «Удалить отзыв» (Trash2).
- [ ] **Step 3: Переписать `VideoDownloaderModal`** на `Modal`.
  - **Выбор формата** — радио-карточки (`role="radiogroup"`), в каждой мини-кадр в цветах трека:
    - «Вертикальное 9:16» — «Reels, Shorts, TikTok»;
    - «Горизонтальное 16:9» — «YouTube и экраны».
  - **Состояние idle:** «Записать видео» (primary, block) и «Скачать кадр .png» (secondary, block).
  - **Состояние recording:** полоса прогресса, проценты и кнопка «Отмена» — останавливает запись и синтезатор, результат отбрасывается.
  - **Состояние done:** превью `<video controls playsInline muted>`, ссылка `<a download>` «Скачать видео» (primary, block, файл `${slug}_karaokecraft.${ext}`) и «Записать заново».
  - **Формат файла:** первый поддерживаемый `MediaRecorder.isTypeSupported` из `['video/webm;codecs=vp9', 'video/webm', 'video/mp4']`.
  - **Состояние error**, если `MediaRecorder` нет или ничего не поддерживается: «Ваш браузер не умеет записывать видео. Скачайте кадр .png или откройте сайт в Chrome.» и только кнопка PNG.
  - **Шрифты canvas:** заголовок — `DISPLAY_FONT`, текст — `fontFamilyFor(style.font)`. Неактивные строки — цвет `style.textColor` с `globalAlpha` 0.35. Перед отрисовкой — `await document.fonts.load(...)` для обоих семейств. Водяной знак не меняется.
  - **Уборка:** закрытие во время записи останавливает рекордер и синтезатор и отменяет rAF; object URL освобождаются при замене и размонтировании.
- [ ] **Step 4: Подключить в `KaraokePlayer`.**
  - На десктопе — кнопка glass «Отзывы (N)» (MessageCircle, N из `useStoredComments`).
  - На телефоне — пункт «Отзывы (N)» в меню «Ещё».
  - Обе открывают `Modal` с `placement="side"` и заголовком «Отзывы», внутри `CommentsSection`.
- [ ] **Step 5:** `npx tsc --noEmit` → без ошибок.
- [ ] **Step 6: Проверить в браузере.**
  - «Отзывы (1)» открывает правую панель; Esc закрывает, фокус возвращается; клик по подложке закрывает.
  - Отзыв гостя «Классно!» появляется с инициалами.
  - Во время игры Пробел в поле отзыва печатает пробел и не ставит на паузу (Review Focus 2).
  - На 375 отзывы — нижняя шторка, нет горизонтальной прокрутки.
  - Экспорт трека 9:16 открывается с 9:16; переключение на 16:9 меняет превью.
  - «Записать видео» показывает прогресс; «Отмена» возвращает в idle и глушит звук.
  - **Review Focus 4:** `const MR = window.MediaRecorder; window.MediaRecorder = undefined`, открыть экспорт → сообщение и кнопка PNG; затем `window.MediaRecorder = MR`.
  - В консоли нет ошибок.
- [ ] **Step 7:** Коммит: `feat: модалки на <dialog>, панель отзывов и новый экспорт видео`.

### Task 12: Вход и регистрация

**Files:**
- Create: `components/auth/AuthShell.tsx`, `components/auth/LoginForm.tsx`, `components/auth/RegisterForm.tsx`
- Modify: `app/login/page.tsx`, `app/register/page.tsx` — серверные страницы с `metadata.title` «Вход» и «Регистрация»: `AuthShell` и форма в `<Suspense fallback={<Skeleton className="h-[360px] rounded-3xl" />}>`.

**Interfaces:**
- Consumes:
  - Task 4 — `safeNextPath`;
  - Task 7 — `useAuth`;
  - Task 8 — `Button`, `Skeleton`;
  - Task 9 — `LyricCover`;
  - Task 11 — `Field`, `Input`;
  - `INITIAL_KARAOKES` из `lib/mock-data.ts`.
- Produces:
  - `AuthShell(props: { title: string; subtitle: string; children: ReactNode; footer: ReactNode })` — серверный компонент.
    - Справа (с `lg`) — `LyricCover` трека `sol-na-gubah` (`hero`, `animate="always"`, `className="aspect-square"`) и слоган «Покажите песню так, как вы её слышите».
  - `LoginForm()`, `RegisterForm()` — клиентские; `next = safeNextPath(useSearchParams().get('next'))`.

- [ ] **Step 1:** Создать `AuthShell`.
- [ ] **Step 2: Создать `LoginForm`.**
  - Заголовок «Вход», подзаголовок «Войдите, чтобы публиковать караоке, ставить лайки и сохранять видео.».
  - Поле «Имя пользователя или email»: `autoComplete="username"`, плейсхолдер «liza_veter или liza@karaokecraft.ru».
  - Поле «Пароль»: `type="password"`, `autoComplete="current-password"`, подсказка «В демо подойдёт любой пароль».
  - Пустой идентификатор → ошибка «Введите имя пользователя или email» и фокус на поле.
  - Кнопка «Войти» (primary, block).
  - Блок «Быстрый вход для демо»: «Лиза — пользователь» → `login('liza_veter')`, «Администратор» → `login('admin')`.
  - Внизу «Нет аккаунта? Зарегистрироваться» → `/register`, параметр `next` сохраняется.
  - После входа — `router.push(next)`.
- [ ] **Step 3: Создать `RegisterForm`.**
  - Подзаголовок «Аккаунт нужен, чтобы ваши треки и лайки сохранялись.».
  - Поля:
    - «Имя» * — пустое: «Введите имя»;
    - «Имя пользователя» — префикс @, подсказка «Можно не заполнять — возьмём из email»;
    - «Email» * — пустое: «Введите email», без «@»: «Похоже, это не email»;
    - «Пароль» * — короче 4 символов: «Минимум 4 символа».
  - Ошибки из `register` показываются у соответствующего поля.
  - Внизу «Уже есть аккаунт? Войти». После успеха — `router.push(next)`.
- [ ] **Step 4:** Обновить обе страницы. `npx tsc --noEmit` → без ошибок.
- [ ] **Step 5: Проверить в браузере.**
  - `/login?next=/profile` → «Лиза — пользователь» → `/profile`, в шапке Лиза, число пользователей не изменилось.
  - Вход «LIZA@karaokecraft.ru» → Лиза.
  - Вход «new user» → выход → снова «New User»: всего +1 пользователь (Review Focus 5).
  - `/login?next=//evil.com` → после входа `/` (Review Focus 5).
  - Пустая отправка → текст ошибки, `aria-invalid="true"`, фокус на поле.
  - Регистрация с «liza@karaokecraft.ru» → «Этот email уже зарегистрирован» под полем Email.
  - 1366 — две колонки, 375 — одна, нет горизонтальной прокрутки; в консоли нет ошибок.
- [ ] **Step 6:** Коммит: `feat: страницы входа и регистрации в новом стиле`.

### Task 13: Студия

**Files:**
- Create:
  - `lib/palettes.ts`;
  - `components/studio/Studio.tsx`, `components/studio/StudioSection.tsx`, `components/studio/TagInput.tsx`, `components/studio/LrcEditor.tsx`, `components/studio/StylePanel.tsx`, `components/studio/StudioPreview.tsx`.
- Modify: `app/create/page.tsx` → `<Studio />`
- Delete: `components/karaoke/KaraokeCreator.tsx`

**Interfaces:**
- Consumes:
  - Task 2 — `parseLrc`, `toLrc`, `activeLineIndex`, `lineProgress`, `trackDuration`;
  - Task 1 — `plural`, `formatTime`;
  - Task 6 — `STYLE_FONTS`, `fontFamilyFor`, `StyleFontKey`;
  - Task 8 — `Button`, `IconButton`;
  - Task 9 — `Segmented`;
  - Task 10 — `usePlayback`, `useToast`;
  - Task 11 — `VideoDownloaderModal`, `Field`, `Input`, `Textarea`;
  - `saveKaraoke`, `PROTOTYPE_LYRICS`.
- Produces:
  - `PALETTES: ReadonlyArray<{ id: string; name: string; background: string; text: string; active: string }>`:

    | id | name | background | text | active |
    | --- | --- | --- | --- | --- |
    | night | Ночь | #1d1b3a | #f4f4f5 | #ffb547 |
    | sea | Море | #0f2a2a | #f4f4f5 | #5eead4 |
    | sunset | Закат | #3b1220 | #fdf2f8 | #fda4af |
    | neon | Неон | #0a0618 | #f5f3ff | #3df5ff |
    | forest | Лес | #10231a | #ecfdf5 | #a3e635 |
    | sepia | Сепия | #2a1f14 | #fbf3e4 | #fb923c |

  - `type StudioDraft = { title: string; artist: string; description: string; tags: string[]; lyrics: LyricLine[]; lrcText: string; font: StyleFontKey; textColor: string; activeColor: string; backgroundColor: string; fontSize: number; aspect: 'v' | 'h' }` — экспортируется из `Studio.tsx`.
    - Значения по умолчанию: «Ночной автобус», «Лиза Ветер», «Атмосферный трек для ночных поездок.», `['поп','ночь']`, `PROTOTYPE_LYRICS` и `toLrc(PROTOTYPE_LYRICS)`, `'Onest'`, палитра night, `32`, `'v'`.
  - `StudioSection(props: { step: number; title: string; description?: string; children: ReactNode })`
  - `TagInput(props: { value: string[]; onChange: (tags: string[]) => void })`
  - `LrcEditor(props: { text: string; onChange: (text: string, lines: LyricLine[] | null) => void })` — `lines` равно `null`, если `parseLrc` не нашёл ни одной строки.
  - `StylePanel(props: { draft: StudioDraft; onChange: (patch: Partial<StudioDraft>) => void })`
  - `StudioPreview(props: { draft: StudioDraft })`

- [ ] **Step 1:** Создать `lib/palettes.ts`.
- [ ] **Step 2: Создать `TagInput`.**
  - Enter или запятая добавляют тег: без пробелов по краям, в нижнем регистре, без повторов, до 8 штук, каждый не длиннее 24 символов.
  - Backspace в пустом поле удаляет последний тег.
  - У чипа кнопка × с подписью «Удалить тег {tag}».
- [ ] **Step 3: Создать `LrcEditor`.**
  - Кнопка «Загрузить .lrc» (`accept=".lrc,.txt"`, чтение через FileReader).
  - Редактор `font-mono`, 8 строк.
  - Статус — `plural(n, ['строка','строки','строк'])`.
  - Если строк 0 — ошибка «Не нашли ни одной строки с таймингом вида [00:12.00]», а прежние строки сохраняются.
- [ ] **Step 4: Создать `StylePanel`.**
  - **Шрифт:** `role="radiogroup"` с подписью «Шрифт», сетка `grid-cols-4 sm:grid-cols-7`. В каждой кнопке «Аа» 24px нужным шрифтом и подпись 13px.
  - **Палитра:** `role="radiogroup"` с подписью «Палитра», кружок фона с точкой акцента и название. Активна палитра, у которой совпадают все три цвета (регистр не важен).
  - **Свои цвета:** «Фон», «Текст», «Активная строка» — `input type="color"` и hex рядом.
  - **«Размер текста»:** ползунок 20–56 с подписью `{n} px`.
  - **«Формат»:** `Segmented`, режим `radio`, варианты 9:16 и 16:9.
- [ ] **Step 5: Создать `StudioPreview`.**
  - Воспроизведение — `usePlayback({ duration: trackDuration(lyrics), preset: 'pop' })`.
  - Размер рамки:
    - `v`: высота `min(64vh, 560px)` (на `<lg` — `min(52vh, 440px)`), ширина = высота · 9/16;
    - `h`: ширина до 640px, `aspect-[16/9]`.
  - Окно строк вокруг активной (`-1` считается как 0): в `v` — 2 строки до и 3 после, в `h` — 1 до и 2 после.
  - Активная строка — `.lyric-wipe`.
  - Внутри рамки: название слева сверху (3.6cqw), водяной знак «KaraokeCraft» справа снизу.
  - Под рамкой: ▶/❚❚, ползунок, `formatTime`.
- [ ] **Step 6: Создать `Studio` и `StudioSection`.**
  - **Раскладка:** `wrap grid gap-8 pt-8 pb-28 lg:grid-cols-[minmax(0,1fr)_minmax(360px,520px)]`. Колонка превью — `order-first lg:order-none lg:sticky lg:top-24 lg:self-start`.
  - **Шаг 1 «Трек»:**
    - «Название» — обязательное, ошибка «Введите название»;
    - «Артист» — плейсхолдер «Неизвестный исполнитель»;
    - «Описание» — 2 строки;
    - «Теги» — `TagInput`.
  - **Шаг 2 «Текст и тайминги»:** `LrcEditor`.
  - **Шаг 3 «Стиль»:** `StylePanel`.
  - **Нижняя панель:**
    - `fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/85 backdrop-blur-xl`, внутри `wrap flex h-[68px] items-center justify-between gap-3`;
    - слева, с `sm`, статус: `plural(строк) · formatTime(trackDuration)`;
    - справа «Скачать видео» (secondary, Download) и «Опубликовать» (primary, Send).
  - **Публикация:**
    - пустое название → ошибка и фокус на поле;
    - иначе `saveKaraoke` — поля как в текущем `handlePublish`, плюс `duration: trackDuration(lyrics)`, `tags: tags.length ? tags : ['караоке']`, `style.font`, `fontSizePx`, `aspectRatio` `'9:16'`/`'16:9'`, `authorAvatar: user?.avatar`;
    - затем тост «Трек опубликован» (`success`) и `router.push('/karaoke/' + id)`.
  - **Экспорт:** `VideoDownloaderModal` с черновиком (`id: 'preview'`), `initialFormat` — по `aspect`.
- [ ] **Step 7:** Подключить `Studio` в `app/create/page.tsx`, удалить `KaraokeCreator.tsx`. `npx tsc --noEmit` → без ошибок.
- [ ] **Step 8: Проверить в браузере.**
  - Загрузка файла через `DataTransfer` с содержимым `"[00:00.00] Раз\r\n[00:02.00] Два\r\n"` → «2 строки», в превью Раз и Два.
  - Мусор в LRC → ошибка, превью не меняется.
  - Палитра «Море» → фон превью `#0f2a2a`; шрифт Caveat → шрифт превью меняется.
  - ▶ в превью → строки идут по настоящим таймингам.
  - Пустое название + «Опубликовать» → ошибка, фокус в поле.
  - Публикация → `/karaoke/<новый id>`; в каталоге на вкладке «Новые» он первый.
  - При формате 16:9 экспорт открывается с 16:9.
  - На 375 превью сверху, нижняя панель видна, нет горизонтальной прокрутки; в консоли нет ошибок.
- [ ] **Step 9:** Коммит: `feat: студия — шаги, стиль с палитрами, живой предпросмотр`.

### Task 14: Режим «На слух»

**Files:**
- Create: `components/studio/TapSyncRecorder.tsx`
- Modify: `components/studio/Studio.tsx` — шаг 2 получает вкладки `Segmented` (режим `tabs`, `idPrefix="lyrics"`): «LRC» и «На слух».

**Interfaces:**
- Consumes:
  - Task 3 — `textToLines`, `createTapSession`, `tap`, `undoTap`, `isComplete`, `nextLineIndex`, `toLyricLines`;
  - Task 2 — `toLrc`;
  - Task 10 — `usePlayback`, `useToast`;
  - Task 9 — `Segmented`, `tabPanelProps`.
- Produces: `TapSyncRecorder(props: { initialText: string; onComplete: (lines: LyricLine[]) => void })`

- [ ] **Step 1: Создать `TapSyncRecorder`.**
  - **Ожидание:**
    - `Textarea` «Текст песни», 8 строк, подсказка «Одна строка — одна строка караоке»;
    - число строк;
    - «Начать запись» (primary, Mic). При 0 строк — ошибка «Добавьте хотя бы одну строку».
  - **Запись:**
    - `usePlayback({ duration: 600, preset: 'pop' })` с нуля;
    - счётчик `${marks.length} / ${texts.length}` и `formatTime(time)`;
    - текущая строка `texts[next]` — 24px, жирная, с подписью «Нажмите «Тап», когда начнётся», следующая — тусклая;
    - «Тап» (primary, lg, block), «Отменить» (secondary, Undo2), «Стоп» (ghost).
  - **Клавиши во время записи** (на `window`): Пробел → тап, Backspace → отмена (у обоих `preventDefault()`), Escape → стоп.
  - **Последний тап:** пауза, `onComplete(toLyricLines(session))`, возврат в ожидание.
  - **«Стоп» раньше конца:** пауза и сообщение (`role="status"`) «Отмечено X из Y — запишите заново». Строки не меняются.
- [ ] **Step 2:** В `Studio` по `onComplete`: `lyrics = lines`, `lrcText = toLrc(lines)`, переключение на вкладку «LRC», тост «Тайминги записаны» (`success`). Начальный текст — `lyrics.map(l => l.text).join('\n')`.
- [ ] **Step 3:** `npx tsc --noEmit` → без ошибок.
- [ ] **Step 4: Проверить в браузере.**
  - Текст «Раз\nДва\nТри» → «Начать запись» → три нажатия Пробела примерно раз в секунду. Открыта вкладка «LRC» с тремя строками и растущими метками, превью их играет, есть тост, страница от Пробела не прокрутилась.
  - Тап → Backspace → счётчик «0 / 3».
  - Тап → «Стоп» → «Отмечено 1 из 3 — запишите заново», строки не изменились.
  - Уход со страницы во время записи глушит музыку.
- [ ] **Step 5:** Коммит: `feat: запись таймингов «На слух»`.

### Task 15: Профиль

**Files:**
- Modify: `app/profile/page.tsx`
- Create: `components/profile/ProfileSettingsForm.tsx`
- Delete: `components/karaoke/KaraokeCard.tsx`

**Interfaces:**
- Consumes:
  - Task 7 — `useAuth`, `useStoredKaraokes`, `useStoredLikedIds`;
  - Task 9 — `TrackCard`, `Segmented`, `tabPanelProps`;
  - Task 8 — `Avatar`, `buttonStyles`, `Skeleton`;
  - Task 11 — `Field`, `Input`, `Textarea`;
  - Task 1 — `formatCount`.
- Produces: `ProfileSettingsForm(props: { user: User })`

- [ ] **Step 1: Переписать страницу.**
  - **Пока `status === 'loading'`:** скелетоны — карточка `h-48` и 4 карточки.
  - **Гость:** карточка «Войдите, чтобы видеть свои треки», «Ваши публикации и понравившиеся треки появятся здесь.», ссылка «Войти» → `/login?next=/profile`.
  - **Шапка профиля** (`rounded-3xl bg-surface-1 border border-line p-6 sm:p-8`):
    - `Avatar` 88px, имя (`font-display`, 26px), бейдж «Администратор» для админа (`bg-accent-soft text-accent`);
    - `@username · email` (14px, `text-fg-subtle`);
    - описание или «Создаю караоке-анимации на KaraokeCraft.»;
    - ссылка «Создать трек» (primary).
  - **Статистика** — три плитки через `formatCount`: «Треков», «Лайков получено», «Прослушиваний».
  - **Списки:** «Мои треки» — `authorId === user.id`; «Понравившиеся» — id из `useStoredLikedIds(user.id)`.
  - **Вкладки:** `Segmented` (режим `tabs`, `idPrefix="profile"`): «Мои треки (N)», «Понравившиеся (N)», «Настройки».
  - **Сетки** — `TrackCard`, как в каталоге.
  - **Пустые состояния:**
    - «Создайте свой первый трек» и ссылка «Открыть студию»;
    - «Отмечайте треки сердцем» и ссылка «В каталог».
- [ ] **Step 2: Создать `ProfileSettingsForm`.**
  - «Имя» — обязательное, ошибка «Введите имя».
  - «О себе» — 3 строки, `maxLength` 160, подсказка `n / 160`.
  - «Ссылка на аватар» — `type="url"`, рядом живой `Avatar` 56px.
  - «Сохранить» (primary) → `updateProfile`, затем на 2500 мс «Сохранено» (`text-success`, иконка Check).
- [ ] **Step 3:** Удалить `KaraokeCard.tsx`. `grep -rn "KaraokeCard" app components` → пусто. `npx tsc --noEmit` → без ошибок.
- [ ] **Step 4: Проверить в браузере** под Лизой.
  - «Мои треки (3)»: Ночной автобус, Соль на губах, Бегу к рассвету. Статистика в формате «N,N тыс.».
  - Лайк трека в плеере → трек появляется в «Понравившихся».
  - Новое имя «Лиза В.» видно в меню шапки; пустое имя → ошибка.
  - Перезагрузка `/profile` → скелетон, затем профиль, без мелькания приглашения войти.
  - На 375 нет горизонтальной прокрутки; в консоли нет ошибок.
- [ ] **Step 5:** Коммит: `feat: профиль на общих компонентах`.

### Task 16: Админка

**Files:**
- Modify: `app/admin/page.tsx`
- Create: `components/admin/TracksPanel.tsx`, `components/admin/UsersPanel.tsx`

**Interfaces:**
- Consumes:
  - Task 7 — `useAuth`, `useStoredKaraokes`, `useStoredUsers`;
  - Task 11 — `Modal`;
  - Task 10 — `useToast`;
  - Task 9 — `LyricCover`, `Chip`, `Segmented`, `tabPanelProps`;
  - Task 8 — `Avatar`, `Button`, `IconButton`, `iconButtonStyles`, `Skeleton`;
  - Task 11 — `Input`;
  - Task 1 — `formatCount`, `formatDate`;
  - из `lib/storage.ts` — `toggleFeatured`, `deleteKaraoke`, `updateUserRole`, `deleteUser`.
- Produces:
  - `TracksPanel(props: { karaokes: Karaoke[] })`
  - `UsersPanel(props: { users: User[]; currentUserId: string })`

- [ ] **Step 1: Переписать страницу.**
  - **Пока загрузка:** скелетон.
  - **Не админ:** карточка «Нужны права администратора», «Здесь модерируют каталог и пользователей.», кнопка «Войти как администратор (демо)» → `switchUser('user-admin')`.
  - **Шапка:** h1 «Модерация» и ссылка «Создать трек» (secondary).
  - **Четыре плитки** через `formatCount`: «Треков», «Пользователей», «Лайков», «Прослушиваний».
  - **Вкладки:** `Segmented` (режим `tabs`, `idPrefix="admin"`): «Треки (N)», «Пользователи (N)», «Система».
  - **«Система»** — две карточки:
    - модуль водяного знака, текст как сейчас;
    - окружение: «Фреймворк» — Next.js 16 (App Router), «Стили» — Tailwind CSS v4, токены «Сцена», «Звук» — Web Audio API, «Хранилище» — localStorage.
- [ ] **Step 2: Создать `TracksPanel`.**
  - Поиск — плейсхолдер «Название, артист или автор», рядом счётчик.
  - С `md` — таблица `table-fixed` с колонками «Трек» (40%), «Автор», «Статистика», «Статус», «Действия». Ниже `md` — список карточек с тем же содержимым.
  - Трек: `LyricCover` `thumb` 40px, название-ссылка, артист.
  - Статистика: ♥ и ▶ через `formatCount`.
  - Статус — `Chip` с `pressed={isFeatured}`: «★ Выбор редакции» или «Обычный». Клик → `toggleFeatured(id)`.
  - Действия: ссылка «Открыть трек» (ExternalLink) и `IconButton` «Удалить трек».
  - **Подтверждение удаления** — `Modal` (`size="sm"`), заголовок «Удалить трек?», описание «"{title}" исчезнет из каталога. Это действие нельзя отменить.». Кнопки «Отмена» (secondary) и «Удалить» (danger) → `deleteKaraoke(id)` и тост «Трек удалён».
- [ ] **Step 3: Создать `UsersPanel`.**
  - Строка: `Avatar` 32px, имя и @username, email (`font-mono`, 13px).
  - Бейдж роли: «Админ» (`accent-soft`) или «Пользователь» (`surface-3`).
  - `formatDate(createdAt)`.
  - Кнопка «Сделать админом»/«Снять админа» (sm, secondary) → `updateUserRole`.
  - `IconButton` «Удалить пользователя» — не для себя, с подтверждением в `Modal`, затем `deleteUser` и тост.
- [ ] **Step 4:** `grep -rn "confirm(" app components` → пусто. `npx tsc --noEmit` → без ошибок.
- [ ] **Step 5: Проверить в браузере.**
  - Переключение «★» у «Тихая линия» отражается в каталоге на вкладке «Рекомендуем».
  - Удаление через модалку работает; Esc закрывает модалку без удаления.
  - На 375 вместо таблиц карточки, нет горизонтальной прокрутки.
  - Перезагрузка `/admin` под админом → скелетон, затем панель, без мелькания «Нужны права».
  - В консоли нет ошибок.
- [ ] **Step 6:** Коммит: `feat: админка — плитки, таблицы-карточки, подтверждение через модалку`.

### Task 17: Уборка и итоговая проверка

**Files:**
- Delete: `components/karaoke/SpotifyLyricsEngine.tsx`, `components/karaoke/ShareModal.tsx`
- Modify:
  - `package.json` и `package-lock.json` — через `npm uninstall canvas-confetti @types/canvas-confetti`;
  - `app/globals.css` — удалить блок `legacy`;
  - `README.md`.

- [ ] **Step 1:** Удалить два файла и выполнить `npm uninstall canvas-confetti @types/canvas-confetti`.
- [ ] **Step 2:** Удалить блок `/* legacy … */` из `globals.css`. `grep -rnE "var\(--(bg|s1|s2|ln|tx|mu|ac|on|fd|fb|pbg|pact|ptx|pf|sb|sa|st|sf|sz)\)" app components` → пусто.
- [ ] **Step 3: Обновить `README.md`.**
  - Стилизация: «Tailwind CSS v4, дизайн-токены «Сцена» (`app/globals.css`)».
  - Шрифты: «`next/font` — Unbounded, Onest и шрифты стилей».
  - Добавить команду `npm test`.
  - Добавить возможности: «Запись таймингов «На слух»», «Горячие клавиши плеера: Пробел, ←/→».
- [ ] **Step 4:** `npm test` → все тесты PASS; `npm run lint` → 0 ошибок; `npm run build` → успешная сборка.
- [ ] **Step 5: Матрица в браузере.**
  - Страницы: `/`, `/?tag=поп`, `/karaoke/nochnoy-avtobus`, `/karaoke/does-not-exist`, `/create`, `/profile`, `/admin`, `/login`, `/register`.
  - Размеры: 1366×860 и 375×812.
  - Для каждой пары:
    - `document.documentElement.scrollWidth === document.documentElement.clientWidth`;
    - `read_console_messages({ onlyErrors: true })` пусто;
    - скриншот.
  - Отдельный проход после выхода: `/profile` — приглашение войти, `/admin` — демо-карточка, в шапке «Войти».
- [ ] **Step 6:** Коммит: `chore: удалить мёртвый код и старые стили, обновить README`.
