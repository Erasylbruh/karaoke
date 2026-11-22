/**
 * Operator details and the version of the legal documents (/terms, /privacy, /copyright).
 *
 * Bump LEGAL_VERSION when the terms or the privacy policy change in substance: signed-in people
 * whose accepted version differs are asked to accept the new one (components/layout/ConsentBanner).
 */
export const LEGAL_VERSION = '2026-11-21';
export const LEGAL_DATE = '21 ноября 2026 г.';

export const OPERATOR_NAME = process.env.NEXT_PUBLIC_OPERATOR_NAME || 'Bomjourne';
export const OPERATOR_COUNTRY = 'Республика Казахстан';
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'karaokecraft1@gmail.com';
export const SITE_NAME = 'KaraokeCraft';

/** Days the operator has to answer a complaint (Закон РК «Об онлайн-платформах и онлайн-рекламе»). */
export const COMPLAINT_ANSWER_DAYS = 20;

export const mailto = (subject: string, body = '') =>
  `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;
