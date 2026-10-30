'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Send } from 'lucide-react';
import VideoDownloaderModal, { formatForAspect } from '@/components/karaoke/VideoDownloaderModal';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Segmented, tabPanelProps } from '@/components/ui/segmented';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import type { StyleFontKey } from '@/lib/fonts';
import { formatTime, plural } from '@/lib/format';
import { toLrc } from '@/lib/lrc';
import { trackDuration } from '@/lib/lyrics';
import { PROTOTYPE_LYRICS } from '@/lib/mock-data';
import { PALETTES } from '@/lib/palettes';
import { saveKaraoke } from '@/lib/storage';
import { GUEST_USER_ID } from '@/lib/store';
import type { Karaoke, LyricLine, User } from '@/lib/types';
import { LrcEditor } from './LrcEditor';
import { StudioPreview, type StudioPreviewHandle } from './StudioPreview';
import { StudioSection } from './StudioSection';
import { StylePanel } from './StylePanel';
import { MAX_TAGS, TagInput } from './TagInput';
import { TapSyncRecorder } from './TapSyncRecorder';

export type StudioDraft = {
  title: string;
  artist: string;
  description: string;
  tags: string[];
  lyrics: LyricLine[];
  lrcText: string;
  font: StyleFontKey;
  textColor: string;
  activeColor: string;
  backgroundColor: string;
  fontSize: number;
  aspect: 'v' | 'h';
};

const NIGHT = PALETTES[0];

const INITIAL_DRAFT: StudioDraft = {
  title: 'Ночной автобус',
  artist: 'Лиза Ветер',
  description: 'Атмосферный трек для ночных поездок.',
  tags: ['поп', 'ночь'],
  lyrics: PROTOTYPE_LYRICS,
  lrcText: toLrc(PROTOTYPE_LYRICS),
  font: 'Onest',
  textColor: NIGHT.text,
  activeColor: NIGHT.active,
  backgroundColor: NIGHT.background,
  fontSize: 32,
  aspect: 'v',
};

type LyricsMode = 'lrc' | 'tap';

const LYRICS_MODES = [
  { value: 'lrc', label: 'LRC' },
  { value: 'tap', label: 'На слух' },
] as const;

const DEFAULT_ARTIST = 'Неизвестный исполнитель';

/** The draft as a track. `id` and the author are what make it a published one. */
function draftToKaraoke(draft: StudioDraft, id: string, user: User | null): Karaoke {
  return {
    id,
    title: draft.title.trim(),
    artist: draft.artist.trim() || DEFAULT_ARTIST,
    description: draft.description.trim(),
    tags: draft.tags.length ? draft.tags : ['караоке'],
    duration: trackDuration(draft.lyrics),
    audioPreset: 'pop',
    style: {
      font: draft.font,
      textColor: draft.textColor,
      activeColor: draft.activeColor,
      backgroundColor: draft.backgroundColor,
      fontSize: 'md',
      fontSizePx: draft.fontSize,
      aspectRatio: draft.aspect === 'v' ? '9:16' : '16:9',
    },
    authorId: user?.id ?? GUEST_USER_ID,
    authorName: user?.name ?? 'Гость',
    authorAvatar: user?.avatar,
    likesCount: 1,
    viewsCount: 1,
    recommendationScore: 8,
    createdAt: new Date().toISOString(),
    lyrics: draft.lyrics,
  };
}

/** Readable id from the title plus four digits of the clock, as tracks have always been named. */
function slugId(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9а-яё]/gi, '-')
      .replace(/-+/g, '-') +
    '-' +
    Date.now().toString().slice(-4)
  );
}

/**
 * The studio: three steps (track, lyrics with timings, style) next to a live preview,
 * and a bar fixed to the bottom with video export and publishing.
 */
export function Studio() {
  const router = useRouter();
  const { user } = useAuth();
  const { show } = useToast();

  const [draft, setDraft] = useState<StudioDraft>(INITIAL_DRAFT);
  const [titleError, setTitleError] = useState<string | undefined>(undefined);
  const [exportOpen, setExportOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [lyricsMode, setLyricsMode] = useState<LyricsMode>('lrc');
  const titleRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<StudioPreviewHandle>(null);

  const update = (patch: Partial<StudioDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const duration = trackDuration(draft.lyrics);
  const status = `${plural(draft.lyrics.length, ['строка', 'строки', 'строк'])} · ${formatTime(duration)}`;

  // The exporter reads the draft as an unsaved track.
  const exportTrack = useMemo(() => {
    const track = draftToKaraoke(draft, 'preview', user);
    return { ...track, title: track.title || 'Без названия' };
  }, [draft, user]);

  function publish() {
    if (publishing) return;
    if (!draft.title.trim()) {
      setTitleError('Введите название');
      titleRef.current?.focus();
      return;
    }
    setPublishing(true);
    const track = saveKaraoke(draftToKaraoke(draft, slugId(draft.title), user));
    show('Трек опубликован', 'success');
    router.push('/karaoke/' + track.id);
  }

  function onTapComplete(lines: LyricLine[]) {
    update({ lyrics: lines, lrcText: toLrc(lines) });
    setLyricsMode('lrc');
    show('Тайминги записаны', 'success');
  }

  function openExport() {
    // The exporter plays the shared synth itself.
    previewRef.current?.pause();
    setExportOpen(true);
  }

  return (
    <>
      <div className="wrap grid gap-8 pt-8 pb-28 lg:grid-cols-[minmax(0,1fr)_minmax(360px,520px)]">
        <div className="flex min-w-0 flex-col gap-6">
          <header>
            <h1 className="font-display text-[clamp(28px,4vw,38px)] leading-[1.1] font-bold tracking-[-0.02em] text-fg">Студия</h1>
            <p className="mt-3 max-w-xl text-[15px] text-fg-muted">
              Три шага до своего караоке: данные трека, текст с таймингами и стиль. Предпросмотр сразу показывает результат.
            </p>
          </header>

          <StudioSection step={1} title="Трек" description="Так песню найдут в каталоге.">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Название" error={titleError}>
                {(control) => (
                  <Input
                    {...control}
                    ref={titleRef}
                    required
                    autoComplete="off"
                    value={draft.title}
                    onChange={(event) => {
                      update({ title: event.target.value });
                      if (titleError) setTitleError(undefined);
                    }}
                    className="scroll-mt-28"
                  />
                )}
              </Field>
              <Field label="Артист">
                {(control) => (
                  <Input
                    {...control}
                    autoComplete="off"
                    placeholder={DEFAULT_ARTIST}
                    value={draft.artist}
                    onChange={(event) => update({ artist: event.target.value })}
                  />
                )}
              </Field>
              <Field label="Описание" className="sm:col-span-2">
                {(control) => (
                  <Textarea
                    {...control}
                    rows={2}
                    value={draft.description}
                    onChange={(event) => update({ description: event.target.value })}
                  />
                )}
              </Field>
              <Field label="Теги" hint={`Enter или запятая добавляют тег, до ${MAX_TAGS} штук.`} className="sm:col-span-2">
                {(control) => (
                  <TagInput
                    id={control.id}
                    aria-describedby={control['aria-describedby']}
                    value={draft.tags}
                    onChange={(tags) => update({ tags })}
                  />
                )}
              </Field>
            </div>
          </StudioSection>

          <StudioSection
            step={2}
            title="Текст и тайминги"
            description="Каждой строке нужна метка времени, когда её начинают петь."
          >
            <div className="flex flex-col gap-5">
              <Segmented
                label="Способ ввода"
                mode="tabs"
                idPrefix="lyrics"
                size="sm"
                options={LYRICS_MODES}
                value={lyricsMode}
                onChange={setLyricsMode}
              />
              <div {...tabPanelProps('lyrics', lyricsMode)}>
                {lyricsMode === 'lrc' ? (
                  <LrcEditor
                    text={draft.lrcText}
                    onChange={(lrcText, lines) => update(lines ? { lrcText, lyrics: lines } : { lrcText })}
                  />
                ) : (
                  <TapSyncRecorder
                    initialText={draft.lyrics.map((line) => line.text).join('\n')}
                    onComplete={onTapComplete}
                    onStart={() => previewRef.current?.pause()}
                  />
                )}
              </div>
            </div>
          </StudioSection>

          <StudioSection step={3} title="Стиль" description="Шрифт, цвета и формат кадра.">
            <StylePanel draft={draft} onChange={update} />
          </StudioSection>
        </div>

        <aside aria-label="Предпросмотр" className="order-first min-w-0 lg:sticky lg:top-24 lg:order-none lg:self-start">
          <div className="rounded-3xl border border-line bg-surface-1 p-4">
            <StudioPreview ref={previewRef} draft={draft} />
          </div>
        </aside>
      </div>

      {/* The bar would cover the end of the page, so the site footer (a direct child of <body>, unlike a dialog's) makes room for it. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl [body:has(&)>footer]:pb-[calc(68px+env(safe-area-inset-bottom))]">
        <div className="wrap flex h-[68px] items-center justify-between gap-3">
          <p className="hidden text-[14px] text-fg-muted tabular-nums sm:block">{status}</p>
          <div className="flex flex-1 items-center gap-2 sm:flex-none sm:gap-3">
            <Button variant="secondary" icon={<Download aria-hidden="true" />} onClick={openExport} className="flex-1 sm:flex-none">
              Скачать видео
            </Button>
            <Button
              variant="primary"
              icon={<Send aria-hidden="true" />}
              onClick={publish}
              disabled={publishing}
              className="flex-1 sm:flex-none"
            >
              Опубликовать
            </Button>
          </div>
        </div>
      </div>

      <VideoDownloaderModal
        karaoke={exportTrack}
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        initialFormat={formatForAspect(draft.aspect)}
      />
    </>
  );
}
