import {
  Caveat,
  JetBrains_Mono,
  Onest,
  Playfair_Display,
  Russo_One,
  Unbounded,
} from 'next/font/google';

// next/font reads these options at build time, so every value has to be a
// literal inside the call (a shared `subsets` constant would be rejected).

// Interface fonts: preloaded on every route.
export const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  preload: true,
  variable: '--font-onest',
});

export const unbounded = Unbounded({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  preload: true,
  variable: '--font-unbounded',
});

// Track style fonts: the @font-face rules ship with the page, but the files are
// not preloaded. The browser fetches one only when a lyric style uses it.
export const playfair = Playfair_Display({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  preload: false,
  variable: '--font-playfair',
});

export const caveat = Caveat({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  preload: false,
  variable: '--font-caveat',
});

export const russoOne = Russo_One({
  weight: '400',
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  preload: false,
  variable: '--font-russo',
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  preload: false,
  variable: '--font-jetbrains',
});

/** Every font variable class, space separated, for the className of <html>. */
export const fontVariables: string = [
  onest,
  unbounded,
  playfair,
  caveat,
  russoOne,
  jetbrainsMono,
]
  .map((font) => font.variable)
  .join(' ');
