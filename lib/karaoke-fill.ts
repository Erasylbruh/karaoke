import type { LyricLine } from './types';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Computes 0..1 fill progress for `line` at `t` seconds.
 * Uses piecewise word-level DTW timestamps when `line.words` is present, weighted by word length
 * so the horizontal sweep matches sung words and pauses naturally on mid-line rests.
 */
export function lineFillShare(
  line: LyricLine,
  nextLineTime: number | undefined,
  t: number,
  totalSec: number,
  fillAnimation = true
): number {
  if (!fillAnimation) return t >= line.time ? 1 : 0;
  const end = line.end ?? nextLineTime ?? totalSec;
  if (t <= line.time) return 0;
  if (t >= end) return 1;

  const words = line.words;
  if (words && words.length > 1) {
    const weights = words.map((w, i) => Math.max(1, w.text.length + (i < words.length - 1 ? 0.5 : 0)));
    const totalWeight = weights.reduce((s, w) => s + w, 0) || 1;
    let filled = 0;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (t >= w.end) {
        filled += weights[i];
      } else if (t > w.time) {
        const span = Math.max(0.05, w.end - w.time);
        filled += weights[i] * clamp01((t - w.time) / span);
        break;
      } else {
        break;
      }
    }
    return clamp01(filled / totalWeight);
  }

  return clamp01((t - line.time) / Math.max(0.1, end - line.time));
}

/**
 * Returns a 3-dot vocal cue (`lit`: 1 -> 2 -> 3) during the last 3 seconds before an upcoming line
 * whenever there was at least 4 seconds of instrumental intro or interlude before it.
 */
export function vocalCueDots(
  lyrics: LyricLine[],
  activeIdx: number,
  t: number
): { targetIdx: number; lit: 1 | 2 | 3 } | null {
  const nextIdx = activeIdx + 1;
  if (nextIdx < 0 || nextIdx >= lyrics.length) return null;
  const next = lyrics[nextIdx];
  const prevEnd = activeIdx >= 0 ? (lyrics[activeIdx].end ?? lyrics[activeIdx].time + 2.5) : 0;
  const gap = next.time - prevEnd;
  if (gap < 4) return null;
  const left = next.time - t;
  if (left <= 0 || left > 3) return null;
  const lit = left > 2 ? 1 : left > 1 ? 2 : 3;
  return { targetIdx: nextIdx, lit };
}

/** Picks a smart 30-second clip start (first repeated chorus line, or ~20% into the song). */
export function suggestClipStart(lyrics: LyricLine[], duration: number, clipSec = 30): number {
  const maxStart = Math.max(0, Math.floor(duration - Math.min(duration, clipSec)));
  if (maxStart === 0) return 0;

  const counts = new Map<string, { count: number; secondTime: number; firstTime: number }>();
  for (const l of lyrics) {
    const norm = l.text.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, ' ').trim();
    if (norm.length < 6) continue;
    const prev = counts.get(norm);
    if (!prev) counts.set(norm, { count: 1, firstTime: l.time, secondTime: l.time });
    else counts.set(norm, { count: prev.count + 1, firstTime: prev.firstTime, secondTime: prev.count === 1 ? l.time : prev.secondTime });
  }

  let best: { count: number; start: number } | null = null;
  for (const item of counts.values()) {
    if (item.count >= 2) {
      const candidate = item.firstTime >= 8 ? item.firstTime : item.secondTime;
      if (!best || item.count > best.count) best = { count: item.count, start: candidate };
    }
  }

  const raw = best ? Math.max(0, best.start - 0.5) : Math.min(25, duration * 0.22);
  return Math.min(maxStart, Math.max(0, Math.round(raw)));
}

function parseHexRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

/** WCAG 2.1 contrast ratio (1..21) between two `#rgb`/`#rrggbb` colours, or null if unparseable. */
export function contrastRatio(colorA: string, colorB: string): number | null {
  const a = parseHexRgb(colorA);
  const b = parseHexRgb(colorB);
  if (!a || !b) return null;
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
