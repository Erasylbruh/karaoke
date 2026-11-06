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
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from 'mediabunny';
import fixWebmDuration from 'fix-webm-duration';
import { Karaoke } from '@/lib/types';
import { fontCss } from '@/lib/fonts';
import { resolveBlobUrl } from '@/lib/blob-store';
import { getAuthor } from '@/lib/storage';
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

/** Images and texts a frame needs that must be loaded before rendering. */
export interface FrameAssets {
  cover: HTMLImageElement | null;
  author: string;
}

/** Loads the cover image and the author name once per render. */
export async function prepareFrameAssets(karaoke: Karaoke): Promise<FrameAssets> {
  let cover: HTMLImageElement | null = null;
  const src = await resolveBlobUrl(karaoke.style?.coverImage);
  if (src) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    try {
      await img.decode();
      cover = img;
    } catch {
      cover = null;
    }
  }
  return { cover, author: getAuthor(karaoke).name };
}

/** Same colour with an alpha, for any #rgb/#rrggbb (other formats are returned as is). */
function withAlpha(color: string, alpha: number): string {
  const m = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return color;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * The KaraokeCraft mark (three equaliser bars + wordmark), drawable anywhere in any size.
 * `x, y` is the top-left corner, `h` the height of the tallest bar. Returns the width drawn.
 */
export function drawBrandMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  { accent = '#ffb547', color = '#f4f4f5', alpha = 0.75 }: { accent?: string; color?: string; alpha?: number } = {}
): number {
  const barW = h * 0.24;
  const step = barW + h * 0.16;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = accent;
  [0.6, 1, 0.8].forEach((k, i) => {
    ctx.beginPath();
    ctx.roundRect(x + i * step, y + h * (1 - k), barW, h * k, barW / 2);
    ctx.fill();
  });
  const textX = x + step * 3 + h * 0.15;
  ctx.fillStyle = color;
  ctx.font = `600 ${h * 0.78}px "Onest", sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText('KaraokeCraft', textX, y + h * 0.9);
  const w = textX + ctx.measureText('KaraokeCraft').width - x;
  ctx.restore();
  return w;
}

/** Draws `img` covering the w×h box (like CSS object-fit: cover). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

/** Rounded square cover (or the accent colour with a note when there is no cover). */
function drawThumb(ctx: CanvasRenderingContext2D, assets: FrameAssets, x: number, y: number, size: number, ac: string) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, size * 0.16);
  ctx.clip();
  if (assets.cover) drawCover(ctx, assets.cover, x, y, size, size);
  else {
    ctx.fillStyle = ac;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.font = `700 ${size * 0.45}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('♪', x + size / 2, y + size * 0.65);
  }
  ctx.restore();
}

/** Vinyl record with the cover as its label; it turns while the song plays. */
function drawVinyl(ctx: CanvasRenderingContext2D, assets: FrameAssets, cx: number, cy: number, r: number, t: number, ac: string, bg: string) {
  const angle = t * Math.PI * 2 * 0.3; // 0.3 turns per second
  ctx.save();
  // Disc and grooves.
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#121214';
  ctx.fill();
  ctx.lineWidth = 1;
  for (let rr = r * 0.44; rr < r * 0.97; rr += r * 0.022) {
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.035 + 0.025 * Math.sin(rr * 0.7)})`;
    ctx.stroke();
  }
  // Label (the cover) turns with the disc.
  const lr = r * 0.4;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.arc(0, 0, lr, 0, Math.PI * 2);
  ctx.clip();
  if (assets.cover) drawCover(ctx, assets.cover, -lr, -lr, lr * 2, lr * 2);
  else {
    ctx.fillStyle = ac;
    ctx.fillRect(-lr, -lr, lr * 2, lr * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-lr, -lr * 0.08, lr * 2, lr * 0.16); // a stripe, so the turning is visible
  }
  ctx.restore();
  // Static light reflection on top, so the disc looks glossy while the label turns.
  if (typeof ctx.createConicGradient === 'function') {
    const sheen = ctx.createConicGradient(-Math.PI / 4, cx, cy);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.07, 'rgba(255,255,255,0.09)');
    sheen.addColorStop(0.14, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.57, 'rgba(255,255,255,0.07)');
    sheen.addColorStop(0.64, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = sheen;
    ctx.fill();
  }
  // Spindle hole.
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.035, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.restore();
}

/**
 * Lyrics like the player: left-aligned, one size; sung lines in the fill colour (a bit
 * transparent), the current line filling left to right, upcoming lines dimmed.
 */
function drawLyrics(
  ctx: CanvasRenderingContext2D,
  karaoke: Karaoke,
  t: number,
  totalSec: number,
  box: { x: number; top: number; bottom: number; width: number; anchor: number; fontSize: number }
) {
  const ac = karaoke.style?.activeColor || '#ffb547';
  const tx = karaoke.style?.textColor || '#f4f4f5';
  const font = fontCss(karaoke.style?.font || 'Onest');
  const { x, top: minY, bottom: maxY, width: maxW, anchor: anchorY, fontSize } = box;
  const lyrics = karaoke.lyrics;
  const rowH = fontSize * 1.15;
  const gap = fontSize * LINE_GAP_EM;
  ctx.font = `700 ${fontSize}px ${font}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
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

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, minY, ctx.canvas.width, maxY - minY);
  ctx.clip();
  const fade = (maxY - minY) * 0.12; // like the player's top/bottom mask
  blocks.forEach((b, idx) => {
    const top = anchorY + tops[idx] - offset;
    if (top + b.rows.length * rowH < minY || top > maxY) return;
    let p = 0;
    let alpha = 0.3;
    if (idx < activeIdx) {
      p = 1;
      alpha = 0.6; // sung lines: fill colour, a bit transparent
    } else if (idx === activeIdx) {
      const line = lyrics[idx];
      const end = line.end ?? lyrics[idx + 1]?.time ?? totalSec;
      p = Math.min(1, Math.max(0, (t - line.time) / Math.max(0.1, end - line.time)));
      alpha = 1;
    }
    const total = b.widths.reduce((s, w) => s + w, 0) || 1;
    let filled = p * total;
    b.rows.forEach((row, r) => {
      const rowTop = top + r * rowH;
      const y = rowTop + fontSize * 0.9;
      const mid = rowTop + rowH / 2;
      const edge = Math.min(1, Math.max(0, Math.min(mid - minY, maxY - mid) / fade));
      ctx.globalAlpha = alpha * edge;
      const w = b.widths[r];
      const fillW = Math.max(0, Math.min(w, filled));
      filled -= w;
      if (fillW < w) {
        ctx.fillStyle = tx;
        ctx.fillText(row, x, y);
      }
      if (fillW > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - 4, y - fontSize * 1.2, fillW + 4, fontSize * 1.6);
        ctx.clip();
        ctx.fillStyle = ac;
        ctx.fillText(row, x, y);
        ctx.restore();
      }
    });
  });
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Thin progress line: unfilled part in the text colour, filled part in the fill colour. */
function drawProgress(ctx: CanvasRenderingContext2D, karaoke: Karaoke, x: number, y: number, w: number, share: number) {
  const ac = karaoke.style?.activeColor || '#ffb547';
  const tx = karaoke.style?.textColor || '#f4f4f5';
  ctx.fillStyle = withAlpha(tx, 0.25);
  ctx.beginPath();
  ctx.roundRect(x, y, w, 5, 2.5);
  ctx.fill();
  ctx.fillStyle = ac;
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(5, w * Math.min(1, share)), 5, 2.5);
  ctx.fill();
}

/** Title, artist, author and the watermark stacked from (x, y); returns the y below them. */
function drawInfo(ctx: CanvasRenderingContext2D, karaoke: Karaoke, assets: FrameAssets, x: number, y: number, maxW: number, scale: number) {
  const ac = karaoke.style?.activeColor || '#ffb547';
  const tx = karaoke.style?.textColor || '#f4f4f5';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = tx;
  ctx.font = `700 ${30 * scale}px "Unbounded", "Onest", sans-serif`;
  const titleRows = wrapText(ctx, karaoke.title, maxW).slice(0, 2);
  if (wrapText(ctx, karaoke.title, maxW).length > 2) titleRows[1] = fitText(ctx, titleRows[1] + '…', maxW);
  let cy = y;
  titleRows.forEach((row) => {
    cy += 36 * scale;
    ctx.fillText(row, x, cy);
  });
  ctx.fillStyle = withAlpha(tx, 0.8);
  ctx.font = `500 ${21 * scale}px "Onest", sans-serif`;
  cy += 32 * scale;
  ctx.fillText(fitText(ctx, karaoke.artist, maxW), x, cy);
  ctx.font = `500 ${17 * scale}px "Onest", sans-serif`;
  cy += 28 * scale;
  ctx.fillStyle = withAlpha(tx, 0.6);
  const label = 'Автор: ';
  ctx.fillText(label, x, cy);
  const lw = ctx.measureText(label).width;
  ctx.fillStyle = tx;
  ctx.font = `700 ${17 * scale}px "Onest", sans-serif`;
  ctx.fillText(fitText(ctx, assets.author, maxW - lw), x + lw, cy);
  cy += 18 * scale;
  drawBrandMark(ctx, x, cy, 20 * scale, { accent: ac, color: tx, alpha: 0.7 });
  return cy + 20 * scale;
}

/**
 * Draws one frame at `t` seconds, laid out like the player in the browser.
 * 9:16 — small cover with title, artist, author and the watermark on top, lyrics below,
 *        a progress line at the very bottom.
 * 16:9 — a turning vinyl record with the cover on the left, the same info under it,
 *        lyrics on the right, a progress line at the very bottom.
 */
export function drawKaraokeFrame(
  ctx: CanvasRenderingContext2D,
  karaoke: Karaoke,
  format: ExportFormat,
  t: number,
  totalSec = karaoke.duration || 40,
  assets: FrameAssets = { cover: null, author: karaoke.authorName }
) {
  const { width, height } = frameSize(format);
  const ac = karaoke.style?.activeColor || '#ffb547';
  const bg = karaoke.style?.backgroundColor || '#1d1b3a';
  ctx.globalAlpha = 1;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  const share = t / totalSec;

  if (format === 'reel') {
    const pad = 48;
    const thumb = 128;
    const headTop = 64;
    drawThumb(ctx, assets, pad, headTop, thumb, ac);
    const infoX = pad + thumb + 24;
    const infoBottom = drawInfo(ctx, karaoke, assets, infoX, headTop - 8, width - infoX - pad, 0.9);
    const lyricsTop = Math.max(headTop + thumb, infoBottom) + 64;
    const barY = height - 72;
    const lyricsBottom = barY - 40;
    const textY = karaoke.style?.textY;
    const anchor =
      typeof textY === 'number'
        ? Math.min(lyricsBottom - 120, Math.max(lyricsTop + 40, (height * textY) / 100 - 60))
        : lyricsTop + (lyricsBottom - lyricsTop) * 0.3;
    drawLyrics(ctx, karaoke, t, totalSec, { x: pad, top: lyricsTop, bottom: lyricsBottom, width: width - pad * 2, anchor, fontSize: 52 });
    drawProgress(ctx, karaoke, pad, barY, width - pad * 2, share);
    return;
  }

  // 16:9
  const pad = 64;
  const disc = 300;
  const colW = 340;
  const discTop = 56;
  drawVinyl(ctx, assets, pad + disc / 2, discTop + disc / 2, disc / 2, t, ac, bg);
  drawInfo(ctx, karaoke, assets, pad, discTop + disc + 14, colW, 0.85);
  const lyricsX = pad + colW + 72;
  const barY = height - 44;
  const lyricsTop = 40;
  const lyricsBottom = barY - 28;
  drawLyrics(ctx, karaoke, t, totalSec, {
    x: lyricsX,
    top: lyricsTop,
    bottom: lyricsBottom,
    width: width - lyricsX - pad,
    anchor: lyricsTop + (lyricsBottom - lyricsTop) * 0.32,
    fontSize: 46,
  });
  drawProgress(ctx, karaoke, pad, barY, width - pad * 2, share);
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
  const assets = await prepareFrameAssets(karaoke);
  const audioUrl = await resolveBlobUrl(karaoke.audioUrl);
  if (audioUrl && typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined') {
    try {
      return await renderFast(karaoke, format, audioUrl, assets, opts);
    } catch (e) {
      if (opts.signal?.aborted) throw abortError();
      console.warn('Fast render failed, falling back to real-time capture', e);
    }
  }
  return renderRealtime(karaoke, format, audioUrl, assets, opts);
}

async function renderFast(karaoke: Karaoke, format: ExportFormat, audioUrl: string, assets: FrameAssets, { onProgress, signal }: RenderOptions): Promise<RenderResult> {
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
      drawKaraokeFrame(ctx, karaoke, format, t, duration, assets);
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
async function renderRealtime(karaoke: Karaoke, format: ExportFormat, audioUrl: string | null, assets: FrameAssets, { onProgress, signal }: RenderOptions): Promise<RenderResult> {
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

    drawKaraokeFrame(ctx, karaoke, format, 0, duration, assets);
    recorder.start(1000);
    if (trackAudio) void trackAudio.play().catch(() => onAbort());
    else synthPlayer?.playPreset(karaoke.audioPreset || 'synthwave', 0);

    let lastReport = 0;
    worker.onmessage = () => {
      const now = performance.now();
      const t = trackAudio ? trackAudio.currentTime : (now - startTime) / 1000;
      drawKaraokeFrame(ctx, karaoke, format, t, duration, assets);
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
