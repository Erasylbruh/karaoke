import type { ButtonHTMLAttributes } from 'react';
import { buttonBase, variantStyles, type ButtonSize, type ButtonVariant } from './button';
import { cn } from './cn';

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'size-8 [&_svg]:size-4',
  md: 'size-10 [&_svg]:size-5',
  lg: 'size-12 [&_svg]:size-[22px]',
};

/** Class names for a round icon-only button, also used to style a `<Link>`. Defaults: `secondary`, `md`. */
export function iconButtonStyles(opts: { variant?: ButtonVariant; size?: ButtonSize } = {}): string {
  const { variant = 'secondary', size = 'md' } = opts;
  return cn(buttonBase, sizeStyles[size], variantStyles[variant]);
}

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Accessible name, also shown as a tooltip. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Makes it a toggle button (`aria-pressed`). */
  pressed?: boolean;
};

export function IconButton({ label, variant, size, pressed, type = 'button', className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        iconButtonStyles({ variant, size }),
        pressed !== undefined && 'aria-pressed:border-transparent aria-pressed:bg-accent-soft aria-pressed:text-accent',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
