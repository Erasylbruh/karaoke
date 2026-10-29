'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Search, SearchX, X } from 'lucide-react';
import { TrackCard } from '@/components/karaoke/TrackCard';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Segmented } from '@/components/ui/segmented';
import {
  catalogQueryToString,
  collectTags,
  filterAndSort,
  parseCatalogQuery,
  pickShowcase,
  type CatalogQuery,
  type SortKey,
} from '@/lib/catalog';
import { plural } from '@/lib/format';
import { useStoredKaraokes } from '@/lib/store';
import { CATALOG_GRID, CATALOG_HERO, CatalogIntro, CatalogSkeleton, ShowcaseSkeleton, TagChipsSkeleton } from './CatalogSkeleton';
import { Showcase } from './Showcase';

const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: 'rec', label: 'Рекомендуем' },
  { value: 'pop', label: 'Популярные' },
  { value: 'new', label: 'Новые' },
  { value: 'old', label: 'Старые' },
];

const MAX_TAGS = 8;
const SEARCH_DELAY_MS = 300;

/** True when the key press goes into a text field, so a hotkey must not take it. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;
}

/**
 * Home page catalog: search, tag chips, showcase, sorting and the track grid.
 * The query lives in the URL (?q=, ?tag=, ?sort=); uses `useSearchParams`, so render it inside `<Suspense>`.
 */
export function Catalog() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const query = useMemo(() => parseCatalogQuery(searchParams), [searchParams]);
  const items = useStoredKaraokes();

  // The input is local state so typing is instant; the URL catches up after SEARCH_DELAY_MS.
  const [search, setSearch] = useState(query.q);
  // When ?q= changes from outside (Back, a link), the input follows it. `writtenQ` is the value this
  // component wrote itself: when the URL catches up with it, the input is already ahead and is left alone.
  const [seenQ, setSeenQ] = useState(query.q);
  const [writtenQ, setWrittenQ] = useState<string | null>(null);
  if (query.q !== seenQ) {
    setSeenQ(query.q);
    if (query.q !== writtenQ) setSearch(query.q);
  }

  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  // «/» focuses the search, unless the user is already typing somewhere.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // `code` covers the same physical key on the Russian layout, where it types «.».
      const isSlash = event.key === '/' || (event.code === 'Slash' && !event.shiftKey);
      if (!isSlash || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.defaultPrevented) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const tags = useMemo(() => (items ? collectTags(items).slice(0, MAX_TAGS) : []), [items]);
  const showcase = useMemo(() => (items ? pickShowcase(items) : undefined), [items]);
  const results = useMemo(
    () => (items ? filterAndSort(items, { q: search, tag: query.tag, sort: query.sort }) : null),
    [items, search, query.tag, query.sort],
  );

  function hrefFor(next: CatalogQuery): string {
    const qs = catalogQueryToString(next);
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function cancelPendingSearch() {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }

  /** Writes the search into the current history entry, keeping whatever tag and sort the URL has now. */
  function writeSearch(value: string) {
    cancelPendingSearch();
    const current = parseCatalogQuery(new URLSearchParams(window.location.search));
    if (current.q === value) return;
    setWrittenQ(value);
    window.history.replaceState(null, '', hrefFor({ ...current, q: value }));
  }

  function onSearchChange(value: string) {
    setSearch(value);
    cancelPendingSearch();
    timerRef.current = window.setTimeout(() => writeSearch(value), SEARCH_DELAY_MS);
  }

  /** A new history entry, so «Назад» returns to the previous filter. Carries the typed search along. */
  function pushQuery(next: CatalogQuery) {
    cancelPendingSearch();
    setWrittenQ(next.q);
    window.history.pushState(null, '', hrefFor(next));
  }

  const activeTag = query.tag;
  const toggleTag = (tag: string) => pushQuery({ ...query, q: search, tag: query.tag === tag ? null : tag });
  const changeSort = (sort: SortKey) => pushQuery({ ...query, q: search, sort });
  const resetFilters = () => {
    setSearch('');
    pushQuery({ q: '', tag: null, sort: query.sort });
  };

  return (
    <>
      <section className={CATALOG_HERO}>
        <div className="min-w-0">
          <CatalogIntro />

          <form
            role="search"
            className="relative mt-8"
            onSubmit={(event) => {
              event.preventDefault();
              writeSearch(search);
            }}
          >
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4.5 size-5 -translate-y-1/2 text-fg-subtle" />
            <input
              ref={inputRef}
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              aria-label="Поиск по каталогу"
              aria-keyshortcuts="/"
              placeholder="Песня, артист или тег"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              className="peer h-12 w-full rounded-full border border-line bg-surface-1 pr-5 pl-12 text-[16px] text-fg transition-colors placeholder:text-fg-subtle hover:border-line-strong focus:border-line-strong focus-visible:outline-offset-0"
            />
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 hidden h-7 min-w-7 -translate-y-1/2 items-center justify-center rounded-md border border-line bg-surface-2 px-2 font-mono text-[13px] leading-none text-fg-muted md:inline-flex md:peer-focus:hidden md:peer-[:not(:placeholder-shown)]:hidden"
            >
              /
            </kbd>
          </form>

          <div
            role="group"
            aria-label="Популярные теги"
            className="mt-4 flex gap-2 max-sm:-mx-4 max-sm:overflow-x-auto max-sm:px-4 max-sm:[scrollbar-width:none] sm:flex-wrap"
          >
            {items === null
              ? <TagChipsSkeleton />
              : tags.map((tag) => (
                  <Chip key={tag} pressed={query.tag === tag} onClick={() => toggleTag(tag)}>
                    <span aria-hidden="true" className="opacity-50">
                      #
                    </span>
                    {tag}
                  </Chip>
                ))}
          </div>
        </div>

        {showcase ? <Showcase track={showcase} /> : items === null && <ShowcaseSkeleton />}
      </section>

      <section aria-labelledby="catalog-tracks" className="wrap pb-16 sm:pb-24">
        <h2 id="catalog-tracks" className="sr-only">
          Треки
        </h2>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          {/* On phones the four segments are wider than the screen: the row scrolls edge to edge, like the tag chips. */}
          <div className="max-sm:-mx-4 max-sm:w-[calc(100%+32px)] max-sm:overflow-x-auto max-sm:px-4 max-sm:[scrollbar-width:none]">
            <Segmented
              label="Сортировка"
              value={query.sort}
              options={SORT_OPTIONS}
              onChange={changeSort}
              className="max-sm:max-w-none max-sm:overflow-visible"
            />
          </div>
          {activeTag && (
            <Chip pressed title="Снять тег" onClick={() => toggleTag(activeTag)}>
              <span aria-hidden="true" className="opacity-60">
                #
              </span>
              {activeTag}
              <X aria-hidden="true" />
              <span className="sr-only">{' — снять тег'}</span>
            </Chip>
          )}
          <p aria-live="polite" className="ml-auto text-[14px] text-fg-muted tabular-nums">
            {results && plural(results.length, ['трек', 'трека', 'треков'])}
          </p>
        </div>

        {results === null ? (
          <CatalogSkeleton />
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-16 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-fg-muted">
              <SearchX aria-hidden="true" className="size-6" />
            </span>
            <p className="mt-4 font-display text-[20px] font-semibold text-fg">Ничего не нашлось</p>
            <p className="mt-2 max-w-[40ch] text-[15px] text-fg-muted">Попробуйте другое название, артиста или тег.</p>
            <Button className="mt-6" onClick={resetFilters}>
              Сбросить фильтры
            </Button>
          </div>
        ) : (
          <ul role="list" className={CATALOG_GRID}>
            {results.map((track) => (
              <li key={track.id} className="min-w-0">
                <TrackCard track={track} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
