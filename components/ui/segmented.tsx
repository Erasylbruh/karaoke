'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn';

export interface SegmentedProps<T extends string> {
  /** Accessible name of the group. */
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: ReactNode }>;
  onChange: (value: T) => void;
  /** `radio` — a choice of value (sorting, filters); `tabs` — switches tab panels. */
  mode?: 'radio' | 'tabs';
  /** Prefix of the tab and panel ids in `tabs` mode; pair it with `tabPanelProps`. */
  idPrefix?: string;
  size?: 'sm' | 'md';
  className?: string;
}

const sizeStyles = {
  sm: 'h-7 px-3 text-[13px]',
  md: 'h-8 px-3.5 text-[14px]',
};

/** Props for the panel of one tab of a `Segmented` in `tabs` mode. */
export function tabPanelProps(idPrefix: string, value: string): { id: string; role: 'tabpanel'; 'aria-labelledby': string } {
  return { id: `${idPrefix}-panel-${value}`, role: 'tabpanel', 'aria-labelledby': `${idPrefix}-tab-${value}` };
}

/**
 * Pill-shaped segmented control. Only the selected segment is in the tab order (roving tabindex);
 * ←/→ (and ↑/↓, Home, End) select the neighbouring segment and move focus to it.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  mode = 'radio',
  idPrefix = 'segmented',
  size = 'md',
  className,
}: SegmentedProps<T>) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const isTabs = mode === 'tabs';
  const selectedIndex = options.findIndex((option) => option.value === value);
  // When the value matches no option, the first segment takes the tab stop.
  const tabStop = selectedIndex < 0 ? 0 : selectedIndex;

  function select(index: number) {
    const option = options[index];
    if (!option) return;
    buttonsRef.current[index]?.focus();
    if (option.value !== value) onChange(option.value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = options.length - 1;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = index === last ? 0 : index + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = index === 0 ? last : index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    select(next);
  }

  return (
    <div
      role={isTabs ? 'tablist' : 'radiogroup'}
      aria-label={label}
      className={cn(
        'inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-line bg-surface-1 p-1 [scrollbar-width:none]',
        className,
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttonsRef.current[index] = node;
            }}
            type="button"
            role={isTabs ? 'tab' : 'radio'}
            aria-checked={isTabs ? undefined : selected}
            aria-selected={isTabs ? selected : undefined}
            id={isTabs ? `${idPrefix}-tab-${option.value}` : undefined}
            aria-controls={isTabs ? `${idPrefix}-panel-${option.value}` : undefined}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => select(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-colors duration-150 [&_svg]:size-4 [&_svg]:shrink-0',
              sizeStyles[size],
              selected ? 'bg-surface-3 text-fg shadow-[inset_0_0_0_1px_var(--color-line)]' : 'text-fg-muted hover:text-fg',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
