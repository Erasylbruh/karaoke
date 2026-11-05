import type { User } from './types';

const DEMO_EMAIL_DOMAIN = 'karaokecraft.demo';

/** Trims, lowercases and joins runs of spaces with "_": "  Vasya   Pupkin " -> "vasya_pupkin". */
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

/** `base` if no user has it yet, otherwise base2, base3, ... */
export function uniqueUsername(base: string, users: User[]): string {
  const taken = new Set(users.map((user) => user.username.toLowerCase()));
  let candidate = base;
  let n = 2;
  while (taken.has(candidate.toLowerCase())) candidate = `${base}${n++}`;
  return candidate;
}

/** Finds a user by email (when the identifier contains "@") or by username. Case and surrounding spaces do not matter. */
export function findUserByIdentifier(users: User[], identifier: string): User | undefined {
  const value = identifier.trim();
  if (value === '') return undefined;
  if (value.includes('@')) {
    const email = value.toLowerCase();
    return users.find((user) => user.email.toLowerCase() === email);
  }
  const username = normalizeUsername(value);
  return users.find((user) => user.username.toLowerCase() === username);
}

/**
 * Creates a regular user for an identifier nobody has used yet.
 * An email is kept as the email; a plain name becomes the username and gets a demo email.
 */
export function buildUserFromIdentifier(identifier: string, users: User[], id: string, createdAt: string): User {
  const value = identifier.trim();
  const at = value.indexOf('@');
  const name = at === -1 ? value : value.slice(0, at);
  const username = uniqueUsername(normalizeUsername(name), users);
  const email = at === -1 ? `${username}@${DEMO_EMAIL_DOMAIN}` : value.toLowerCase();
  return { id, username, name, email, avatar: '', bio: '', role: 'user', createdAt };
}

// URL parsers silently drop tabs and newlines, so "/\t/evil.com" would be read as "//evil.com".
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Returns `next` only when it is a path on this site; anything else ("//host", "/\host", "https://host") falls back to "/". */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || next[0] !== '/') return '/';
  if (next[1] === '/' || next[1] === '\\') return '/';
  if (hasControlChars(next)) return '/';
  return next;
}
