'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, FileImage, RotateCcw, Video } from 'lucide-react';
import { Button, buttonStyles } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Modal } from '@/components/ui/modal';
import { synthPlayer } from '@/lib/audio-synthesizer';
import { DISPLAY_FONT, fontFamilyFor } from '@/lib/fonts';
import type { Karaoke, KaraokeStyle, LyricLine } from '@/lib/types';

type ExportFormat = 'reel' | 'landscape';
type Phase = 'idle' | 'recording' | 'done' | 'unsupported';

/** In order of preference; Safari has only mp4. */
const MIME_TYPES = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'];
const MAX_RECORD_SECONDS = 40;
/** The synth's own default level; the player's volume or mute must not carry over into the file. */
const RECORD_GAIN = 0.4;

const FRAME_SIZE: Record<ExportFormat, { width: number; height: number }> = {
  reel: { width: 720, height: 1280 },
  landscape: { width: 1280, height: 720 },
};

const FORMATS: ReadonlyArray<{ value: ExportFormat; label: string; hint: string }> = [
  { value: 'reel', label: 'Вертикальное 9:16', hint: 'Reels, Shorts, TikTok' },
  { value: 'landscape', label: 'Горизонтальное 16:9', hint: 'YouTube и экраны' },
];

// The canvas cannot use CSS variables; these match surface-1, fg and accent for tracks saved without colours.
const CANVAS_FALLBACK = { background: '#14121B', text: '#F4F4F5', active: '#FFB547' };

/** Export format matching a track's own frame. */
export function formatForAspect(aspect: KaraokeStyle['aspectRatio'] | undefined): ExportFormat {
  return aspect === '16:9' || aspect === 'h' ? 'landscape' : 'reel';
}

/** The first video type this browser can record, or null when it cannot record a canvas at all. */
function pickMimeType(): string | null {
  if (typeof window === 'undefined' || typeof window.MediaRecorder?.isTypeSupported !== 'function') return null;
  if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null;
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

function fileSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^0-9a-zа-яё]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'karaoke'
  );
}

/** Valid lines in time order: old or hand-edited saves may hold junk or unsorted lines. */
function validLines(lyrics: unknown): LyricLine[] {
  if (!Array.isArray(lyrics)) return [];
  return lyrics
    .filter(
      (line): line is LyricLine =>
        !!line && typeof line.text === 'string' && typeof line.time === 'number' && Number.isFinite(line.time),
    )
    .sort((a, b) => a.time - b.time);
}

/** Loads the faces the frame uses, for the scripts in `text` (Cyrillic lives in its own font file). */
function loadFonts(family: string, text: string): Promise<unknown> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  return Promise.all([
    document.fonts.load(`700 36px ${DISPLAY_FONT}`, text),
    document.fonts.load(`700 42px ${family}`, text),
    document.fonts.load(`600 32px ${family}`, text),
    document.fonts.load(`500 22px ${family}`, text),
  ]).catch(() => undefined);
}

/**
 * Sets `ctx.font` so `text` fits `maxWidth`: shrinks the size down to 70%, then cuts the text with «…».
 * Returns the text to draw.
 */
function fitText(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, family: string, maxWidth: number): string {
  ctx.font = `${weight} ${size}px ${family}`;
  const width = ctx.measureText(text).width;
  if (width <= maxWidth) return text;
  ctx.font = `${weight} ${Math.max(Math.round(size * 0.7), Math.floor((size * maxWidth) / width))}px ${family}`;
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && ctx.measureText(`${chars.join('')}…`).width > maxWidth) chars.pop();
  return `${chars.join('').trimEnd()}…`;
}

interface FrameSource {
  track: Karaoke;
  lines: LyricLine[];
  format: ExportFormat;
  /** Seconds the progress bar spans. */
  duration: number;
}

function drawFrame(ctx: CanvasRenderingContext2D, { track, lines, format, duration }: FrameSource, elapsed: number) {
  const { width, height } = FRAME_SIZE[format];
  const reel = format === 'reel';
  const style: Partial<KaraokeStyle> = track.style ?? {};
  const background = style.backgroundColor || CANVAS_FALLBACK.background;
  const textColor = style.textColor || CANVAS_FALLBACK.text;
  const activeColor = style.activeColor || CANVAS_FALLBACK.active;
  const family = fontFamilyFor(style.font);
  const maxWidth = width - (reel ? 96 : 160);

  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, width, height);

  // 1. Background in the track's colour, darker towards the bottom.
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  const shade = ctx.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, 'rgba(0,0,0,0.2)');
  shade.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);

  // 2. Title in the display font, artist in the lyric font.
  ctx.textAlign = 'center';
  ctx.fillStyle = textColor;
  const title = fitText(ctx, track.title, 700, reel ? 36 : 28, DISPLAY_FONT, maxWidth);
  ctx.fillText(title, width / 2, reel ? 120 : 70);
  ctx.globalAlpha = 0.7;
  const artist = fitText(ctx, track.artist, 500, reel ? 22 : 18, family, maxWidth);
  ctx.fillText(artist, width / 2, reel ? 165 : 100);

  // 3. Lyrics around the line being sung.
  let activeIndex = -1;
  lines.forEach((line, index) => {
    if (elapsed >= line.time) activeIndex = index;
  });
  const centerY = reel ? height / 2 : height / 2 + 30;
  const lineHeight = reel ? 76 : 60;
  lines.forEach((line, index) => {
    const y = centerY + (index - activeIndex) * lineHeight;
    if (y <= 200 || y >= height - 180) return;
    const active = index === activeIndex;
    ctx.fillStyle = active ? activeColor : textColor;
    ctx.globalAlpha = active ? 1 : 0.35;
    const size = active ? (reel ? 42 : 34) : reel ? 32 : 26;
    ctx.fillText(fitText(ctx, line.text, active ? 700 : 600, size, family, maxWidth), width / 2, y);
  });
  ctx.globalAlpha = 1;

  // 4. Progress bar.
  const progress = duration > 0 ? Math.min(1, elapsed / duration) : 0;
  const barWidth = width * 0.7;
  const barX = (width - barWidth) / 2;
  const barY = height - 100;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barWidth, 4, 2);
  ctx.fill();
  ctx.fillStyle = activeColor;
  ctx.beginPath();
  ctx.roundRect(barX, barY, barWidth * progress, 4, 2);
  ctx.fill();

  // 5. Mandatory watermark.
  const wmWidth = 260;
  const wmHeight = 36;
  const wmX = (width - wmWidth) / 2;
  const wmY = height - 60;
  ctx.fillStyle = 'rgba(9, 9, 11, 0.7)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(wmX, wmY, wmWidth, wmHeight, 999);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffb547';
  ctx.font = `700 14px ${DISPLAY_FONT}`;
  ctx.fillText('✦ KaraokeCraft', width / 2, wmY + 23);
}

/** One recording in progress. */
interface Recording {
  discarded: boolean;
  frame: number;
  recorder: MediaRecorder | null;
  videoTracks: MediaStreamTrack[];
}

/** Stops a recording and its backing track; its result is thrown away. */
function discardRecording(run: Recording) {
  run.discarded = true;
  cancelAnimationFrame(run.frame);
  if (run.recorder && run.recorder.state !== 'inactive') run.recorder.stop();
  run.videoTracks.forEach((track) => track.stop());
  synthPlayer?.stop();
}

/** Small frame in the track's colours, in the shape of the format. */
function FormatThumb({ format, style }: { format: ExportFormat; style: Partial<KaraokeStyle> }) {
  const text = style.textColor || 'var(--color-fg)';
  const rest = { backgroundColor: text, opacity: 0.35 };
  return (
    <span aria-hidden="true" className="flex h-10 w-12 shrink-0 items-center justify-center">
      <span
        className={cn(
          'flex flex-col items-center justify-center gap-[3px] rounded-[5px] ring-1 ring-white/10',
          format === 'reel' ? 'h-10 w-[23px]' : 'h-[27px] w-12',
        )}
        style={{ backgroundColor: style.backgroundColor || 'var(--color-surface-1)' }}
      >
        <span className="h-[2px] w-1/2 rounded-full" style={rest} />
        <span className="h-[3px] w-2/3 rounded-full" style={{ backgroundColor: style.activeColor || 'var(--color-accent)' }} />
        <span className="h-[2px] w-1/2 rounded-full" style={rest} />
      </span>
    </span>
  );
}

/** The dialog's contents. Mounted only while the dialog is open, so each opening starts afresh. */
function ExportBody({ track, initialFormat }: { track: Karaoke; initialFormat: ExportFormat }) {
  const [format, setFormat] = useState(initialFormat);
  const [mimeType] = useState(pickMimeType);
  const [phase, setPhase] = useState<Phase>(mimeType ? 'idle' : 'unsupported');
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recordingRef = useRef<Recording | null>(null);
  // After a phase change the old buttons disappear; focus moves to the first action of the new phase.
  const actionsRef = useRef<HTMLDivElement>(null);
  const moveFocusRef = useRef(false);
  const radioName = useId();

  const lines = useMemo(() => validLines(track.lyrics), [track.lyrics]);
  const lastLine = lines.at(-1);
  const trackSeconds = Number.isFinite(track.duration) && track.duration > 0 ? track.duration : (lastLine?.time ?? 0) + 4;
  const recordSeconds = Math.min(trackSeconds, MAX_RECORD_SECONDS);
  const style: Partial<KaraokeStyle> = track.style ?? {};
  const family = fontFamilyFor(style.font);
  const sampleText = useMemo(() => [track.title, track.artist, ...lines.map((line) => line.text)].join(' '), [track.title, track.artist, lines]);
  // The still frame shows the second line being sung, with one line above it.
  const stillTime = lines[1]?.time ?? lines[0]?.time ?? 0;
  const { width, height } = FRAME_SIZE[format];
  const ext = mimeType?.startsWith('video/mp4') ? 'mp4' : 'webm';
  const fileBase = `${fileSlug(track.title)}_karaokecraft`;

  // The still preview, redrawn when the format or the track changes (resizing the canvas clears it).
  useEffect(() => {
    if (phase === 'recording') return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    let stale = false;
    loadFonts(family, sampleText).then(() => {
      if (!stale) drawFrame(ctx, { track, lines, format, duration: recordSeconds }, stillTime);
    });
    return () => {
      stale = true;
    };
  }, [phase, format, track, lines, family, sampleText, recordSeconds, stillTime]);

  useEffect(() => {
    if (!moveFocusRef.current) return;
    moveFocusRef.current = false;
    actionsRef.current?.querySelector<HTMLElement>('button, a')?.focus();
  }, [phase]);

  // A replaced or abandoned video frees its memory.
  useEffect(() => {
    if (!videoUrl) return;
    return () => URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  // Closing the dialog mid-recording stops the recorder, the frame loop and the sound.
  useEffect(
    () => () => {
      const run = recordingRef.current;
      if (run) discardRecording(run);
    },
    [],
  );

  function changePhase(next: Phase) {
    moveFocusRef.current = true;
    setPhase(next);
  }

  async function record() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!mimeType || !canvas || !ctx || recordingRef.current) return;

    const run: Recording = { discarded: false, frame: 0, recorder: null, videoTracks: [] };
    recordingRef.current = run;
    setVideoUrl(null);
    setProgress(0);
    changePhase('recording');

    await loadFonts(family, sampleText);
    if (run.discarded) return;

    const source: FrameSource = { track, lines, format, duration: recordSeconds };
    drawFrame(ctx, source, 0);
    const canvasStream = canvas.captureStream(30);
    run.videoTracks = canvasStream.getVideoTracks();
    // The tap on the synth's output is shared by every recording, so its audio track is never stopped.
    const audio = synthPlayer?.getMediaStreamDestination();
    const stream = new MediaStream([...run.videoTracks, ...(audio?.stream.getAudioTracks() ?? [])]);

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_000_000 });
    } catch {
      discardRecording(run);
      recordingRef.current = null;
      changePhase('unsupported');
      return;
    }
    run.recorder = recorder;

    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      run.videoTracks.forEach((videoTrack) => videoTrack.stop());
      if (run.discarded) return;
      recordingRef.current = null;
      synthPlayer?.stop();
      setVideoUrl(URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || mimeType })));
      changePhase('done');
    };

    recorder.start(100);
    synthPlayer?.setVolume(RECORD_GAIN);
    synthPlayer?.playPreset(track.audioPreset ?? 'synthwave', 0);

    const start = performance.now();
    const tick = (now: number) => {
      if (run.discarded) return;
      const elapsed = Math.max(0, (now - start) / 1000);
      drawFrame(ctx, source, Math.min(elapsed, recordSeconds));
      setProgress(Math.min(100, Math.floor((elapsed / recordSeconds) * 100)));
      if (elapsed < recordSeconds) run.frame = requestAnimationFrame(tick);
      else if (recorder.state !== 'inactive') recorder.stop();
    };
    run.frame = requestAnimationFrame(tick);
  }

  function cancel() {
    const run = recordingRef.current;
    if (run) discardRecording(run);
    recordingRef.current = null;
    setProgress(0);
    changePhase('idle');
  }

  function chooseFormat(next: ExportFormat) {
    setFormat(next);
    // A finished video no longer matches the chosen format.
    if (phase === 'done') {
      setVideoUrl(null);
      setPhase('idle');
    }
  }

  async function downloadFrame() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    await loadFonts(family, sampleText);
    drawFrame(ctx, { track, lines, format, duration: recordSeconds }, stillTime);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileBase}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  const recording = phase === 'recording';
  const media = format === 'reel' ? 'aspect-[9/16] h-[min(300px,38dvh)] w-auto' : 'aspect-video h-auto w-full';
  const frameButton = (
    <Button
      variant={phase === 'unsupported' ? 'primary' : 'secondary'}
      block
      icon={<FileImage aria-hidden="true" />}
      onClick={downloadFrame}
    >
      Скачать кадр .png
    </Button>
  );

  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label="Формат видео" className="grid gap-2 sm:grid-cols-2">
        {FORMATS.map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-2xl border bg-surface-2 p-3 transition-colors',
              'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent',
              'has-disabled:cursor-not-allowed has-disabled:opacity-60',
              format === option.value ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong',
            )}
          >
            <input
              type="radio"
              name={radioName}
              value={option.value}
              checked={format === option.value}
              onChange={() => chooseFormat(option.value)}
              disabled={recording}
              className="sr-only"
            />
            <FormatThumb format={option.value} style={style} />
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-fg">{option.label}</span>
              <span className="block text-[13px] text-fg-muted">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex justify-center rounded-2xl border border-line bg-ink p-3">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          role="img"
          aria-label="Кадр видео"
          className={cn(media, 'rounded-lg', phase === 'done' && 'hidden')}
        />
        {phase === 'done' && videoUrl && (
          <video src={videoUrl} controls playsInline muted aria-label="Записанное видео" className={cn(media, 'rounded-lg bg-ink')} />
        )}
      </div>

      <p role="status" className="sr-only">
        {recording ? 'Идёт запись видео' : phase === 'done' ? 'Видео готово' : ''}
      </p>

      <div ref={actionsRef} className="space-y-3">
        {phase === 'unsupported' && (
          <div className="space-y-3">
            <p className="flex gap-3 rounded-2xl border border-line bg-surface-2 p-4 text-[14px] text-fg-muted">
              <AlertTriangle aria-hidden="true" className="size-5 shrink-0 text-accent" />
              Ваш браузер не умеет записывать видео. Скачайте кадр .png или откройте сайт в Chrome.
            </p>
            {frameButton}
          </div>
        )}

        {phase === 'idle' && (
          <div className="space-y-2">
            <Button variant="primary" block icon={<Video aria-hidden="true" />} onClick={record}>
              Записать видео
            </Button>
            {frameButton}
            <p className="pt-1 text-center text-[13px] text-fg-subtle">Запись идёт в реальном времени, около {Math.ceil(recordSeconds)} с.</p>
          </div>
        )}

        {recording && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-[14px]">
              <span className="text-fg-muted">Запись видео…</span>
              <span className="font-semibold tabular-nums">{progress}%</span>
            </div>
            <div
              role="progressbar"
              aria-label="Запись видео"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="h-1.5 overflow-hidden rounded-full bg-surface-3"
            >
              <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
            </div>
            <Button block onClick={cancel}>
              Отмена
            </Button>
          </div>
        )}

        {phase === 'done' && videoUrl && (
          <div className="space-y-2">
            <a href={videoUrl} download={`${fileBase}.${ext}`} className={buttonStyles({ variant: 'primary', block: true })}>
              <Download aria-hidden="true" />
              Скачать видео
            </a>
            <Button block icon={<RotateCcw aria-hidden="true" />} onClick={record}>
              Записать заново
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

interface VideoDownloaderModalProps {
  karaoke: Karaoke;
  open: boolean;
  onClose: () => void;
  /** Defaults to the track's own frame (`style.aspectRatio`); applied on every opening. */
  initialFormat?: ExportFormat;
}

/** Export of a track as a watermarked video (canvas + MediaRecorder) or a still .png frame. */
export default function VideoDownloaderModal({ karaoke, open, onClose, initialFormat }: VideoDownloaderModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Скачать видео" description="С водяным знаком «✦ KaraokeCraft» внизу кадра">
      {open && <ExportBody track={karaoke} initialFormat={initialFormat ?? formatForAspect(karaoke.style?.aspectRatio)} />}
    </Modal>
  );
}
