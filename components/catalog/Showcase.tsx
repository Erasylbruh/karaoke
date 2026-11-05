import Link from 'next/link';
import { LyricCover } from '@/components/karaoke/LyricCover';
import type { Karaoke } from '@/lib/types';

/** The big singing cover on the first screen of the catalog, linking to the track. */
export function Showcase({ track }: { track: Karaoke }) {
  // pickShowcase falls back to the top recommended track when none is featured.
  const label = track.isFeatured ? 'Выбор редакции' : 'Рекомендуем';
  return (
    <Link href={`/karaoke/${track.id}`} className="group block rounded-3xl outline-offset-4">
      <LyricCover
        track={track}
        variant="hero"
        animate="always"
        className="aspect-[16/10] rounded-3xl shadow-[inset_0_0_0_1px_var(--color-line)] transition-shadow duration-300 group-hover:shadow-pop lg:aspect-square"
      />
      <p className="mt-3 flex min-w-0 items-baseline gap-1.5 px-1 text-[14px] text-fg-muted">
        <span className="shrink-0 font-semibold text-accent">
          <span aria-hidden="true">★ </span>
          {label}
        </span>
        <span aria-hidden="true" className="shrink-0 text-fg-subtle">
          ·
        </span>
        <span className="min-w-0 truncate">
          <span className="font-medium text-fg transition-colors group-hover:text-accent">{track.title}</span> — {track.artist}
        </span>
      </p>
    </Link>
  );
}
