import {
  caveat,
  jetbrainsMono,
  onest,
  playfair,
  russoOne,
  unbounded,
} from '@/app/fonts';

export type StyleFontKey =
  | 'Onest'
  | 'Unbounded'
  | 'Playfair'
  | 'Caveat'
  | 'Russo'
  | 'Georgia'
  | 'Mono';

const ONEST_FAMILY = onest.style.fontFamily;

/**
 * The one font table for lyric styles. The player, the studio and the canvas
 * export all take `family` from here, so they draw with the same real fonts.
 * `family` is the full CSS font-family list, usable in CSS and in `ctx.font`.
 */
export const STYLE_FONTS: ReadonlyArray<{
  key: StyleFontKey;
  label: string;
  family: string;
}> = [
  { key: 'Onest', label: 'Onest', family: ONEST_FAMILY },
  { key: 'Unbounded', label: 'Unbounded', family: unbounded.style.fontFamily },
  { key: 'Playfair', label: 'Playfair', family: playfair.style.fontFamily },
  { key: 'Caveat', label: 'Caveat', family: caveat.style.fontFamily },
  { key: 'Russo', label: 'Russo One', family: russoOne.style.fontFamily },
  { key: 'Georgia', label: 'Georgia', family: 'Georgia, "Times New Roman", serif' },
  { key: 'Mono', label: 'Моно', family: jetbrainsMono.style.fontFamily },
];

/** Font-family for a stored style key. An unknown or missing key gives Onest. */
export function fontFamilyFor(key: string | undefined): string {
  return STYLE_FONTS.find((font) => font.key === key)?.family ?? ONEST_FAMILY;
}

/** Font-family of the display (heading) font, Unbounded. */
export const DISPLAY_FONT: string = unbounded.style.fontFamily;
