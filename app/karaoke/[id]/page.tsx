'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Karaoke } from '@/lib/types';
import {
  getKaraokeById,
  canViewKaraoke,
  toggleKaraokeLike,
  hasUserLiked,
  incrementViewCount,
  registerInteraction,
  registerListen,
  registerGuestPlay,
  guestPlaysLeft,
  getGuestId,
  getAuthor,
  artistSlug,
  isFollowing,
  toggleFollow,
  getFollowersCount,
  GUEST_PLAY_LIMIT,
} from '@/lib/storage';
import { useAuth } from '@/context/AuthContext';
import { synthPlayer } from '@/lib/audio-synthesizer';
import { resolveBlobUrl } from '@/lib/blob-store';
import { ensureStyleFont, fontCss } from '@/lib/fonts';
import VideoDownloaderModal from '@/components/karaoke/VideoDownloaderModal';
import CommentsSection from '@/components/karaoke/CommentsSection';
import PlaylistPicker from '@/components/karaoke/PlaylistPicker';
import Tutorial from '@/components/ui/Tutorial';

const fmt = (n: number) =>
  n >= 1000
    ? (n / 1000).toFixed(1).replace('.0', '').replace('.', ',') + ' тыс.'
    : '' + n;

const mm = (s: number) =>
  Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

function KaraokePlayerContent() {
  const params = useParams();
  const { user, openAuthPrompt } = useAuth();
  // Ids made from Cyrillic titles arrive percent-encoded.
  const rawId = (params?.id as string) || '';
  const id = (() => {
    try {
      return decodeURIComponent(rawId);
    } catch {
      return rawId;
    }
  })();

  const [karaoke, setKaraoke] = useState<Karaoke | null>(null);
  const [denied, setDenied] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(40);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isSmallHeader, setIsSmallHeader] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [guestLeft, setGuestLeft] = useState(GUEST_PLAY_LIMIT);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeRef = useRef(0);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const linesRef = useRef<(HTMLParagraphElement | null)[]>([]);
  const activeLineIndexRef = useRef<number>(-2);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const finishedRef = useRef(false);

  const hasAudio = !!audioSrc;
  const actorId = user?.id ?? (typeof window !== 'undefined' ? getGuestId() : 'guest');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 2600);
  };

  const setTime = (t: number) => {
    timeRef.current = t;
    setCurrentTime(t);
  };

  useEffect(() => {
    if (!id) return;
    const item = getKaraokeById(id);
    if (!item || !canViewKaraoke(item, user)) {
      setKaraoke(null);
      setDenied(true);
      return;
    }
    setDenied(false);
    setKaraoke(item);
    setDuration(item.duration || 40);
    setLikesCount(item.likesCount);
    setIsLiked(hasUserLiked(item.id, user?.id));
    setFollowing(isFollowing(user?.id, item.authorId));
    setFollowers(getFollowersCount(item.authorId));
    setGuestLeft(guestPlaysLeft(item.id));
    ensureStyleFont(item.style);
    resolveBlobUrl(item.audioUrl).then(setAudioSrc);
    incrementViewCount(item.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  // Start / stop sound (author's uploaded audio, or the built-in synth preset as a fallback)
  useEffect(() => {
    if (!karaoke) return;
    const audio = audioRef.current;
    if (isPlaying) {
      if (hasAudio && audio) {
        audio.currentTime = timeRef.current;
        void audio.play().catch(() => setIsPlaying(false));
      } else {
        synthPlayer?.playPreset(karaoke.audioPreset || 'synthwave', timeRef.current);
      }
    } else {
      audio?.pause();
      synthPlayer?.stop();
    }
    return () => {
      synthPlayer?.stop();
      audio?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, karaoke?.audioPreset, hasAudio]);

  // Clock: follows the audio element when there is one, otherwise a wall clock.
  useEffect(() => {
    if (!isPlaying || !karaoke) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const audio = audioRef.current;
      const next = hasAudio && audio ? audio.currentTime : timeRef.current + dt;
      if (next >= duration) {
        setIsPlaying(false);
        setTime(0);
        if (!finishedRef.current) {
          finishedRef.current = true;
          registerInteraction(karaoke.id, actorId, 'finish');
        }
        return;
      }
      setTime(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, karaoke, hasAudio, duration]);

  // Active line, auto-scroll and the fill of the current line.
  // Lines that are already sung keep their fill via the `pa` class (see globals.css),
  // and rewinding simply makes them "future" lines again.
  useEffect(() => {
    if (!karaoke) return;
    const lyrics = karaoke.lyrics;

    let activeIdx = -1;
    lyrics.forEach((l, i) => {
      if (l.time <= currentTime) activeIdx = i;
    });

    if (activeIdx !== activeLineIndexRef.current) {
      activeLineIndexRef.current = activeIdx;
      // The fill is an inline --w on each span: sung lines must end at 100% (the last frame of a
      // line rarely lands exactly on its end), and upcoming lines must lose any stale value.
      linesRef.current.forEach((el, i) => {
        const sp = el?.querySelector('span') as HTMLElement | null;
        if (!sp) return;
        if (i < activeIdx) sp.style.setProperty('--w', '100%');
        else if (i > activeIdx) sp.style.removeProperty('--w');
      });
      const activeEl = linesRef.current[activeIdx];
      const container = lyricsContainerRef.current;
      if (activeEl && container) {
        container.scrollTo({
          top: activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2,
          behavior: 'smooth',
        });
      }
    }

    if (activeIdx >= 0 && linesRef.current[activeIdx]) {
      const line = lyrics[activeIdx];
      const end = line.end ?? lyrics[activeIdx + 1]?.time ?? duration;
      const progress = Math.min(100, Math.max(0, ((currentTime - line.time) / Math.max(0.1, end - line.time)) * 100));
      const span = linesRef.current[activeIdx]?.querySelector('span');
      if (span) (span as HTMLElement).style.setProperty('--w', `${progress}%`);
    }
  }, [currentTime, karaoke, duration]);

  const handleLyricsScroll = () => {
    if (typeof window === 'undefined' || window.innerWidth > 820) return;
    const container = lyricsContainerRef.current;
    if (!container) return;
    if (container.scrollTop > 40) setIsSmallHeader(true);
    else if (container.scrollTop < 6) setIsSmallHeader(false);
  };

  // ---- Guest gating ----
  const requireAccount = (reason: string) => {
    if (user) return true;
    openAuthPrompt(reason);
    return false;
  };

  /** Guests get GUEST_PLAY_LIMIT free karaokes; after that registration is required. */
  const canStartPlayback = () => {
    if (!karaoke) return false;
    if (user) return true;
    if (registerGuestPlay(karaoke.id)) {
      setGuestLeft(guestPlaysLeft(karaoke.id));
      return true;
    }
    openAuthPrompt(`Вы уже послушали ${GUEST_PLAY_LIMIT} караоке без регистрации. Зарегистрируйтесь, чтобы слушать дальше.`);
    return false;
  };

  const startPlayback = () => {
    if (!canStartPlayback() || !karaoke) return false;
    registerInteraction(karaoke.id, actorId, 'listen');
    registerListen(karaoke.id, actorId);
    finishedRef.current = false;
    setIsPlaying(true);
    return true;
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (timeRef.current >= duration) setTime(0);
    startPlayback();
  };

  const handleSeek = (time: number) => {
    const clamped = Math.max(0, Math.min(duration, time));
    setTime(clamped);
    if (audioRef.current && hasAudio) audioRef.current.currentTime = clamped;
    else if (isPlaying && karaoke) synthPlayer?.playPreset(karaoke.audioPreset || 'synthwave', clamped);
  };

  const handleLineClick = (time: number) => {
    if (!isPlaying && !canStartPlayback()) return;
    handleSeek(time + 0.01);
    if (!isPlaying && karaoke) {
      registerInteraction(karaoke.id, actorId, 'listen');
    registerListen(karaoke.id, actorId);
      finishedRef.current = false;
      setIsPlaying(true);
    }
  };

  const handleLike = () => {
    if (!karaoke || !requireAccount('Лайки доступны после входа в аккаунт.')) return;
    const res = toggleKaraokeLike(karaoke.id, user!.id);
    setIsLiked(res.isLiked);
    setLikesCount(res.count);
    showToast(res.isLiked ? 'Добавлено в понравившиеся' : 'Удалено из понравившихся');
  };

  const handleOpenDownload = (_format: 'reel' | 'landscape') => {
    if (!requireAccount('Скачивать видео могут только зарегистрированные пользователи.')) return;
    setIsDownloadOpen(true);
  };

  const handleShare = () => {
    if (!karaoke || typeof window === 'undefined') return;
    navigator.clipboard?.writeText(window.location.href);
    registerInteraction(karaoke.id, actorId, 'share');
    showToast('Ссылка скопирована в буфер обмена');
  };

  const handlePlaylist = () => {
    if (!requireAccount('Плейлисты доступны после входа в аккаунт.')) return;
    setShowPlaylists(true);
  };

  const handleFollow = () => {
    if (!karaoke || !requireAccount('Подписываться на авторов можно после входа.')) return;
    const res = toggleFollow(user!.id, karaoke.authorId);
    setFollowing(res.following);
    setFollowers(res.count);
  };

  if (!karaoke) {
    return (
      <div style={{ padding: '80px 20px', textAlign: 'center', minHeight: '60vh' }}>
        <h2 style={{ font: '700 24px var(--fd)', marginBottom: '12px' }}>
          {denied ? 'Караоке недоступно' : 'Загрузка…'}
        </h2>
        {denied && (
          <>
            <p style={{ color: 'var(--mu)', marginBottom: '24px' }}>
              Песня удалена, заблокирована или доступна только автору.
            </p>
            <Link href="/" className="bt pr">
              Вернуться в каталог
            </Link>
          </>
        )}
      </div>
    );
  }

  const author = getAuthor(karaoke);
  const bg = karaoke.style?.backgroundColor || '#1d1b3a';
  const ac = karaoke.style?.activeColor || '#ffb547';
  const cover = karaoke.style?.coverImage;

  let activeIdx = -1;
  karaoke.lyrics.forEach((l, i) => {
    if (l.time <= currentTime) activeIdx = i;
  });

  return (
    <>
      <Tutorial
        page="player"
        steps={[
          { title: 'Плеер', text: 'Строки подсвечиваются в такт музыке. Нажмите на строку, чтобы перейти к ней, или двигайте ползунок.' },
          { title: 'Автор и исполнитель', text: 'Нажмите на имя автора, чтобы открыть его профиль, или на исполнителя — чтобы увидеть все его песни.' },
          { title: 'Плейлисты и скачивание', text: 'Сохраняйте караоке в плейлист и скачивайте видео 9:16 или 16:9. Для этого нужен аккаунт.' },
        ]}
      />
      <section
        id="player"
        style={
          {
            '--pbg': bg,
            '--pact': ac,
            '--ptx': karaoke.style?.textColor || '#f4f4f5',
            '--pf': fontCss(karaoke.style?.font || 'Onest'),
          } as React.CSSProperties
        }
      >
        {audioSrc && (
          <audio
            ref={audioRef}
            src={audioSrc}
            preload="auto"
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) setDuration(d);
            }}
          />
        )}

        <aside className={`pi ${isSmallHeader ? 'sm' : ''}`} id="pi">
          <Link href="/" className="bt bk" aria-label="Назад в каталог">
            <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span className="t">Каталог</span>
          </Link>

          <div
            className={`cv ${cover ? 'img' : ''}`}
            id="pcv"
            style={{ background: cover ? `url(${cover})` : `linear-gradient(145deg, ${bg}, ${ac})` }}
          >
            {!cover && karaoke.title[0]}
          </div>

          <div className="tx">
            <h2 id="pt">{karaoke.title}</h2>
            <p id="pa">
              <Link href={`/artist/${encodeURIComponent(artistSlug(karaoke.artist))}`} className="lk">
                {karaoke.artist}
              </Link>
            </p>
            <p className="sm" style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>Автор:</span>
              {author.username ? (
                <Link href={`/u/${author.username}`} className="lk" style={{ fontWeight: 600 }}>
                  {author.name}
                </Link>
              ) : (
                <span style={{ fontWeight: 600 }}>{author.name}</span>
              )}
              {user?.id !== karaoke.authorId && (
                <button className="bt sm" onClick={handleFollow} aria-pressed={following}>
                  {following ? 'Вы подписаны' : 'Подписаться'}
                </button>
              )}
              <span className="mu">{followers} подп.</span>
            </p>
            <div className="tg" id="pg">
              {karaoke.tags.map((tag) => (
                <Link key={tag} href={`/tag/${encodeURIComponent(tag)}`}>
                  <span>{tag}</span>
                </Link>
              ))}
            </div>
            {!user && (
              <p className="sm" style={{ opacity: 0.8 }}>
                {guestLeft > 0
                  ? `Бесплатных прослушиваний осталось: ${guestLeft}`
                  : 'Бесплатные прослушивания закончились'}
              </p>
            )}
          </div>

          <div className="pa2">
            <button className="bt" id="like" aria-pressed={isLiked} aria-label="Лайк" onClick={handleLike}>
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              </svg>
              <span className="t" id="lk">
                {fmt(likesCount)}
              </span>
            </button>

            <button className="bt dl" aria-label="Скачать видео 9:16" onClick={() => handleOpenDownload('reel')}>
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              <span className="t">Видео 9:16</span>
            </button>

            <button className="bt dl" aria-label="Скачать видео 16:9" onClick={() => handleOpenDownload('landscape')}>
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              <span className="t">Видео 16:9</span>
            </button>

            <button className="bt" aria-label="Добавить в плейлист" onClick={handlePlaylist}>
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 6h13M3 12h13M3 18h9M19 14v6M16 17h6" />
              </svg>
              <span className="t">В плейлист</span>
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

            <button className="bt" aria-label="Комментарии" onClick={() => setShowComments(!showComments)}>
              <span className="t">{showComments ? 'Скрыть отзывы' : 'Отзывы'}</span>
            </button>
          </div>
        </aside>

        <div className="ly" id="ly" ref={lyricsContainerRef} onScroll={handleLyricsScroll} aria-label="Текст песни">
          {karaoke.lyrics.map((line, i) => {
            const lineClass = `ln ${i === activeIdx ? 'on' : ''} ${i < activeIdx ? 'pa' : ''}`.trim();
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

        <div className="pc">
          <button className="pp" id="pp" aria-label={isPlaying ? 'Пауза' : 'Играть'} onClick={handleTogglePlay}>
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
            max={duration}
            step="0.1"
            value={currentTime}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
            aria-label="Перемотка"
          />

          <time id="tm">
            {mm(currentTime)} / {mm(duration)}
          </time>
        </div>
      </section>

      <div className={`ts ${toastMessage ? 'on' : ''}`} id="ts" role="status" aria-live="polite">
        {toastMessage}
      </div>

      {showPlaylists && (
        <PlaylistPicker karaokeId={karaoke.id} onClose={() => setShowPlaylists(false)} onChange={showToast} />
      )}

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
