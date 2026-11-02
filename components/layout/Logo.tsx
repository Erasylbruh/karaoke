import { cn } from '@/components/ui/cn';

/** Brand mark: three amber bars and the «KaraokeCraft» wordmark. `compact` keeps only the bars. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center text-fg', !compact && 'gap-2')}>
      <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor" className="shrink-0 text-accent" aria-hidden="true">
        <rect x="2" y="9" width="4" height="11" rx="2" />
        <rect x="9" y="2" width="4" height="18" rx="2" />
        <rect x="16" y="6" width="4" height="14" rx="2" />
      </svg>
      {!compact && <span className="font-display text-[15px] font-semibold tracking-tight">KaraokeCraft</span>}
    </span>
  );
}
