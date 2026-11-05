import { useId, type ReactNode } from 'react';

export interface StudioSectionProps {
  step: number;
  title: string;
  description?: string;
  children: ReactNode;
}

/** One numbered step of the studio: a heading with the step number and its card. */
export function StudioSection({ step, title, description, children }: StudioSectionProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="rounded-3xl border border-line bg-surface-1 p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-[15px] font-bold text-accent"
        >
          {step}
        </span>
        <div className="min-w-0 pt-0.5">
          <h2 id={headingId} className="font-display text-[19px] leading-tight font-semibold text-fg">
            <span className="sr-only">Шаг {step}. </span>
            {title}
          </h2>
          {description && <p className="mt-1.5 text-[14px] text-fg-muted">{description}</p>}
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}
