import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Makes it a toggle (`aria-pressed`); a pressed chip is tinted with the accent. */
  pressed?: boolean;
  size?: 'sm' | 'md';
};

const sizeStyles = {
  sm: 'h-8 gap-1 px-3 text-[13px] [&_svg]:size-3.5',
  md: 'h-9 gap-1.5 px-3.5 text-[14px] [&_svg]:size-4',
};

/** Small pill button for tags and filters. */
export function Chip({ pressed, size = 'md', type = 'button', className, children, ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cn(
        'inline-flex shrink-0 select-none items-center whitespace-nowrap rounded-full border font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
        sizeStyles[size],
        pressed
          ? 'border-transparent bg-accent-soft text-accent hover:bg-accent/20'
          : 'border-line bg-surface-1 text-fg-muted hover:border-line-strong hover:text-fg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
