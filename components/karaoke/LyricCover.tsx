import type { CSSProperties } from 'react';
import { cn } from '@/components/ui/cn';
import { fontFamilyFor } from '@/lib/fonts';
import type { Karaoke } from '@/lib/types';

export interface LyricCoverProps {
  track: Pick<Karaoke, 'title' | 'lyrics' | 'style'>;
  /** `card` — square catalog cover; `hero` — large cover, the caller must set its size or proportions (e.g. `aspect-[16/10]`); `thumb` — small letter tile. */
  variant?: 'card' | 'hero' | 'thumb';
  /** `always` — the middle line is sung in a loop; `hover` — only while a `group` ancestor is hovered or focused. */
  animate?: 'always' | 'hover' | 'never';
  className?: string;
}

// The wipe loop. A paused `hover` cover rests at the same 60% as a static one (-1.92s is 60% of 3.2s).
const SING = '[animation-name:sing] [animation-duration:3.2s] [animation-timing-function:linear] [animation-iteration-count:infinite]';
const ANIMATION: Record<NonNullable<LyricCoverProps['animate']>, string> = {
  always: SING,
  hover: cn(
    SING,
    '[animation-delay:-1.92s] [animation-play-state:paused] group-hover:[animation-play-state:running] group-focus-visible:[animation-play-state:running]',
  ),
  never: '',
};

/**
 * Up to three lyric lines around the second one: [1], [2], [3] when there are enough,
 * otherwise whatever there is. Blank lines are skipped.
 */
function pickLines(track: LyricCoverProps['track']): { lines: string[]; active: number } {
  const texts = (Array.isArray(track.lyrics) ? track.lyrics : [])
    .map((line) => (typeof line?.text === 'string' ? line.text.trim() : ''))
    .filter(Boolean);
  if (texts.length === 0) return { lines: [track.title || '♪'], active: 0 };
  const start = Math.min(1, Math.max(0, texts.length - 3));
  const lines = texts.slice(start, start + 3);
  return { lines, active: lines.length === 3 ? 1 : 0 };
}

/**
 * Cover drawn as a frame of the track's own karaoke screen: its background, font and active colour,
 * with one line "being sung". Decorative (`aria-hidden`): show the title as text next to it.
 * Has no hooks, so it renders in server components too.
 */
export function LyricCover({ track, variant = 'card', animate = 'never', className }: LyricCoverProps) {
  // Tracks saved by older versions may lack colours; the interface tokens stand in for them.
  const style: Partial<Karaoke['style']> = track.style ?? {};
  const background = style.backgroundColor || 'var(--color-surface-2)';
  const text = style.textColor || 'var(--color-fg)';
  const active = style.activeColor || 'var(--color-accent)';
  const rest = `color-mix(in srgb, ${text} 35%, transparent)`;
  const hasRadius = /(^|\s)rounded(-|\s|$)/.test(className ?? '');

  const frame: CSSProperties = {
    backgroundColor: background,
    backgroundImage: `radial-gradient(120% 90% at 85% 0%, color-mix(in srgb, ${active} 28%, transparent), transparent 60%)`,
    color: text,
    fontFamily: fontFamilyFor(style.font),
  };

  if (variant === 'thumb') {
    const letter = Array.from((track.title ?? '').trim())[0]?.toUpperCase() ?? '♪';
    return (
      <div
        aria-hidden="true"
        className={cn(
          '@container grid aspect-square shrink-0 select-none place-items-center overflow-hidden',
          !hasRadius && 'rounded-[10px]',
          className,
        )}
        style={frame}
      >
        <span className="text-[45cqw] leading-none font-bold" style={{ color: active }}>
          {letter}
        </span>
      </div>
    );
  }

  const { lines, active: activeIndex } = pickLines(track);
  const isHero = variant === 'hero';

  // cq units resolve against the nearest container *ancestor*, so the sizing lives on the inner layer.
  return (
    <div
      aria-hidden="true"
      className={cn(
        '@container relative select-none overflow-hidden',
        !isHero && 'aspect-square',
        !hasRadius && (isHero ? 'rounded-3xl' : 'rounded-2xl'),
        className,
      )}
      style={frame}
    >
      <div
        className={cn(
          'absolute inset-0 flex flex-col justify-center font-semibold leading-[1.15] [overflow-wrap:anywhere]',
          // A card keeps its top fifth free for corner badges, so the lines sit a little below the middle.
          isHero ? 'gap-[2.5cqw] p-[7cqw] text-[7cqw]' : 'gap-[3cqw] px-[8cqw] pt-[18cqw] pb-[8cqw] text-[8.5cqw]',
        )}
      >
        {lines.map((line, index) =>
          index === activeIndex ? (
            // The paragraph takes the "rest" colour, so the clamp's ellipsis matches the unsung text.
            <p key={index} className="line-clamp-3" style={{ color: rest }}>
              <span
                className={cn('lyric-wipe motion-reduce:[animation-name:none]', ANIMATION[animate])}
                style={
                  {
                    '--progress': '60%',
                    '--wipe-color': active,
                    '--wipe-rest': rest,
                  } as CSSProperties
                }
              >
                {line}
              </span>
            </p>
          ) : (
            // Neighbour lines stay on one row and fade out at the frame edge.
            <p key={index} className="overflow-hidden whitespace-nowrap opacity-40 [mask-image:linear-gradient(90deg,black_80%,transparent)]">
              {line}
            </p>
          ),
        )}
      </div>
    </div>
  );
}
