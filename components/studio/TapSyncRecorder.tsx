'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Undo2 } from 'lucide-react';
import { usePlayback } from '@/components/player/usePlayback';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { formatTime, plural } from '@/lib/format';
import {
  createTapSession,
  isComplete,
  nextLineIndex,
  tap,
  textToLines,
  toLyricLines,
  undoTap,
  type TapSession,
} from '@/lib/tap-sync';
import type { LyricLine } from '@/lib/types';

export interface TapSyncRecorderProps {
  /** Lyrics to start with, one line per row. */
  initialText: string;
  /** Called after the last line is marked, with the timed lines. */
  onComplete: (lines: LyricLine[]) => void;
  /** Called when a recording starts, so the caller can silence whatever else plays the synth. */
  onStart?: () => void;
}

/** A recording stops by itself at this length (seconds). */
const MAX_DURATION = 600;
const NO_LINES_ERROR = 'Добавьте хотя бы одну строку';

function stoppedEarly(session: TapSession): string {
  return `Отмечено ${session.marks.length} из ${session.texts.length} — запишите заново`;
}

/**
 * Tap-to-sync: paste plain lyrics, start the music and tap (button or Space) as each line begins.
 * The taps become the lines' times.
 */
export function TapSyncRecorder({ initialText, onComplete, onStart }: TapSyncRecorderProps) {
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | undefined>(undefined);
  // Non-null while recording.
  const [session, setSession] = useState<TapSession | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const playback = usePlayback({ duration: MAX_DURATION, preset: 'pop' });
  const { time, isPlaying } = playback;

  const lineCount = textToLines(text).length;

  // The clock ran out (or was stopped from outside): the recording ends like a stop.
  if (session && !isPlaying) {
    setNotice(stoppedEarly(session));
    setSession(null);
  }

  function start() {
    const texts = textToLines(text);
    if (texts.length === 0) {
      setError(NO_LINES_ERROR);
      return;
    }
    onStart?.();
    setError(undefined);
    setNotice(null);
    setSession(createTapSession(texts));
    playback.seek(0);
    playback.play();
  }

  function stop() {
    if (!session) return;
    playback.pause();
    setNotice(stoppedEarly(session));
    setSession(null);
  }

  function tapNow() {
    if (!session) return;
    const next = tap(session, time);
    if (next === session) return;
    if (isComplete(next)) {
      playback.pause();
      setSession(null);
      onComplete(toLyricLines(next));
      return;
    }
    setSession(next);
  }

  function undo() {
    if (session) setSession(undoTap(session));
  }

  // The key listener below is added once per recording; it calls whatever the latest render defined.
  const actionsRef = useRef({ tapNow, undo, stop });
  useEffect(() => {
    actionsRef.current = { tapNow, undo, stop };
  });

  const recording = session !== null;
  useEffect(() => {
    if (!recording) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const actions = actionsRef.current;
      if (event.code === 'Space') {
        // Keeps the page from scrolling; a held key must not tap over and over.
        event.preventDefault();
        if (!event.repeat) actions.tapNow();
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        if (!event.repeat) actions.undo();
      } else if (event.key === 'Escape') {
        actions.stop();
      }
    }
    // A focused button would otherwise click again when Space is released.
    function onKeyUp(event: KeyboardEvent) {
      if (event.code === 'Space') event.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [recording]);

  if (session) {
    const next = nextLineIndex(session);
    const following = session.texts[next + 1];
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4 text-[14px] text-fg-muted tabular-nums">
          <p aria-live="polite">
            Отмечено <span className="font-semibold text-fg">{`${session.marks.length} / ${session.texts.length}`}</span>
          </p>
          <p>{formatTime(time)}</p>
        </div>

        <div className="rounded-2xl border border-line bg-surface-2 px-5 py-6">
          <p className="text-[13px] text-fg-subtle">Нажмите «Тап», когда начнётся</p>
          <p className="mt-2 text-[24px] leading-tight font-bold text-fg [overflow-wrap:anywhere]">{session.texts[next]}</p>
          {following !== undefined && <p className="mt-4 text-[16px] text-fg-subtle [overflow-wrap:anywhere]">{following}</p>}
        </div>

        <Button variant="primary" size="lg" block onClick={tapNow}>
          Тап
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" icon={<Undo2 aria-hidden="true" />} onClick={undo}>
            Отменить
          </Button>
          <Button variant="ghost" onClick={stop}>
            Стоп
          </Button>
          <p className="ml-auto hidden text-[13px] text-fg-subtle sm:block">Пробел — тап, Backspace — отмена, Esc — стоп</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Текст песни" hint="Одна строка — одна строка караоке" error={error}>
        {(control) => (
          <Textarea
            {...control}
            rows={8}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setError(undefined);
              setNotice(null);
            }}
          />
        )}
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <p className="text-[13px] text-fg-muted tabular-nums">{plural(lineCount, ['строка', 'строки', 'строк'])}</p>
        <Button variant="primary" icon={<Mic aria-hidden="true" />} onClick={start}>
          Начать запись
        </Button>
      </div>

      <p role="status" className="text-[14px] text-fg-muted empty:hidden">
        {notice}
      </p>
    </div>
  );
}
