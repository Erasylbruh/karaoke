import type { ReactNode } from 'react';
import { LyricCover } from '@/components/karaoke/LyricCover';
import { INITIAL_KARAOKES } from '@/lib/mock-data';

const SHOWCASE_TRACK_ID = 'sol-na-gubah';

export interface AuthShellProps {
  title: string;
  subtitle: string;
  /** The form. */
  children: ReactNode;
  /** The link to the other auth page, under the form. */
  footer: ReactNode;
}

/** Two columns from `lg`: the form on the left, a singing lyric cover on the right. One column below. */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  const showcase = INITIAL_KARAOKES.find((track) => track.id === SHOWCASE_TRACK_ID);

  return (
    <div className="wrap grid items-center gap-12 py-10 sm:py-14 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-2 lg:gap-20">
      <section className="mx-auto w-full max-w-md lg:mx-0">
        <h1 className="font-display text-[clamp(28px,4vw,38px)] leading-[1.1] font-bold tracking-[-0.02em] text-fg">{title}</h1>
        <p className="mt-3 text-[15px] text-fg-muted">{subtitle}</p>
        <div className="mt-8">{children}</div>
        <p className="mt-6 text-[14px] text-fg-muted">{footer}</p>
      </section>

      <aside className="hidden lg:block">
        {showcase && (
          <div className="mx-auto w-full max-w-[460px]">
            <LyricCover track={showcase} variant="hero" animate="always" className="aspect-square shadow-pop" />
            <p className="mt-6 font-display text-[20px] leading-snug font-semibold text-balance text-fg">
              Покажите песню так, как вы её слышите
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
