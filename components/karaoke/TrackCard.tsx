import Link from 'next/link';
import { Heart, Play } from 'lucide-react';
import { formatCount, formatTime } from '@/lib/format';
import type { Karaoke } from '@/lib/types';
import { LyricCover } from './LyricCover';

const BADGE = 'inline-flex h-7 items-center gap-1 rounded-full bg-ink/60 px-2.5 text-[13px] font-medium text-fg backdrop-blur';

/**
 * Catalog card: the lyric cover, title, artist and counters, all one link to the player.
 * Hovering or focusing it lifts the card, starts the sung line and shows the play button.
 */
export function TrackCard({ track }: { track: Karaoke }) {
  return (
    <Link
      href={`/karaoke/${track.id}`}
      className="group block rounded-2xl outline-offset-4 transition-transform duration-200 ease-out hover:-translate-y-1 focus-visible:-translate-y-1"
    >
      <div className="@container relative">
        <LyricCover
          track={track}
          animate="hover"
          className="rounded-2xl shadow-[inset_0_0_0_1px_var(--color-line)] transition-shadow duration-200 group-hover:shadow-pop"
        />

        <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex items-start gap-2">
          {track.isFeatured && (
            <span className={BADGE} title="Выбор редакции">
              <span aria-hidden="true" className="text-accent">
                ★
              </span>
              <span className="sr-only @min-[220px]:not-sr-only">Выбор редакции</span>
            </span>
          )}
          <span className={`${BADGE} ml-auto tabular-nums`}>
            <span className="sr-only">Длительность </span>
            {formatTime(track.duration)}
          </span>
        </div>

        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 bottom-3 grid size-11 translate-y-1 place-items-center rounded-full bg-accent text-accent-ink opacity-0 shadow-pop transition-[opacity,translate] duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
        >
          <Play className="ml-0.5 size-5 fill-current" />
        </span>
      </div>

      <div className="mt-3 min-w-0 px-0.5">
        <p className="truncate text-[15px] leading-snug font-semibold text-fg">{track.title}</p>
        <p className="truncate text-[14px] leading-snug text-fg-muted">{track.artist}</p>
        <p className="mt-1.5 flex items-center gap-3.5 text-[13px] text-fg-subtle tabular-nums">
          <span className="inline-flex items-center gap-1">
            <Heart aria-hidden="true" className="size-3.5" />
            <span className="sr-only">Нравится: </span>
            {formatCount(track.likesCount ?? 0)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Play aria-hidden="true" className="size-3.5" />
            <span className="sr-only">Прослушиваний: </span>
            {formatCount(track.viewsCount ?? 0)}
          </span>
        </p>
      </div>
    </Link>
  );
}
