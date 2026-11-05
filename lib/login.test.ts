import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { User } from './types';
import { findUserByIdentifier, buildUserFromIdentifier, safeNextPath } from './login.ts';

const base = { avatar: '', createdAt: '2026-01-01T00:00:00Z' };
const users: User[] = [
  { ...base, id: 'user-admin', username: 'admin', name: 'Администратор', email: 'admin@karaokecraft.ru', role: 'admin' },
  { ...base, id: 'user-liza', username: 'liza_veter', name: 'Лиза Ветер', email: 'liza@karaokecraft.ru', role: 'user' },
];

test('findUserByIdentifier matches username or email ignoring case and spaces', () => {
  assert.equal(findUserByIdentifier(users, 'Admin')?.id, 'user-admin');
  assert.equal(findUserByIdentifier(users, '  LIZA@karaokecraft.ru ')?.id, 'user-liza');
  assert.equal(findUserByIdentifier(users, 'liza veter')?.id, 'user-liza');
  assert.equal(findUserByIdentifier(users, 'nobody'), undefined);
  assert.equal(findUserByIdentifier(users, '   '), undefined);
});

test('buildUserFromIdentifier from a username can be found again', () => {
  const u = buildUserFromIdentifier('Vasya Pupkin', users, 'user-1', '2026-10-28T00:00:00Z');
  assert.deepEqual(
    { id: u.id, username: u.username, email: u.email, name: u.name, role: u.role },
    { id: 'user-1', username: 'vasya_pupkin', email: 'vasya_pupkin@karaokecraft.demo', name: 'Vasya Pupkin', role: 'user' },
  );
  assert.equal(findUserByIdentifier([...users, u], 'VASYA pupkin')?.id, 'user-1');
});

test('buildUserFromIdentifier from an email keeps usernames unique', () => {
  const u = buildUserFromIdentifier('Admin@Other.com', users, 'user-2', '2026-10-28T00:00:00Z');
  assert.equal(u.email, 'admin@other.com');
  assert.equal(u.username, 'admin2');
  assert.equal(u.name, 'Admin');
  assert.equal(findUserByIdentifier([...users, u], 'admin@other.com')?.id, 'user-2');
});

test('safeNextPath allows only same-site paths', () => {
  assert.equal(safeNextPath('/profile'), '/profile');
  assert.equal(safeNextPath('/karaoke/x?y=1'), '/karaoke/x?y=1');
  assert.equal(safeNextPath(null), '/');
  assert.equal(safeNextPath('//evil.com'), '/');
  assert.equal(safeNextPath('https://evil.com'), '/');
  assert.equal(safeNextPath('/\\evil.com'), '/');
});

test('safeNextPath rejects control characters that URL parsers strip', () => {
  // `?next=/%09/evil.com` decodes to "/\t/evil.com"; a browser drops the tab and reads "//evil.com".
  assert.equal(safeNextPath('/\t/evil.com'), '/');
  assert.equal(safeNextPath('/\n/evil.com'), '/');
  assert.equal(safeNextPath('/profile\r\nSet-Cookie: x=1'), '/');
});
