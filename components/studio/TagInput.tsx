'use client';

import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

export const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 24;

export interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Wiring from a `Field`: the label's target and its hint. */
  id?: string;
  'aria-describedby'?: string;
}

/** Adds the typed tags to `tags`: trimmed, lower-case, without repeats, at most 8 of up to 24 characters. */
function addTags(tags: string[], typed: string[]): string[] {
  const next = [...tags];
  for (const raw of typed) {
    const tag = raw.trim().toLowerCase().slice(0, MAX_TAG_LENGTH).trim();
    if (tag && !next.includes(tag) && next.length < MAX_TAGS) next.push(tag);
  }
  return next;
}

/**
 * Tags as chips inside a text field. Enter or a comma turns the typed text into a tag
 * (leaving the field does too); Backspace in the empty field removes the last one.
 */
export function TagInput({ value, onChange, id, 'aria-describedby': describedBy }: TagInputProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const full = value.length >= MAX_TAGS;

  function commit(typed: string[]) {
    const next = addTags(value, typed);
    if (next.length !== value.length) onChange(next);
  }

  // A comma can arrive without a key event (phone keyboards, paste), so it is handled here too.
  function onTextChange(event: ChangeEvent<HTMLInputElement>) {
    const parts = event.target.value.split(',');
    if (parts.length > 1) commit(parts.slice(0, -1));
    setText(parts[parts.length - 1]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit([text]);
      setText('');
    } else if (event.key === 'Backspace' && text === '' && value.length > 0) {
      event.preventDefault();
      onChange(value.slice(0, -1));
    }
  }

  function onBlur() {
    if (text.trim() === '') return;
    commit([text]);
    setText('');
  }

  function remove(tag: string) {
    onChange(value.filter((item) => item !== tag));
    inputRef.current?.focus();
  }

  return (
    // The whole box acts as the field: a click on its empty part puts the caret in the input.
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) inputRef.current?.focus();
      }}
      className="flex min-h-10 w-full cursor-text flex-wrap items-center gap-1.5 rounded-field border border-line bg-surface-2 px-1.5 py-1.5 transition-[border-color,box-shadow] duration-150 focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--color-accent-soft)] hover:border-line-strong focus-within:hover:border-accent"
    >
      {value.length > 0 && (
        <ul role="list" className="contents" aria-label="Добавленные теги">
          {value.map((tag) => (
            <li key={tag} className="inline-flex h-7 max-w-full items-center gap-0.5 rounded-full bg-accent-soft pr-0.5 pl-3 text-[13px] font-medium text-accent">
              <span className="truncate">{tag}</span>
              <button
                type="button"
                aria-label={`Удалить тег ${tag}`}
                title={`Удалить тег ${tag}`}
                onClick={() => remove(tag)}
                className="grid size-6 shrink-0 place-items-center rounded-full transition-colors hover:bg-accent/20"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        id={id}
        aria-describedby={describedBy}
        value={text}
        onChange={onTextChange}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        enterKeyHint="enter"
        autoComplete="off"
        placeholder={full ? 'Больше тегов не добавить' : value.length === 0 ? 'Например, поп' : 'Ещё тег'}
        className="h-7 min-w-[8rem] flex-1 bg-transparent px-1.5 text-[16px] text-fg placeholder:text-fg-subtle focus-visible:outline-none md:text-[15px]"
      />
    </div>
  );
}
