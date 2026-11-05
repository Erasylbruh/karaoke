'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { cn } from '@/components/ui/cn';
import { activeLineIndex, lineProgress } from '@/lib/lyrics';
import type { LyricLine } from '@/lib/types';

export interface LyricsViewProps {
  lines: LyricLine[];
  time: number;
  duration: number;
  fontFamily: string;
  activeColor: string;
  textColor: string;
  onSeekLine: (index: number) => void;
  className?: string;
}

// A jump this big between two frames is a seek, not playback.
const SEEK_JUMP_SECONDS = 1.5;
// After the user scrolls the lyrics, auto-centring waits this long.
const USER_SCROLL_HOLD_MS = 3000;

function centerLine(container: HTMLElement, line: HTMLElement | null | undefined, smooth: boolean) {
  if (!line) return;
  const top = line.offsetTop + line.offsetHeight / 2 - container.clientHeight / 2;
  // CSS cannot stop a scripted smooth scroll, so reduced motion is checked here.
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  container.scrollTo({ top, behavior: smooth && !reduce ? 'smooth' : 'auto' });
}

/**
 * Scrolling synced lyrics. The active line fills with `activeColor` as it is sung and is kept
 * in the middle of the box; each line is a button that seeks to it.
 */
export function LyricsView({ lines, time, duration, fontFamily, activeColor, textColor, onSeekLine, className }: LyricsViewProps) {
  const active = activeLineIndex(lines, time);
  const progress = lineProgress(lines, active, time, duration);
  // Before the first line starts, the first line is the one to look at.
  const focusIndex = Math.max(0, active);

  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusRef = useRef(focusIndex);
  const prevTimeRef = useRef<number | null>(null);
  const holdUntilRef = useRef(0);
  // A centring skipped during the hold, to catch up on when the hold ends.
  const missedRef = useRef(false);
  const holdTimerRef = useRef<number | undefined>(undefined);
  const mountedRef = useRef(false);

  // Centre on a line change; the very first centring is instant.
  useEffect(() => {
    focusRef.current = focusIndex;
    const container = containerRef.current;
    if (!container) return;
    if (performance.now() < holdUntilRef.current) {
      missedRef.current = true;
      return;
    }
    centerLine(container, lineRefs.current[focusIndex], mountedRef.current);
    mountedRef.current = true;
  }, [focusIndex]);

  // A seek centres right away, even during the hold: the user asked to go there.
  useEffect(() => {
    const prev = prevTimeRef.current;
    prevTimeRef.current = time;
    const container = containerRef.current;
    if (prev === null || !container || Math.abs(time - prev) <= SEEK_JUMP_SECONDS) return;
    holdUntilRef.current = 0;
    missedRef.current = false;
    centerLine(container, lineRefs.current[focusRef.current], true);
  }, [time]);

  // The user's own scrolling pauses auto-centring; a resize re-centres instantly.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function onUserScroll() {
      holdUntilRef.current = performance.now() + USER_SCROLL_HOLD_MS;
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = window.setTimeout(() => {
        holdUntilRef.current = 0;
        if (missedRef.current && container) {
          missedRef.current = false;
          centerLine(container, lineRefs.current[focusRef.current], true);
        }
      }, USER_SCROLL_HOLD_MS);
    }

    const resize = new ResizeObserver(() => {
      if (performance.now() >= holdUntilRef.current) centerLine(container, lineRefs.current[focusRef.current], false);
    });
    resize.observe(container);
    container.addEventListener('wheel', onUserScroll, { passive: true });
    container.addEventListener('touchmove', onUserScroll, { passive: true });
    return () => {
      resize.disconnect();
      container.removeEventListener('wheel', onUserScroll);
      container.removeEventListener('touchmove', onUserScroll);
      window.clearTimeout(holdTimerRef.current);
    };
  }, []);

  function seekLine(index: number) {
    holdUntilRef.current = 0;
    missedRef.current = false;
    onSeekLine(index);
  }

  const rest = `color-mix(in srgb, ${textColor} 35%, transparent)`;

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label="Текст песни"
      className={cn(
        'relative overflow-y-auto overscroll-contain mask-fade-y [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
      style={{ fontFamily, color: textColor }}
    >
      {lines.length === 0 ? (
        <p className="grid h-full place-items-center text-center text-[18px] opacity-60">У этой песни пока нет текста</p>
      ) : (
        <div className="flex flex-col items-start py-[40vh]">
          {lines.map((line, index) => {
            const isActive = index === active;
            return (
              <button
                key={line.id ?? index}
                ref={(node) => {
                  lineRefs.current[index] = node;
                }}
                type="button"
                aria-current={isActive ? 'true' : undefined}
                onClick={() => seekLine(index)}
                className={cn(
                  'max-w-[22ch] cursor-pointer rounded-xl py-[0.22em] text-left text-[clamp(26px,7.5vw,36px)] leading-[1.15] font-bold [overflow-wrap:anywhere] transition-opacity duration-300 lg:text-[clamp(30px,3.2vw,48px)]',
                  isActive ? 'opacity-100' : index < active ? 'opacity-50 hover:opacity-70' : 'opacity-30 hover:opacity-70',
                )}
              >
                {isActive ? (
                  <span
                    className="lyric-wipe"
                    style={
                      {
                        '--progress': `${progress * 100}%`,
                        '--wipe-color': activeColor,
                        '--wipe-rest': rest,
                      } as CSSProperties
                    }
                  >
                    {line.text}
                  </span>
                ) : (
                  line.text
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
