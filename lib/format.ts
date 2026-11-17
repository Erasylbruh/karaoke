/**
 * Safe formatting, URL decoding, CSS escaping and Russian pluralisation helpers.
 */

/** Decodes a route parameter without throwing URIError on malformed '%' sequences. */
export function safeDecode(raw: string | undefined | null): string {
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const HEX_OR_VAR_COLOR = /^(#[0-9a-fA-F]{3,8}|var\(--[a-zA-Z0-9-]+\))$/;

/** Ensures a user-controlled colour cannot inject arbitrary CSS declarations. */
export function safeColor(color: string | undefined | null, fallback: string): string {
  const c = color?.trim();
  return c && HEX_OR_VAR_COLOR.test(c) ? c : fallback;
}

/**
 * Allows only safe media/image URLs (https:, data:image/, blob:, idb:, or local paths).
 * Rejects javascript:, data:text/html, plain http: tracking beacons, and control characters.
 */
export function safeMediaUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed || /[\u0000-\u001F\u007F]/.test(trimmed)) return undefined;
  if (trimmed.startsWith('idb:') || trimmed.startsWith('blob:') || trimmed.startsWith('/')) return trimmed;
  if (/^data:image\/(jpeg|png|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') return parsed.toString();
  } catch {
    return undefined;
  }
  return undefined;
}

/** Safely wraps a validated URL into CSS `url("...")` escaping quotes, parentheses and backslashes. */
export function cssUrl(url: string | undefined | null): string | undefined {
  const safe = safeMediaUrl(url);
  if (!safe) return undefined;
  const escaped = safe.replace(/["\\()\n\r]/g, (ch) => `\\${ch}`);
  return `url("${escaped}")`;
}

/**
 * Russian pluralisation: `pluralRu(2, 'песня', 'песни', 'песен')` -> `'песни'`.
 * Pass `withNumber = true` to get `'2 песни'`.
 */
export function pluralRu(n: number, one: string, few: string, many: string, withNumber = false): string {
  const abs = Math.abs(Math.trunc(n));
  const m10 = abs % 10;
  const m100 = abs % 100;
  let word = many;
  if (m10 === 1 && m100 !== 11) word = one;
  else if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) word = few;
  return withNumber ? `${n.toLocaleString('ru-RU')} ${word}` : word;
}
