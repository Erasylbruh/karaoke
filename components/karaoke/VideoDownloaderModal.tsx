'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Download, 
  Video, 
  ShieldCheck, 
  Loader2, 
  FileImage 
} from 'lucide-react';
import { Karaoke } from '@/lib/types';
import { synthPlayer } from '@/lib/audio-synthesizer';
import { resolveBlobUrl } from '@/lib/blob-store';
import fixWebmDuration from 'fix-webm-duration';
import { fontCss } from '@/lib/fonts';

/** Space between lyric lines in the video, as a share of the font size. */
const LINE_GAP_EM = 0.05;

/** Splits a lyric line into rows that fit `maxW` (uses the context's current font). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/s+/).filter(Boolean);
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

const FPS = 30;

/**
 * Frame clock running in a Worker: unlike requestAnimationFrame it keeps ticking when the tab is
 * not in front, so the video doesn't freeze or drop to a few frames per second.
 */
function startTicker(onTick: () => void): () => void {
  const src = `let t=setInterval(()=>postMessage(0),${Math.round(1000 / FPS)});onmessage=()=>clearInterval(t);`;
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  const worker = new Worker(url);
  worker.onmessage = onTick;
  return () => {
    worker.terminate();
    URL.revokeObjectURL(url);
  };
}
import { registerDownload, getGuestId } from '@/lib/storage';
import { useAuth } from '@/context/AuthContext';

interface VideoDownloaderModalProps {
  karaoke: Karaoke;
  isOpen: boolean;
  onClose: () => void;
  initialFormat?: 'reel' | 'landscape';
}

export default function VideoDownloaderModal({
  karaoke,
  isOpen,
  onClose,
  initialFormat = 'reel',
}: VideoDownloaderModalProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<string>('Готов к записи');
  const [aspectRatio, setAspectRatio] = useState<'reel' | 'landscape'>(initialFormat);
  const { user } = useAuth();
  const trackDownload = () => registerDownload(karaoke.id, user?.id ?? getGuestId());

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const stopTickerRef = useRef<(() => void) | null>(null);
  const trackAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [fileExt, setFileExt] = useState('webm');

  /** Stops whatever is producing sound for the recording (uploaded track or synth). */
  const stopSound = () => {
    synthPlayer?.stop();
    trackAudioRef.current?.pause();
    trackAudioRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  };

  useEffect(() => {
    setAspectRatio(initialFormat);
  }, [initialFormat]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      stopTickerRef.current?.();
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  if (!isOpen) return null;

  const width = aspectRatio === 'reel' ? 720 : 1280;
  const height = aspectRatio === 'reel' ? 1280 : 720;

  const drawFrame = (ctx: CanvasRenderingContext2D, elapsedSec: number, totalSec = karaoke.duration || 40) => {
    const reel = aspectRatio === 'reel';
    const unit = Math.min(width, height) / 100;
    const ac = karaoke.style?.activeColor || '#ffb547';
    const tx = karaoke.style?.textColor || '#f4f4f5';
    const font = fontCss(karaoke.style?.font || 'Onest');
    const padX = reel ? width * 0.09 : width * 0.1;
    const maxW = width - padX * 2;

    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // 1. Background color from track + soft dark gradient
    ctx.fillStyle = karaoke.style?.backgroundColor || '#1d1b3a';
    ctx.fillRect(0, 0, width, height);
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, 'rgba(0,0,0,0.2)');
    grad.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // 2. Header, left-aligned: title, artist and the watermark right under them.
    const headTop = reel ? unit * 16 : unit * 12;
    ctx.fillStyle = '#f4f4f5';
    ctx.font = `700 ${reel ? 36 : 28}px "Unbounded", "Onest", sans-serif`;
    ctx.fillText(fitText(ctx, karaoke.title, maxW), padX, headTop);
    ctx.fillStyle = '#a1a1aa';
    ctx.font = `500 ${reel ? 22 : 18}px "Onest", sans-serif`;
    ctx.fillText(fitText(ctx, karaoke.artist, maxW), padX, headTop + (reel ? 40 : 32));

    // Watermark: small logo bars + wordmark. It is part of the header, so it can't be cropped
    // away without also cutting the title.
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

    // 3. Synced lyrics, styled like the player: left-aligned, one size, wrapped lines,
    // the current line fills left to right in the accent colour.
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

    const activeIdx = lyrics.reduce((a, line, idx) => (elapsedSec >= line.time ? idx : a), -1);

    // Smooth scroll: glide from the previous line to the active one over 0.35 s.
    const SCROLL = 0.35;
    let offset = 0;
    if (activeIdx >= 0) {
      const from = activeIdx > 0 ? tops[activeIdx - 1] : tops[0] - rowH - gap;
      const k = Math.min(1, (elapsedSec - lyrics[activeIdx].time) / SCROLL);
      const ease = 1 - Math.pow(1 - k, 3);
      offset = from + (tops[activeIdx] - from) * ease;
    } else {
      offset = tops[0] - rowH - gap;
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
      const bottom = top + b.rows.length * rowH;
      if (bottom < minY - fontSize || top > maxY + fontSize) return;

      // Fill progress of this line (0..1), same rule as in the browser player.
      let p = 0;
      let alpha = 0.3;
      if (idx < activeIdx) {
        p = 1;
        alpha = 0.85;
      } else if (idx === activeIdx) {
        const line = lyrics[idx];
        const end = line.end ?? lyrics[idx + 1]?.time ?? totalSec;
        p = Math.min(1, Math.max(0, (elapsedSec - line.time) / Math.max(0.1, end - line.time)));
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

    // 4. Progress bar at the bottom
    const progressPercent = Math.min(1, elapsedSec / totalSec);
    const barY = height - (reel ? unit * 18 : unit * 8);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.roundRect(padX, barY, maxW, 4, 2);
    ctx.fill();
    ctx.fillStyle = ac;
    ctx.beginPath();
    ctx.roundRect(padX, barY, maxW * progressPercent, 4, 2);
    ctx.fill();
  };

  const handleStartRecord = async () => {
    if (!canvasRef.current) return;
    setIsRecording(true);
    setProgress(0);
    setVideoUrl(null);
    setRecordingStatus('Генерация видео...');
    recordedChunksRef.current = [];

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const canvasStream = canvas.captureStream(FPS);

    // Sound: the track's own uploaded audio, captured silently through Web Audio;
    // the built-in synth preset only when the project has no audio file.
    let audioTracks: MediaStreamTrack[] = [];
    let trackAudio: HTMLAudioElement | null = null;
    const audioSrc = await resolveBlobUrl(karaoke.audioUrl);
    if (audioSrc) {
      try {
        trackAudio = new Audio();
        trackAudio.crossOrigin = 'anonymous';
        trackAudio.preload = 'auto';
        trackAudio.src = audioSrc;
        await new Promise<void>((resolve, reject) => {
          trackAudio!.oncanplaythrough = () => resolve();
          trackAudio!.onerror = () => reject(new Error('audio'));
          trackAudio!.load();
        });
        const actx = new AudioContext();
        const source = actx.createMediaElementSource(trackAudio);
        const dest = actx.createMediaStreamDestination();
        source.connect(dest);
        audioCtxRef.current = actx;
        trackAudioRef.current = trackAudio;
        audioTracks = dest.stream.getAudioTracks();
      } catch {
        trackAudio = null;
        setRecordingStatus('Не удалось загрузить аудио трека, видео будет с демо-мелодией');
      }
    }
    if (!trackAudio) {
      const synthDest = synthPlayer?.getMediaStreamDestination();
      audioTracks = synthDest ? synthDest.stream.getAudioTracks() : [];
    }
    const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);

    const mimeType =
      // MP4 (H.264 + AAC) plays everywhere, including phones and Instagram/TikTok uploads; WebM is the fallback.
      ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'].find((t) =>
        MediaRecorder.isTypeSupported(t)
      ) || 'video/webm';
    setFileExt(mimeType.startsWith('video/mp4') ? 'mp4' : 'webm');

    const recorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: 5_000_000,
      audioBitsPerSecond: 160_000,
    });

    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    let recordedMs = 0;
    recorder.onstop = async () => {
      stopTickerRef.current?.();
      stopTickerRef.current = null;
      let blob = new Blob(recordedChunksRef.current, { type: mimeType });
      // MediaRecorder writes WebM without a duration, so players can't seek or show the length.
      if (mimeType.startsWith('video/webm')) {
        blob = await fixWebmDuration(blob, recordedMs, { logger: false });
      }
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setIsRecording(false);
      setRecordingStatus('Готово к скачиванию!');
      stopSound();
    };

    recorder.start(1000);
    // Full length of the song; the clock follows the audio so lyrics stay in sync with the sound.
    const recordDuration =
      trackAudio && Number.isFinite(trackAudio.duration) && trackAudio.duration > 0 ? trackAudio.duration : karaoke.duration || 40;
    if (trackAudio) {
      trackAudio.currentTime = 0;
      await trackAudio.play();
    } else {
      synthPlayer?.playPreset(karaoke.audioPreset || 'synthwave', 0);
    }
    const startTime = performance.now();
    let lastProgress = 0;

    // Make sure the project's font is ready, otherwise the first frames use a fallback font.
    await document.fonts.load(`700 40px ${fontCss(karaoke.style?.font || 'Onest')}`).catch(() => undefined);
    drawFrame(ctx, 0, recordDuration);
    stopTickerRef.current = startTicker(() => {
      const now = performance.now();
      const elapsed = trackAudio ? trackAudio.currentTime : (now - startTime) / 1000;
      drawFrame(ctx, elapsed, recordDuration);
      if (now - lastProgress > 250) {
        lastProgress = now;
        setProgress(Math.min(100, (elapsed / recordDuration) * 100));
      }
      const finished = elapsed >= recordDuration || (trackAudio?.ended ?? false);
      if (finished && mediaRecorderRef.current?.state === 'recording') {
        recordedMs = now - startTime;
        stopTickerRef.current?.();
        stopTickerRef.current = null;
        setProgress(100);
        mediaRecorderRef.current.stop();
      }
    });
  };

  const handleDownloadSnapshot = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    drawFrame(ctx, karaoke.lyrics[0]?.time || 4);

    const dataUrl = canvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${karaoke.title.toLowerCase().replace(/\s+/g, '_')}_watermarked.png`;
    a.click();
    trackDownload();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(9, 9, 11, 0.78)',
        backdropFilter: 'blur(8px)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 100,
        padding: '16px',
      }}
      onClick={() => {
        stopSound();
        onClose();
      }}
    >
      <div
        style={{
          background: 'var(--s1)',
          border: '1px solid var(--ln)',
          borderRadius: '24px',
          padding: '28px',
          maxWidth: '520px',
          width: '100%',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h3 style={{ margin: 0, font: '700 18px var(--fd)' }}>Скачать видео</h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--mu)' }}>
              С защитным водяным знаком KaraokeCraft
            </p>
          </div>
          <button
            onClick={() => {
              stopSound();
              onClose();
            }}
            style={{
              background: 'none',
              border: 0,
              color: 'var(--mu)',
              padding: '4px',
              borderRadius: '50%',
            }}
          >
            <X style={{ width: '20px', height: '20px' }} />
          </button>
        </div>

        {/* Format Selector */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', color: 'var(--mu)', marginBottom: '8px' }}>Формат видео</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setAspectRatio('reel')}
              className={`bt ${aspectRatio === 'reel' ? 'pr' : ''}`}
              style={{
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '12px 14px',
                borderRadius: '14px',
                height: 'auto',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Вертикальный (9:16)</span>
              <span style={{ fontSize: '12px', opacity: 0.8 }}>Reels, Shorts, TikTok</span>
            </button>

            <button
              type="button"
              onClick={() => setAspectRatio('landscape')}
              className={`bt ${aspectRatio === 'landscape' ? 'pr' : ''}`}
              style={{
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '12px 14px',
                borderRadius: '14px',
                height: 'auto',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Горизонтальный (16:9)</span>
              <span style={{ fontSize: '12px', opacity: 0.8 }}>YouTube, мониторы</span>
            </button>
          </div>
        </div>

        {/* Watermark Notice */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: '12px',
            background: 'var(--s2)',
            border: '1px solid var(--ln)',
            fontSize: '13px',
            color: 'var(--mu)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px',
          }}
        >
          <ShieldCheck style={{ width: '18px', height: '18px', color: 'var(--ac)', flexShrink: 0 }} />
          <span>
            Видео сохраняются с водяным знаком <strong style={{ color: 'var(--tx)' }}>«KaraokeCraft»</strong> под названием и исполнителем.
          </span>
        </div>

        <canvas ref={canvasRef} width={width} height={height} style={{ display: 'none' }} />

        {/* Progress / Status */}
        {isRecording && (
          <div
            style={{
              padding: '14px',
              borderRadius: '12px',
              background: 'var(--s2)',
              border: '1px solid var(--ln)',
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Loader2 style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} />
                {recordingStatus}
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(progress)}%</span>
            </div>
            <div style={{ width: '100%', height: '6px', background: 'var(--s1)', borderRadius: '999px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: 'var(--ac)',
                  transition: 'width 0.2s linear',
                }}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {!videoUrl ? (
            <button
              type="button"
              onClick={handleStartRecord}
              disabled={isRecording}
              className="bt pr"
              style={{ width: '100%', padding: '12px' }}
            >
              {isRecording ? (
                <>
                  <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                  Запись видео...
                </>
              ) : (
                <>
                  <Video style={{ width: '16px', height: '16px' }} />
                  Записать видео со звуком
                </>
              )}
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <a
                href={videoUrl}
                download={`${karaoke.title.toLowerCase().replace(/\s+/g, '_')}_watermarked.${fileExt}`}
                onClick={trackDownload}
                className="bt pr"
                style={{ width: '100%', padding: '12px', textAlign: 'center' }}
              >
                <Download style={{ width: '16px', height: '16px' }} />
                Скачать видео на устройство
              </a>
              <button
                type="button"
                onClick={handleStartRecord}
                className="bt"
                style={{ width: '100%', padding: '10px' }}
              >
                Записать заново
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleDownloadSnapshot}
            className="bt"
            style={{ width: '100%', padding: '10px' }}
          >
            <FileImage style={{ width: '16px', height: '16px' }} />
            Скачать снимок кадра (.png)
          </button>
        </div>
      </div>
    </div>
  );
}
