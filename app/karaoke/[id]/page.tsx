'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronLeft, Download, Ellipsis, ListCheck, ListPlus, Maximize2, MessageSquare, Minimize2, Pause, Play, X } from 'lucide-react';
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
  LISTEN_SHARE,
  registerGuestPlay,
  guestPlaysLeft,
  getGuestId,
  getAuthor,
  artistSlug,
  isFollowing,
  toggleFollow,
  getPlaylists,
  getComments,
  GUEST_PLAY_LIMIT,
  updateKaraoke,
} from '@/lib/storage';
import { useAuth } from '@/context/AuthContext';
import { synthPlayer } from '@/lib/audio-synthesizer';
import { isBlobRef, resolveBlobUrl, uploadLocalBlob } from '@/lib/blob-store';
import { ensureStyleFont, fontCss } from '@/lib/fonts';
import { useDownloads } from '@/context/DownloadsContext';
import { QUALITY_OPTIONS, getPreferredQuality, setPreferredQuality } from '@/lib/video-render';
import type { ExportFormat, VideoQuality } from '@/lib/video-render';
import CommentsSection from '@/components/karaoke/CommentsSection';
import PlaylistPicker from '@/components/karaoke/PlaylistPicker';
import Tutorial from '@/components/ui/Tutorial';
import { useDataVersion } from '@/components/DataProvider';

/** «Скачать ▾»: pick the video format; the video is made in the background (see DownloadsContext). */
function DownloadMenu({ onPick, karaokeId }: { onPick: (f: ExportFormat, q: VideoQuality) => void; karaokeId: string }) {
  const { jobs, openPanel } = useDownloads();
  const [quality, setQuality] = useState<VideoQuality>('720p');
  const mine = jobs.find((j) => j.karaoke.id === karaokeId && (j.status === 'rendering' || j.status === 'queued'));
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties | undefined>(undefined);
  const ref = useRef<HTMLDivElement | null>(null);
  // The info column scrolls, so the list is positioned against the viewport instead of being clipped by it.
  const toggle = () => {
    const r = ref.current?.getBoundingClientRect();
    // Opens upward when there is not enough room below the button (the list is ~330 px tall).
    const below = r ? window.innerHeight - r.bottom : 0;
    setPos(
      r && window.innerWidth > 820
        ? below > 340
          ? { position: 'fixed', top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 250) }
          : { position: 'fixed', bottom: window.innerHeight - r.top + 6, left: Math.min(r.left, window.innerWidth - 250), top: 'auto' }
        : undefined
    );
    if (!open) setQuality(getPreferredQuality());
    setOpen(!open);
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const pick = (f: ExportFormat) => {
    setOpen(false);
    onPick(f, quality);
  };
  return (
    <div className="dl-menu" ref={ref}>
      <button className="bt" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        <Download size={16} aria-hidden="true" />
        <span className="t">{mine ? (mine.status === 'queued' ? 'В очереди' : `Видео ${Math.round(mine.progress * 100)}%`) : 'Скачать'}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="dl-list" role="menu" style={pos}>
          <div className="dl-q" role="radiogroup" aria-label="Качество видео">
            {QUALITY_OPTIONS.map((q) => (
              <button
                key={q.id}
                type="button"
                role="radio"
                aria-checked={quality === q.id}
                className={quality === q.id ? 'on' : ''}
                onClick={() => {
                  setQuality(q.id);
                  setPreferredQuality(q.id);
                }}
              >
                <b>{q.label}</b>
                <span>{q.hint}</span>
              </button>
            ))}
          </div>
          <button role="menuitem" onClick={() => pick('reel')}>
            <b>Вертикальное 9:16</b>
            <span>Reels, Shorts, TikTok</span>
          </button>
          <button role="menuitem" onClick={() => pick('landscape')}>
            <b>Горизонтальное 16:9</b>
            <span>YouTube, презентации</span>
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              openPanel();
            }}
          >
            <b>Мои загрузки</b>
            <span>Прогресс и история</span>
          </button>
        </div>
      )}
    </div>
  );
}

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
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const { startDownload } = useDownloads();
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [following, setFollowing] = useState(false);
  const [isSmall, setIsSmall] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  useDataVersion(); // playlist state and review count stay live
  const [guestLeft, setGuestLeft] = useState(GUEST_PLAY_LIMIT);

  const actionsRef = useRef<HTMLDialogElement>(null);
  const reviewsRef = useRef<HTMLDialogElement>(null);
  const playerRef = useRef<HTMLElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeRef = useRef(0);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const linesRef = useRef<(HTMLParagraphElement | null)[]>([]);
  const activeLineIndexRef = useRef<number>(-2);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const finishedRef = useRef(false);
  // Seconds actually played in this run (seeking doesn't add time) and whether the listen was counted.
  const heardRef = useRef(0);
  const listenCountedRef = useRef(false);

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
    setGuestLeft(guestPlaysLeft(item.id));
    ensureStyleFont(item.style);
    resolveBlobUrl(item.audioUrl).then(setAudioSrc);
    incrementViewCount(item.id);
    heardRef.current = 0;
    listenCountedRef.current = false;
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
        // Played to the end: the next run is a new listen.
        heardRef.current = 0;
        listenCountedRef.current = false;
        if (!finishedRef.current) {
          finishedRef.current = true;
          registerInteraction(karaoke.id, actorId, 'finish');
        }
        return;
      }
      setTime(next);
      // A listen counts once the person has really heard LISTEN_SHARE of the track.
      heardRef.current += Math.min(dt, 0.5);
      if (!listenCountedRef.current && heardRef.current >= duration * LISTEN_SHARE) {
        listenCountedRef.current = true;
        registerInteraction(karaoke.id, actorId, 'listen');
        registerListen(karaoke.id, actorId);
      }
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
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
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

  // Files saved before cloud uploads worked live only in the author's browser (`idb:` refs), so
  // other people hear the demo tune. When the author opens the track here, move them to the cloud.
  useEffect(() => {
    if (!karaoke || !user || user.id !== karaoke.authorId) return;
    const audioLocal = isBlobRef(karaoke.audioUrl);
    const fontLocal = isBlobRef(karaoke.style?.fontFile);
    if (!audioLocal && !fontLocal) return;
    let alive = true;
    void (async () => {
      const [audioUrl, fontFile] = await Promise.all([
        audioLocal ? uploadLocalBlob(karaoke.audioUrl, 'audio') : null,
        fontLocal ? uploadLocalBlob(karaoke.style?.fontFile, 'fonts') : null,
      ]);
      if (!alive || (!audioUrl && !fontFile)) return;
      updateKaraoke(karaoke.id, {
        ...(audioUrl ? { audioUrl } : {}),
        ...(fontFile ? { style: { ...karaoke.style, fontFile } } : {}),
      });
      if (audioUrl) showToast('Песня загружена в облако — теперь её слышно на всех устройствах');
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karaoke?.id, user?.id]);

  // A link like /karaoke/{id}#c-{commentId} (from a reply notification) opens the reviews on that comment.
  useEffect(() => {
    if (!karaoke) return;
    const m = window.location.hash.match(/^#c-(.+)$/);
    if (!m) return;
    setHighlightId(decodeURIComponent(m[1]));
    reviewsRef.current?.showModal();
  }, [karaoke]);

  // Fullscreen (not available on iPhone Safari, so the button is hidden there).
  useEffect(() => {
    setCanFullscreen(!!document.fullscreenEnabled);
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void playerRef.current?.requestFullscreen().catch(() => {});
  };

  // Mobile: the info block collapses into a compact row while the lyrics are scrolled.
  // The collapsed header has "weight": scrolling back up only returns to the start of the
  // lyrics; a second, separate pull down (or a tap on the header) opens it again.
  const reachedTopAt = useRef<number | null>(null);
  const pull = useRef<{ startY: number; armed: boolean } | null>(null);
  const wheelPull = useRef({ sum: 0, last: 0 });
  /** Pull distance (px) that opens the header. */
  const PULL_TO_OPEN = 70;

  const handleLyricsScroll = () => {
    if (window.innerWidth > 820) return;
    const top = lyricsContainerRef.current?.scrollTop ?? 0;
    if (top > 40) setIsSmall(true);
    if (top <= 1) reachedTopAt.current ??= performance.now();
    else reachedTopAt.current = null;
  };

  /** At the top already, and since a moment ago (so it is a new gesture, not the same fling). */
  const restingAtTop = () =>
    (lyricsContainerRef.current?.scrollTop ?? 1) <= 1 &&
    reachedTopAt.current !== null &&
    performance.now() - reachedTopAt.current > 250;

  const handleLyricsTouchStart = (e: React.TouchEvent) => {
    pull.current = isSmall ? { startY: e.touches[0].clientY, armed: restingAtTop() } : null;
  };
  const handleLyricsTouchMove = (e: React.TouchEvent) => {
    const p = pull.current;
    if (!p?.armed) return;
    if (e.touches[0].clientY - p.startY > PULL_TO_OPEN) {
      pull.current = null;
      setIsSmall(false);
    }
  };
  // Mouse wheel / touchpad on narrow screens: the same rule with accumulated wheel distance.
  const handleLyricsWheel = (e: React.WheelEvent) => {
    if (!isSmall || e.deltaY >= 0 || !restingAtTop()) return;
    const w = wheelPull.current;
    const now = performance.now();
    if (now - w.last > 400) w.sum = 0;
    w.last = now;
    w.sum += -e.deltaY;
    if (w.sum > PULL_TO_OPEN * 2) {
      w.sum = 0;
      setIsSmall(false);
    }
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

  // Space toggles playback, arrows seek by 5 s (ignored while typing or inside a popup).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, select, button, [contenteditable]') || t.closest('dialog[open]'))) return;
      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 'ArrowRight') handleSeek(timeRef.current + 5);
      else if (e.key === 'ArrowLeft') handleSeek(timeRef.current - 5);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const handleLineClick = (time: number) => {
    if (!isPlaying && !canStartPlayback()) return;
    handleSeek(time + 0.01);
    if (!isPlaying && karaoke) {
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

  const handleOpenDownload = (format: ExportFormat, quality: VideoQuality) => {
    if (!requireAccount('Скачивать видео могут только зарегистрированные пользователи.')) return;
    if (karaoke) startDownload(karaoke, format, quality);
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

  const inPlaylist = !!user && getPlaylists(user.id).some((p) => p.karaokeIds.includes(karaoke.id));
  const reviewCount = getComments(karaoke.id).length;

  const metadata = (
    <>
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
      </p>
      <div className="tg">
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
    </>
  );
  const actions = (
      <div className="pa2" onClick={(event) => {
        // On phones these buttons sit in the bottom sheet, which closes after an action. A button
        // that only opens a menu (Скачать ▾) must keep it open, or the menu vanishes with it.
        const btn = event.target instanceof Element ? event.target.closest('button') : null;
        if (btn && !btn.matches('[aria-haspopup="menu"]') && !btn.closest('.dl-q')) actionsRef.current?.close();
      }}>
        <button className="bt player-like" aria-pressed={isLiked} aria-label="Лайк" onClick={handleLike}>
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          </svg>
          <span className="t">
            {fmt(likesCount)}
          </span>
        </button>

        <DownloadMenu onPick={handleOpenDownload} karaokeId={karaoke.id} />

        <button className="bt" aria-pressed={inPlaylist} onClick={handlePlaylist}>
          {inPlaylist ? <ListCheck size={16} aria-hidden="true" /> : <ListPlus size={16} aria-hidden="true" />}
          <span className="t">{inPlaylist ? 'В плейлисте' : 'В плейлист'}</span>
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

        <button className="bt" aria-haspopup="dialog" onClick={() => reviewsRef.current?.showModal()}>
          <MessageSquare size={16} aria-hidden="true" />
          <span className="t">Отзывы{reviewCount ? ` · ${reviewCount}` : ''}</span>
        </button>
      </div>
  );

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
        ref={playerRef}
        className={isFullscreen ? 'fs' : undefined}
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

        <aside
          className={`pi ${isSmall ? 'sm' : ''}`}
          onClick={(e) => {
            // Tapping the collapsed header (not its buttons or links) opens it.
            if (isSmall && !(e.target as HTMLElement).closest('button, a, dialog')) setIsSmall(false);
          }}
        >
          <Link href="/" className="bt bk" aria-label="Назад в каталог">
            <ChevronLeft aria-hidden="true" size={20} />
            <span className="t">Каталог</span>
          </Link>

          <div
            className={`cv ${cover ? 'img' : ''}`}
            id="pcv"
            style={{ backgroundImage: cover ? `url(${cover})` : `linear-gradient(145deg, ${bg}, ${ac})` }}
          >
            {!cover && karaoke.title[0]}
          </div>

          <div className="tx">
            <h1 id="pt" title={karaoke.title}>{karaoke.title}</h1>
            <p id="pa">
              <Link href={`/artist/${encodeURIComponent(artistSlug(karaoke.artist))}`} className="lk">
                {karaoke.artist}
              </Link>
            </p>
            <div className="player-desktop-meta">{metadata}</div>
          </div>

          <div className="player-desktop-actions">{actions}</div>
          <button type="button" className="player-icon player-more" aria-label="О песне и действия" aria-haspopup="dialog" onClick={() => actionsRef.current?.showModal()}>
            <Ellipsis aria-hidden="true" size={22} />
          </button>
          <dialog ref={actionsRef} className="player-sheet" aria-labelledby="player-sheet-title">
            <div className="player-sheet-heading">
              <h3 id="player-sheet-title">О песне</h3>
              <button type="button" className="player-icon" aria-label="Закрыть" onClick={() => actionsRef.current?.close()}>
                <X aria-hidden="true" size={22} />
              </button>
            </div>
            <div onClick={(event) => {
              if (event.target instanceof Element && event.target.closest('button')) actionsRef.current?.close();
            }}>{metadata}</div>
            {actions}
          </dialog>
        </aside>

        <div
          className="ly"
          id="ly"
          ref={lyricsContainerRef}
          onScroll={handleLyricsScroll}
          onTouchStart={handleLyricsTouchStart}
          onTouchMove={handleLyricsTouchMove}
          onWheel={handleLyricsWheel}
          aria-label="Текст песни"
        >
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

        </div>

        <div className="pc">
          <button className="pp" aria-label={isPlaying ? 'Пауза' : 'Играть'} onClick={handleTogglePlay}>
            {isPlaying ? <Pause size={20} fill="currentColor" aria-hidden="true" /> : <Play size={20} fill="currentColor" aria-hidden="true" />}
          </button>
          <div className="player-timeline">
            <input
              type="range"
              min="0"
              max={duration}
              step="0.1"
              value={currentTime}
              onChange={(e) => handleSeek(parseFloat(e.target.value))}
              aria-label="Перемотка"
              aria-valuetext={`${mm(currentTime)} из ${mm(duration)}`}
              style={{ '--seek-progress': `${(currentTime / duration) * 100}%` } as React.CSSProperties}
            />
            <div className="player-times">
              <span>{mm(currentTime)}</span>
              <span className="player-times-end">
                {mm(duration)}
                {canFullscreen && (
                  <button className="player-fs" aria-label={isFullscreen ? 'Выйти из полноэкранного режима' : 'Во весь экран'} onClick={toggleFullscreen}>
                    {isFullscreen ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
                  </button>
                )}
              </span>
            </div>
          </div>
        </div>

        <dialog ref={reviewsRef} className="player-sheet player-reviews" aria-labelledby="player-reviews-title">
          <div className="player-sheet-heading">
            <h3 id="player-reviews-title">Отзывы{reviewCount ? ` · ${reviewCount}` : ''}</h3>
            <button type="button" className="player-icon" aria-label="Закрыть" onClick={() => reviewsRef.current?.close()}>
              <X aria-hidden="true" size={22} />
            </button>
          </div>
          <CommentsSection karaokeId={karaoke.id} trackAuthorId={karaoke.authorId} highlightId={highlightId} />
        </dialog>
      </section>

      <div className={`ts ${toastMessage ? 'on' : ''}`} id="ts" role="status" aria-live="polite">
        {toastMessage}
      </div>

      {showPlaylists && (
        <PlaylistPicker karaokeId={karaoke.id} onClose={() => setShowPlaylists(false)} onChange={showToast} />
      )}
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
