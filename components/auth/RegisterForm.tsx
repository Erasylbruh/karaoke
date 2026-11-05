'use client';

import { useRef, useState, type FormEvent, type RefObject } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { safeNextPath } from '@/lib/login';

type FieldName = 'name' | 'username' | 'email' | 'password';
type Errors = Partial<Record<FieldName, string>>;

// Order of the fields on the page: the first invalid one gets the focus.
const FIELD_ORDER: FieldName[] = ['name', 'username', 'email', 'password'];

/** Reads `?next=`; uses `useSearchParams`, so render it inside `<Suspense>`. */
function useNextPath(): string {
  return safeNextPath(useSearchParams().get('next'));
}

/** "Уже есть аккаунт?" line for the page footer; keeps `?next=` for the login page. */
export function RegisterFooter() {
  const next = useNextPath();
  const href = next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`;
  return (
    <>
      Уже есть аккаунт?{' '}
      <Link href={href} className="font-medium text-accent hover:underline">
        Войти
      </Link>
    </>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const next = useNextPath();
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const refs: Record<FieldName, RefObject<HTMLInputElement | null>> = {
    name: nameRef,
    username: usernameRef,
    email: emailRef,
    password: passwordRef,
  };

  // Shows the errors and moves the focus to the first invalid field.
  const reject = (found: Errors) => {
    setErrors(found);
    const first = FIELD_ORDER.find((field) => found[field]);
    if (first) refs[first].current?.focus();
  };

  // Editing a field takes its error away.
  const clear = (field: FieldName) => setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedEmail = email.trim();
    const found: Errors = {};
    if (!name.trim()) found.name = 'Введите имя';
    if (!trimmedEmail) found.email = 'Введите email';
    // Something before the "@" is needed: the username is taken from it.
    else if (trimmedEmail.indexOf('@') < 1) found.email = 'Похоже, это не email';
    if (password.length < 4) found.password = 'Минимум 4 символа';
    if (FIELD_ORDER.some((field) => found[field])) {
      reject(found);
      return;
    }

    // The "@" is drawn in front of the field, so one typed by hand is dropped.
    const result = register({ username: username.trim().replace(/^@+/, ''), name, email: trimmedEmail });
    if (!result.ok) {
      reject({ [result.field]: result.message });
      return;
    }
    router.push(next);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <Field label="Имя *" error={errors.name}>
        {(control) => (
          <Input
            {...control}
            ref={nameRef}
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              clear('name');
            }}
          />
        )}
      </Field>

      <Field label="Имя пользователя" hint="Можно не заполнять — возьмём из email" error={errors.username}>
        {(control) => (
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[15px] text-fg-subtle">
              @
            </span>
            <Input
              {...control}
              ref={usernameRef}
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className="pl-7"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                clear('username');
              }}
            />
          </div>
        )}
      </Field>

      <Field label="Email *" error={errors.email}>
        {(control) => (
          <Input
            {...control}
            ref={emailRef}
            type="email"
            autoComplete="email"
            placeholder="liza@karaokecraft.ru"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              clear('email');
            }}
          />
        )}
      </Field>

      <Field label="Пароль *" error={errors.password}>
        {(control) => (
          <Input
            {...control}
            ref={passwordRef}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clear('password');
            }}
          />
        )}
      </Field>

      <Button type="submit" variant="primary" size="lg" block>
        Зарегистрироваться
      </Button>
    </form>
  );
}
