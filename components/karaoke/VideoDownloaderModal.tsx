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

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    setAspectRatio(initialFormat);
  }, [initialFormat]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  if (!isOpen) return null;

  const width = aspectRatio === 'reel' ? 720 : 1280;
  const height = aspectRatio === 'reel' ? 1280 : 720;

  const drawFrame = (ctx: CanvasRenderingContext2D, elapsedSec: number) => {
    ctx.clearRect(0, 0, width, height);

    // 1. Background color from track
    const bgColor = karaoke.style?.backgroundColor || '#1d1b3a';
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // Subtle dark gradient overlay
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, 'rgba(0,0,0,0.2)');
    grad.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // 2. Song Header
    ctx.fillStyle = '#f4f4f5';
    ctx.font = `700 ${aspectRatio === 'reel' ? 36 : 28}px "Unbounded", "Onest", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(karaoke.title, width / 2, aspectRatio === 'reel' ? 120 : 70);

    ctx.fillStyle = '#a1a1aa';
    ctx.font = `500 ${aspectRatio === 'reel' ? 22 : 18}px "Onest", sans-serif`;
    ctx.fillText(karaoke.artist, width / 2, aspectRatio === 'reel' ? 165 : 100);

    // 3. Synced Lyrics
    const activeIdx = karaoke.lyrics.reduce((acc, line, idx) => {
      return elapsedSec >= line.time ? idx : acc;
    }, -1);

    const centerY = aspectRatio === 'reel' ? height / 2 : height / 2 + 30;
    const lineHeight = aspectRatio === 'reel' ? 76 : 60;

    karaoke.lyrics.forEach((line, idx) => {
      const distance = idx - activeIdx;
      const y = centerY + distance * lineHeight;

      if (y > 200 && y < height - 180) {
        const isActive = idx === activeIdx;

        if (isActive) {
          ctx.fillStyle = karaoke.style?.activeColor || '#ffb547';
          ctx.font = `700 ${aspectRatio === 'reel' ? 42 : 34}px "Onest", sans-serif`;
        } else {
          ctx.fillStyle = 'rgba(244, 244, 245, 0.35)';
          ctx.font = `600 ${aspectRatio === 'reel' ? 32 : 26}px "Onest", sans-serif`;
        }

        ctx.textAlign = 'center';
        ctx.fillText(line.text, width / 2, y);
      }
    });

    // 4. Progress bar line at bottom
    const progressPercent = Math.min(1, elapsedSec / (karaoke.duration || 40));
    const barWidth = width * 0.7;
    const barX = (width - barWidth) / 2;
    const barY = height - 100;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, 4, 2);
    ctx.fill();

    ctx.fillStyle = karaoke.style?.activeColor || '#ffb547';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth * progressPercent, 4, 2);
    ctx.fill();

    // 5. MANDATORY WATERMARK ("KaraokeCraft")
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
    ctx.font = '700 14px "Unbounded", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✦ KaraokeCraft', width / 2, wmY + 23);
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

    const canvasStream = canvas.captureStream(30);

    let combinedStream: MediaStream = canvasStream;
    const audioDest = synthPlayer?.getMediaStreamDestination();
    if (audioDest && audioDest.stream.getAudioTracks().length > 0) {
      combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioDest.stream.getAudioTracks(),
      ]);
    }

    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
    }

    const recorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: 3000000,
    });

    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setIsRecording(false);
      setRecordingStatus('Готово к скачиванию!');
      synthPlayer?.stop();
    };

    recorder.start(100);
    synthPlayer?.playPreset(karaoke.audioPreset || 'synthwave', 0);

    const recordDuration = Math.min(karaoke.duration, 40);
    const startTime = performance.now();

    const recordLoop = (currentTime: number) => {
      const elapsed = (currentTime - startTime) / 1000;
      setProgress(Math.min(100, (elapsed / recordDuration) * 100));

      drawFrame(ctx, elapsed);

      if (elapsed < recordDuration && mediaRecorderRef.current?.state === 'recording') {
        animationFrameRef.current = requestAnimationFrame(recordLoop);
      } else {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }
    };

    animationFrameRef.current = requestAnimationFrame(recordLoop);
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
        synthPlayer?.stop();
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
              synthPlayer?.stop();
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
            Видео сохраняются с водяным знаком <strong style={{ color: 'var(--tx)' }}>«✦ KaraokeCraft»</strong> внизу экрана.
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
                  Записать и скачать видео (.webm)
                </>
              )}
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <a
                href={videoUrl}
                download={`${karaoke.title.toLowerCase().replace(/\s+/g, '_')}_watermarked.webm`}
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
