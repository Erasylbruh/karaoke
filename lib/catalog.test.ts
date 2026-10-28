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
