/**
 * Automatic line timing through the local Rust "aligner" service (see aligner/README.md).
 *
 * The service runs Whisper on the author's computer and matches the recognised words to the
 * lyrics the author typed, so it returns the start and end of every line.
 * Address: NEXT_PUBLIC_ALIGNER_URL, by default http://localhost:8787 (the author's own PC).
 */
export interface AlignedLine {
  time: number;
  end: number;
  /** Share of the line's words that were actually recognised (0..1). Low = check by hand. */
  confidence: number;
}

export interface AlignmentResult {
  lines: AlignedLine[];
  language: string;
  confidence: number;
  elapsedMs: number;
}

export const ALIGNER_URL = (process.env.NEXT_PUBLIC_ALIGNER_URL || 'http://localhost:8787').replace(/\/$/, '');

/** True when the aligner answers within a couple of seconds. */
export async function isAlignerOnline(): Promise<boolean> {
  try {
    const res = await fetch(`${ALIGNER_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Kazakh letters -> kk, other Cyrillic -> ru, anything else is left to auto-detection. */
export function guessLanguage(text: string): string {
  if (/[әғқңөұүһі]/i.test(text)) return 'kk';
  if (/[а-яё]/i.test(text)) return 'ru';
  return 'auto';
}

export async function alignLyrics(audio: Blob, fileName: string, lines: string[]): Promise<AlignmentResult> {
  const form = new FormData();
  form.append('audio', audio, fileName || 'audio.mp3');
  form.append('lyrics', JSON.stringify(lines));
  form.append('language', guessLanguage(lines.join(' ')));
  let res: Response;
  try {
    res = await fetch(`${ALIGNER_URL}/align`, { method: 'POST', body: form });
  } catch {
    throw new Error('Сервис авто-тайминга не отвечает. Запустите aligner на компьютере.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error ? `Авто-тайминг: ${data.error}` : 'Авто-тайминг не удался');
  return {
    lines: (data.lines as { start: number; end: number; confidence: number }[]).map((l) => ({
      time: l.start,
      end: l.end,
      confidence: l.confidence,
    })),
    language: data.language,
    confidence: data.confidence,
    elapsedMs: data.elapsed_ms,
  };
}
