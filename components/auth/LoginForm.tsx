'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { safeNextPath } from '@/lib/login';

const IDENTIFIER_REQUIRED = 'Введите имя пользователя или email';

/** Reads `?next=`; uses `useSearchParams`, so render it inside `<Suspense>`. */
function useNextPath(): string {
  return safeNextPath(useSearchParams().get('next'));
}

/** "Нет аккаунта?" line for the page footer; keeps `?next=` for the register page. */
export function LoginFooter() {
  const next = useNextPath();
  const href = next === '/' ? '/register' : `/register?next=${encodeURIComponent(next)}`;
  return (
    <>
      Нет аккаунта?{' '}
      <Link href={href} className="font-medium text-accent hover:underline">
        Зарегистрироваться
      </Link>
    </>
  );
}

export function LoginForm() {
  const router = useRouter();
  const next = useNextPath();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const identifierRef = useRef<HTMLInputElement>(null);

  // Signs in and leaves for `next`; on a refusal shows the message at the field and focuses it.
  const signIn = (value: string) => {
    const trimmed = value.trim();
    let message = '';
    if (trimmed === '' || trimmed.startsWith('@')) {
      message = IDENTIFIER_REQUIRED;
    } else {
      try {
        login(trimmed);
      } catch (err) {
        message = err instanceof Error ? err.message : IDENTIFIER_REQUIRED;
      }
    }
    if (message) {
      setError(message);
      identifierRef.current?.focus();
      return;
    }
    router.push(next);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    signIn(identifier);
  };

  return (
    <div>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <Field label="Имя пользователя или email" error={error}>
          {(control) => (
            <Input
              {...control}
              ref={identifierRef}
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="liza_veter или liza@karaokecraft.ru"
              value={identifier}
              onChange={(event) => {
                setIdentifier(event.target.value);
                setError('');
              }}
            />
          )}
        </Field>

        <Field label="Пароль" hint="В демо подойдёт любой пароль">
          {(control) => (
            <Input
              {...control}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>

        <Button type="submit" variant="primary" size="lg" block>
          Войти
        </Button>
      </form>

      <div className="mt-8 border-t border-line pt-6">
        <h2 className="text-[14px] font-medium text-fg-muted">Быстрый вход для демо</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <Button block icon={<User aria-hidden="true" />} onClick={() => signIn('liza_veter')}>
            Лиза — пользователь
          </Button>
          <Button block icon={<ShieldCheck aria-hidden="true" />} onClick={() => signIn('admin')}>
            Администратор
          </Button>
        </div>
      </div>
    </div>
  );
}
