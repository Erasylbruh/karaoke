'use client';

/**
 * Karaoke video rendering, independent of any page, so it can run in the background while the
 * user moves around the site (see context/DownloadsContext.tsx).
 *
 * Fast path: frames are drawn and encoded with WebCodecs as fast as the hardware encoder allows
 * (much faster than real time) and muxed into MP4 (H.264 + AAC) or WebM by mediabunny.
 * Fallback (no WebCodecs, or a project without an audio file): the old real-time MediaRecorder
 * capture, which takes as long as the song.
 */

import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from 'mediabunny';
import fixWebmDuration from 'fix-webm-duration';
import { Karaoke } from '@/lib/types';
import { fontCss } from '@/lib/fonts';
import { resolveBlobUrl } from '@/lib/blob-store';
import { synthPlayer } from '@/lib/audio-synthesizer';

export type ExportFormat = 'reel' | 'landscape';

export const FPS = 30;
/** Space between lyric lines, as a share of the font size. */
const LINE_GAP_EM = 0.05;

export function frameSize(format: ExportFormat) {
  return format === 'reel' ? { width: 720, height: 1280 } : { width: 1280, height: 720 };
}

/** Splits a lyric line into rows that fit `maxW` (uses the context's current font). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const rows: string[] = [];
  let row = '';
  for (const w of words) {
    const next = row ? row + ' ' + w : w;
    if (row && ctx.measureText(next).width > maxW) {
      rows.push(row);
      row = w;
    } else row = next;
  }
  if (row) rows.push(row);
  return rows.length ? rows : [''];
}

/** Shortens text with an ellipsis so it fits on one row. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

/**
 * Draws one frame at `t` seconds: background, left-aligned title + artist with the watermark
 * under them, the lyrics with the player's left-to-right fill, and a progress bar.
 */
export function drawKaraokeFrame(
  ctx: CanvasRenderingContext2D,
  karaoke: Karaoke,
  format: ExportFormat,
  t: number,
  totalSec = karaoke.duration || 40
) {
  const { width, height } = frameSize(format);
  const reel = format === 'reel';
  const unit = Math.min(width, height) / 100;
  const ac = karaoke.style?.activeColor || '#ffb547';
  const tx = karaoke.style?.textColor || '#f4f4f5';
  const font = fontCss(karaoke.style?.font || 'Onest');
  const padX = reel ? width * 0.09 : width * 0.1;
  const maxW = width - padX * 2;

  ctx.clearRect(0, 0, width, height);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;

  ctx.fillStyle = karaoke.style?.backgroundColor || '#1d1b3a';
  ctx.fillRect(0, 0, width, height);
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, 'rgba(0,0,0,0.2)');
  grad.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Header: title, artist and the watermark right under them.
  const headTop = reel ? unit * 16 : unit * 12;
  ctx.fillStyle = '#f4f4f5';
  ctx.font = `700 ${reel ? 36 : 28}px "Unbounded", "Onest", sans-serif`;
  ctx.fillText(fitText(ctx, karaoke.title, maxW), padX, headTop);
  ctx.fillStyle = '#a1a1aa';
  ctx.font = `500 ${reel ? 22 : 18}px "Onest", sans-serif`;
  ctx.fillText(fitText(ctx, karaoke.artist, maxW), padX, headTop + (reel ? 40 : 32));

  const wmBaseY = headTop + (reel ? 84 : 66);
  const barW = unit * 0.9;
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = ac;
  [unit * 2.4, unit * 3.8, unit * 3].forEach((h, i) => {
    ctx.beginPath();
    ctx.roundRect(padX + i * barW * 1.6, wmBaseY - h, barW, h, barW / 2);
    ctx.fill();
  });
  ctx.fillStyle = '#f4f4f5';
  ctx.font = `600 ${unit * 2.4}px "Onest", sans-serif`;
  ctx.fillText('KaraokeCraft', padX + barW * 5, wmBaseY - unit * 0.2);
  ctx.restore();

  // Lyrics: left-aligned, one size, wrapped; the current line fills in the accent colour.
  const lyrics = karaoke.lyrics;
  const fontSize = reel ? 46 : 40;
  const rowH = fontSize * 1.15;
  const gap = fontSize * LINE_GAP_EM;
  ctx.font = `700 ${fontSize}px ${font}`;
  const blocks = lyrics.map((l) => {
    const rows = wrapText(ctx, l.text, maxW);
    return { rows, widths: rows.map((r) => ctx.measureText(r).width) };
  });
  const tops: number[] = [];
  let acc = 0;
  blocks.forEach((b) => {
    tops.push(acc);
    acc += b.rows.length * rowH + gap;
  });

  const activeIdx = lyrics.reduce((a, line, idx) => (t >= line.time ? idx : a), -1);
  // Smooth scroll: glide from the previous line to the active one over 0.35 s.
  let offset = (tops[0] ?? 0) - rowH - gap;
  if (activeIdx >= 0) {
    const from = activeIdx > 0 ? tops[activeIdx - 1] : tops[0] - rowH - gap;
    const k = Math.min(1, (t - lyrics[activeIdx].time) / 0.35);
    offset = from + (tops[activeIdx] - from) * (1 - Math.pow(1 - k, 3));
  }

  const textY = karaoke.style?.textY;
  const anchorY = typeof textY === 'number' ? (height * textY) / 100 : reel ? height * 0.48 : height * 0.52;
  const minY = wmBaseY + unit * 6;
  const maxY = height - (reel ? unit * 26 : unit * 14);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, minY - fontSize, width, maxY - minY + fontSize);
  ctx.clip();
  blocks.forEach((b, idx) => {
    const top = anchorY + tops[idx] - offset;
    if (top + b.rows.length * rowH < minY - fontSize || top > maxY + fontSize) return;
    let p = 0;
    let alpha = 0.3;
    if (idx < activeIdx) {
      p = 1;
      alpha = 0.6; // sung lines: accent colour, a bit transparent
    } else if (idx === activeIdx) {
      const line = lyrics[idx];
      const end = line.end ?? lyrics[idx + 1]?.time ?? totalSec;
      p = Math.min(1, Math.max(0, (t - line.time) / Math.max(0.1, end - line.time)));
      alpha = 1;
    }
    // Fade lines out near the top and bottom edges, like the player's mask.
    const mid = top + rowH / 2;
    const edge = Math.min(mid - minY, maxY - mid) / (rowH * 1.5);
    ctx.globalAlpha = alpha * Math.max(0, Math.min(1, edge + 0.35));

    const total = b.widths.reduce((s, w) => s + w, 0) || 1;
    let filled = p * total;
    b.rows.forEach((row, r) => {
      const y = top + r * rowH + fontSize * 0.9;
      const w = b.widths[r];
      const fillW = Math.max(0, Math.min(w, filled));
      filled -= w;
      if (fillW < w) {
        ctx.fillStyle = tx;
        ctx.fillText(row, padX, y);
      }
      if (fillW > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(padX - 4, y - fontSize * 1.2, fillW + 4, fontSize * 1.6);
        ctx.clip();
        ctx.fillStyle = ac;
        ctx.fillText(row, padX, y);
        ctx.restore();
      }
    });
  });
  ctx.restore();
  ctx.globalAlpha = 1;

  const barY = height - (reel ? unit * 18 : unit * 8);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.beginPath();
  ctx.roundRect(padX, barY, maxW, 4, 2);
  ctx.fill();
  ctx.fillStyle = ac;
  ctx.beginPath();
  ctx.roundRect(padX, barY, maxW * Math.min(1, t / totalSec), 4, 2);
  ctx.fill();
}

export interface RenderOptions {
  onProgress?: (share: number) => void;
  signal?: AbortSignal;
}

export interface RenderResult {
  blob: Blob;
  ext: 'mp4' | 'webm';
  /** 'fast' = WebCodecs, 'realtime' = MediaRecorder capture. */
  mode: 'fast' | 'realtime';
}

const abortError = () => new DOMException('Загрузка отменена', 'AbortError');

function makeCanvas(format: ExportFormat) {
  const { width, height } = frameSize(format);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен');
  return { canvas, ctx };
}

async function loadFonts(karaoke: Karaoke) {
  await Promise.all(
    [`700 40px ${fontCss(karaoke.style?.font || 'Onest')}`, '700 30px "Unbounded"', '500 20px "Onest"'].map((f) =>
      document.fonts.load(f).catch(() => undefined)
    )
  );
}

export async function renderKaraokeVideo(karaoke: Karaoke, format: ExportFormat, opts: RenderOptions = {}): Promise<RenderResult> {
  await loadFonts(karaoke);
  const audioUrl = await resolveBlobUrl(karaoke.audioUrl);
  if (audioUrl && typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined') {
    try {
      return await renderFast(karaoke, format, audioUrl, opts);
    } catch (e) {
      if (opts.signal?.aborted) throw abortError();
      console.warn('Fast render failed, falling back to real-time capture', e);
    }
  }
  return renderRealtime(karaoke, format, audioUrl, opts);
}

async function renderFast(karaoke: Karaoke, format: ExportFormat, audioUrl: string, { onProgress, signal }: RenderOptions): Promise<RenderResult> {
  const { width, height } = frameSize(format);
  const res = await fetch(audioUrl, { signal });
  const actx = new AudioContext();
  let audio: AudioBuffer;
  try {
    audio = await actx.decodeAudioData(await res.arrayBuffer());
  } finally {
    void actx.close().catch(() => undefined);
  }

  // H.264 + AAC in MP4 plays everywhere; VP9/VP8 + Opus in WebM where H.264 encoding is missing.
  const videoCodec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'vp8'], { width, height });
  const audioCodec = await getFirstEncodableAudioCodec(videoCodec === 'avc' ? ['aac', 'opus'] : ['opus'], {
    numberOfChannels: audio.numberOfChannels,
    sampleRate: audio.sampleRate,
  });
  if (!videoCodec || !audioCodec) throw new Error('no encodable codecs');
  const mp4 = videoCodec === 'avc';

  const { canvas, ctx } = makeCanvas(format);
  const output = new Output({
    format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const video = new CanvasSource(canvas, { codec: videoCodec, bitrate: 5_000_000, keyFrameInterval: 2 });
  const sound = new AudioBufferSource({ codec: audioCodec, bitrate: 160_000 });
  output.addVideoTrack(video, { frameRate: FPS });
  output.addAudioTrack(sound);
  await output.start();

  try {
    const duration = audio.duration;
    await sound.add(audio);
    const frames = Math.ceil(duration * FPS);
    let lastReport = 0;
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw abortError();
      const t = i / FPS;
      drawKaraokeFrame(ctx, karaoke, format, t, duration);
      await video.add(t, 1 / FPS);
      if (i - lastReport >= FPS / 2) {
        lastReport = i;
        onProgress?.(i / frames);
      }
    }
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => undefined);
    throw e;
  }
  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error('empty output');
  onProgress?.(1);
  return { blob: new Blob([buffer], { type: mp4 ? 'video/mp4' : 'video/webm' }), ext: mp4 ? 'mp4' : 'webm', mode: 'fast' };
}

/**
 * Real-time capture: plays the track silently through Web Audio and records the canvas with
 * MediaRecorder. A Worker drives the frames, so a background tab keeps 30 fps.
 */
async function renderRealtime(karaoke: Karaoke, format: ExportFormat, audioUrl: string | null, { onProgress, signal }: RenderOptions): Promise<RenderResult> {
  const { canvas, ctx } = makeCanvas(format);
  const canvasStream = canvas.captureStream(FPS);

  let audioTracks: MediaStreamTrack[] = [];
  let trackAudio: HTMLAudioElement | null = null;
  let actx: AudioContext | null = null;
  if (audioUrl) {
    trackAudio = new Audio();
    trackAudio.crossOrigin = 'anonymous';
    trackAudio.preload = 'auto';
    trackAudio.src = audioUrl;
    await new Promise<void>((resolve, reject) => {
      trackAudio!.oncanplaythrough = () => resolve();
      trackAudio!.onerror = () => reject(new Error('Не удалось загрузить аудио трека'));
      trackAudio!.load();
    });
    actx = new AudioContext();
    const dest = actx.createMediaStreamDestination();
    actx.createMediaElementSource(trackAudio).connect(dest);
    audioTracks = dest.stream.getAudioTracks();
  } else {
    const synthDest = synthPlayer?.getMediaStreamDestination();
    audioTracks = synthDest ? synthDest.stream.getAudioTracks() : [];
  }

  const mimeType =
    ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'].find((t) =>
      MediaRecorder.isTypeSupported(t)
    ) || 'video/webm';
  const recorder = new MediaRecorder(new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]), {
    mimeType,
    videoBitsPerSecond: 5_000_000,
    audioBitsPerSecond: 160_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);

  const duration =
    trackAudio && Number.isFinite(trackAudio.duration) && trackAudio.duration > 0 ? trackAudio.duration : karaoke.duration || 40;

  const stopSound = () => {
    synthPlayer?.stop();
    trackAudio?.pause();
    void actx?.close().catch(() => undefined);
  };

  return new Promise<RenderResult>((resolve, reject) => {
    const src = `let t=setInterval(()=>postMessage(0),${Math.round(1000 / FPS)});`;
    const workerUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const worker = new Worker(workerUrl);
    const startTime = performance.now();
    let recordedMs = 0;
    let aborted = false;
    const cleanup = () => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      stopSound();
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      aborted = true;
      if (recorder.state === 'recording') recorder.stop();
      else {
        cleanup();
        reject(abortError());
      }
    };
    signal?.addEventListener('abort', onAbort);

    recorder.onstop = async () => {
      cleanup();
      if (aborted) return reject(abortError());
      let blob = new Blob(chunks, { type: mimeType });
      if (mimeType.startsWith('video/webm')) blob = await fixWebmDuration(blob, recordedMs, { logger: false });
      onProgress?.(1);
      resolve({ blob, ext: mimeType.startsWith('video/mp4') ? 'mp4' : 'webm', mode: 'realtime' });
    };

    drawKaraokeFrame(ctx, karaoke, format, 0, duration);
    recorder.start(1000);
    if (trackAudio) void trackAudio.play().catch(() => onAbort());
    else synthPlayer?.playPreset(karaoke.audioPreset || 'synthwave', 0);

    let lastReport = 0;
    worker.onmessage = () => {
      const now = performance.now();
      const t = trackAudio ? trackAudio.currentTime : (now - startTime) / 1000;
      drawKaraokeFrame(ctx, karaoke, format, t, duration);
      if (now - lastReport > 500) {
        lastReport = now;
        onProgress?.(Math.min(0.99, t / duration));
      }
      if ((t >= duration || trackAudio?.ended) && recorder.state === 'recording') {
        recordedMs = now - startTime;
        worker.onmessage = null;
        recorder.stop();
      }
    };
  });
}

/** File name like "propose_vertical.mp4". */
export function videoFileName(karaoke: Pick<Karaoke, 'title'>, format: ExportFormat, ext: string) {
  const base = karaoke.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'karaoke';
  return `${base}_${format === 'reel' ? 'vertical' : 'horizontal'}.${ext}`;
}
