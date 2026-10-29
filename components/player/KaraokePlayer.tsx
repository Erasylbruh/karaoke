'use client';

import Link from 'next/link';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Download, Heart, MoreHorizontal, Music2, Share2 } from 'lucide-react';
import { LyricCover } from '@/components/karaoke/LyricCover';
import VideoDownloaderModal from '@/components/karaoke/VideoDownloaderModal';
import { Avatar } from '@/components/ui/avatar';
import { Button, buttonStyles } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { IconButton, iconButtonStyles } from '@/components/ui/icon-button';
import { Menu, MenuItem } from '@/components/ui/menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { fontFamilyFor } from '@/lib/fonts';
import { formatCount } from '@/lib/format';
import { trackDuration } from '@/lib/lyrics';
import { incrementViewCount, toggleKaraokeLike } from '@/lib/storage';
import { GUEST_USER_ID, useStoredKaraokes, useStoredLikedIds } from '@/lib/store';
import type { Karaoke, LyricLine } from '@/lib/types';
import { LyricsView } from './LyricsView';
import { PlayerControls } from './PlayerControls';
import { usePlayback } from './usePlayback';

const SKIP_SECONDS = 5;

// Mobile: a 56px top bar and the 72px control bar; desktop: the grid's pt-24 + pb-28.
const LYRICS_HEIGHT = 'h-[calc(100dvh-56px-72px)] lg:h-[calc(100dvh-208px)]';
const CONTENT_GRID = 'wrap lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-16 lg:pt-24 lg:pb-28';

/** Track colours with interface tokens standing in for the ones older saves lack. */
function trackColors(track: Karaoke) {
  const style: Partial<Karaoke['style']> = track.style ?? {};
  return {
    background: style.backgroundColor || 'var(--color-surface-1)',
    text: style.textColor || 'var(--color-fg)',
    active: style.activeColor || 'var(--color-accent)',
  };
}

/** Valid lines in time order: old or hand-edited saves may hold junk or unsorted lines. */
function cleanLines(lyrics: unknown): LyricLine[] {
  if (!Array.isArray(lyrics)) return [];
  return lyrics
    .filter(
      (line): line is LyricLine =>
        !!line && typeof line.text === 'string' && typeof line.time === 'number' && Number.isFinite(line.time),
    )
    .sort((a, b) => a.time - b.time);
}

/** True when a key press goes into a text field or a form control. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;
}

/** Player placeholder with the same layout, shown until the stored tracks are read. */
export function PlayerSkeleton() {
  return (
    <section data-player aria-busy="true" aria-label="Загрузка плеера" className="min-h-dvh bg-ink">
      <div className="wrap flex h-14 items-center gap-3 lg:hidden">
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="size-11 rounded-[10px]" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3.5 w-24" />
        </div>
      </div>
      <div className={CONTENT_GRID}>
        <div className="hidden lg:block">
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <Skeleton className="mt-7 h-7 w-3/4" />
          <Skeleton className="mt-3 h-4 w-1/2" />
          <Skeleton className="mt-5 h-4 w-40" />
          <div className="mt-6 grid grid-cols-2 gap-2">
            <Skeleton className="h-10 rounded-full" />
            <Skeleton className="h-10 rounded-full" />
            <Skeleton className="col-span-2 h-10 rounded-full" />
          </div>
        </div>
        <div className={cn(LYRICS_HEIGHT, 'flex flex-col justify-center gap-5')}>
          {['w-3/5', 'w-4/5', 'w-2/3', 'w-3/4', 'w-1/2'].map((width, index) => (
            <Skeleton key={index} className={cn('h-8 lg:h-10', width)} />
          ))}
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/80 pb-[env(safe-area-inset-bottom)]">
        <div className="wrap flex h-[72px] items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="size-12 rounded-full" />
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-1 flex-1 rounded-full" />
          <Skeleton className="size-10 rounded-full" />
        </div>
      </div>
    </section>
  );
}

function PlayerNotFound() {
  return (
    <section data-player className="grid min-h-dvh place-items-center px-4 text-center">
      <div className="flex max-w-sm flex-col items-center">
        <span className="mb-5 grid size-14 place-items-center rounded-full bg-surface-2 text-fg-muted">
          <Music2 aria-hidden="true" className="size-6" />
        </span>
        <h1 className="font-display text-[24px] font-bold">Караоке не найдено</h1>
        <p className="mt-3 text-[15px] text-fg-muted">Возможно, его удалили или ссылка неверна.</p>
        <Link href="/" className={cn(buttonStyles({ variant: 'primary' }), 'mt-7')}>
          В каталог
        </Link>
      </div>
    </section>
  );
}

interface TrackActionsProps {
  track: Karaoke;
  liked: boolean;
  onLike: () => void;
  onShare: () => void;
  onDownload: () => void;
}

// The info panels do not depend on the clock, so they skip the 60 fps re-renders.
const TrackAside = memo(function TrackAside({ track, liked, onLike, onShare, onDownload }: TrackActionsProps) {
  const { active } = trackColors(track);
  const tags = Array.isArray(track.tags) ? track.tags : [];

  return (
    <aside className="sticky top-24 hidden self-start lg:block">
      <LyricCover track={track} variant="card" className="w-full shadow-pop" />
      <h1 className="mt-7 font-display text-[26px] leading-tight font-bold [overflow-wrap:anywhere]">{track.title}</h1>
      <p className="mt-1.5 text-[16px] opacity-75">{track.artist}</p>
      <p className="mt-4 flex min-w-0 items-center gap-2 text-[14px]">
        <span className="opacity-75">Автор:</span>
        <Avatar name={track.authorName || '?'} src={track.authorAvatar} size={20} />
        <span className="truncate">{track.authorName}</span>
      </p>
      {tags.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-2" aria-label="Теги">
          {tags.map((tag) => (
            <li key={tag}>
              <Link
                href={`/?tag=${encodeURIComponent(tag)}`}
                className="inline-flex h-8 items-center rounded-full bg-white/10 px-3.5 text-[13px] font-medium transition-colors hover:bg-white/20"
              >
                {tag}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button
          variant="glass"
          aria-pressed={liked}
          onClick={onLike}
          icon={<Heart aria-hidden="true" style={liked ? { color: active, fill: active } : undefined} />}
        >
          <span className="sr-only">Нравится,</span>
          {formatCount(track.likesCount ?? 0)}
        </Button>
        <Button variant="glass" onClick={onShare} icon={<Share2 aria-hidden="true" />}>
          Поделиться
        </Button>
        <Button variant="glass" onClick={onDownload} icon={<Download aria-hidden="true" />} className="col-span-2">
          Скачать видео
        </Button>
      </div>
    </aside>
  );
});

const MobileTopBar = memo(function MobileTopBar({ track, liked, onLike, onShare, onDownload }: TrackActionsProps) {
  const { active } = trackColors(track);

  return (
    <div className="wrap sticky top-0 z-20 flex h-14 items-center gap-2.5 lg:hidden">
      <Link href="/" aria-label="В каталог" title="В каталог" className={cn(iconButtonStyles({ variant: 'glass' }), '-ml-1')}>
        <ChevronLeft aria-hidden="true" />
      </Link>
      {/* The tile shares the page colour, so a faint ring keeps its edge. */}
      <LyricCover track={track} variant="thumb" className="size-11 ring-1 ring-white/10" />
      <div className="min-w-0 flex-1 leading-tight">
        <h1 className="truncate text-[15px] font-semibold">{track.title}</h1>
        <p className="truncate text-[13px] opacity-75">{track.artist}</p>
      </div>
      <IconButton
        label="Нравится"
        variant="glass"
        pressed={liked}
        onClick={onLike}
        // The pressed state takes the track's colour rather than the app accent.
        style={liked ? { backgroundColor: `color-mix(in srgb, ${active} 22%, transparent)` } : undefined}
      >
        <Heart aria-hidden="true" style={liked ? { color: active, fill: active } : undefined} />
      </IconButton>
      <Menu label="Ещё" button={<MoreHorizontal aria-hidden="true" />} buttonClassName={iconButtonStyles({ variant: 'glass' })}>
        <MenuItem icon={<Share2 aria-hidden="true" />} onSelect={onShare}>
          Поделиться
        </MenuItem>
        <MenuItem icon={<Download aria-hidden="true" />} onSelect={onDownload}>
          Скачать видео
        </MenuItem>
      </Menu>
    </div>
  );
});

function PlayerView({ track }: { track: Karaoke }) {
  const { user } = useAuth();
  const userId = user?.id ?? GUEST_USER_ID;
  const likedIds = useStoredLikedIds(userId);
  const liked = likedIds?.includes(track.id) ?? false;
  const { show } = useToast();
  const [downloadOpen, setDownloadOpen] = useState(false);

  const lines = useMemo(() => cleanLines(track.lyrics), [track.lyrics]);
  const duration = Number.isFinite(track.duration) && track.duration > 0 ? track.duration : trackDuration(lines);
  const playback = usePlayback({ duration, preset: track.audioPreset });
  const { play, pause, seek, skip, toggle } = playback;
  const colors = trackColors(track);
  const aspect = track.style?.aspectRatio;

  const like = useCallback(() => {
    toggleKaraokeLike(track.id, userId);
  }, [track.id, userId]);

  const share = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      show('Ссылка скопирована', 'success');
    } catch {
      show('Не удалось скопировать ссылку', 'error');
    }
  }, [show]);

  // The exporter plays the backing track itself, so the player falls silent first.
  const openDownload = useCallback(() => {
    pause();
    setDownloadOpen(true);
  }, [pause]);

  const seekLine = useCallback(
    (index: number) => {
      const line = lines[index];
      if (!line) return;
      seek(line.time);
      play();
    },
    [lines, play, seek],
  );

  // Space plays/pauses, ←/→ skip 5 s. Not while typing, in a menu or under a dialog.
  useEffect(() => {
    if (downloadOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target) || document.querySelector('dialog[open]')) return;
      if (event.target instanceof Element && event.target.closest('[role="menu"]')) return;
      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) toggle();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        skip(event.key === 'ArrowLeft' ? -SKIP_SECONDS : SKIP_SECONDS);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [downloadOpen, skip, toggle]);

  return (
    <section data-player className="relative isolate min-h-dvh" style={{ backgroundColor: colors.background, color: colors.text }}>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          backgroundImage: `radial-gradient(60% 50% at 75% 25%, color-mix(in srgb, ${colors.active} 24%, transparent), transparent 70%)`,
        }}
      />

      <MobileTopBar track={track} liked={liked} onLike={like} onShare={share} onDownload={openDownload} />

      <div className={CONTENT_GRID}>
        <TrackAside track={track} liked={liked} onLike={like} onShare={share} onDownload={openDownload} />
        <LyricsView
          lines={lines}
          time={playback.time}
          duration={duration}
          fontFamily={fontFamilyFor(track.style?.font)}
          activeColor={colors.active}
          textColor={colors.text}
          onSeekLine={seekLine}
          className={LYRICS_HEIGHT}
        />
      </div>

      <PlayerControls playback={playback} duration={duration} accent={colors.active} />

      <VideoDownloaderModal
        karaoke={track}
        isOpen={downloadOpen}
        onClose={() => setDownloadOpen(false)}
        initialFormat={aspect === '16:9' || aspect === 'h' ? 'landscape' : 'reel'}
      />
    </section>
  );
}

/** Full-screen player for track `id`, in the track's own colours. */
export function KaraokePlayer({ id }: { id: string }) {
  const items = useStoredKaraokes();
  const track = items?.find((item) => item.id === id) ?? null;
  const found = track !== null;

  // One view per visit; the ref also absorbs the Strict Mode double effect.
  const viewedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!found || viewedRef.current === id) return;
    viewedRef.current = id;
    incrementViewCount(id);
  }, [found, id]);

  if (items === null) return <PlayerSkeleton />;
  if (!track) return <PlayerNotFound />;
  return <PlayerView key={track.id} track={track} />;
}
