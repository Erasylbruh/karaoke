const LOCALE = 'ru-RU';
const pluralRules = new Intl.PluralRules('ru');

function formatFraction(value: number): string {
  return value.toLocaleString(LOCALE, { maximumFractionDigits: 1 });
}

/** 960 -> "960", 1840 -> "1,8 тыс.", 2 400 000 -> "2,4 млн". */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const thousands = Math.round(n / 100) / 10;
  // 999 950 rounds up to 1000 thousands, which reads better as "1 млн".
  if (thousands < 1000) return `${formatFraction(thousands)} тыс.`;
  return `${formatFraction(Math.round(n / 100_000) / 10)} млн`;
}

/** Seconds -> "m:ss", rounded down. Negative and non-finite values give "0:00". */
export function formatTime(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** ISO date -> "14 окт. 2026". An invalid date gives an empty string. */
export function formatDate(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date
    .toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone })
    .replace(/\s*г\.$/, '');
}

/** Number with its Russian noun form: plural(7, ['трек', 'трека', 'треков']) -> "7 треков". Forms are for 1, 2 and 5. */
export function plural(n: number, forms: [string, string, string]): string {
  const rule = pluralRules.select(n);
  if (rule === 'one') return `${n} ${forms[0]}`;
  if (rule === 'few') return `${n} ${forms[1]}`;
  return `${n} ${forms[2]}`;
}
