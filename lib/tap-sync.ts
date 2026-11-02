import type { LyricLine } from './types';

/** Tap-to-sync state: the lyric lines and the time (seconds) of each tap so far. Never mutated. */
export interface TapSession {
  readonly texts: string[];
  readonly marks: number[];
}

/** Splits pasted lyrics into trimmed, non-empty lines. */
export function textToLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

export function createTapSession(texts: string[]): TapSession {
  return { texts: [...texts], marks: [] };
}

/** True once every line has a mark. */
export function isComplete(session: TapSession): boolean {
  return session.marks.length >= session.texts.length;
}

/** Index of the line the next tap will mark. */
export function nextLineIndex(session: TapSession): number {
  return session.marks.length;
}

/**
 * Marks the next line at `time`.
 * Returns the same session when it is already complete or `time` is earlier than the last mark.
 */
export function tap(session: TapSession, time: number): TapSession {
  const { marks } = session;
  if (isComplete(session) || (marks.length > 0 && time < marks[marks.length - 1])) return session;
  return { texts: session.texts, marks: [...marks, time] };
}

/** Removes the last mark; a session without marks is returned as is. */
export function undoTap(session: TapSession): TapSession {
  if (session.marks.length === 0) return session;
  return { texts: session.texts, marks: session.marks.slice(0, -1) };
}

/** The marked lines only, with times rounded to hundredths of a second. */
export function toLyricLines(session: TapSession): LyricLine[] {
  return session.marks.map((time, i) => ({
    id: `t-${i}`,
    time: Math.round(time * 100) / 100,
    text: session.texts[i],
  }));
}
