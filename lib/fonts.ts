import { KaraokeStyle } from './types';
import { resolveBlobUrl } from './blob-store';

export const DEFAULT_FONTS = [
  'Onest',
  'Unbounded',
  'Georgia',
  'Mono',
  'Inter',
  'Outfit',
  'Space Grotesk',
] as const;

/** Fonts authors use most often. Loaded from Google Fonts. */
export const POPULAR_FONTS = [
  'Montserrat',
  'Poppins',
  'Roboto',
  'Playfair Display',
  'Bebas Neue',
  'Oswald',
  'Pacifico',
] as const;

export const FONT_FILE_ACCEPT = '.ttf,.otf,.woff,.woff2';
export const FONT_FILE_MAX_BYTES = 2 * 1024 * 1024;
const FONT_EXT = /\.(ttf|otf|woff2?)$/i;

const GENERIC: Record<string, string> = {
  Georgia: 'Georgia, "Times New Roman", serif',
  Mono: 'ui-monospace, Menlo, Consolas, monospace',
};

export const GOOGLE_FONT_NAME = /^[A-Za-z][A-Za-z0-9 ]{1,39}$/;

export function fontCss(font: string): string {
  if (GENERIC[font]) return GENERIC[font];
  return `"${font}", "Onest", system-ui, sans-serif`;
}

export function isFontFile(file: File): boolean {
  return FONT_EXT.test(file.name);
}

/** Checks the file signature, so a renamed image or script is rejected. */
export async function looksLikeFont(file: File): Promise<boolean> {
  if (!isFontFile(file) || file.size > FONT_FILE_MAX_BYTES) return false;
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const tag = String.fromCharCode(...head);
  return (
    tag === 'wOFF' ||
    tag === 'wOF2' ||
    tag === 'OTTO' ||
    tag === 'true' ||
    (head[0] === 0 && head[1] === 1 && head[2] === 0 && head[3] === 0)
  );
}

const loaded = new Set<string>();

export function loadGoogleFont(name: string) {
  if (typeof document === 'undefined' || !GOOGLE_FONT_NAME.test(name) || loaded.has(name)) return;
  if (GENERIC[name]) return;
  loaded.add(name);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;500;700&display=swap`;
  document.head.appendChild(link);
}

export async function loadCustomFont(family: string, ref: string) {
  if (typeof document === 'undefined' || loaded.has(family)) return;
  const url = await resolveBlobUrl(ref);
  if (!url) return;
  const face = new FontFace(family, `url(${url})`);
  await face.load();
  document.fonts.add(face);
  loaded.add(family);
}

/** Makes sure the font of a style is available in the page. */
export function ensureStyleFont(style: KaraokeStyle) {
  if (style.fontFile) {
    void loadCustomFont(style.font, style.fontFile).catch(() => {});
  } else {
    loadGoogleFont(style.font);
  }
}
