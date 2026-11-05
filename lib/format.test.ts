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
