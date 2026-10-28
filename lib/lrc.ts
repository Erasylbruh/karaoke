import type { LyricLine } from './types';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Reads the [mm:ss.xx] stamps at the start of a line; whatever follows them is the lyric. */
function parseLine(line: string): { times: number[]; text: string } {
  // Sticky, so only stamps standing back to back from the start of the line count.
  // Created per call because a sticky regex keeps its position in lastIndex.
  const stamp = /\[(\d{1,3}):(\d{1,2}(?:\.\d{1,3})?)\]/y;
  const times: number[] = [];
  let end = 0;
  for (let match = stamp.exec(line); match !== null; match = stamp.exec(line)) {
    // Whole milliseconds first, so 1.234 comes out as exactly 1.234.
    times.push((Number(match[1]) * 60_000 + Math.round(Number(match[2]) * 1000)) / 1000);
    end = stamp.lastIndex;
  }
  return { times, text: line.slice(end).trim() };
}

/**
 * Parses LRC text into karaoke lines sorted by time.
 * Metadata tags, lines without a stamp and lines with empty text are skipped;
 * a line with several stamps becomes one karaoke line per stamp.
 */
export function parseLrc(text: string): LyricLine[] {
  const found: { time: number; text: string }[] = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const { times, text: lyric } = parseLine(line);
    if (lyric === '') continue;
    for (const time of times) found.push({ time, text: lyric });
  }
  // Array.prototype.sort is stable: equal times keep their order in the file.
  found.sort((a, b) => a.time - b.time);
  return found.map((entry, i) => ({ id: `l-${i}`, time: entry.time, text: entry.text }));
}

/** 65.5 -> "[01:05.50]". Time is rounded to whole centiseconds first, so 59.999 gives "[01:00.00]". */
export function formatLrcTimestamp(seconds: number): string {
  const centis = Math.round(seconds * 100);
  const minutes = Math.floor(centis / 6000);
  const secs = Math.floor(centis / 100) % 60;
  return `[${pad2(minutes)}:${pad2(secs)}.${pad2(centis % 100)}]`;
}

/** One "[mm:ss.xx] text" line per karaoke line, joined with "\n". */
export function toLrc(lines: LyricLine[]): string {
  return lines.map((line) => `${formatLrcTimestamp(line.time)} ${line.text}`).join('\n');
}
