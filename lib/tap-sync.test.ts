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
