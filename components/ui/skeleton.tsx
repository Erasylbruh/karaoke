import { cn } from './cn';

/**
 * Shimmering placeholder block; size it with `className` (for example `h-4 w-32`).
 * Corners default to `rounded-field` unless `className` sets its own `rounded-*`.
 * Under reduced motion it stays a flat surface-2 block.
 */
export function Skeleton({ className }: { className?: string }) {
  const hasRadius = /(^|\s)rounded(-|\s|$)/.test(className ?? '');
  return <div aria-hidden="true" className={cn('animate-shimmer bg-surface-2', !hasRadius && 'rounded-field', className)} />;
}
