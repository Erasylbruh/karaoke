'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Karaoke, LyricLine, LyricWord, Visibility } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { saveKaraoke, updateKaraoke, getKaraokeById, fetchKaraokeById, getKaraokes, artistSlug, initialRecommendationScore, uid, getGenres, MAX_GENRES } from '@/lib/storage';
import { pluralRu, safeMediaUrl } from '@/lib/format';
import { contrastRatio } from '@/lib/karaoke-fill';
import { isBlobRef, putBlob, resolveBlobUrl } from '@/lib/blob-store';
import {
  DEFAULT_FONTS,
  POPULAR_FONTS,
  FONT_FILE_ACCEPT,
  FONT_FILE_MAX_BYTES,
  GOOGLE_FONT_NAME,
  fontCss,
  loadGoogleFont,
  loadCustomFont,
  looksLikeFont,
} from '@/lib/fonts';
import { alignLyrics, isAlignerOnline, localAccessState, LOCAL_ACCESS_HINT } from '@/lib/alignment';
import { useDownloads } from '@/context/DownloadsContext';
import { compressAudio, needsCompression } from '@/lib/audio-compress';
import CoverCropModal from '@/components/karaoke/CoverCropModal';
import { cropToBlob, looksLikeImage, openImageFile, saveCover, type CropRect } from '@/lib/cover';

const STEPS = ['Аудио и информация', 'Текст и тайминг', 'Стиль', 'Доступ'] as const;

const STYLE_THEMES = [
  { id: 'amber', name: 'Янтарная сцена', bg: '#1d1b3a', active: '#ffb547', text: '#f4f4f5', font: 'Onest' },
  { id: 'vinyl', name: 'Тёплый винил', bg: '#231815', active: '#ff7a45', text: '#f5ebe6', font: 'Playfair Display' },
  { id: 'indie', name: 'Полуночный инди', bg: '#0f172a', active: '#38bdf8', text: '#e2e8f0', font: 'Space Grotesk' },
  { id: 'minimal', name: 'Чистый минимал', bg: '#121214', active: '#ffffff', text: '#a1a1aa', font: 'Inter' },
  { id: 'club', name: 'Неоновый клуб', bg: '#160d29', active: '#fb7185', text: '#f8fafc', font: 'Unbounded' },
  { id: 'cinema', name: 'Кинотитр', bg: '#141917', active: '#fde047', text: '#e7e5e4', font: 'Georgia' },
] as const;

// The lyrics block can only be dragged inside the safe area, split into zones 1-3 (top / middle / bottom).
const ZONE_TOP = 14;
const ZONE_BOTTOM = 88;
const ZONES = [1, 2, 3];

const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i;
/** Storage limit for the uploaded (possibly compressed) file. */
const AUDIO_MAX_BYTES = 40 * 1024 * 1024;
/** Biggest original we try to compress in the browser (a ~20-minute WAV). */
const AUDIO_SOURCE_MAX_BYTES = 250 * 1024 * 1024;

const SAMPLE_TEXT = `Город гаснет за стеклом
Фонари плывут рекой
Я держу твой голос в кармане
Как проездной на всю зиму`;

interface Line {
  id: string;
  text: string;
  time: number;
  end: number;
  words?: LyricWord[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

function parseLrc(text: string): Line[] {
  const out: Line[] = [];
  const re = /\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\](.*)/;
  text.split('\n').forEach((l, idx) => {
    const m = l.match(re);
    const t = m?.[3].trim();
    if (m && t) {
      const start = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
      out.push({ id: `l-${idx}-${Date.now()}`, text: t, time: round1(start), end: round1(start + 3.5) });
    }
  });
  // An LRC file only has starts: end each line just before the next one begins.
  return out.map((l, i) => ({ ...l, end: out[i + 1] ? round1(Math.min(l.end, out[i + 1].time)) : l.end }));
}

/** `editId` switches the wizard to editing an existing karaoke of the signed-in author. */
export default function KaraokeCreator({ editId }: { editId?: string } = {}) {
  const router = useRouter();
  const { user, isLoading, openAuthPrompt } = useAuth();

  const [step, setStep] = useState(0);

  // Step 1
  const [audioRef_, setAudioRef] = useState<string | null>(null); // stored blob ref
  const [audioUrl, setAudioUrl] = useState<string | null>(null); // object URL for playback
  const [audioName, setAudioName] = useState('');
  const [audioDuration, setAudioDuration] = useState(0);
  const [demoAudio, setDemoAudio] = useState(false);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [description, setDescription] = useState('');
  /** Genres picked from the admin-managed list (stored in `tags`). */
  const [genres, setGenres] = useState<string[]>([]);
  const [coverImage, setCoverImage] = useState<string | undefined>();
  /** Picked picture waiting in the crop window (object URL), and whether the crop is being saved. */
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [coverSaving, setCoverSaving] = useState(false);

  // Step 2
  const [rawText, setRawText] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [audioTime, setAudioTime] = useState<number | null>(null);
  const [tapMode, setTapMode] = useState(false);
  const [tapIdx, setTapIdx] = useState(0);

  // Step 3
  const [font, setFont] = useState('Onest');
  const [fontFile, setFontFile] = useState<string | undefined>();
  const [googleName, setGoogleName] = useState('');
  const [activeColor, setActiveColor] = useState('#ffb547');
  const [textColor, setTextColor] = useState('#f4f4f5');
  const [backgroundColor, setBackgroundColor] = useState('#1d1b3a');
  const [fontSize, setFontSize] = useState(32);
  const [fillAnimation, setFillAnimation] = useState(true);
  const [aspectRatio, setAspectRatio] = useState<'v' | 'h'>('v');
  const [textY, setTextY] = useState(50);

  // Step 4
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [rightsConfirmed, setRightsConfirmed] = useState(!!editId);

  const [previewLineIndex, setPreviewLineIndex] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const { startDownload } = useDownloads();
  const [busy, setBusy] = useState(false);
  // Share of the audio file sent to the cloud (0..1) while it uploads.
  const [uploadShare, setUploadShare] = useState<number | null>(null);
  const [uploadPhase, setUploadPhase] = useState<'compress' | 'upload'>('upload');
  // Auto timing: null = not checked yet; confidence per line id after a run.
  const [alignerOnline, setAlignerOnline] = useState<boolean | null>(null);
  const [aligning, setAligning] = useState(false);
  const [lineConfidence, setLineConfidence] = useState<Record<string, number>>({});

  const audioEl = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const blockRef = useRef<HTMLDivElement | null>(null);
  const dragGrab = useRef<number | null>(null);
  const toastTimer = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), Math.max(2800, msg.length * 60));
  };

  const [editState, setEditState] = useState<'none' | 'loaded' | 'denied'>('none');
  useEffect(() => {
    if (!editId || isLoading) return;
    let alive = true;
    void (async () => {
      const k = getKaraokeById(editId) ?? (await fetchKaraokeById(editId));
      if (!alive) return;
      if (!k || !user || (k.authorId !== user.id && user.role !== 'admin')) {
        setEditState('denied');
        return;
      }
      setTitle(k.title);
      setArtist(k.artist);
      setDescription(k.description || '');
      setGenres(k.tags.filter((t) => t !== 'караоке'));
      setCoverImage(k.style.coverImage);
      if (k.audioUrl) {
        setAudioRef(k.audioUrl);
        setAudioName('загруженный трек');
        const resolved = await resolveBlobUrl(k.audioUrl);
        if (alive) setAudioUrl(resolved);
      } else setDemoAudio(true);
      setAudioDuration(k.duration || 0);
      const loaded = k.lyrics.map((l, i) => ({
        id: l.id || `l-${i}`,
        text: l.text,
        time: l.time,
        end: l.end ?? k.lyrics[i + 1]?.time ?? l.time + 4,
        words: l.words,
      }));
      setLines(loaded);
      setRawText(loaded.map((l) => l.text).join('\n'));
      setFont(k.style.font || 'Onest');
      setFontFile(k.style.fontFile);
      if (k.style.fontFile) void loadCustomFont(k.style.font, k.style.fontFile).catch(() => {});
      else loadGoogleFont(k.style.font || 'Onest');
      setActiveColor(k.style.activeColor);
      setTextColor(k.style.textColor);
      setBackgroundColor(k.style.backgroundColor);
      setFontSize(k.style.fontSizePx || 32);
      setFillAnimation(k.style.fillAnimation !== false);
      setAspectRatio(k.style.aspectRatio === '16:9' || k.style.aspectRatio === 'h' ? 'h' : 'v');
      setTextY(k.style.textY ?? 50);
      setVisibility(k.visibility);
      setRightsConfirmed(true);
      setEditState('loaded');
    })();
    return () => {
      alive = false;
    };
  }, [editId, isLoading, user]);

  const knownArtists = useMemo(
    () => (typeof window === 'undefined' ? [] : [...new Set(getKaraokes().map((k) => k.artist))]),
    []
  );

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  // Preview cycles through lines by itself until the author plays the audio.
  useEffect(() => {
    if (lines.length === 0) return;
    const timer = setInterval(() => setPreviewLineIndex((p) => (p + 1) % lines.length), 2200);
    return () => clearInterval(timer);
  }, [lines.length]);

  // ---------- Step 1: audio ----------
  const handleAudio = async (file?: File) => {
    if (!file) return;
    if (!(file.type.startsWith('audio/') || AUDIO_EXT.test(file.name))) {
      showToast('Нужен аудиофайл: mp3, wav, ogg, m4a, aac или flac');
      return;
    }
    if (file.size > AUDIO_SOURCE_MAX_BYTES) {
      showToast('Файл слишком большой — максимум 250 МБ');
      return;
    }
    setBusy(true);
    setUploadShare(0);
    try {
      // Long WAV/FLAC files would not fit the storage limit: shrink them to M4A first.
      if (needsCompression(file)) {
        setUploadPhase('compress');
        try {
          file = await compressAudio(file, setUploadShare);
        } catch {
          // keep the original; the size check below decides whether it can still be uploaded
        }
        setUploadShare(0);
      }
      if (file.size > AUDIO_MAX_BYTES) {
        showToast('Файл слишком большой даже после сжатия — максимум 40 МБ');
        return;
      }
      setUploadPhase('upload');
      const ref = await putBlob(file, 'audio', setUploadShare);
      if (isBlobRef(ref)) showToast('Не удалось загрузить песню в облако: пока она будет слышна только в этом браузере');
      setAudioRef(ref);
      setAudioUrl(URL.createObjectURL(file));
      setAudioName(file.name);
      setDemoAudio(false);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
    } catch {
      showToast('Не удалось сохранить файл. Проверьте свободное место в браузере');
    } finally {
      setBusy(false);
      setUploadShare(null);
    }
  };

  const handleCover = async (file?: File) => {
    if (!file) return;
    if (!looksLikeImage(file)) return showToast('Для обложки нужно изображение: JPG, PNG или WebP');
    try {
      setCropSrc(await openImageFile(file));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Не удалось открыть картинку');
    }
  };

  const closeCrop = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  const applyCrop = async (rect: CropRect) => {
    if (!cropSrc) return;
    setCoverSaving(true);
    try {
      setCoverImage(await saveCover(await cropToBlob(cropSrc, rect)));
      closeCrop();
      showToast('Обложка сохранена');
    } catch {
      showToast('Не удалось сохранить обложку, попробуйте ещё раз');
    } finally {
      setCoverSaving(false);
    }
  };

  const hasAudio = !!audioRef_ || demoAudio;
  const step1Ok = hasAudio && title.trim().length > 0;

  // ---------- Step 2: text & timing ----------
  const onTextChange = (v: string) => {
    setRawText(v);
    const texts = v.split('\n').map((s) => s.trim()).filter(Boolean);
    setLines((prev) => {
      let cursor = prev.length ? prev[prev.length - 1].end + 0.5 : 0;
      return texts.map((t, i) => {
        if (prev[i]) return { ...prev[i], text: t, words: prev[i].text === t ? prev[i].words : undefined };
        const line = { id: `l-${Date.now()}-${i}`, text: t, time: round1(cursor), end: round1(cursor + 3.5) };
        cursor += 4;
        return line;
      });
    });
  };

  // Check for the local aligner when the timing step opens.
  useEffect(() => {
    if (step !== 1) return;
    let alive = true;
    // Don't trigger the browser's permission prompt on page load: only check when already allowed.
    void localAccessState().then(async (state) => {
      if (state === 'granted' || state === 'unknown') {
        const ok = await isAlignerOnline();
        if (alive) setAlignerOnline(ok);
      }
    });
    return () => {
      alive = false;
    };
  }, [step]);

  const runAutoTiming = async () => {
    if (!audioUrl || lines.length === 0) return showToast('Нужны аудио и текст песни');
    if ((await localAccessState()) === 'denied') return showToast(LOCAL_ACCESS_HINT);
    // Long timeout: this request may show Chrome's "local network access" prompt.
    const online = await isAlignerOnline(60_000);
    setAlignerOnline(online);
    if (!online) {
      return showToast(
        (await localAccessState()) === 'denied'
          ? LOCAL_ACCESS_HINT
          : 'Авто-тайминг сейчас недоступен — расставьте тайминги вручную или загрузите файл .lrc'
      );
    }
    if (lines.some((l) => l.time > 0) && !window.confirm('Заменить текущие тайминги автоматическими?')) return;
    setAligning(true);
    try {
      const blob = await (await fetch(audioUrl)).blob();
      const res = await alignLyrics(blob, audioName, lines.map((l) => l.text));
      const r2 = (n: number) => Math.round(n * 100) / 100;
      setLines((prev) =>
        prev.map((l, i) =>
          res.lines[i]
            ? {
                ...l,
                time: r2(res.lines[i].time),
                end: r2(res.lines[i].end),
                words: res.lines[i].words?.map((w) => ({ text: w.text, time: r2(w.time), end: r2(w.end) })),
              }
            : l
        )
      );
      setLineConfidence(Object.fromEntries(lines.map((l, i) => [l.id, res.lines[i]?.confidence ?? 0])));
      const weak = res.lines.filter((l) => l.confidence < 0.5).length;
      showToast(
        `Готово за ${Math.round(res.elapsedMs / 1000)} с.` + (weak ? ` Проверьте строки с пометкой «?»: ${weak}` : ' Все строки распознаны')
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Авто-тайминг не удался');
    } finally {
      setAligning(false);
    }
  };

  const patchLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, words: undefined, ...patch } : l)));

  const removeLine = (i: number) => {
    const next = lines.filter((_, idx) => idx !== i);
    setLines(next);
    setRawText(next.map((l) => l.text).join('\n'));
  };

  const markNow = (i: number, field: 'time' | 'end') => {
    const t = audioEl.current?.currentTime;
    if (t === undefined) return showToast('Загрузите аудио, чтобы отмечать моменты');
    patchLine(i, { [field]: round1(t) } as Partial<Line>);
  };

  const startTapSync = (fromBeginning = false) => {
    if (!audioUrl || lines.length === 0) return showToast('Нужны аудио и текст песни');
    setTapIdx(0);
    setTapMode(true);
    const el = audioEl.current;
    if (el) {
      if (fromBeginning || el.currentTime >= (el.duration || 1) - 1) el.currentTime = 0;
      void el.play().catch(() => {});
    }
  };

  const stampTapLine = () => {
    const el = audioEl.current;
    if (!el || tapIdx >= lines.length) return;
    if (el.paused) {
      void el.play().catch(() => {});
    }
    const t = round1(el.currentTime || 0);
    const idx = tapIdx;
    setLines((prev) =>
      prev.map((l, i) => {
        if (i === idx) {
          return { ...l, time: t, end: round1(Math.max(t + 3.2, l.end)), words: undefined };
        }
        if (i === idx - 1) {
          return { ...l, end: round1(Math.max(l.time + 0.3, Math.min(l.end, t - 0.1))) };
        }
        return l;
      })
    );
    if (idx + 1 >= lines.length) {
      setTapMode(false);
      showToast('Все строки размечены по Пробелу!');
    } else {
      setTapIdx(idx + 1);
    }
  };

  useEffect(() => {
    if (!tapMode || step !== 1) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('input, textarea, select, [contenteditable]')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        stampTapLine();
      } else if (e.key === 'Escape') {
        setTapMode(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const handleLrcFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseLrc(String(reader.result || ''));
      if (parsed.length === 0) return showToast('В файле не найдено строк с таймингами [мм:сс.xx]');
      setLines(parsed);
      setRawText(parsed.map((l) => l.text).join('\n'));
      showToast(`Загружено строк: ${parsed.length}`);
    };
    reader.readAsText(file);
  };

  const timingProblems = lines.filter((l) => l.end <= l.time).length;

  // ---------- Step 3: fonts ----------
  const pickFont = (name: string) => {
    setFont(name);
    setFontFile(undefined);
    loadGoogleFont(name);
  };

  const handleFontFile = async (file?: File) => {
    if (!file) return;
    if (!(await looksLikeFont(file))) {
      showToast(`Принимаются только файлы шрифтов (${FONT_FILE_ACCEPT}) до ${FONT_FILE_MAX_BYTES / 1024 / 1024} МБ`);
      return;
    }
    try {
      const ref = await putBlob(file);
      const family = `custom-${uid()}`;
      await loadCustomFont(family, ref);
      setFont(family);
      setFontFile(ref);
      showToast('Шрифт загружен');
    } catch {
      showToast('Не удалось прочитать шрифт — файл повреждён');
    }
  };

  const applyGoogleFont = async () => {
    const name = googleName.trim();
    if (!GOOGLE_FONT_NAME.test(name)) return showToast('Введите название шрифта латиницей, например «Caveat»');
    loadGoogleFont(name);
    const timeout = new Promise<never[]>((r) => setTimeout(() => r([]), 4000));
    const faces = await Promise.race([document.fonts.load(`16px "${name}"`), timeout]);
    if (faces.length === 0) return showToast(`Шрифт «${name}» не найден в Google Fonts`);
    setFont(name);
    setFontFile(undefined);
    showToast(`Шрифт «${name}» подключён`);
  };

  // ---------- Step 3: lyrics block drag ----------
  const blockHeightPct = () => {
    const f = frameRef.current;
    const b = blockRef.current;
    return f && b ? (b.offsetHeight / f.offsetHeight) * 100 : 30;
  };

  const clampCenter = (c: number) => {
    const half = blockHeightPct() / 2;
    const lo = ZONE_TOP + half;
    const hi = ZONE_BOTTOM - half;
    return lo > hi ? (ZONE_TOP + ZONE_BOTTOM) / 2 : clamp(c, lo, hi);
  };

  const onDragStart = (e: React.PointerEvent) => {
    const f = frameRef.current;
    const b = blockRef.current;
    if (!f || !b) return;
    const rect = f.getBoundingClientRect();
    const center = rect.top + (textY / 100) * rect.height;
    dragGrab.current = e.clientY - center;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (dragGrab.current === null || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    setTextY(clampCenter(((e.clientY - dragGrab.current - rect.top) / rect.height) * 100));
  };
  const onDragEnd = () => {
    dragGrab.current = null;
  };
  const onBlockKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') setTextY((y) => clampCenter(y - 2));
    else if (e.key === 'ArrowDown') setTextY((y) => clampCenter(y + 2));
    else return;
    e.preventDefault();
  };

  // ---------- Publish ----------
  const finalLines: LyricLine[] = useMemo(
    () =>
      lines.map((l, i) => ({
        id: l.id,
        time: l.time,
        end: l.end > l.time ? l.end : lines[i + 1]?.time ?? l.time + 4,
        text: l.text,
        ...(l.words?.length ? { words: l.words } : {}),
      })),
    [lines]
  );

  const activeContrast = contrastRatio(activeColor, backgroundColor);
  const textContrast = contrastRatio(textColor, backgroundColor);
  const lowContrast =
    (activeContrast !== null && activeContrast < 2.6) ||
    (textContrast !== null && textContrast < 3.0);

  const styleObj = {
    font,
    fontFile,
    textColor,
    activeColor,
    backgroundColor,
    fontSize: 'md' as const,
    fontSizePx: fontSize,
    textY: Math.round(textY),
    fillAnimation,
    aspectRatio: (aspectRatio === 'v' ? '9:16' : '16:9') as '9:16' | '16:9',
    coverImage,
  };

  const tagList = genres.slice(0, MAX_GENRES);
  const genreOptions = [...getGenres(), ...genres.filter((g) => !getGenres().includes(g))];
  const toggleGenre = (g: string) =>
    setGenres((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : cur.length >= MAX_GENRES ? cur : [...cur, g]));

  const handlePublish = () => {
    if (!user) return openAuthPrompt('Чтобы опубликовать караоке, войдите или зарегистрируйтесь.');
    if (!step1Ok) return setStep(0);
    if (finalLines.length === 0) {
      showToast('Добавьте текст песни');
      return setStep(1);
    }
    if (visibility !== 'private' && !rightsConfirmed) {
      return showToast('Подтвердите соблюдение авторских прав и правил платформы');
    }

    // Reuse the spelling of an artist that already exists, so "queen" and "Queen" share one page.
    const existingArtist = knownArtists.find((a) => artistSlug(a) === artistSlug(artist));

    if (editId) {
      updateKaraoke(editId, {
        title: title.trim(),
        artist: existingArtist ?? (artist.trim() || 'Неизвестный исполнитель'),
        description: description.trim(),
        tags: tagList.length ? tagList : ['караоке'],
        duration: Math.ceil(audioDuration || (finalLines[finalLines.length - 1].end ?? 0) + 4) || 40,
        audioUrl: audioRef_ ?? undefined,
        style: styleObj,
        visibility,
        lyrics: finalLines,
      });
      showToast('Изменения сохранены');
      setTimeout(() => router.push('/studio/content'), 700);
      return;
    }
    const newId =
      (title.toLowerCase().trim().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '') || 'karaoke') +
      '-' + uid();

    const newKaraoke: Karaoke = {
      id: newId,
      title: title.trim(),
      artist: existingArtist ?? (artist.trim() || 'Неизвестный исполнитель'),
      description: description.trim(),
      tags: tagList.length ? tagList : ['караоке'],
      duration: Math.ceil(audioDuration || (finalLines[finalLines.length - 1].end ?? 0) + 4) || 40,
      audioUrl: audioRef_ ?? undefined,
      audioPreset: 'pop',
      style: styleObj,
      authorId: user.id,
      authorName: user.name,
      authorAvatar: user.avatar,
      likesCount: 0,
      viewsCount: 0,
      recommendationScore: initialRecommendationScore(user.id),
      visibility,
      status: 'active',
      createdAt: new Date().toISOString(),
      lyrics: finalLines,
    };

    saveKaraoke(newKaraoke);
    showToast(
      visibility === 'public' ? 'Опубликовано!' : visibility === 'unlisted' ? 'Сохранено: доступно по ссылке' : 'Сохранено: видите только вы'
    );
    setTimeout(() => router.push(`/karaoke/${encodeURIComponent(newKaraoke.id)}`), 900);
  };

  // ---------- Preview ----------
  const activeIdx = (() => {
    if (lines.length === 0) return -1;
    if (audioTime !== null) {
      let a = 0;
      lines.forEach((l, i) => l.time <= audioTime && (a = i));
      return a;
    }
    return previewLineIndex % lines.length;
  })();
  const range = aspectRatio === 'v' ? [-2, 3] : [-1, 2];
  const previewLines: { text: string; on: boolean; key: string }[] = [];
  if (lines.length > 0) {
    for (let j = range[0]; j <= range[1]; j++) {
      const idx = activeIdx + j;
      if (idx >= 0 && idx < lines.length) previewLines.push({ text: lines[idx].text, on: j === 0, key: lines[idx].id });
    }
  }

  const previewKaraoke: Karaoke = {
    id: 'preview',
    title: title || 'Без названия',
    artist: artist || 'Артист',
    description,
    tags: tagList,
    duration: Math.ceil(audioDuration) || 40,
    style: styleObj,
    authorId: user?.id || 'guest',
    authorName: user?.name || 'Гость',
    likesCount: 0,
    viewsCount: 0,
    recommendationScore: 0,
    visibility: 'private',
    status: 'active',
    createdAt: new Date().toISOString(),
    lyrics: finalLines,
  };

  if (isLoading) return <div style={{ minHeight: '60vh' }} />;
  if (!user) {
    return (
      <div className="pg" style={{ maxWidth: 520 }}>
        <h1 className="pg-h">Создать караоке</h1>
        <p className="pg-sub">Войдите или зарегистрируйтесь, чтобы создавать и публиковать караоке.</p>
        <div className="row">
          <Link href="/login" className="bt pr">Войти</Link>
          <Link href="/register" className="bt">Регистрация</Link>
        </div>
      </div>
    );
  }

  if (editId && editState === 'denied') {
    return (
      <div className="pg" style={{ maxWidth: 520 }}>
        <h1 className="pg-h">Караоке недоступно</h1>
        <p className="pg-sub">Его нет, или оно принадлежит другому автору.</p>
        <Link href="/studio/content" className="bt pr">В Creator Studio</Link>
      </div>
    );
  }
  if (editId && editState !== 'loaded') return <div style={{ minHeight: '60vh' }} />;

  const showPreview = step >= 1;

  return (
    <>
      {cropSrc && <CoverCropModal src={cropSrc} busy={coverSaving} onCancel={closeCrop} onDone={applyCrop} />}

      <div className="pg" style={{ maxWidth: 1280 }}>
        {editId && (
          <Link href="/studio/content" className="bt sm gh" style={{ marginBottom: 14 }}>
            ← Назад в Creator Studio
          </Link>
        )}
        <h1 className="pg-h">{editId ? `Редактирование: ${title || 'караоке'}` : 'Создать караоке'}</h1>
        <p className="pg-sub">Шаг {step + 1} из {STEPS.length}: {STEPS[step]}</p>

        <div className="stepper" role="tablist">
          {STEPS.map((s, i) => (
            <button
              key={s}
              role="tab"
              aria-current={i === step ? 'step' : undefined}
              className={i < step ? 'done' : ''}
              onClick={() => (i <= step || step1Ok ? setStep(i) : showToast('Сначала загрузите аудио и укажите название'))}
            >
              {i + 1}. {s}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: showPreview ? 'minmax(300px, 460px) 1fr' : 'minmax(300px, 640px)', gap: 36, alignItems: 'start' }} className="ed">
          <div className="stack">
            {/* ---------------- STEP 1 ---------------- */}
            {step === 0 && (
              <>
                <div className="card stack">
                  <b>1. Загрузите аудио</b>
                  <label className="bt" style={{ cursor: 'pointer', padding: '28px 16px', borderStyle: 'dashed', flexDirection: 'column' }}>
                    {busy
                      ? `${uploadPhase === 'compress' ? 'Сжимаю аудио' : 'Загрузка в облако'}… ${Math.round((uploadShare ?? 0) * 100)}%`
                      : audioName
                        ? `Выбрано: ${audioName}`
                        : 'Выберите файл (mp3, wav, ogg, m4a)'}
                    {busy ? (
                      <span
                        className="up-bar"
                        role="progressbar"
                        aria-label="Загрузка аудио"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round((uploadShare ?? 0) * 100)}
                      >
                        <i style={{ width: `${Math.round((uploadShare ?? 0) * 100)}%` }} />
                      </span>
                    ) : (
                      <span className="mu sm">длинные WAV и FLAC сожмутся автоматически</span>
                    )}
                    <input type="file" hidden accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac" onChange={(e) => handleAudio(e.target.files?.[0])} />
                  </label>
                  {!hasAudio && (
                    <button className="lk mu sm" style={{ textAlign: 'left' }} onClick={() => setDemoAudio(true)}>
                      Нет файла под рукой? Использовать демо-мелодию
                    </button>
                  )}
                  {demoAudio && <span className="pill ok" style={{ width: 'fit-content' }}>Демо-мелодия выбрана</span>}
                  {audioUrl && (
                    <audio
                      ref={audioEl}
                      src={audioUrl}
                      controls
                      style={{ width: '100%' }}
                      onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration || 0)}
                      onTimeUpdate={(e) => setAudioTime(e.currentTarget.currentTime)}
                    />
                  )}
                </div>

                {hasAudio && (
                  <div className="card stack">
                    <b>2. Расскажите о песне</b>
                    <label className="fld">
                      Название песни *
                      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ночной автобус" />
                    </label>
                    <label className="fld">
                      Исполнитель
                      <input type="text" list="artists" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Лиза Ветер" />
                      <datalist id="artists">{knownArtists.map((a) => <option key={a} value={a} />)}</datalist>
                      <span className="sm">Выберите из списка, если исполнитель уже есть на сайте.</span>
                    </label>
                    <label className="fld">
                      Описание (по желанию)
                      <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
                    </label>
                    <div className="fld">
                      <span>
                        Жанры <span className="sm">· выбрано {genres.length} из {MAX_GENRES}</span>
                      </span>
                      <div className="chips" role="group" aria-label="Жанры проекта">
                        {genreOptions.map((g) => {
                          const on = genres.includes(g);
                          return (
                            <button
                              key={g}
                              type="button"
                              className="chip"
                              aria-pressed={on}
                              disabled={!on && genres.length >= MAX_GENRES}
                              onClick={() => toggleGenre(g)}
                            >
                              {g}
                            </button>
                          );
                        })}
                      </div>
                      <span className="sm">Нет нужного жанра? Напишите администратору — он добавит его в список.</span>
                    </div>
                    <div className="fld">
                      Обложка (по желанию)
                      <div className="row">
                        {safeMediaUrl(coverImage) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={safeMediaUrl(coverImage)} alt="" className="av md" style={{ borderRadius: 10 }} />
                        )}
                        <label className="bt sm" style={{ cursor: 'pointer' }}>
                          {coverImage ? 'Заменить' : 'Загрузить обложку'}
                          <input
                            type="file"
                            hidden
                            accept="image/*,.heic,.heif"
                            onChange={(e) => {
                              handleCover(e.target.files?.[0]);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        {coverImage && <button className="bt sm gh" onClick={() => setCoverImage(undefined)}>Убрать</button>}
                      </div>
                      <span className="sm">В каталоге при наведении на карточку оживает текст песни — даже поверх обложки.</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ---------------- STEP 2 ---------------- */}
            {step === 1 && (
              <>
                {demoAudio && <p className="mu sm" style={{ margin: 0 }}>С демо-мелодией кнопки «⏱» и набивка по Пробелу недоступны: впишите тайминги вручную.</p>}

                <div className="card stack">
                  <label className="fld">
                    Текст песни (одна строка — одна строка караоке)
                    <textarea rows={6} value={rawText} onChange={(e) => onTextChange(e.target.value)} placeholder="Вставьте текст песни…" />
                  </label>
                  <div className="row">
                    <label className="bt sm" style={{ cursor: 'pointer' }}>
                      Загрузить .lrc
                      <input type="file" hidden accept=".lrc,.txt" onChange={(e) => handleLrcFile(e.target.files?.[0])} />
                    </label>
                    <button className="bt sm gh" onClick={() => onTextChange(SAMPLE_TEXT)}>Вставить пример</button>
                    <button
                      className="bt sm"
                      onClick={() => (tapMode ? setTapMode(false) : startTapSync())}
                      disabled={!audioUrl || lines.length === 0}
                      aria-pressed={tapMode}
                      title="Слушайте песню и нажимайте Пробел в начале каждой строки"
                    >
                      {tapMode ? 'Остановить набивку' : 'Набить по Пробелу'}
                    </button>
                    <button
                      className="bt sm"
                      onClick={runAutoTiming}
                      disabled={aligning || !audioUrl || lines.length === 0}
                      aria-busy={aligning}
                      title={
                        alignerOnline === false
                          ? 'Сервис авто-тайминга не запущен на компьютере'
                          : 'Расставить тайминги по аудио автоматически'
                      }
                    >
                      {aligning ? 'Расставляю… (до минуты)' : 'Авто-тайминг'}
                    </button>
                    {alignerOnline === false && <span className="mu sm">сервис не запущен</span>}
                  </div>
                </div>

                {tapMode && audioUrl && lines.length > 0 && (
                  <div className="card tap-bar" role="region" aria-label="Живая разметка по Пробелу">
                    <div className="tap-head">
                      <b>Строка {Math.min(tapIdx + 1, lines.length)} из {lines.length}</b>
                      <div className="row" style={{ gap: 6 }}>
                        <button type="button" className="bt sm gh" onClick={() => startTapSync(true)}>Сначала (0:00)</button>
                        <button type="button" className="bt sm gh" onClick={() => setTapMode(false)}>Готово</button>
                      </div>
                    </div>
                    <button type="button" className="bt pr tap-hit" onClick={stampTapLine}>
                      <span>Нажмите <b>Пробел</b> или сюда, когда начнётся строка:</span>
                      <strong>«{lines[tapIdx]?.text}»</strong>
                    </button>
                    {lines[tapIdx + 1] && (
                      <span className="mu sm">Следующая: «{lines[tapIdx + 1].text}»</span>
                    )}
                  </div>
                )}

                {lines.length > 0 && (
                  <div className="card">
                    <div className="trow" style={{ borderBottom: 0, color: 'var(--mu)', fontSize: 12 }}>
                      <span />
                      <span>Строка</span>
                      <span>Начало, с</span>
                      <span>Конец, с</span>
                      <span />
                    </div>
                    {lines.map((l, i) => (
                      <div key={l.id} className={`trow ${i === activeIdx && audioTime !== null ? 'cur' : ''}`}>
                        <span
                          className="num"
                          title={lineConfidence[l.id] !== undefined && lineConfidence[l.id] < 0.5 ? 'Строка плохо распознана — проверьте тайминг' : undefined}
                          style={lineConfidence[l.id] !== undefined && lineConfidence[l.id] < 0.5 ? { color: '#f87171', fontWeight: 700 } : undefined}
                        >
                          {lineConfidence[l.id] !== undefined && lineConfidence[l.id] < 0.5 ? '?' : i + 1}
                        </span>
                        <input className="in" type="text" value={l.text} onChange={(e) => patchLine(i, { text: e.target.value })} aria-label={`Текст строки ${i + 1}`} />
                        <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                          <input className="in" type="number" step="0.1" min="0" value={l.time} onChange={(e) => patchLine(i, { time: round1(parseFloat(e.target.value) || 0) })} aria-label={`Начало строки ${i + 1}`} />
                          <button className="bt sm gh" style={{ padding: '4px 6px' }} title="Поставить текущий момент аудио" onClick={() => markNow(i, 'time')} disabled={!audioUrl}>⏱</button>
                        </div>
                        <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                          <input className="in" type="number" step="0.1" min="0" value={l.end} onChange={(e) => patchLine(i, { end: round1(parseFloat(e.target.value) || 0) })} aria-label={`Конец строки ${i + 1}`} style={l.end <= l.time ? { borderColor: '#f87171' } : undefined} />
                          <button className="bt sm gh" style={{ padding: '4px 6px' }} title="Поставить текущий момент аудио" onClick={() => markNow(i, 'end')} disabled={!audioUrl}>⏱</button>
                        </div>
                        <button className="bt sm gh del" onClick={() => removeLine(i)} aria-label={`Удалить строку ${i + 1}`}>✕</button>
                      </div>
                    ))}
                    {timingProblems > 0 && (
                      <p className="sm" style={{ color: '#f87171', marginBottom: 0 }}>
                        У {pluralRu(timingProblems, 'строки', 'строк', 'строк', true)} конец раньше начала — заливка для них растянется до следующей строки.
                      </p>
                    )}
                    <p className="mu sm" style={{ marginBottom: 0 }}>
                      Заливка строки идёт от начала до конца. Всё, что между концом строки и началом следующей — пауза.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* ---------------- STEP 3 ---------------- */}
            {step === 2 && (
              <>
                <div className="card stack">
                  <b>Шрифт</b>
                  <span className="mu sm">Стандартные</span>
                  <div className="fontgrid">
                    {DEFAULT_FONTS.map((f) => (
                      <button key={f} className="fontbtn" style={{ fontFamily: fontCss(f) }} aria-pressed={font === f && !fontFile} onClick={() => pickFont(f)}>
                        {f === 'Mono' ? 'Моно' : f}
                      </button>
                    ))}
                  </div>
                  <span className="mu sm">Популярные у авторов</span>
                  <div className="fontgrid">
                    {POPULAR_FONTS.map((f) => (
                      <button key={f} className="fontbtn" style={{ fontFamily: fontCss(f) }} aria-pressed={font === f && !fontFile} onClick={() => pickFont(f)}>
                        {f}
                      </button>
                    ))}
                  </div>
                  <span className="mu sm">Свой шрифт</span>
                  <div className="row">
                    <label className="bt sm" style={{ cursor: 'pointer' }}>
                      Загрузить файл шрифта
                      <input type="file" hidden accept={FONT_FILE_ACCEPT} onChange={(e) => { handleFontFile(e.target.files?.[0]); e.target.value = ''; }} />
                    </label>
                    {fontFile && <span className="pill ok">Свой шрифт подключён</span>}
                  </div>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <input className="in" type="text" value={googleName} onChange={(e) => setGoogleName(e.target.value)} placeholder="Или название из Google Fonts: Caveat" />
                    <button className="bt sm" onClick={applyGoogleFont}>Применить</button>
                  </div>
                  <span className="mu sm">Файлы: .ttf, .otf, .woff, .woff2 до 2 МБ. Убедитесь, что у вас есть права на шрифт.</span>
                </div>

                <div className="card stack">
                  <b>Готовые сцены и цвета</b>
                  <div className="theme-grid" role="group" aria-label="Цветовые сцены">
                    {STYLE_THEMES.map((t) => {
                      const active =
                        backgroundColor.toLowerCase() === t.bg.toLowerCase() &&
                        activeColor.toLowerCase() === t.active.toLowerCase() &&
                        textColor.toLowerCase() === t.text.toLowerCase();
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className="theme-card"
                          aria-pressed={active}
                          onClick={() => {
                            setBackgroundColor(t.bg);
                            setActiveColor(t.active);
                            setTextColor(t.text);
                            if (!fontFile) pickFont(t.font);
                          }}
                          style={{ background: t.bg, color: t.text }}
                        >
                          <span className="theme-sw" style={{ color: t.active }}>Аа</span>
                          <b>{t.name}</b>
                        </button>
                      );
                    })}
                  </div>
                  <div className="cl">
                    <label className="fld">Активная строка<input type="color" value={activeColor} onChange={(e) => setActiveColor(e.target.value)} className="in" style={{ height: 40, padding: 3 }} /></label>
                    <label className="fld">Текст<input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="in" style={{ height: 40, padding: 3 }} /></label>
                    <label className="fld">Фон<input type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} className="in" style={{ height: 40, padding: 3 }} /></label>
                  </div>
                  {lowContrast && (
                    <p className="sm" style={{ color: '#fbbf24', margin: 0 }}>
                      Выбранные цвета близки по яркости — строки могут плохо читаться в плеере и видео.
                    </p>
                  )}
                  <label className="row sm" style={{ gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={fillAnimation}
                      onChange={(e) => setFillAnimation(e.target.checked)}
                      style={{ accentColor: 'var(--ac)', width: 18, height: 18 }}
                    />
                    <span>
                      Анимация заливки
                      <span className="mu sm" style={{ display: 'block' }}>
                        {fillAnimation
                          ? 'Строка заливается цветом слева направо в такт песне'
                          : 'Активная строка сразу целиком окрашивается в цвет заливки'}
                      </span>
                    </span>
                  </label>
                  <label className="fld">
                    Размер текста ({fontSize}px)
                    <input type="range" min="20" max="56" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value, 10))} style={{ accentColor: 'var(--ac)' }} />
                  </label>
                  <div className="fs">
                    <span>Формат ролика</span>
                    <div className="sg">
                      <button type="button" aria-pressed={aspectRatio === 'v'} onClick={() => setAspectRatio('v')}>9:16</button>
                      <button type="button" aria-pressed={aspectRatio === 'h'} onClick={() => setAspectRatio('h')}>16:9</button>
                    </div>
                  </div>
                  <span className="mu sm">Перетащите блок текста в предпросмотре (или стрелками ↑ ↓). Он двигается в пределах зон 1–3.</span>
                </div>
              </>
            )}

            {/* ---------------- STEP 4 ---------------- */}
            {step === 3 && (
              <div className="stack">
                <div className="card stack">
                  <b>Кто сможет слушать</b>
                  {(
                    [
                      ['public', 'Опубликовать', 'Караоке появится в каталоге, на странице исполнителя и в вашем профиле.'],
                      ['unlisted', 'Только по ссылке', 'В каталоге его не видно. Слушать смогут все, у кого есть ссылка.'],
                      ['private', 'Ограничить доступ', 'Видите только вы. Позже можно открыть в Creator Studio.'],
                    ] as [Visibility, string, string][]
                  ).map(([v, label, text]) => (
                    <div key={v} className="choice" role="radio" aria-checked={visibility === v} tabIndex={0} onClick={() => setVisibility(v)} onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && setVisibility(v)}>
                      <input type="radio" checked={visibility === v} onChange={() => setVisibility(v)} style={{ accentColor: 'var(--ac)', marginTop: 4 }} />
                      <div><b>{label}</b><span>{text}</span></div>
                    </div>
                  ))}
                  {visibility !== 'private' && (
                    <label className="row sm" style={{ gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginTop: 4 }}>
                      <input
                        type="checkbox"
                        checked={rightsConfirmed}
                        onChange={(e) => setRightsConfirmed(e.target.checked)}
                        style={{ accentColor: 'var(--ac)', width: 18, height: 18, marginTop: 2, flex: 'none' }}
                      />
                      <span className="mu sm" style={{ lineHeight: 1.45 }}>
                        Подтверждаю, что загружаемые материалы не нарушают права третьих лиц, и соглашаюсь с{' '}
                        <Link href="/terms" style={{ color: 'var(--ac)' }}>правилами платформы</Link>.
                      </span>
                    </label>
                  )}
                </div>
                <div className="row">
                  <button className="bt pr" onClick={handlePublish}>
                    {editId ? 'Сохранить изменения' : visibility === 'public' ? 'Опубликовать' : 'Сохранить'}
                  </button>
                  <button className="bt" onClick={() => startDownload(previewKaraoke, aspectRatio === 'h' ? 'landscape' : 'reel')} disabled={finalLines.length === 0}>Скачать видео</button>
                </div>
              </div>
            )}

            {/* nav */}
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button className="bt gh" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>Назад</button>
              {step < STEPS.length - 1 && (
                <button
                  className="bt pr"
                  onClick={() => (step === 0 && !step1Ok ? showToast('Загрузите аудио и укажите название') : setStep(step + 1))}
                >
                  Далее
                </button>
              )}
            </div>
          </div>

          {/* ---------------- PREVIEW ---------------- */}
          {showPreview && (
            <div className="pv">
              <div
                ref={frameRef}
                className={`fr ${aspectRatio} ${fillAnimation ? 'wipe' : ''}`}
                id="fr"
                style={
                  {
                    '--sb': backgroundColor,
                    '--sa': activeColor,
                    '--st': textColor,
                    '--sf': fontCss(font),
                    '--sz': fontSize,
                  } as React.CSSProperties
                }
              >
                <div className="ft" id="ft">{title || 'Без названия'}</div>

                {step === 2 &&
                  ZONES.map((z, i) => (
                    <div key={z} className="zn" style={{ top: `${ZONE_TOP + ((ZONE_BOTTOM - ZONE_TOP) / 3) * i}%` }}>
                      <span>Зона {z}</span>
                    </div>
                  ))}

                <div
                  ref={blockRef}
                  className={`fl ${step === 2 ? 'drag' : ''}`}
                  id="fl"
                  style={{ inset: 'auto 0 auto 0', top: `${textY}%`, transform: 'translateY(-50%)', height: 'auto' }}
                  onPointerDown={step === 2 ? onDragStart : undefined}
                  onPointerMove={step === 2 ? onDragMove : undefined}
                  onPointerUp={onDragEnd}
                  onPointerCancel={onDragEnd}
                  onKeyDown={step === 2 ? onBlockKey : undefined}
                  tabIndex={step === 2 ? 0 : undefined}
                  aria-label={step === 2 ? 'Блок текста: перетащите или используйте стрелки вверх и вниз' : undefined}
                >
                  {previewLines.length === 0 ? (
                    <p className="pl">Здесь появится текст песни</p>
                  ) : (
                    previewLines.map((pl) => (
                      <p key={pl.key} className={`pl ${pl.on ? 'on' : ''}`}><span>{pl.text}</span></p>
                    ))
                  )}
                </div>

                <div className="wm" aria-hidden="true">
                  <svg viewBox="0 0 22 22"><rect x="2" y="9" width="4" height="11" rx="2" /><rect x="9" y="2" width="4" height="18" rx="2" /><rect x="16" y="6" width="4" height="14" rx="2" /></svg>
                  KaraokeCraft
                </div>
              </div>
              {/* Timing step: the player sits right under the preview and travels with it. */}
              {step === 1 && audioUrl && (
                <audio
                  ref={audioEl}
                  className="pv-audio"
                  src={audioUrl}
                  controls
                  onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration || 0)}
                  onTimeUpdate={(e) => setAudioTime(e.currentTarget.currentTime)}
                />
              )}
            </div>
          )}
        </div>
      </div>

      <div className={`ts ${toast ? 'on' : ''}`} id="ts" role="status" aria-live="polite" style={{ bottom: 24 }}>{toast}</div>

    </>
  );
}
