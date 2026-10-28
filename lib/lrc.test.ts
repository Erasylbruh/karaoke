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
