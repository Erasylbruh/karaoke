'use client';

import { useState } from 'react';
import { cn } from './cn';

/** Initials backgrounds; white text is readable on each. */
const PALETTE = ['#7c3aed', '#db2777', '#ea580c', '#0891b2', '#16a34a', '#4f46e5', '#c026d3', '#0d9488'];

function hash(value: string): number {
  let h = 0;
  for (const ch of value) {
    h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  }
  return h;
}

/** First letters of the first two words: «Лиза Ветер» → «ЛВ». */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase();
}

export interface AvatarProps {
  name: string;
  src?: string;
  /** Diameter in px. */
  size?: number;
  className?: string;
}

/**
 * Round user picture. Without `src`, or when the image fails to load, shows the initials
 * on a colour picked from the name. Decorative: put the name in text next to it.
 */
export function Avatar({ name, src, size = 32, className }: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const box = { width: size, height: size };
  const base = 'inline-block shrink-0 rounded-full';

  if (src && failedSrc !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        onError={() => setFailedSrc(src)}
        className={cn(base, 'bg-surface-3 object-cover', className)}
        style={box}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(base, 'inline-flex select-none items-center justify-center font-semibold leading-none text-white', className)}
      style={{ ...box, backgroundColor: PALETTE[hash(name) % PALETTE.length], fontSize: Math.max(10, Math.round(size * 0.4)) }}
    >
      {initials(name) || '?'}
    </span>
  );
}
