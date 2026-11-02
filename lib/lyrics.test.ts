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
  assert.equal(lineProgress(lines, 2, 11.7, 12), 1);
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
