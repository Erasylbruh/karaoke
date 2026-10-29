import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'glass';
export type ButtonSize = 'sm' | 'md' | 'lg';

/** Colours per variant, shared by `buttonStyles` and `iconButtonStyles`. */
export const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110 active:brightness-95',
  secondary: 'border border-line bg-surface-2 text-fg hover:border-line-strong hover:bg-surface-3',
  ghost: 'text-fg-muted hover:bg-surface-2 hover:text-fg',
  danger: 'border border-danger/30 bg-danger/10 text-danger hover:border-danger/50 hover:bg-danger/20',
  glass: 'bg-white/10 hover:bg-white/20 text-current',
};

/** Shape and behaviour shared by every button and icon button. */
export const buttonBase =
  'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold whitespace-nowrap transition-[background-color,border-color,color,filter] duration-150 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:shrink-0';

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3.5 text-[13px] [&_svg]:size-4',
  md: 'h-10 gap-2 px-4.5 text-[14px] [&_svg]:size-[18px]',
  lg: 'h-12 gap-2.5 px-6 text-[16px] [&_svg]:size-5',
};

/** Class names for a button, also used to style a `<Link>` as a button. Defaults: `secondary`, `md`. */
export function buttonStyles(opts: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean } = {}): string {
  const { variant = 'secondary', size = 'md', block = false } = opts;
  return cn(buttonBase, sizeStyles[size], variantStyles[variant], block && 'w-full');
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Shown before the text; decorative. */
  icon?: ReactNode;
};

export function Button({ variant, size, block, icon, type = 'button', className, children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonStyles({ variant, size, block }), className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}
