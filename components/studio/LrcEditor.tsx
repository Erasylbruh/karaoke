'use client';

import { useId, useMemo, useRef, type ChangeEvent } from 'react';
import { Check, TriangleAlert, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { plural } from '@/lib/format';
import { parseLrc } from '@/lib/lrc';
import type { LyricLine } from '@/lib/types';

export interface LrcEditorProps {
  text: string;
  /** `lines` is null when the text holds no timed line; the previous lines should then stay. */
  onChange: (text: string, lines: LyricLine[] | null) => void;
}

const NO_LINES_ERROR = 'Не нашли ни одной строки с таймингом вида [00:12.00]';

/** Text box for lyrics in LRC format, with an .lrc file upload and a count of the lines found. */
export function LrcEditor({ text, onChange }: LrcEditorProps) {
  const id = useId();
  const statusId = `${id}-status`;
  const fileRef = useRef<HTMLInputElement>(null);
  const { show } = useToast();

  const count = useMemo(() => parseLrc(text).length, [text]);
  const invalid = count === 0;

  function change(next: string) {
    const lines = parseLrc(next);
    onChange(next, lines.length > 0 ? lines : null);
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Cleared, so picking the same file again still fires `change`.
    input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => change(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => show('Не удалось прочитать файл', 'error');
    reader.readAsText(file);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <label htmlFor={id} className="text-[14px] font-medium text-fg">
          Текст в формате LRC
        </label>
        <Button size="sm" icon={<Upload aria-hidden="true" />} onClick={() => fileRef.current?.click()}>
          Загрузить .lrc
        </Button>
        <input ref={fileRef} type="file" accept=".lrc,.txt" hidden onChange={onFile} />
      </div>

      <Textarea
        id={id}
        rows={8}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        value={text}
        onChange={(event) => change(event.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={statusId}
        placeholder={'[00:00.00] Первая строка\n[00:04.00] Вторая строка'}
        className="font-mono leading-relaxed"
      />

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 text-[13px]">
        <p id={statusId} aria-live="polite" className={invalid ? 'flex items-start gap-1.5 text-danger' : 'flex items-center gap-1.5 text-fg-muted'}>
          {invalid ? (
            <>
              <TriangleAlert aria-hidden="true" className="mt-px size-4 shrink-0" />
              {NO_LINES_ERROR}
            </>
          ) : (
            <>
              <Check aria-hidden="true" className="size-4 shrink-0 text-success" />
              {plural(count, ['строка', 'строки', 'строк'])}
            </>
          )}
        </p>
        <p className="text-fg-subtle">
          Каждая строка: <span className="font-mono">[мм:сс.сс] текст</span>
        </p>
      </div>
    </div>
  );
}
