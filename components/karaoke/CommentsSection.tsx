'use client';

import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { formatDate, plural } from '@/lib/format';
import { addComment, deleteComment } from '@/lib/storage';
import { useStoredComments } from '@/lib/store';

interface CommentsSectionProps {
  karaokeId: string;
}

/** Reviews of a track: the form and the list, newest first. Has no frame of its own. */
export default function CommentsSection({ karaokeId }: CommentsSectionProps) {
  const { user, isAdmin } = useAuth();
  const comments = useStoredComments(karaokeId);
  const [guestName, setGuestName] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const listHeadingId = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = text.trim();
    if (!content) {
      setError('Напишите отзыв');
      textRef.current?.focus();
      return;
    }
    const now = Date.now();
    addComment({
      id: `comm-${now}`,
      karaokeId,
      userId: user?.id ?? `guest-${now}`,
      userName: user?.name ?? (guestName.trim() || 'Гость'),
      userAvatar: user?.avatar ?? '',
      content,
      createdAt: new Date(now).toISOString(),
    });
    setText('');
    setError(undefined);
  }

  // Ctrl/⌘+Enter sends from the text field.
  function onTextKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function remove(id: string) {
    deleteComment(id);
    // The pressed button disappears; keep focus inside the dialog, on the list.
    listHeadingRef.current?.focus();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} noValidate className="space-y-3">
        {!user && (
          <Field label="Имя">
            {(control) => (
              <Input
                {...control}
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                placeholder="Как вас зовут?"
                autoComplete="nickname"
                maxLength={40}
              />
            )}
          </Field>
        )}
        <Field label="Отзыв" error={error}>
          {(control) => (
            <Textarea
              {...control}
              ref={textRef}
              rows={3}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                if (error && event.target.value.trim()) setError(undefined);
              }}
              onKeyDown={onTextKeyDown}
              placeholder="Что вы думаете о треке?"
              maxLength={1000}
            />
          )}
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="sm" icon={<Send aria-hidden="true" />}>
            Отправить
          </Button>
        </div>
      </form>

      <section aria-labelledby={listHeadingId}>
        <h3
          ref={listHeadingRef}
          id={listHeadingId}
          tabIndex={-1}
          className="text-[13px] font-semibold tracking-wide text-fg-subtle uppercase outline-none"
        >
          {comments ? plural(comments.length, ['отзыв', 'отзыва', 'отзывов']) : 'Отзывы'}
        </h3>

        {comments === null ? (
          <div aria-busy="true" className="mt-2 space-y-4 pt-2">
            {[0, 1].map((index) => (
              <div key={index} className="flex gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <p className="mt-3 text-[14px] text-fg-muted">Пока нет отзывов. Будьте первым!</p>
        ) : (
          <ul className="mt-1">
            {comments.map((comment) => {
              const canDelete = isAdmin || (!!user && user.id === comment.userId);
              return (
                <li key={comment.id} className="flex items-start gap-3 border-t border-line py-4 first:border-t-0">
                  <Avatar name={comment.userName || 'Гость'} src={comment.userAvatar || undefined} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 leading-snug">
                      <span className="min-w-0 truncate text-[14px] font-semibold text-fg">{comment.userName || 'Гость'}</span>
                      <time dateTime={comment.createdAt} className="text-[13px] text-fg-subtle">
                        {formatDate(comment.createdAt)}
                      </time>
                    </p>
                    <p className="mt-1 text-[14px] leading-relaxed whitespace-pre-line text-fg-muted [overflow-wrap:anywhere]">
                      {comment.content}
                    </p>
                  </div>
                  {canDelete && (
                    <IconButton label="Удалить отзыв" variant="ghost" size="sm" onClick={() => remove(comment.id)} className="-mt-1 -mr-1.5">
                      <Trash2 aria-hidden="true" />
                    </IconButton>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
