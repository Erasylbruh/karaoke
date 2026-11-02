'use client';

import type { CSSProperties, KeyboardEvent } from 'react';
import { Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { formatTime } from '@/lib/format';
import type { Playback } from './usePlayback';

const SKIP_SECONDS = 5;

export interface PlayerControlsProps {
  playback: Playback;
  duration: number;
  /** The track's active colour: fills the sliders. */
  accent: string;
}

/** Ranges are drawn by `.range` in globals.css; the fill takes the track's colour instead of the app accent. */
function rangeStyle(fill: number, accent: string): CSSProperties {
  // A fallback of `var(--color-accent)` must not be assigned to itself (a cycle voids the variable).
  const style: Record<string, string> = { '--fill': `${fill}%` };
  if (!accent.includes('--color-accent')) {
    style['--color-accent'] = accent;
    style.accentColor = accent;
  }
  return style as CSSProperties;
}

/** Glass control bar fixed to the bottom of the player: skip, play/pause, seek and volume. */
export function PlayerControls({ playback, duration, accent }: PlayerControlsProps) {
  const { time, isPlaying, volume, muted } = playback;
  const shown = Math.min(time, duration);
  const fill = duration > 0 ? (shown / duration) * 100 : 0;
  const silent = muted || volume === 0;
  const level = muted ? 0 : volume;

  // A native step of 0.1 s makes arrow keys useless on the seek bar; they skip like the page shortcuts.
  function onSeekKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    playback.skip(event.key === 'ArrowLeft' ? -SKIP_SECONDS : SKIP_SECONDS);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/35 pb-[env(safe-area-inset-bottom)] text-white backdrop-blur-xl">
      <div className="wrap flex h-[72px] items-center gap-2 sm:gap-3">
        <IconButton label="Назад на 5 секунд" variant="glass" onClick={() => playback.skip(-SKIP_SECONDS)}>
          <RotateCcw aria-hidden="true" />
        </IconButton>
        <button
          type="button"
          aria-label={isPlaying ? 'Пауза' : 'Играть'}
          title={isPlaying ? 'Пауза' : 'Играть'}
          onClick={playback.toggle}
          className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-black transition-transform duration-150 hover:scale-105 active:scale-95"
        >
          {isPlaying ? (
            <Pause aria-hidden="true" className="size-5 fill-current" />
          ) : (
            <Play aria-hidden="true" className="size-5 translate-x-px fill-current" />
          )}
        </button>
        <IconButton label="Вперёд на 5 секунд" variant="glass" onClick={() => playback.skip(SKIP_SECONDS)}>
          <RotateCw aria-hidden="true" />
        </IconButton>

        <span className="ml-1 shrink-0 text-[13px] tabular-nums">{formatTime(shown)}</span>
        <input
          type="range"
          className="range min-w-0 flex-1"
          min={0}
          max={duration}
          step={0.1}
          value={shown}
          aria-label="Перемотка"
          aria-valuetext={`${formatTime(shown)} из ${formatTime(duration)}`}
          onChange={(event) => playback.seek(Number(event.target.value))}
          onKeyDown={onSeekKeyDown}
          style={rangeStyle(fill, accent)}
        />
        <span className="shrink-0 text-[13px] tabular-nums opacity-70">{formatTime(duration)}</span>

        <IconButton label={silent ? 'Включить звук' : 'Выключить звук'} variant="glass" onClick={playback.toggleMute}>
          {silent ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        </IconButton>
        <input
          type="range"
          className="range hidden w-24 sm:block"
          min={0}
          max={1}
          step={0.05}
          value={level}
          aria-label="Громкость"
          onChange={(event) => playback.setVolume(Number(event.target.value))}
          style={rangeStyle(level * 100, accent)}
        />
      </div>
    </div>
  );
}
