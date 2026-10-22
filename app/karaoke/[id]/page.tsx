'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Karaoke } from '@/lib/types';
import { getKaraokeById, toggleKaraokeLike, hasUserLiked, incrementViewCount } from '@/lib/storage';
import { useAuth } from '@/context/AuthContext';
import { synthPlayer } from '@/lib/audio-synthesizer';
import VideoDownloaderModal from '@/components/karaoke/VideoDownloaderModal';
import CommentsSection from '@/components/karaoke/CommentsSection';

const FONT_MAP: Record<string, string> = {
  Onest: '"Onest", system-ui, sans-serif',
  Unbounded: '"Unbounded", "Onest", sans-serif',
  Georgia: 'Georgia, "Times New Roman", serif',
  Mono: 'ui-monospace, Menlo, Consolas, monospace',
  Outfit: '"Outfit", "Onest", sans-serif',
  Inter: '"Inter", system-ui, sans-serif',
};

const fmt = (n: number) =>
  n >= 1000
    ? (n / 1000).toFixed(1).replace('.0', '').replace('.', ',') + ' тыс.'
    : '' + n;

const mm = (s: number) =>
  Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

function KaraokePlayerContent() {
  const params = useParams();
  const { user } = useAuth();
  const id = params?.id as string;

  const [karaoke, setKaraoke] = useState<Karaoke | null>(null);
  const [likesCount, setLikesCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSmallHeader, setIsSmallHeader] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<'reel' | 'landscape'>('reel');
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [showComments, setShowComments] = useState(false);

  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const linesRef = useRef<(HTMLParagraphElement | null)[]>([]);
  const activeLineIndexRef = useRef<number>(-2);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 2600);
  };

  useEffect(() => {
    if (!id) return;
    const item = getKaraokeById(id);
    if (item) {
      setKaraoke(item);
      setLikesCount(item.likesCount);
      setIsLiked(hasUserLiked(item.id, user?.id));
      incrementViewCount(item.id);
    }
  }, [id, user?.id]);

  // Audio synthesizer playback loop
  useEffect(() => {
    if (!karaoke) return;
    const dur = karaoke.duration || 40;

    const interval = setInterval(() => {
      if (!isPlaying) return;

      setCurrentTime((prev) => {
        const next = prev + 0.1;
        if (next >= dur) {
          setIsPlaying(false);
          synthPlayer?.stop();
          return 0;
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, karaoke]);

  // Audio synths trigger
  useEffect(() => {
    if (!karaoke) return;
    if (isPlaying) {
      synthPlayer?.playPreset(karaoke.audioPreset || 'synthwave', currentTime);
    } else {
      synthPlayer?.stop();
    }
    return () => {
      synthPlayer?.stop();
    };
  }, [isPlaying, karaoke?.audioPreset]);

  // Update line highlights, scroll, and gradient wipe (--w)
  useEffect(() => {
    if (!karaoke) return;
    const dur = karaoke.duration || 40;
    const lyrics = karaoke.lyrics;

    let activeIdx = -1;
    lyrics.forEach((l, i) => {
      if (l.time <= currentTime) activeIdx = i;
    });

    // Check if active index changed
    if (activeIdx !== activeLineIndexRef.current) {
      activeLineIndexRef.current = activeIdx;
      const activeEl = linesRef.current[activeIdx];
      const container = lyricsContainerRef.current;
      if (activeEl && container) {
        container.scrollTo({
          top: activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2,
          behavior: 'smooth',
        });
      }
    }

    // Update active line progressive wipe percentage
    if (activeIdx >= 0 && linesRef.current[activeIdx]) {
      const start = lyrics[activeIdx].time;
      const end = lyrics[activeIdx + 1] ? lyrics[activeIdx + 1].time : dur;
      const progress = Math.min(100, Math.max(0, ((currentTime - start) / (end - start)) * 111));
      const span = linesRef.current[activeIdx]?.querySelector('span');
      if (span) {
        (span as HTMLElement).style.setProperty('--w', `${progress}%`);
      }
    }
  }, [currentTime, karaoke]);

  // Mobile scroll collapse
  const handleLyricsScroll = () => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth > 820) return;
    const container = lyricsContainerRef.current;
    if (!container) return;
    if (container.scrollTop > 40) {
      setIsSmallHeader(true);
    } else if (container.scrollTop < 6) {
      setIsSmallHeader(false);
    }
  };

  const handleTogglePlay = () => {
    if (!isPlaying && currentTime >= (karaoke?.duration || 40)) {
      setCurrentTime(0);
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (time: number) => {
    const dur = karaoke?.duration || 40;
    const clamped = Math.max(0, Math.min(dur, time));
    setCurrentTime(clamped);
    if (isPlaying && karaoke) {
      synthPlayer?.playPreset(karaoke.audioPreset || 'synthwave', clamped);
    }
  };

  const handleLineClick = (time: number) => {
    handleSeek(time + 0.01);
    if (!isPlaying) {
      setIsPlaying(true);
    }
  };

  const handleLike = () => {
    if (!karaoke) return;
    const userId = user?.id || 'guest-user';
    const res = toggleKaraokeLike(karaoke.id, userId);
    setIsLiked(res.isLiked);
    setLikesCount(res.count);
    showToast(res.isLiked ? 'Добавлено в понравившиеся' : 'Удалено из понравившихся');
  };

  const handleOpenDownload = (format: 'reel' | 'landscape') => {
    setDownloadFormat(format);
    setIsDownloadOpen(true);
  };

  const handleShare = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard?.writeText(window.location.href);
      showToast('Ссылка скопирована в буфер обмена');
    }
  };

  if (!karaoke) {
    return (
      <div style={{ padding: '80px 20px', textAlign: 'center', minHeight: '60vh' }}>
        <h2 style={{ font: '700 24px var(--fd)', marginBottom: '12px' }}>Караоке не найдено</h2>
        <p style={{ color: 'var(--mu)', marginBottom: '24px' }}>
          Возможно, песня была удалена или ссылка неверна.
        </p>
        <Link href="/" className="bt pr">
          Вернуться в каталог
        </Link>
      </div>
    );
  }

  const bg = karaoke.style?.backgroundColor || '#1d1b3a';
  const ac = karaoke.style?.activeColor || '#ffb547';
  const fontKey = karaoke.style?.font || 'Onest';
  const fontCss = FONT_MAP[fontKey] || FONT_MAP.Onest;
  const dur = karaoke.duration || 40;

  let activeIdx = -1;
  karaoke.lyrics.forEach((l, i) => {
    if (l.time <= currentTime) activeIdx = i;
  });

  return (
    <>
      <section
        id="player"
        style={
          {
            '--pbg': bg,
            '--pact': ac,
            '--ptx': '#f4f4f5',
            '--pf': fontCss,
          } as React.CSSProperties
        }
      >
        <aside className={`pi ${isSmallHeader ? 'sm' : ''}`} id="pi">
          <Link href="/" className="bt bk" aria-label="Назад в каталог">
            <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span className="t">Каталог</span>
          </Link>

          <div
            className="cv"
            id="pcv"
            style={{
              background: `linear-gradient(145deg, ${bg}, ${ac})`,
            }}
          >
            {karaoke.title[0]}
          </div>

          <div className="tx">
            <h2 id="pt">{karaoke.title}</h2>
            <p id="pa">{karaoke.artist}</p>
            <div className="tg" id="pg">
              {karaoke.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>

          <div className="pa2">
            <button
              className="bt"
              id="like"
              aria-pressed={isLiked}
              aria-label="Лайк"
              onClick={handleLike}
            >
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              </svg>
              <span className="t" id="lk">
                {fmt(likesCount)}
              </span>
            </button>

            <button
              className="bt dl"
              aria-label="Скачать видео 9:16"
              onClick={() => handleOpenDownload('reel')}
            >
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              <span className="t">Видео 9:16</span>
            </button>

            <button
              className="bt dl"
              aria-label="Скачать видео 16:9"
              onClick={() => handleOpenDownload('landscape')}
            >
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              <span className="t">Видео 16:9</span>
            </button>

            <button className="bt" aria-label="Поделиться" onClick={handleShare}>
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              <span className="t">Поделиться</span>
            </button>

            <button
              className="bt"
              aria-label="Комментарии"
              onClick={() => setShowComments(!showComments)}
            >
              <span className="t">{showComments ? 'Скрыть отзывы' : 'Отзывы'}</span>
            </button>
          </div>
        </aside>

        {/* Masked Synced Lyrics Container */}
        <div
          className="ly"
          id="ly"
          ref={lyricsContainerRef}
          onScroll={handleLyricsScroll}
          aria-label="Текст песни"
        >
          {karaoke.lyrics.map((line, i) => {
            const isLineActive = i === activeIdx;
            const isLinePast = i < activeIdx;
            const lineClass = `ln ${isLineActive ? 'on' : ''} ${isLinePast ? 'pa' : ''}`.trim();

            return (
              <p
                key={line.id || i}
                ref={(el) => {
                  linesRef.current[i] = el;
                }}
                className={lineClass}
                onClick={() => handleLineClick(line.time)}
              >
                <span>{line.text}</span>
              </p>
            );
          })}

          {showComments && (
            <div style={{ marginTop: '80px', paddingBottom: '40px', maxWidth: '600px' }}>
              <CommentsSection karaokeId={karaoke.id} />
            </div>
          )}
        </div>

        {/* Floating Player Control Bar */}
        <div className="pc">
          <button
            className="pp"
            id="pp"
            aria-label={isPlaying ? 'Пауза' : 'Играть'}
            onClick={handleTogglePlay}
          >
            {isPlaying ? (
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                <polygon points="6 3 20 12 6 21 6 3" />
              </svg>
            )}
          </button>

          <input
            id="sk"
            type="range"
            min="0"
            max={dur}
            step="0.1"
            value={currentTime}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
            aria-label="Перемотка"
          />

          <time id="tm">
            {mm(currentTime)} / {mm(dur)}
          </time>
        </div>
      </section>

      {/* Toast Notification */}
      <div className={`ts ${toastMessage ? 'on' : ''}`} id="ts" role="status" aria-live="polite">
        {toastMessage}
      </div>

      {/* Video Downloader Modal */}
      <VideoDownloaderModal
        karaoke={karaoke}
        isOpen={isDownloadOpen}
        onClose={() => setIsDownloadOpen(false)}
      />
    </>
  );
}

export default function KaraokePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '80vh' }} />}>
      <KaraokePlayerContent />
    </Suspense>
  );
}
