'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Karaoke, LyricLine } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { saveKaraoke } from '@/lib/storage';
import VideoDownloaderModal from '@/components/karaoke/VideoDownloaderModal';

const FONT_MAP: Record<string, string> = {
  Onest: '"Onest", system-ui, sans-serif',
  Unbounded: '"Unbounded", "Onest", sans-serif',
  Georgia: 'Georgia, "Times New Roman", serif',
  Mono: 'ui-monospace, Menlo, Consolas, monospace',
};

const DEFAULT_LYRICS: LyricLine[] = [
  { id: '1', time: 0, text: 'Город гаснет за стеклом' },
  { id: '2', time: 4, text: 'Фонари плывут рекой' },
  { id: '3', time: 8, text: 'Я держу твой голос в кармане' },
  { id: '4', time: 12, text: 'Как проездной на всю зиму' },
  { id: '5', time: 16, text: 'Ехать, ехать, не домой' },
  { id: '6', time: 20, text: 'Просто ехать за тобой' },
  { id: '7', time: 24, text: 'Остановка — это мы' },
  { id: '8', time: 28, text: 'Свет внутри, а снаружи дым' },
  { id: '9', time: 32, text: 'Пой со мной, пока не рассвело' },
  { id: '10', time: 36, text: 'Пусть услышит весь район' },
];

const DEFAULT_LRC_TEXT = `[00:00.00] Город гаснет за стеклом
[00:04.00] Фонари плывут рекой
[00:08.00] Я держу твой голос в кармане
[00:12.00] Как проездной на всю зиму
[00:16.00] Ехать, ехать, не домой
[00:20.00] Просто ехать за тобой
[00:24.00] Остановка — это мы
[00:28.00] Свет внутри, а снаружи дым
[00:32.00] Пой со мной, пока не рассвело
[00:36.00] Пусть услышит весь район`;

const NOTE: Record<string, string> = {
  lrc: 'Загрузите файл .lrc или отредактируйте текст — строки встанут по времени сами.',
  man: 'Включите музыку и нажимайте на строку, когда её поют.',
};

export default function KaraokeCreator() {
  const router = useRouter();
  const { user } = useAuth();

  const [title, setTitle] = useState('Ночной автобус');
  const [artist, setArtist] = useState('Лиза Ветер');
  const [description, setDescription] = useState('Атмосферный трек для ночных поездок.');
  const [font, setFont] = useState('Onest');
  const [activeColor, setActiveColor] = useState('#ffb547');
  const [textColor, setTextColor] = useState('#f4f4f5');
  const [backgroundColor, setBackgroundColor] = useState('#1d1b3a');
  const [fontSize, setFontSize] = useState(32);
  const [aspectRatio, setAspectRatio] = useState<'v' | 'h'>('v');
  const [syncMode, setSyncMode] = useState<'lrc' | 'man'>('lrc');
  const [tags, setTags] = useState('поп, ночь');
  const [lrcText, setLrcText] = useState(DEFAULT_LRC_TEXT);
  const [lyrics, setLyrics] = useState<LyricLine[]>(DEFAULT_LYRICS);

  const [previewLineIndex, setPreviewLineIndex] = useState(2);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 2600);
  };

  // Parse LRC whenever text changes
  const handleLrcChange = (text: string) => {
    setLrcText(text);
    const lines = text.split('\n');
    const parsed: LyricLine[] = [];
    const regex = /\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\](.*)/;

    lines.forEach((l, idx) => {
      const match = l.match(regex);
      if (match) {
        const m = parseInt(match[1], 10);
        const s = parseFloat(match[2]);
        const t = match[3].trim();
        if (t) {
          parsed.push({
            id: `l-${idx}`,
            time: m * 60 + s,
            text: t,
          });
        }
      }
    });

    if (parsed.length > 0) {
      setLyrics(parsed);
    }
  };

  // Preview animation cycling through lines
  useEffect(() => {
    const timer = setInterval(() => {
      setPreviewLineIndex((prev) => (prev + 1) % lyrics.length);
    }, 2200);
    return () => clearInterval(timer);
  }, [lyrics.length]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        handleLrcChange(content);
        showToast('Файл .lrc успешно загружен');
      }
    };
    reader.readAsText(file);
  };

  const handlePublish = () => {
    if (!title.trim()) {
      showToast('Пожалуйста, укажите название песни');
      return;
    }

    const tagList = tags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const newId = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9а-яё]/gi, '-')
      .replace(/-+/g, '-') + '-' + Date.now().toString().slice(-4);

    const newKaraoke: Karaoke = {
      id: newId,
      title: title.trim(),
      artist: artist.trim() || 'Неизвестный исполнитель',
      description: description.trim(),
      tags: tagList.length > 0 ? tagList : ['караоке'],
      duration: Math.max(40, lyrics[lyrics.length - 1]?.time + 4 || 40),
      audioPreset: 'pop',
      style: {
        font,
        textColor,
        activeColor,
        backgroundColor,
        fontSize: 'md',
        fontSizePx: fontSize,
        aspectRatio: aspectRatio === 'v' ? '9:16' : '16:9',
      },
      authorId: user?.id || 'guest-user',
      authorName: user?.name || 'Гость',
      likesCount: 1,
      viewsCount: 1,
      recommendationScore: 8,
      createdAt: new Date().toISOString(),
      lyrics,
    };

    saveKaraoke(newKaraoke);
    showToast('Опубликовано — трек успешно сохранён!');

    setTimeout(() => {
      router.push(`/karaoke/${newKaraoke.id}`);
    }, 900);
  };

  // Prepare preview lines slice
  const windowRange = aspectRatio === 'v' ? [-2, 3] : [-1, 2];
  const previewLines: { text: string; isActive: boolean; key: number }[] = [];
  for (let j = windowRange[0]; j <= windowRange[1]; j++) {
    const idx = (previewLineIndex + j + lyrics.length) % lyrics.length;
    previewLines.push({
      text: lyrics[idx]?.text || '',
      isActive: j === 0,
      key: idx,
    });
  }

  const currentPreviewKaraoke: Karaoke = {
    id: 'preview',
    title: title || 'Без названия',
    artist: artist || 'Артист',
    description: description,
    tags: tags.split(',').map((t) => t.trim()),
    duration: 40,
    style: {
      font,
      textColor,
      activeColor,
      backgroundColor,
      fontSize: 'md',
      fontSizePx: fontSize,
      aspectRatio: aspectRatio === 'v' ? '9:16' : '16:9',
    },
    authorId: user?.id || 'guest',
    authorName: user?.name || 'Гость',
    likesCount: 0,
    viewsCount: 0,
    createdAt: new Date().toISOString(),
    lyrics,
  };

  return (
    <>
      <section id="studio">
        <div className="ctl" id="ctl">
          <h2>Оформление</h2>

          <label>
            Название
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Название песни"
            />
          </label>

          <label>
            Артист
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Имя исполнителя"
            />
          </label>

          <label>
            Шрифт
            <select value={font} onChange={(e) => setFont(e.target.value)}>
              <option value="Onest">Onest</option>
              <option value="Unbounded">Unbounded</option>
              <option value="Georgia">Georgia</option>
              <option value="Mono">Моноширинный</option>
            </select>
          </label>

          <div className="cl">
            <label>
              Активная строка
              <input
                type="color"
                value={activeColor}
                onChange={(e) => setActiveColor(e.target.value)}
              />
            </label>
            <label>
              Текст
              <input
                type="color"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
              />
            </label>
            <label>
              Фон
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
              />
            </label>
          </div>

          <label>
            Размер текста ({fontSize}px)
            <input
              type="range"
              min="20"
              max="56"
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
            />
          </label>

          <div className="fs">
            <span>Формат ролика</span>
            <div className="sg">
              <button
                type="button"
                aria-pressed={aspectRatio === 'v'}
                onClick={() => setAspectRatio('v')}
              >
                9:16
              </button>
              <button
                type="button"
                aria-pressed={aspectRatio === 'h'}
                onClick={() => setAspectRatio('h')}
              >
                16:9
              </button>
            </div>
          </div>

          <div className="fs">
            <span>Тайминги строк</span>
            <div className="sg">
              <button
                type="button"
                aria-pressed={syncMode === 'lrc'}
                onClick={() => setSyncMode('lrc')}
              >
                Файл LRC
              </button>
              <button
                type="button"
                aria-pressed={syncMode === 'man'}
                onClick={() => setSyncMode('man')}
              >
                На слух / текст
              </button>
            </div>
            <small>{NOTE[syncMode]}</small>
          </div>

          {syncMode === 'lrc' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                type="file"
                accept=".lrc,.txt"
                id="lrc-file"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              <label
                htmlFor="lrc-file"
                className="bt"
                style={{ cursor: 'pointer', textAlign: 'center' }}
              >
                Загрузить .lrc файл
              </label>
            </div>
          )}

          <label>
            Синхронизированные строки (.lrc)
            <textarea
              rows={5}
              value={lrcText}
              onChange={(e) => handleLrcChange(e.target.value)}
              style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                lineHeight: 1.4,
              }}
            />
          </label>

          <label>
            Теги (через запятую)
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="поп, инди, ночь"
            />
          </label>

          <div className="ac2">
            <button type="button" className="bt pr" id="pub" onClick={handlePublish}>
              Опубликовать
            </button>
            <button
              type="button"
              className="bt dl"
              onClick={() => setIsDownloadOpen(true)}
            >
              Скачать видео
            </button>
          </div>
        </div>

        {/* Live Container Query Preview Frame */}
        <div className="pv">
          <div
            className={`fr ${aspectRatio}`}
            id="fr"
            style={
              {
                '--sb': backgroundColor,
                '--sa': activeColor,
                '--st': textColor,
                '--sf': FONT_MAP[font] || FONT_MAP.Onest,
                '--sz': fontSize,
              } as React.CSSProperties
            }
          >
            <div className="ft" id="ft">
              {title || 'Без названия'}
            </div>

            <div className="fl" id="fl">
              {previewLines.map((pl, i) => (
                <p key={`${pl.key}-${i}`} className={`pl ${pl.isActive ? 'on' : ''}`}>
                  {pl.text}
                </p>
              ))}
            </div>

            <div className="wm">KaraokeCraft</div>
          </div>
        </div>
      </section>

      {/* Toast Notification */}
      <div className={`ts ${toastMessage ? 'on' : ''}`} id="ts" role="status" aria-live="polite">
        {toastMessage}
      </div>

      {/* Video Downloader Modal */}
      <VideoDownloaderModal
        karaoke={currentPreviewKaraoke}
        isOpen={isDownloadOpen}
        onClose={() => setIsDownloadOpen(false)}
      />
    </>
  );
}
