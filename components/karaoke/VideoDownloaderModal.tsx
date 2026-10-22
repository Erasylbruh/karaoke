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
}

export default function VideoDownloaderModal({
  karaoke,
  isOpen,
  onClose,
}: VideoDownloaderModalProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<string>('Готов к записи');
  const [aspectRatio, setAspectRatio] = useState<'reel' | 'landscape'>('reel');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);

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

    // 1. Clean Minimalist Background
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#09090b');
    grad.addColorStop(1, '#18181b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // 2. Song Header
    ctx.fillStyle = '#f4f4f5';
    ctx.font = `bold ${aspectRatio === 'reel' ? 34 : 28}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(karaoke.title, width / 2, aspectRatio === 'reel' ? 120 : 70);

    ctx.fillStyle = '#a1a1aa';
    ctx.font = `500 ${aspectRatio === 'reel' ? 22 : 18}px sans-serif`;
    ctx.fillText(karaoke.artist, width / 2, aspectRatio === 'reel' ? 165 : 100);

    // 3. Spotify Lyrics Animation
    const activeIdx = karaoke.lyrics.reduce((acc, line, idx) => {
      return elapsedSec >= line.time ? idx : acc;
    }, -1);

    const centerY = aspectRatio === 'reel' ? height / 2 : height / 2 + 30;
    const lineHeight = aspectRatio === 'reel' ? 72 : 58;

    karaoke.lyrics.forEach((line, idx) => {
      const distance = idx - activeIdx;
      const y = centerY + distance * lineHeight;

      if (y > 220 && y < height - 190) {
        const isActive = idx === activeIdx;

        if (isActive) {
          ctx.fillStyle = karaoke.style.activeColor || '#22c55e';
          ctx.font = `700 ${aspectRatio === 'reel' ? 40 : 32}px sans-serif`;
        } else {
          ctx.fillStyle = '#71717a';
          ctx.font = `500 ${aspectRatio === 'reel' ? 30 : 24}px sans-serif`;
        }

        ctx.textAlign = 'center';
        ctx.fillText(line.text, width / 2, y);
      }
    });

    // 4. Progress bar line at bottom
    const progressPercent = Math.min(1, elapsedSec / (karaoke.duration || 60));
    const barWidth = width * 0.7;
    const barX = (width - barWidth) / 2;
    const barY = height - 110;

    ctx.fillStyle = '#27272a';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, 4, 2);
    ctx.fill();

    ctx.fillStyle = karaoke.style.activeColor || '#22c55e';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth * progressPercent, 4, 2);
    ctx.fill();

    // 5. MANDATORY WATERMARK (Минималистичный защитный водяной знак)
    const wmWidth = 300;
    const wmHeight = 40;
    const wmX = (width - wmWidth) / 2;
    const wmY = height - 70;

    ctx.fillStyle = '#18181b';
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(wmX, wmY, wmWidth, wmHeight, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#22c55e';
    ctx.font = '600 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✦ KaraokeCraft • Spotify Lyrics', width / 2, wmY + 25);
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

    drawFrame(ctx, karaoke.lyrics[0]?.time || 5);

    const dataUrl = canvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${karaoke.title.toLowerCase().replace(/\s+/g, '_')}_watermarked.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
      <div className="relative w-full max-w-xl rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-green-500" />
            <div>
              <h3 className="font-semibold text-base text-zinc-100">Скачать видео караоке</h3>
              <p className="text-xs text-zinc-400">С водяным знаком KaraokeCraft</p>
            </div>
          </div>
          <button
            onClick={() => {
              synthPlayer?.stop();
              onClose();
            }}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Format Selector */}
        <div className="mt-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-2">
              Формат видео
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAspectRatio('reel')}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  aspectRatio === 'reel'
                    ? 'bg-green-500/5 border-green-500 text-zinc-100'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="font-medium text-sm text-zinc-200">Вертикальный (9:16)</div>
                <div className="text-xs text-zinc-500">Reels, Shorts, TikTok</div>
              </button>

              <button
                type="button"
                onClick={() => setAspectRatio('landscape')}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  aspectRatio === 'landscape'
                    ? 'bg-green-500/5 border-green-500 text-zinc-100'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="font-medium text-sm text-zinc-200">Горизонтальный (16:9)</div>
                <div className="text-xs text-zinc-500">YouTube, мониторы</div>
              </button>
            </div>
          </div>

          {/* Watermark Notice */}
          <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed text-zinc-400">
              Видео сохраняются с водяным знаком <span className="text-zinc-200 font-medium">«✦ KaraokeCraft»</span> в нижней части экрана.
            </div>
          </div>

          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="hidden"
          />

          {/* Progress / Status */}
          {isRecording && (
            <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 text-green-500 animate-spin" />
                  {recordingStatus}
                </span>
                <span className="font-mono text-zinc-400">{Math.round(progress)}%</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Download Buttons */}
          <div className="space-y-2.5 pt-1">
            {!videoUrl ? (
              <button
                type="button"
                onClick={handleStartRecord}
                disabled={isRecording}
                className="w-full py-2.5 px-4 rounded-lg bg-green-500 hover:bg-green-600 text-black font-medium text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isRecording ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Запись видео...
                  </>
                ) : (
                  <>
                    <Video className="w-4 h-4" />
                    Записать и скачать видео (.webm)
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-2">
                <a
                  href={videoUrl}
                  download={`${karaoke.title.toLowerCase().replace(/\s+/g, '_')}_watermarked.webm`}
                  className="w-full py-2.5 px-4 rounded-lg bg-green-500 hover:bg-green-600 text-black font-medium text-sm transition-colors flex items-center justify-center gap-2 text-center"
                >
                  <Download className="w-4 h-4" />
                  Скачать видео на устройство
                </a>
                <button
                  type="button"
                  onClick={handleStartRecord}
                  className="w-full py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium border border-zinc-700 transition-colors"
                >
                  Записать заново
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleDownloadSnapshot}
              className="w-full py-2 px-4 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors flex items-center justify-center gap-2"
            >
              <FileImage className="w-3.5 h-3.5 text-zinc-400" />
              Скачать снимок кадра (.png)
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
