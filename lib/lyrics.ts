import type { LyricLine } from './types';

// A line's fill completes at 90% of its length, leaving a short beat before the next line.
const FILL_SHARE = 0.9;
const MIN_DURATION = 10;
const TAIL_SECONDS = 4;

/** Index of the line being sung at `time`, or -1 if the first line has not started yet. Expects lines sorted by time. */
export function activeLineIndex(lines: LyricLine[], time: number): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].time <= time) return i;
  }
  return -1;
}

/** How much of line `index` is filled at `time`, from 0 to 1. A line ends where the next one starts; the last one ends at `duration`. */
export function lineProgress(lines: LyricLine[], index: number, time: number, duration: number): number {
  if (index < 0 || index >= lines.length) return 0;
  const start = lines[index].time;
  const end = index + 1 < lines.length ? lines[index + 1].time : duration;
  if (end <= start) return 1;
  const fill = (time - start) / ((end - start) * FILL_SHARE);
  return Math.min(1, Math.max(0, fill));
}

/** Track length: the last line's time plus a short tail, but never under 10 seconds. */
export function trackDuration(lines: LyricLine[]): number {
  if (lines.length === 0) return MIN_DURATION;
  return Math.max(MIN_DURATION, lines[lines.length - 1].time + TAIL_SECONDS);
}
