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

/** reel = 9:16; landscape = 16:9 «Пластинка+»; landscape-tv = 16:9 «Караоке-ТВ». */
export type ExportFormat = 'reel' | 'landscape' | 'landscape-tv';

/** Silent title card before the audio and closing card after it, in seconds (see docs/video/). */
export const INTRO_SEC = 2.5;
export const OUTRO_SEC = 2.5;

export const FPS = 30;
/** Space between lyric lines, as a share of the font size. */
const LINE_GAP_EM = 0.05;

/** Layout size of a frame; drawing always uses these units, the quality only scales them. */
export function frameSize(format: ExportFormat) {
  return format === 'reel' ? { width: 720, height: 1280 } : { width: 1280, height: 720 };
}

export type VideoQuality = '480p' | '720p' | '1080p';

export const QUALITY_OPTIONS: { id: VideoQuality; label: string; hint: string }[] = [
  { id: '480p', label: '480p', hint: 'лёгкий файл' },
  { id: '720p', label: '720p', hint: 'HD' },
  { id: '1080p', label: '1080p', hint: 'Full HD' },
];

const QUALITY = {
  '480p': { scale: 2 / 3, bitrate: 2_500_000 },
  '720p': { scale: 1, bitrate: 5_000_000 },
  '1080p': { scale: 1.5, bitrate: 10_000_000 },
} as const;

/** Real pixel size of the video file for a format and quality (always even, as encoders need). */
export function outputSize(format: ExportFormat, quality: VideoQuality) {
  const { width, height } = frameSize(format);
  const even = (n: number) => Math.round(n / 2) * 2;
  return { width: even(width * QUALITY[quality].scale), height: even(height * QUALITY[quality].scale) };
}

const QUALITY_KEY = 'kc_video_quality';
export function getPreferredQuality(): VideoQuality {
  try {
    const q = localStorage.getItem(QUALITY_KEY);
    if (q === '480p' || q === '720p' || q === '1080p') return q;
  } catch {
    // storage blocked
  }
  return '720p';
}
export function setPreferredQuality(q: VideoQuality) {
  try {
    localStorage.setItem(QUALITY_KEY, q);
  } catch {
    // storage blocked
  }
}

const wordSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;
const graphemeSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const graphemes = (s: string) => (graphemeSegmenter ? [...graphemeSegmenter.segment(s)].map((g) => g.segment) : [...s]);

/**
 * Pieces of a word too wide for one row: word boundaries of its language first (Japanese and
 * Chinese have no spaces; "a—b" splits at the dash), single characters when even a piece is too wide.
 */
function splitWide(ctx: CanvasRenderingContext2D, word: string, maxW: number): string[] {
  const parts = wordSegmenter ? [...wordSegmenter.segment(word)].map((s) => s.segment) : [word];
  return parts.flatMap((p) => (ctx.measureText(p).width > maxW ? graphemes(p) : [p]));
}

const wrapCache = new Map<string, string[]>();

/** Splits a lyric line into rows that fit `maxW` (uses the context's current font). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const key = `${ctx.font}|${maxW}|${text}`;
  const cached = wrapCache.get(key);
  if (cached) return cached;
  // Each unit goes on the row after a space (a whole word) or glued to the previous piece.
  const units: { text: string; space: boolean }[] = [];
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (ctx.measureText(w).width <= maxW) units.push({ text: w, space: true });
    else splitWide(ctx, w, maxW).forEach((p, i) => units.push({ text: p, space: i === 0 }));
  }
  const rows: string[] = [];
  let row = '';
  for (const u of units) {
    const next = row ? row + (u.space ? ' ' : '') + u.text : u.text;
    if (row && ctx.measureText(next).width > maxW) {
      rows.push(row);
      row = u.text;
    } else row = next;
  }
  if (row) rows.push(row);
  const out = rows.length ? rows : [''];
  if (wrapCache.size > 5000) wrapCache.clear();
  wrapCache.set(key, out);
  return out;
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
  /** "@username" when the author has a tag, otherwise the name. */
  authorTag?: string;
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
  const author = getAuthor(karaoke);
  return { cover, author: author.name, authorTag: author.username ? '@' + author.username : author.name };
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
function drawVinyl(ctx: CanvasRenderingContext2D, assets: FrameAssets, cx: number, cy: number, r: number, t: number, ac: string, bg: string, label = 0.4) {
  const angle = t * Math.PI * 2 * 0.3; // 0.3 turns per second
  ctx.save();
  // Disc and grooves.
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#121214';
  ctx.fill();
  ctx.lineWidth = 1;
  for (let rr = r * (label + 0.04); rr < r * 0.97; rr += r * 0.022) {
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.035 + 0.025 * Math.sin(rr * 0.7)})`;
    ctx.stroke();
  }
  // Label (the cover) turns with the disc.
  const lr = r * label;
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

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Where TikTok, Reels and Shorts (9:16) or the YouTube player (16:9) put their own buttons and
 * captions, as shares of the frame. Everything that matters stays inside.
 */
const SAFE = {
  reel: { top: 0.12, bottom: 0.22, left: 0.06, right: 0.15 },
  landscape: { top: 0.1, bottom: 0.14, left: 0.05, right: 0.05 },
} as const;

function safeBox(format: ExportFormat) {
  const { width, height } = frameSize(format);
  const s = format === 'reel' ? SAFE.reel : SAFE.landscape;
  return { x0: width * s.left, x1: width * (1 - s.right), y0: height * s.top, y1: height * (1 - s.bottom) };
}

/** The progress line sits PROGRESS_GAP to the left of the lyrics. */
const PROGRESS_W = 5;
const PROGRESS_GAP = 5;

/** Vertical progress line filled top to bottom: the rest in the text colour, the filled part in the fill colour. */
function drawVerticalProgress(ctx: CanvasRenderingContext2D, karaoke: Karaoke, x: number, top: number, bottom: number, share: number) {
  const ac = karaoke.style?.activeColor || '#ffb547';
  const tx = karaoke.style?.textColor || '#f4f4f5';
  const h = bottom - top;
  ctx.fillStyle = withAlpha(tx, 0.16);
  ctx.beginPath();
  ctx.roundRect(x, top, PROGRESS_W, h, PROGRESS_W / 2);
  ctx.fill();
  ctx.fillStyle = ac;
  ctx.beginPath();
  ctx.roundRect(x, top, PROGRESS_W, Math.max(PROGRESS_W, h * clamp01(share)), PROGRESS_W / 2);
  ctx.fill();
}

/** Width drawBrandMark takes at height `h`. */
function brandMarkWidth(ctx: CanvasRenderingContext2D, h: number): number {
  ctx.save();
  ctx.font = `600 ${h * 0.78}px "Onest", sans-serif`;
  const w = h * 0.4 * 3 + h * 0.15 + ctx.measureText('KaraokeCraft').width;
  ctx.restore();
  return w;
}

const plateWidth = (ctx: CanvasRenderingContext2D, h: number) => brandMarkWidth(ctx, h) + h * 1.5;

/** KaraokeCraft plate: a pill in the text colour with the mark in the background colour. */
function drawPlate(ctx: CanvasRenderingContext2D, karaoke: Karaoke, x: number, y: number, h: number) {
  const tx = karaoke.style?.textColor || '#f4f4f5';
  const bg = karaoke.style?.backgroundColor || '#1d1b3a';
  ctx.fillStyle = tx;
  ctx.beginPath();
  ctx.roundRect(x, y, plateWidth(ctx, h), h * 2, h);
  ctx.fill();
  drawBrandMark(ctx, x + h * 0.75, y + h * 0.5, h, { accent: bg, color: bg, alpha: 1 });
}

/** "Artist · @author". */
const subtitle = (karaoke: Karaoke, assets: FrameAssets) => [karaoke.artist, assets.authorTag ?? assets.author].filter(Boolean).join(' · ');

/** Turning vinyl with the title and "artist · @author" to its right, vertically centred on `cy`. */
function drawVinylRow(
  ctx: CanvasRenderingContext2D,
  karaoke: Karaoke,
  assets: FrameAssets,
  x: number,
  cy: number,
  r: number,
  t: number,
  maxRight: number,
  titlePx: number,
  subPx: number
) {
  const ac = karaoke.style?.activeColor || '#ffb547';
  const tx = karaoke.style?.textColor || '#f4f4f5';
  const bg = karaoke.style?.backgroundColor || '#1d1b3a';
  drawVinyl(ctx, assets, x + r, cy, r, t, ac, bg, 0.55);
  const textX = x + r * 2.35;
  const maxW = maxRight - textX;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = tx;
  ctx.font = `700 ${titlePx}px "Unbounded", "Onest", sans-serif`;
  ctx.fillText(fitText(ctx, karaoke.title, maxW), textX, cy - titlePx * 0.15);
  ctx.fillStyle = withAlpha(tx, 0.7);
  ctx.font = `500 ${subPx}px "Onest", sans-serif`;
  ctx.fillText(fitText(ctx, subtitle(karaoke, assets), maxW), textX, cy + subPx * 1.2);
}

/** Record player arm: `k` 0 = resting beside the disc, 1 = on the record. */
function drawTonearm(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, k: number) {
  const px = cx + r * 1.08;
  const py = cy - r * 0.95;
  const a = 0.04 + 0.38 * (1 - Math.pow(1 - clamp01(k), 3));
  const len = r * 1.25;
  const ex = px - len * Math.sin(a);
  const ey = py + len * Math.cos(a);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#3a3a3d';
  ctx.lineWidth = r * 0.045;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.translate(ex, ey);
  ctx.rotate(a);
  ctx.fillStyle = '#2b2b2e';
  ctx.fillRect(-r * 0.05, -r * 0.02, r * 0.1, r * 0.14);
  ctx.restore();
  ctx.fillStyle = '#2b2b2e';
  ctx.beginPath();
  ctx.arc(px, py, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#55555a';
  ctx.beginPath();
  ctx.arc(px, py, r * 0.04, 0, Math.PI * 2);
  ctx.fill();
}

/** Share of line `idx` already sung at `t`. */
function lineShare(karaoke: Karaoke, idx: number, t: number, totalSec: number) {
  const line = karaoke.lyrics[idx];
  const end = line.end ?? karaoke.lyrics[idx + 1]?.time ?? totalSec;
  return clamp01((t - line.time) / Math.max(0.1, end - line.time));
}

/**
 * «Караоке-ТВ»: the lyrics go in pairs, two lines at a time, without scrolling. The pair changes
 * once both are sung; inside it a line fills left to right like in the player.
 */
function drawLinePair(
  ctx: CanvasRenderingContext2D,
  karaoke: Karaoke,
  t: number,
  totalSec: number,
  box: { x: number; top: number; bottom: number; width: number; fontSize: number }
) {
  const lyrics = karaoke.lyrics;
  if (!lyrics.length) return;
  const ac = karaoke.style?.activeColor || '#ffb547';
  const tx = karaoke.style?.textColor || '#f4f4f5';
  const font = fontCss(karaoke.style?.font || 'Onest');
  const activeIdx = lyrics.reduce((a, line, idx) => (t >= line.time ? idx : a), -1);
  const first = Math.floor(Math.max(activeIdx, 0) / 2) * 2;
  const ids = [first, first + 1].filter((i) => i < lyrics.length);

  // Long lines: shrink the font until both lines fit the box.
  let fontSize = box.fontSize;
  let blocks: string[][] = [];
  let height = 0;
  for (let i = 0; i < 5; i++) {
    ctx.font = `700 ${fontSize}px ${font}`;
    blocks = ids.map((id) => wrapText(ctx, lyrics[id].text, box.width));
    height = blocks.reduce((s, b) => s + b.length * fontSize * 1.18, 0) + fontSize * 0.45 * (blocks.length - 1);
    if (height <= box.bottom - box.top) break;
    fontSize *= 0.88;
  }
  const rowH = fontSize * 1.18;
  const appear = activeIdx < 0 ? 0.5 : 0.35 + 0.65 * clamp01((t - lyrics[first].time) / 0.25);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let y = (box.top + box.bottom) / 2 - height / 2;
  blocks.forEach((rows, k) => {
    const idx = ids[k];
    const p = idx < activeIdx ? 1 : idx === activeIdx ? lineShare(karaoke, idx, t, totalSec) : 0;
    const widths = rows.map((r) => ctx.measureText(r).width);
    let filled = p * (widths.reduce((s, w) => s + w, 0) || 1);
    ctx.globalAlpha = appear;
    rows.forEach((row, r) => {
      const baseline = y + r * rowH + fontSize * 0.9;
      const fillW = Math.max(0, Math.min(widths[r], filled));
      filled -= widths[r];
      if (fillW < widths[r]) {
        ctx.fillStyle = tx;
        ctx.fillText(row, box.x, baseline);
      }
      if (fillW > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(box.x - 4, baseline - fontSize * 1.2, fillW + 4, fontSize * 1.6);
        ctx.clip();
        ctx.fillStyle = ac;
        ctx.fillText(row, box.x, baseline);
        ctx.restore();
      }
    });
    y += rows.length * rowH + fontSize * 0.45;
  });
  ctx.globalAlpha = 1;
}

/** 9:16 (docs/video/vertical-v2.md): plate on top, the player's lyric column, vinyl with the title below. */
function drawReelFrame(ctx: CanvasRenderingContext2D, karaoke: Karaoke, t: number, totalSec: number, assets: FrameAssets) {
  const { height } = frameSize('reel');
  const { x0, x1, y0, y1 } = safeBox('reel');
  drawPlate(ctx, karaoke, x0, y0 + 16, 24);
  const top = y0 + 101;
  const bottom = y1 - 149;
  const textX = x0 + PROGRESS_W + PROGRESS_GAP;
  drawVerticalProgress(ctx, karaoke, x0, top, bottom, t / totalSec);
  const textY = karaoke.style?.textY;
  const anchor =
    typeof textY === 'number'
      ? Math.min(bottom - 160, Math.max(top + 40, (height * textY) / 100 - 60))
      : top + (bottom - top) * 0.3;
  drawLyrics(ctx, karaoke, t, totalSec, { x: textX, top, bottom, width: x1 - textX, anchor, fontSize: 45 });
  drawVinylRow(ctx, karaoke, assets, x0, y1 - 69, 53, t, x1, 25, 19);
}

/** 16:9 «Пластинка+»: big vinyl with a tonearm on the left, the player's lyric column on the right. */
function drawVinylFrame(ctx: CanvasRenderingContext2D, karaoke: Karaoke, t: number, totalSec: number, assets: FrameAssets, armK: number) {
  const ac = karaoke.style?.activeColor || '#ffb547';
  const tx = karaoke.style?.textColor || '#f4f4f5';
  const bg = karaoke.style?.backgroundColor || '#1d1b3a';
  const { x0, x1, y0, y1 } = safeBox('landscape');
  drawPlate(ctx, karaoke, x0, y0, 19);
  const r = 171;
  const cx = x0 + r;
  const cy = y0 + 64 + r;
  drawVinyl(ctx, assets, cx, cy, r, t, ac, bg, 0.45);
  drawTonearm(ctx, cx, cy, r, armK);
  const barX = x0 + r * 2 + 93;
  const infoW = barX - 24 - x0;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = tx;
  ctx.font = '700 32px "Unbounded", "Onest", sans-serif';
  ctx.fillText(fitText(ctx, karaoke.title, infoW), x0, cy + r + 51);
  ctx.fillStyle = withAlpha(tx, 0.7);
  ctx.font = '500 20px "Onest", sans-serif';
  ctx.fillText(fitText(ctx, subtitle(karaoke, assets), infoW), x0, cy + r + 83);
  const textX = barX + PROGRESS_W + PROGRESS_GAP;
  drawVerticalProgress(ctx, karaoke, barX, y0, y1, t / totalSec);
  drawLyrics(ctx, karaoke, t, totalSec, { x: textX, top: y0, bottom: y1, width: x1 - textX, anchor: y0 + (y1 - y0) * 0.32, fontSize: 45 });
}

/** 16:9 «Караоке-ТВ»: small vinyl with the title and the plate on top, two big lines in the middle. */
function drawTvFrame(ctx: CanvasRenderingContext2D, karaoke: Karaoke, t: number, totalSec: number, assets: FrameAssets) {
  const { x0, x1, y0, y1 } = safeBox('landscape');
  const plateX = x1 - plateWidth(ctx, 19);
  drawPlate(ctx, karaoke, plateX, y0 + 8, 19);
  drawVinylRow(ctx, karaoke, assets, x0, y0 + 45, 45, t, plateX - 24, 27, 19);
  const barX = x0 + 27;
  const textX = barX + PROGRESS_W + PROGRESS_GAP;
  const top = y0 + 133;
  const bottom = y1 - 27;
  drawVerticalProgress(ctx, karaoke, barX, top, bottom, t / totalSec);
  drawLinePair(ctx, karaoke, t, totalSec, { x: textX, top, bottom, width: x1 - textX - 27, fontSize: 53 });
}

/**
 * Draws the song frame at `t` seconds of the AUDIO. `armK` lowers the tonearm of «Пластинка+»
 * (0 = resting, 1 = on the record).
 */
export function drawKaraokeFrame(
  ctx: CanvasRenderingContext2D,
  karaoke: Karaoke,
  format: ExportFormat,
  t: number,
  totalSec = karaoke.duration || 40,
  assets: FrameAssets = { cover: null, author: karaoke.authorName },
  armK = 1
) {
  const { width, height } = frameSize(format);
  ctx.globalAlpha = 1;
  ctx.fillStyle = karaoke.style?.backgroundColor || '#1d1b3a';
  ctx.fillRect(0, 0, width, height);
  if (format === 'reel') drawReelFrame(ctx, karaoke, t, totalSec, assets);
  else if (format === 'landscape-tv') drawTvFrame(ctx, karaoke, t, totalSec, assets);
  else drawVinylFrame(ctx, karaoke, t, totalSec, assets, armK);
}

/** Title card shown, without sound, before the song. */
function drawIntroCard(ctx: CanvasRenderingContext2D, karaoke: Karaoke, format: ExportFormat, assets: FrameAssets) {
  const { width, height } = frameSize(format);
  const ac = karaoke.style?.activeColor || '#ffb547';
  const tx = karaoke.style?.textColor || '#f4f4f5';
  ctx.fillStyle = karaoke.style?.backgroundColor || '#1d1b3a';
  ctx.fillRect(0, 0, width, height);
  const reel = format === 'reel';
  const size = 293;
  const x = reel ? (width - size) / 2 : 293;
  drawThumb(ctx, assets, x, reel ? 333 : 213, size, ac);
  const textX = reel ? width / 2 : 640;
  const maxW = reel ? width - 116 : width - 64 - textX;
  ctx.textAlign = reel ? 'center' : 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = tx;
  ctx.font = '700 60px "Unbounded", "Onest", sans-serif';
  const all = wrapText(ctx, karaoke.title, maxW);
  const rows = all.slice(0, 2);
  if (all.length > 2) rows[1] = fitText(ctx, rows[1] + '…', maxW);
  let y = reel ? 740 : 340 - (rows.length - 1) * 36;
  rows.forEach((row) => {
    ctx.fillText(row, textX, y);
    y += 72;
  });
  ctx.fillStyle = withAlpha(tx, 0.7);
  ctx.font = '500 24px "Onest", sans-serif';
  ctx.fillText(fitText(ctx, subtitle(karaoke, assets), maxW), textX, y - 22);
}

/** Closing card shown, without sound, after the song. */
function drawOutroCard(ctx: CanvasRenderingContext2D, karaoke: Karaoke, format: ExportFormat, assets: FrameAssets) {
  const { width, height } = frameSize(format);
  const tx = karaoke.style?.textColor || '#f4f4f5';
  ctx.fillStyle = karaoke.style?.backgroundColor || '#1d1b3a';
  ctx.fillRect(0, 0, width, height);
  const reel = format === 'reel';
  const h = reel ? 48 : 29;
  drawPlate(ctx, karaoke, (width - plateWidth(ctx, h)) / 2, reel ? 480 : 253, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = tx;
  ctx.font = `700 ${reel ? 37 : 43}px "Unbounded", "Onest", sans-serif`;
  ctx.fillText('Сделай своё караоке', width / 2, reel ? 667 : 400);
  ctx.fillStyle = withAlpha(tx, 0.7);
  ctx.font = '500 24px "Onest", sans-serif';
  ctx.fillText(fitText(ctx, `Автор: ${assets.authorTag ?? assets.author}`, width - 116), width / 2, reel ? 717 : 451);
}

/** Total length of the exported video for a song of `audioSec` seconds. */
export const videoLength = (audioSec: number) => INTRO_SEC + audioSec + OUTRO_SEC;

/**
 * One frame at `v` seconds of the VIDEO: INTRO_SEC of title card without sound, the song
 * (audio time = v − INTRO_SEC), then OUTRO_SEC of closing card without sound.
 */
export function drawVideoFrame(
  ctx: CanvasRenderingContext2D,
  karaoke: Karaoke,
  format: ExportFormat,
  v: number,
  audioSec: number,
  assets: FrameAssets
) {
  const t = Math.min(audioSec, Math.max(0, v - INTRO_SEC));
  drawKaraokeFrame(ctx, karaoke, format, t, audioSec, assets, clamp01((v - (INTRO_SEC - 0.9)) / 0.9));
  if (v < INTRO_SEC) {
    ctx.save();
    ctx.globalAlpha = v < INTRO_SEC - 0.6 ? 1 : (INTRO_SEC - v) / 0.6;
    drawIntroCard(ctx, karaoke, format, assets);
    ctx.restore();
  } else if (v > INTRO_SEC + audioSec) {
    ctx.save();
    ctx.globalAlpha = clamp01((v - INTRO_SEC - audioSec) / 0.4);
    drawOutroCard(ctx, karaoke, format, assets);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

export interface RenderOptions {
  onProgress?: (share: number) => void;
  signal?: AbortSignal;
  quality?: VideoQuality;
}

export interface RenderResult {
  blob: Blob;
  ext: 'mp4' | 'webm';
  /** 'fast' = WebCodecs, 'realtime' = MediaRecorder capture. */
  mode: 'fast' | 'realtime';
}

const abortError = () => new DOMException('Загрузка отменена', 'AbortError');

/** Canvas in the output resolution; drawing is scaled so the layout code keeps 720p units. */
function makeCanvas(format: ExportFormat, quality: VideoQuality) {
  const base = frameSize(format);
  const { width, height } = outputSize(format, quality);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas недоступен');
  ctx.setTransform(width / base.width, 0, 0, height / base.height, 0, 0);
  ctx.imageSmoothingQuality = 'high';
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

async function renderFast(karaoke: Karaoke, format: ExportFormat, audioUrl: string, assets: FrameAssets, { onProgress, signal, quality = '720p' }: RenderOptions): Promise<RenderResult> {
  const { width, height } = outputSize(format, quality);
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

  const { canvas, ctx } = makeCanvas(format, quality);
  const output = new Output({
    format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const video = new CanvasSource(canvas, { codec: videoCodec, bitrate: QUALITY[quality].bitrate, keyFrameInterval: 2 });
  const sound = new AudioBufferSource({ codec: audioCodec, bitrate: 160_000 });
  output.addVideoTrack(video, { frameRate: FPS });
  output.addAudioTrack(sound);
  await output.start();

  try {
    const duration = audio.duration;
    // The intro and closing cards are silent: pad the song with silence on both sides.
    const silence = (sec: number) =>
      new AudioBuffer({ length: Math.max(1, Math.round(sec * audio.sampleRate)), numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate });
    await sound.add(silence(INTRO_SEC));
    await sound.add(audio);
    await sound.add(silence(OUTRO_SEC));
    const frames = Math.ceil(videoLength(duration) * FPS);
    let lastReport = 0;
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw abortError();
      const v = i / FPS;
      drawVideoFrame(ctx, karaoke, format, v, duration, assets);
      await video.add(v, 1 / FPS);
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
async function renderRealtime(karaoke: Karaoke, format: ExportFormat, audioUrl: string | null, assets: FrameAssets, { onProgress, signal, quality = '720p' }: RenderOptions): Promise<RenderResult> {
  const { canvas, ctx } = makeCanvas(format, quality);
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
    videoBitsPerSecond: QUALITY[quality].bitrate,
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

    const total = videoLength(duration);
    drawVideoFrame(ctx, karaoke, format, 0, duration, assets);
    recorder.start(1000);

    // Intro card (silent) → the song → closing card (silent).
    let songStartedAt = 0;
    let songEndedAt = 0;
    let lastReport = 0;
    worker.onmessage = () => {
      const now = performance.now();
      if (!songStartedAt && now - startTime >= INTRO_SEC * 1000) {
        songStartedAt = now;
        if (trackAudio) void trackAudio.play().catch(() => onAbort());
        else synthPlayer?.playPreset(karaoke.audioPreset || 'synthwave', 0);
      }
      let v: number;
      if (!songStartedAt) v = (now - startTime) / 1000;
      else if (!songEndedAt) {
        const t = trackAudio ? trackAudio.currentTime : (now - songStartedAt) / 1000;
        if (t >= duration || trackAudio?.ended) {
          songEndedAt = now;
          synthPlayer?.stop();
        }
        v = INTRO_SEC + Math.min(t, duration);
      } else v = INTRO_SEC + duration + (now - songEndedAt) / 1000;
      drawVideoFrame(ctx, karaoke, format, v, duration, assets);
      if (now - lastReport > 500) {
        lastReport = now;
        onProgress?.(Math.min(0.99, v / total));
      }
      if (songEndedAt && now - songEndedAt >= OUTRO_SEC * 1000 && recorder.state === 'recording') {
        recordedMs = now - startTime;
        worker.onmessage = null;
        recorder.stop();
      }
    };
  });
}

/** File name like "propose_vertical_1080p.mp4". */
export function videoFileName(karaoke: Pick<Karaoke, 'title'>, format: ExportFormat, ext: string, quality: VideoQuality = '720p') {
  const base = karaoke.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'karaoke';
  const kind = format === 'reel' ? 'vertical' : format === 'landscape-tv' ? 'horizontal_tv' : 'horizontal';
  return `${base}_${kind}_${quality}.${ext}`;
}
