import type { Karaoke } from './types';

export type SortKey = 'rec' | 'pop' | 'new' | 'old';

export interface CatalogQuery {
  q: string;
  tag: string | null;
  sort: SortKey;
}

const DEFAULT_SORT: SortKey = 'rec';
const SORT_KEYS: readonly SortKey[] = ['rec', 'pop', 'new', 'old'];

// Tracks saved by older versions of the app may have no tags at all.
const tagsOf = (item: Karaoke): string[] => item.tags ?? [];

/** Lowercases and folds "ё" into "е", so that "елка" finds "ёлка". */
const fold = (value: string): string => value.toLowerCase().replace(/ё/g, 'е');

// Score for the "Рекомендуем" order: the explicit one, else 10 for editor's picks and 5 for the rest.
const recScore = (item: Karaoke): number => item.recommendationScore ?? (item.isFeatured ? 10 : 5);

const createdTime = (item: Karaoke): number => {
  const time = Date.parse(item.createdAt);
  return Number.isNaN(time) ? 0 : time;
};

// Array.prototype.sort is stable: tracks that compare equal keep their order in the input.
const COMPARATORS: Record<SortKey, (a: Karaoke, b: Karaoke) => number> = {
  rec: (a, b) => recScore(b) - recScore(a),
  pop: (a, b) => b.viewsCount - a.viewsCount,
  new: (a, b) => createdTime(b) - createdTime(a),
  old: (a, b) => createdTime(a) - createdTime(b),
};

function isSortKey(value: string | null): value is SortKey {
  return SORT_KEYS.some((key) => key === value);
}

/** Reads ?q=, ?tag= and ?sort=. Missing or unknown values fall back to the defaults. */
export function parseCatalogQuery(params: URLSearchParams): CatalogQuery {
  const sort = params.get('sort');
  return {
    q: params.get('q') ?? '',
    tag: params.get('tag') || null,
    sort: isSortKey(sort) ? sort : DEFAULT_SORT,
  };
}

/** Query string without the leading "?". Values equal to the defaults are left out, so the default state is "". */
export function catalogQueryToString(query: CatalogQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.tag) params.set('tag', query.tag);
  if (query.sort !== DEFAULT_SORT) params.set('sort', query.sort);
  return params.toString();
}

/** Search runs over title, artist, author and tags. `needle` must already be folded. */
function matchesSearch(item: Karaoke, needle: string): boolean {
  if (needle === '') return true;
  return [item.title, item.artist, item.authorName, ...tagsOf(item)].some((field) => fold(field).includes(needle));
}

/** Applies the search and the tag filter, then sorts. `items` itself is not changed. */
export function filterAndSort(items: Karaoke[], query: CatalogQuery): Karaoke[] {
  const needle = fold(query.q.trim());
  // filter() returns a new array, so the in-place sort below never touches `items`.
  return items
    .filter((item) => (!query.tag || tagsOf(item).includes(query.tag)) && matchesSearch(item, needle))
    .sort(COMPARATORS[query.sort]);
}

/** Distinct tags, most used first; tags used equally often go alphabetically (Russian collation). */
export function collectTags(items: Karaoke[]): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of tagsOf(item)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .sort(([tagA, countA], [tagB, countB]) => countB - countA || tagA.localeCompare(tagB, 'ru'))
    .map(([tag]) => tag);
}

/** The top-scored recommended (featured) track; when none is featured, the top-scored track overall. */
export function pickShowcase(items: Karaoke[]): Karaoke | undefined {
  const featured = items.filter((item) => item.isFeatured);
  // Stable sort: among equal scores the track that comes first in `items` wins.
  return [...(featured.length > 0 ? featured : items)].sort(COMPARATORS.rec)[0];
}
