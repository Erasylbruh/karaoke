'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from './cn';

/** Props the `Field` hands to its control: the label's target and the hint/error wiring. */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

export interface FieldProps {
  label: string;
  /** Shown under the control. */
  hint?: string;
  /** Shown under the control instead of nothing; marks the control invalid. */
  error?: string;
  className?: string;
  /** Renders the control; spread `control` onto it. */
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Label, control and the hint and error under it. The hint and the error are linked to the control
 * through `aria-describedby`, and an error sets `aria-invalid`.
 */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ');

  const control: FieldControlProps = { id };
  if (describedBy) control['aria-describedby'] = describedBy;
  if (error) control['aria-invalid'] = true;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[14px] font-medium text-fg">
        {label}
      </label>
      {children(control)}
      {hint && (
        <p id={hintId} className="text-[13px] text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Class names of a text field. Pass `invalid` for the error border; `Input`, `Textarea` and `Select`
 * take it from `aria-invalid` themselves.
 */
export function inputStyles(invalid = false): string {
  return cn(
    // 16px on phones keeps iOS from zooming into the field on focus.
    'w-full min-w-0 rounded-field border bg-surface-2 px-3 text-[16px] text-fg md:text-[15px]',
    'transition-[border-color,box-shadow] duration-150 placeholder:text-fg-subtle focus-visible:outline-none',
    'disabled:cursor-not-allowed disabled:opacity-50',
    // Only one set of border colours at a time: utilities of one property do not override by class order.
    invalid
      ? 'border-danger focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-danger)_20%,transparent)]'
      : 'border-line hover:border-line-strong focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]',
  );
}

function isInvalid(value: ComponentProps<'input'>['aria-invalid']): boolean {
  return value === true || value === 'true';
}

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cn(inputStyles(isInvalid(rest['aria-invalid'])), 'h-10', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={cn(inputStyles(isInvalid(rest['aria-invalid'])), 'resize-y py-2.5 leading-normal', className)} {...rest} />;
}

export function Select({ className, ...rest }: ComponentProps<'select'>) {
  return <select className={cn(inputStyles(isInvalid(rest['aria-invalid'])), 'h-10 pr-2', className)} {...rest} />;
}
