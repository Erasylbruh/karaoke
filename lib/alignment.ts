/**
 * Automatic line timing through the Rust "aligner" service (see aligner/README.md).
 *
 * The service runs Whisper on the author's computer and matches the recognised words to the
 * lyrics the author typed, so it returns the start and end of every line.
 *
 * Where it is: NEXT_PUBLIC_ALIGNER_URL if set; otherwise the public tunnel address the running
 * aligner publishes to Firestore (config/aligner), so phones and other computers can use it;
 * otherwise http://localhost:8787 (the same computer).
 */
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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

const FIXED_URL = (process.env.NEXT_PUBLIC_ALIGNER_URL || '').replace(/\/$/, '');
const LOCAL_URL = 'http://localhost:8787';
/** The aligner refreshes its address every minute; older than this means it is switched off. */
const STALE_MS = 3 * 60 * 1000;

let cached: { url: string; at: number } | null = null;

/** Current address of the aligner (see the comment at the top of the file). */
export async function getAlignerUrl(): Promise<string> {
  if (FIXED_URL) return FIXED_URL;
  if (cached && Date.now() - cached.at < 20_000) return cached.url;
  let url = LOCAL_URL;
  try {
    const snap = await getDoc(doc(db, 'config', 'aligner'));
    const d = snap.data() as { url?: string; updatedAt?: number } | undefined;
    if (d?.url && d.updatedAt && Date.now() - Number(d.updatedAt) < STALE_MS) url = d.url.replace(/\/$/, '');
  } catch {
    // offline or no access: try this computer
  }
  cached = { url, at: Date.now() };
  return url;
}

const isLoopback = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(url);

/**
 * Chrome (142+) asks the user before a site from the internet may call localhost
 * ("Local network access"). Returns that permission's state, or 'unknown' where the browser
 * has no such permission (then the request simply goes through).
 */
export async function localAccessState(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  if (typeof window === 'undefined' || !isLoopback(await getAlignerUrl())) return 'granted';
  if (['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) return 'granted';
  for (const name of ['local-network-access', 'loopback-network']) {
    try {
      return (await navigator.permissions.query({ name } as unknown as PermissionDescriptor)).state;
    } catch {
      // permission name not supported by this browser
    }
  }
  return 'unknown';
}

export const LOCAL_ACCESS_HINT =
  'Браузер запретил сайту доступ к сервису на компьютере. Нажмите значок слева от адреса сайта → «Настройки сайта» → «Доступ к локальной сети» → «Разрешить», затем обновите страницу.';

/**
 * True when the aligner answers. `timeoutMs` must be long when the call may show Chrome's
 * "local network access" prompt, otherwise the request is cancelled while the prompt is open.
 */
export async function isAlignerOnline(timeoutMs = 2000): Promise<boolean> {
  try {
    const res = await fetch(`${await getAlignerUrl()}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Language from the script of the lyrics; anything unclear is left to Whisper's detection. */
export function guessLanguage(text: string): string {
  if (/[぀-ヿ]/.test(text)) return 'ja'; // hiragana / katakana
  if (/[가-힯]/.test(text)) return 'ko'; // hangul
  if (/[一-鿿]/.test(text)) return 'zh'; // han only
  if (/[әғқңөұүһі]/i.test(text)) return 'kk';
  if (/[а-яё]/i.test(text)) return 'ru';
  return 'auto';
}

const ALIGN_RATE = 16_000;

/**
 * Decodes the song in the browser (which reads almost any format: mp3, ogg/opus, m4a, wav,
 * flac…) and returns 16 kHz mono WAV — exactly what Whisper uses. The aligner then never meets
 * a codec it can't read, and the upload is 5-10x smaller than the original file.
 */
export async function toAlignerWav(audio: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await audio.arrayBuffer());
  } finally {
    void ctx.close().catch(() => undefined);
  }
  const frames = Math.ceil(decoded.duration * ALIGN_RATE);
  const off = new OfflineAudioContext(1, frames, ALIGN_RATE); // the browser resamples and mixes to mono
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const pcm = (await off.startRendering()).getChannelData(0);

  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, ALIGN_RATE, true);
  v.setUint32(28, ALIGN_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  return new Blob([buf], { type: 'audio/wav' });
}

export async function alignLyrics(audio: Blob, fileName: string, lines: string[]): Promise<AlignmentResult> {
  const form = new FormData();
  try {
    form.append('audio', await toAlignerWav(audio), 'audio.wav');
  } catch {
    // The browser could not decode it: let the aligner try the original file.
    form.append('audio', audio, fileName || 'audio.mp3');
  }
  form.append('lyrics', JSON.stringify(lines));
  form.append('language', guessLanguage(lines.join(' ')));
  let res: Response;
  try {
    res = await fetch(`${await getAlignerUrl()}/align`, { method: 'POST', body: form });
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
