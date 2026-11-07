'use client';

/**
 * Shrinks big or lossless audio in the browser before upload.
 *
 * WAV takes ~10 MB per minute, so songs over 4 minutes did not fit the 40 MB storage limit.
 * Lossless files (WAV, FLAC, AIFF) and anything over 15 MB are re-encoded to AAC 192 kbit/s
 * in M4A (Opus in WebM where the browser can't encode AAC): ~1.4 MB per minute, and the
 * difference is hard to hear on a karaoke track. Everything else is uploaded as it is.
 */

import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
} from 'mediabunny';

const BIG_FILE = 15 * 1024 * 1024;
const LOSSLESS = /\.(wav|wave|flac|aif|aiff)$/i;

export function needsCompression(file: File): boolean {
  return file.size > BIG_FILE || LOSSLESS.test(file.name) || /wav|flac|aiff/i.test(file.type);
}

/** Re-encodes `file`; `onProgress` gets 0..1. Throws when the browser can't do it. */
export async function compressAudio(file: File, onProgress?: (share: number) => void): Promise<File> {
  const codec = await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: 2, sampleRate: 48000 });
  if (!codec) throw new Error('В этом браузере нельзя сжать аудио');
  const mp4 = codec === 'aac';
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const output = new Output({
    format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const conversion = await Conversion.init({
    input,
    output,
    video: { discard: true },
    audio: { codec, bitrate: 192_000, forceTranscode: true },
  });
  if (!conversion.isValid) throw new Error('Не удалось прочитать аудиофайл');
  conversion.onProgress = (p) => onProgress?.(p);
  await conversion.execute();
  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error('Пустой результат сжатия');
  const name = file.name.replace(/\.[^.]+$/, '') + (mp4 ? '.m4a' : '.webm');
  return new File([buffer], name, { type: mp4 ? 'audio/mp4' : 'audio/webm' });
}
