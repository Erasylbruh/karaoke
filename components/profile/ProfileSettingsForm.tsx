'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import type { User } from '@/lib/types';

const BIO_MAX = 160;
const SAVED_MS = 2500;

/**
 * Edit form of the profile. The fields start from `user`; render it with `key={user.id}`
 * so that switching to another user resets them.
 */
export function ProfileSettingsForm({ user }: { user: User }) {
  const { updateProfile } = useAuth();
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio ?? '');
  const [avatar, setAvatar] = useState(user.avatar);
  const [nameError, setNameError] = useState('');
  const [saved, setSaved] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Введите имя');
      setSaved(false);
      nameRef.current?.focus();
      return;
    }
    updateProfile({ name: trimmed, bio: bio.trim(), avatar: avatar.trim() });
    setName(trimmed);
    setSaved(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setSaved(false), SAVED_MS);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex max-w-xl flex-col gap-5 rounded-3xl border border-line bg-surface-1 p-6 sm:p-8">
      <Field label="Имя" error={nameError}>
        {(control) => (
          <Input
            {...control}
            ref={nameRef}
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameError('');
            }}
          />
        )}
      </Field>

      <Field label="О себе" hint={`${bio.length} / ${BIO_MAX}`}>
        {(control) => (
          <Textarea
            {...control}
            rows={3}
            maxLength={BIO_MAX}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
          />
        )}
      </Field>

      <div className="flex items-start gap-3">
        <Field label="Ссылка на аватар" className="min-w-0 flex-1">
          {(control) => (
            <Input
              {...control}
              type="url"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="https://"
              value={avatar}
              onChange={(event) => setAvatar(event.target.value)}
            />
          )}
        </Field>
        <Avatar name={name || user.name} src={avatar.trim() || undefined} size={56} className="mt-[19px]" />
      </div>

      <div className="flex items-center gap-4">
        <Button type="submit" variant="primary">
          Сохранить
        </Button>
        <p role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-success">
          {saved && (
            <>
              <Check aria-hidden="true" className="size-4" />
              Сохранено
            </>
          )}
        </p>
      </div>
    </form>
  );
}
