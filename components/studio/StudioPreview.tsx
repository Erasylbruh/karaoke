'use client';

import { useImperativeHandle, useState, type CSSProperties, type KeyboardEvent, type Ref } from 'react';
import { Pause, Play } from 'lucide-react';
import { usePlayback } from '@/components/player/usePlayback';
import { cn } from '@/components/ui/cn';
import { fontFamilyFor } from '@/lib/fonts';
import { formatTime } from '@/lib/format';
import { activeLineIndex, lineProgress, trackDuration } from '@/lib/lyrics';
import type { StudioDraft } from './Studio';

/** What the studio can do with the preview: pause it before the exporter takes the synth. */
export interface StudioPreviewHandle {
  pause(): void;
}

export interface StudioPreviewProps {
  draft: StudioDraft;
  ref?: Ref<StudioPreviewHandle>;
}

/** Lines shown before and after the active one, per frame format. */
const WINDOW = { v: { before: 2, after: 3 }, h: { before: 1, after: 2 } } as const;
/** Font size in cqw per px of the chosen size: the frame is narrower in 9:16, so the factor is bigger. */
const SIZE_FACTOR = { v: 0.265, h: 0.15 } as const;
const SKIP_SECONDS = 5;

/**
 * Live frame of the karaoke in the draft's style, with play/pause and a seek bar under it.
 * The lines around the active one slide up as the song moves on.
 */
export function StudioPreview({ draft, ref }: StudioPreviewProps) {
  const { lyrics, aspect, textColor, activeColor, backgroundColor } = draft;
  const duration = trackDuration(lyrics);
  const playback = usePlayback({ duration, preset: 'pop' });
  const { pause, skip } = playback;
  useImperativeHandle(ref, () => ({ pause }), [pause]);

  const time = Math.min(playback.time, duration);
  const active = activeLineIndex(lyrics, time);
  const focus = Math.max(0, active);
  const progress = lineProgress(lyrics, active, time, duration);

  // A move to the next line slides the window up by one row; any other jump just redraws it.
  const [shift, setShift] = useState({ focus, step: 0 });
  if (shift.focus !== focus) setShift({ focus, step: focus - shift.focus });
  const slideIn = shift.step === 1;

  const { before, after } = WINDOW[aspect];
  const rows: Array<{ index: number; text: string } | null> = [];
  for (let index = focus - before; index <= focus + after; index++) {
    rows.push(index >= 0 && index < lyrics.length ? { index, text: lyrics[index].text } : null);
  }

    const fill = duration > 0 ? (time / duration) * 100 : 0;
  const title = draft.title.trim() || 'Без названия';

  function onSeekKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    skip(event.key === 'ArrowLeft' ? -SKIP_SECONDS : SKIP_SECONDS);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid place-items-center">
        <div
          role="group"
          aria-label="Предпросмотр кадра"
          data-preview-frame
          className={cn(
            '@container relative overflow-hidden rounded-2xl shadow-pop ring-1 ring-white/10',
            aspect === 'v'
              ? 'h-[min(52vh,440px)] w-[calc(min(52vh,440px)*9/16)] lg:h-[min(64vh,560px)] lg:w-[calc(min(64vh,560px)*9/16)]'
              : 'aspect-[16/9] w-full max-w-[640px]',
          )}
          style={{ backgroundColor, color: textColor }}
        >
          {/* The same shading as the exported video: a little darker towards the bottom. */}
          <div aria-hidden="true" className="absolute inset-0 bg-linear-to-b from-black/10 to-black/45" />

          <p className="absolute top-[6cqw] right-[8cqw] left-[8cqw] truncate font-display text-[3.6cqw] font-semibold opacity-70">
            {title}
          </p>

          {lyrics.length === 0 ? (
            <p className="absolute inset-0 grid place-items-center px-[8cqw] text-center text-[5cqw] opacity-60">Здесь появится текст</p>
          ) : (
            <div
              className="absolute inset-0 flex flex-col justify-center overflow-hidden px-[8cqw]"
              style={{ fontFamily: fontFamilyFor(draft.font), fontSize: `${draft.fontSize * SIZE_FACTOR[aspect]}cqw` }}
            >
              <div
                key={focus}
                data-preview-lines
                className={cn(slideIn && 'transition-transform duration-300 ease-out starting:translate-y-[1.65em]')}
              >
                {rows.map((row, slot) =>
                  row === null ? (
                    <div key={`empty-${slot}`} aria-hidden="true" className="mb-[0.5em] h-[1.15em]" />
                  ) : (
                    <p
                      key={row.index}
                      data-active={row.index === focus || undefined}
                      className={cn(
                        'mb-[0.5em] leading-[1.15] font-bold [overflow-wrap:anywhere]',
                        row.index === focus ? 'opacity-100' : 'opacity-35',
                      )}
                    >
                      {row.index === focus ? (
                        <span
                          className="lyric-wipe"
                          style={
                            {
                              '--progress': `${progress * 100}%`,
                              '--wipe-color': activeColor,
                              '--wipe-rest': textColor,
                            } as CSSProperties
                          }
                        >
                          {row.text}
                        </span>
                      ) : (
                        row.text
                      )}
                    </p>
                  ),
                )}
              </div>
            </div>
          )}

          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-[5cqw] bottom-[4cqw] font-display text-[3.2cqw] font-bold tracking-[-0.02em] opacity-50"
          >
            KaraokeCraft
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={playback.isPlaying ? 'Пауза' : 'Играть'}
          title={playback.isPlaying ? 'Пауза' : 'Играть'}
          onClick={playback.toggle}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-fg text-ink transition-transform duration-150 hover:scale-105 active:scale-95"
        >
          {playback.isPlaying ? (
            <Pause aria-hidden="true" className="size-[18px] fill-current" />
          ) : (
            <Play aria-hidden="true" className="size-[18px] translate-x-px fill-current" />
          )}
        </button>
        <input
          type="range"
          className="range min-w-0 flex-1"
          min={0}
          max={duration}
          step={0.1}
          value={time}
          aria-label="Перемотка"
          aria-valuetext={`${formatTime(time)} из ${formatTime(duration)}`}
          onChange={(event) => playback.seek(Number(event.target.value))}
          onKeyDown={onSeekKeyDown}
          style={{ '--fill': `${fill}%`, '--color-accent': activeColor, accentColor: activeColor } as CSSProperties}
        />
        <span className="shrink-0 text-[13px] text-fg-muted tabular-nums">
          {formatTime(time)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
