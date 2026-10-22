'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import confetti from 'canvas-confetti';
import { 
  Music, 
  Palette, 
  FileText, 
  Upload, 
  Play, 
  Check, 
  Plus, 
  Trash2, 
  Clock, 
  Flame, 
  Disc, 
  Headphones, 
  Mic2, 
  Tag,
  Radio
} from 'lucide-react';
import { Karaoke, LyricLine, FontFamily, FontSize, BackgroundType } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { saveKaraoke } from '@/lib/storage';
import SpotifyLyricsEngine from './SpotifyLyricsEngine';

const PRESET_FONTS: FontFamily[] = [
  'Inter',
  'Poppins',
  'Montserrat',
  'Space Grotesk',
  'Outfit',
  'Caveat',
  'Playfair Display',
  'JetBrains Mono',
];

const PRESET_COLORS = [
  { name: 'Spotify Green', hex: '#22c55e' },
  { name: 'Cyber Cyan', hex: '#06b6d4' },
  { name: 'Purple', hex: '#a855f7' },
  { name: 'Rose', hex: '#f43f5e' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'White', hex: '#f4f4f5' },
];

const PRESET_INACTIVE_COLORS = [
  { name: 'Приглушенный серый', hex: '#71717a' },
  { name: 'Сланец', hex: '#64748b' },
  { name: 'Темно-серый', hex: '#52525b' },
  { name: 'Светло-серый', hex: '#a1a1aa' },
];

const PRESET_BACKGROUNDS: { type: BackgroundType; label: string; desc: string; gradient: string }[] = [
  { type: 'obsidian', label: 'Черный Zinc', desc: 'Строгий минималистичный темный фон', gradient: '#09090b' },
  { type: 'mesh', label: 'Мягкий градиент', desc: 'Сдержанный переход оттенков', gradient: 'linear-gradient(135deg, #09090b 0%, #18181b 100%)' },
  { type: 'aura', label: 'Радиальный фон', desc: 'Едва заметный акцент по центру', gradient: 'radial-gradient(circle, #18181b 0%, #09090b 100%)' },
  { type: 'gradient', label: 'Двухцветный', desc: 'Классический линейный переход', gradient: 'linear-gradient(180deg, #18181b 0%, #09090b 100%)' },
];

const SUGGESTED_TAGS = ['pop', 'rock', 'synthwave', 'lofi', 'chill', 'hiphop', 'anime', 'party', 'karaoke', '80s'];

export default function KaraokeCreator() {
  const router = useRouter();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'info' | 'lyrics' | 'style'>('info');

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [description, setDescription] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(['karaoke', 'pop']);
  const [audioPreset, setAudioPreset] = useState<'synthwave' | 'lofi' | 'pop' | 'cyberpunk' | 'chill' | 'rock'>('synthwave');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioFileName, setAudioFileName] = useState('');
  const [duration, setDuration] = useState(60);

  const [font, setFont] = useState<FontFamily>('Inter');
  const [fontSize, setFontSize] = useState<FontSize>('lg');
  const [activeColor, setActiveColor] = useState('#22c55e');
  const [textColor, setTextColor] = useState('#71717a');
  const [backgroundType, setBackgroundType] = useState<BackgroundType>('obsidian');
  const [backgroundGradient, setBackgroundGradient] = useState(PRESET_BACKGROUNDS[0].gradient);
  const [coverIcon, setCoverIcon] = useState('mic');
  const [coverImage, setCoverImage] = useState('');

  const [rawLyricsText, setRawLyricsText] = useState(`[00:03.00] Добро пожаловать в KaraokeCraft
[00:08.50] Здесь оживают любимые треки
[00:14.00] Анимация строк прямо как в Spotify
[00:20.00] Пой вместе с нами и делись с друзьями!
[00:26.00] Скачивай видео с водяным знаком
[00:32.00] Создавай музыку легко и быстро!`);

  const [lyrics, setLyrics] = useState<LyricLine[]>([
    { id: '1', time: 3, text: 'Добро пожаловать в KaraokeCraft' },
    { id: '2', time: 8.5, text: 'Здесь оживают любимые треки' },
    { id: '3', time: 14, text: 'Анимация строк прямо как в Spotify' },
    { id: '4', time: 20, text: 'Пой вместе с нами и делись с друзьями!' },
    { id: '5', time: 26, text: 'Скачивай видео с водяным знаком' },
    { id: '6', time: 32, text: 'Создавай музыку легко и быстро!' },
  ]);

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      setAudioFileName(file.name);

      const tempAudio = new Audio(url);
      tempAudio.onloadedmetadata = () => {
        if (tempAudio.duration) {
          setDuration(Math.round(tempAudio.duration));
        }
      };
    }
  };

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCoverImage(url);
    }
  };

  const addTag = (t: string) => {
    const cleaned = t.trim().toLowerCase().replace('#', '');
    if (cleaned && !tags.includes(cleaned)) {
      setTags([...tags, cleaned]);
    }
    setTagInput('');
  };

  const removeTag = (t: string) => {
    setTags(tags.filter((x) => x !== t));
  };

  const handleParseLyrics = () => {
    const lines = rawLyricsText.split('\n').filter((l) => l.trim().length > 0);
    const parsed: LyricLine[] = [];
    const lrcRegex = /\[(\d{2}):(\d{2}(?:\.\d+)?)\](.*)/;

    lines.forEach((line, idx) => {
      const match = line.match(lrcRegex);
      if (match) {
        const min = parseInt(match[1], 10);
        const sec = parseFloat(match[2]);
        const text = match[3].trim();
        parsed.push({
          id: String(idx + 1),
          time: min * 60 + sec,
          text: text || '...',
        });
      } else {
        parsed.push({
          id: String(idx + 1),
          time: idx * 5 + 2,
          text: line.trim(),
        });
      }
    });

    if (parsed.length > 0) {
      setLyrics(parsed);
      const lastLine = parsed[parsed.length - 1];
      if (lastLine.time + 10 > duration) {
        setDuration(Math.round(lastLine.time + 10));
      }
    }
  };

  const [syncingIndex, setSyncingIndex] = useState(0);
  const [syncStartTime, setSyncStartTime] = useState<number | null>(null);

  const handleStartLiveSync = () => {
    setSyncStartTime(Date.now());
    setSyncingIndex(0);
  };

  const handleStampCurrentLine = () => {
    if (syncStartTime === null) return;
    const elapsed = (Date.now() - syncStartTime) / 1000;

    if (syncingIndex < lyrics.length) {
      const updated = [...lyrics];
      updated[syncingIndex] = {
        ...updated[syncingIndex],
        time: Math.round(elapsed * 10) / 10,
      };
      setLyrics(updated);
      setSyncingIndex(syncingIndex + 1);
    }
  };

  const previewKaraoke: Karaoke = {
    id: 'preview',
    title: title || 'Название трека',
    artist: artist || 'Исполнитель',
    description: description || 'Описание караоке-анимации',
    tags,
    lyrics,
    audioUrl: audioUrl || undefined,
    audioPreset,
    duration,
    style: {
      font,
      fontSize,
      activeColor,
      textColor,
      backgroundType,
      backgroundColor: '#09090b',
      backgroundGradient,
      coverIcon,
      coverImage: coverImage || undefined,
    },
    authorId: user?.id || 'demo-user',
    authorName: user?.name || 'Создатель',
    authorAvatar: user?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    likesCount: 0,
    viewsCount: 1,
    isFeatured: false,
    createdAt: '2026-03-20T12:00:00Z',
  };

  const handlePublish = () => {
    if (!title.trim()) {
      alert('Пожалуйста, укажите название трека');
      setActiveTab('info');
      return;
    }
    if (!artist.trim()) {
      alert('Пожалуйста, укажите имя исполнителя');
      setActiveTab('info');
      return;
    }
    if (lyrics.length === 0) {
      alert('Пожалуйста, добавьте текст песни');
      setActiveTab('lyrics');
      return;
    }

    const newKaraoke: Karaoke = {
      ...previewKaraoke,
      id: 'k-' + Date.now(),
      createdAt: new Date().toISOString(),
    };

    saveKaraoke(newKaraoke);

    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.6 },
      colors: ['#22c55e', '#ffffff', '#71717a'],
    });

    setTimeout(() => {
      router.push(`/karaoke/${newKaraoke.id}`);
    }, 1000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-5 border-b border-zinc-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 tracking-tight">
            Создание караоке-анимации
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Настройте стиль отображения текста, шрифт и синхронизацию строк.
          </p>
        </div>

        <button
          type="button"
          onClick={handlePublish}
          className="px-6 py-2.5 rounded-lg bg-green-500 hover:bg-green-600 text-black font-medium text-sm transition-colors flex items-center justify-center gap-2"
        >
          Опубликовать караоке
        </button>
      </div>

      {/* Main Grid: Left Controls (Tabs), Right Sticky Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Creator Settings (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Tabs Navigation */}
          <div className="grid grid-cols-3 p-1 rounded-xl bg-zinc-900 border border-zinc-800 gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('info')}
              className={`py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'info'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Music className="w-4 h-4" />
              1. Трек и теги
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('lyrics')}
              className={`py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'lyrics'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <FileText className="w-4 h-4" />
              2. Текст и тайминг
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('style')}
              className={`py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'style'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Palette className="w-4 h-4" />
              3. Стиль и цвета
            </button>
          </div>

          {/* TAB 1: Song & Metadata */}
          {activeTab === 'info' && (
            <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 space-y-5">
              <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                <Music className="w-4 h-4 text-zinc-400" />
                Основная информация
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1.5">
                    Название песни *
                  </label>
                  <input
                    type="text"
                    placeholder="Например: Blinding Lights"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-green-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1.5">
                    Исполнитель *
                  </label>
                  <input
                    type="text"
                    placeholder="Например: The Weeknd"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-green-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">
                  Описание трека
                </label>
                <textarea
                  rows={2}
                  placeholder="Дополнительная информация о треке..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-green-500 transition-colors resize-none"
                />
              </div>

              {/* Tags Selector */}
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-zinc-500" />
                  Теги для поиска
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Добавить тег..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag(tagInput))}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-green-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => addTag(tagInput)}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
                  >
                    Добавить
                  </button>
                </div>

                {/* Popular Tag Pills */}
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_TAGS.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => addTag(st)}
                      className={`text-[11px] px-2.5 py-0.5 rounded-full transition-colors ${
                        tags.includes(st)
                          ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                          : 'bg-zinc-950 text-zinc-500 hover:text-zinc-300 border border-zinc-800'
                      }`}
                    >
                      #{st}
                    </button>
                  ))}
                </div>

                {/* Current Selected Tags */}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3 pt-2 border-t border-zinc-800">
                    {tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700"
                      >
                        #{t}
                        <button type="button" onClick={() => removeTag(t)} className="hover:text-red-400 ml-1">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Audio Source Options */}
              <div className="pt-3 border-t border-zinc-800 space-y-3">
                <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-zinc-500" />
                  Музыкальное сопровождение
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
                    <span className="text-xs font-medium text-zinc-200 block">Встроенный синтезатор</span>
                    <select
                      value={audioPreset}
                      onChange={(e) => setAudioPreset(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-green-500"
                    >
                      <option value="synthwave">Synthwave Beat (108 BPM)</option>
                      <option value="lofi">Lofi Ambient (82 BPM)</option>
                      <option value="pop">Dance Pop (120 BPM)</option>
                      <option value="chill">Electronic Chill</option>
                    </select>
                    <p className="text-[11px] text-zinc-500">
                      Работает в любом браузере автономно.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2">
                    <span className="text-xs font-medium text-zinc-200 block">Свой аудиофайл</span>
                    <label className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 cursor-pointer text-xs text-zinc-300 transition-colors">
                      <Upload className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="truncate">{audioFileName || 'Выбрать MP3/WAV...'}</span>
                      <input type="file" accept="audio/*" onChange={handleAudioUpload} className="hidden" />
                    </label>
                    <p className="text-[11px] text-zinc-500 truncate">
                      {audioFileName ? `Файл: ${audioFileName}` : 'Загрузка с устройства'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('lyrics')}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors"
                >
                  Перейти к тексту →
                </button>
              </div>

            </div>
          )}

          {/* TAB 2: Lyrics & Timestamps */}
          {activeTab === 'lyrics' && (
            <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-zinc-400" />
                  Текст и тайминги
                </h3>
                <span className="text-xs text-zinc-500">
                  Строк: <strong className="text-zinc-300">{lyrics.length}</strong>
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Текст песни или LRC:</span>
                  <button
                    type="button"
                    onClick={handleParseLyrics}
                    className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-green-400 border border-zinc-700 font-medium transition-colors text-xs"
                  >
                    Распознать тайминги
                  </button>
                </div>
                <textarea
                  rows={5}
                  value={rawLyricsText}
                  onChange={(e) => setRawLyricsText(e.target.value)}
                  className="w-full p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-green-500"
                  placeholder="[00:04.00] Первая строка&#10;[00:09.50] Вторая строка..."
                />
              </div>

              {/* Live Tap-to-Sync Tool */}
              <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    Синхронизация на слух
                  </span>
                  {syncStartTime !== null && (
                    <span className="text-xs font-mono text-green-400">
                      Строка {syncingIndex + 1} из {lyrics.length}
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Запустите воспроизведение и нажимайте кнопку синхронизации для расстановки секунд.
                </p>

                <div className="flex items-center gap-2 pt-1">
                  {syncStartTime === null ? (
                    <button
                      type="button"
                      onClick={handleStartLiveSync}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs flex items-center gap-1.5 border border-zinc-700"
                    >
                      <Play className="w-3.5 h-3.5 text-green-500" />
                      Начать запись тайминга
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStampCurrentLine}
                      disabled={syncingIndex >= lyrics.length}
                      className="px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-black font-medium text-xs transition-colors"
                    >
                      Отметить: {syncingIndex < lyrics.length ? lyrics[syncingIndex]?.text.slice(0, 25) : 'Завершено'}
                    </button>
                  )}
                </div>
              </div>

              {/* Editable Lines Table */}
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {lyrics.map((line, idx) => (
                  <div
                    key={line.id}
                    className="flex items-center gap-2 p-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs"
                  >
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={line.time}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        const copy = [...lyrics];
                        copy[idx].time = val;
                        setLyrics(copy);
                      }}
                      className="w-16 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 font-mono text-center text-zinc-200 focus:outline-none focus:border-green-500"
                    />
                    <span className="text-zinc-500 text-[10px]">сек</span>
                    <input
                      type="text"
                      value={line.text}
                      onChange={(e) => {
                        const copy = [...lyrics];
                        copy[idx].text = e.target.value;
                        setLyrics(copy);
                      }}
                      className="flex-1 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-green-500"
                    />
                    <button
                      type="button"
                      onClick={() => setLyrics(lyrics.filter((_, i) => i !== idx))}
                      className="p-1 text-zinc-500 hover:text-red-400 rounded transition-colors"
                      title="Удалить строку"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const nextTime = lyrics.length > 0 ? lyrics[lyrics.length - 1].time + 5 : 2;
                    setLyrics([...lyrics, { id: String(Date.now()), time: nextTime, text: 'Новая строка текста...' }]);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs text-zinc-300 font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Добавить строку
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('style')}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors"
                >
                  Перейти к стилю →
                </button>
              </div>

            </div>
          )}

          {/* TAB 3: Visual Style, Colors & Fonts */}
          {activeTab === 'style' && (
            <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800 space-y-5">
              <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                <Palette className="w-4 h-4 text-zinc-400" />
                Визуальный стиль караоке
              </h3>

              {/* Active Color */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400 block">
                  Цвет активной строки
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {PRESET_COLORS.map((col) => (
                    <button
                      key={col.hex}
                      type="button"
                      onClick={() => setActiveColor(col.hex)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                        activeColor === col.hex ? 'ring-2 ring-green-500 ring-offset-2 ring-offset-zinc-900' : 'hover:opacity-90'
                      }`}
                      style={{ backgroundColor: col.hex }}
                      title={col.name}
                    >
                      {activeColor === col.hex && <Check className="w-3.5 h-3.5 text-black stroke-[3]" />}
                    </button>
                  ))}
                  <div className="flex items-center gap-2 ml-2">
                    <span className="text-xs text-zinc-500">Свой:</span>
                    <input
                      type="color"
                      value={activeColor}
                      onChange={(e) => setActiveColor(e.target.value)}
                      className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
                    />
                  </div>
                </div>
              </div>

              {/* Inactive Color */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400 block">
                  Цвет неактивного текста
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PRESET_INACTIVE_COLORS.map((col) => (
                    <button
                      key={col.hex}
                      type="button"
                      onClick={() => setTextColor(col.hex)}
                      className={`p-2 rounded-lg border text-xs text-left transition-colors ${
                        textColor === col.hex
                          ? 'border-green-500 bg-green-500/5 text-zinc-100'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: col.hex }} />
                        <span className="truncate">{col.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Family */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400 block">
                  Шрифт текста
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PRESET_FONTS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFont(f)}
                      className={`p-2 rounded-lg border text-xs font-medium transition-colors ${
                        font === f
                          ? 'border-green-500 bg-green-500/5 text-zinc-100'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Size */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400 block">
                  Размер шрифта
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'sm', label: 'Компактный' },
                    { id: 'md', label: 'Средний' },
                    { id: 'lg', label: 'Крупный' },
                    { id: 'xl', label: 'Большой' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setFontSize(s.id as FontSize)}
                      className={`p-2 rounded-lg border text-xs font-medium transition-colors ${
                        fontSize === s.id
                          ? 'border-green-500 bg-green-500/5 text-zinc-100'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Background Theme */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400 block">
                  Фон караоке
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {PRESET_BACKGROUNDS.map((bg) => (
                    <button
                      key={bg.type}
                      type="button"
                      onClick={() => {
                        setBackgroundType(bg.type);
                        setBackgroundGradient(bg.gradient);
                      }}
                      className={`p-2.5 rounded-lg border text-left transition-colors ${
                        backgroundType === bg.type
                          ? 'border-green-500 bg-green-500/5 text-zinc-100'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <div className="font-medium text-xs text-zinc-200">{bg.label}</div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">{bg.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Icon & Cover Art */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-medium text-zinc-400 block">
                  Иконка трека или обложка
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { id: 'mic', label: 'Микрофон', icon: Mic2 },
                    { id: 'flame', label: 'Пламя', icon: Flame },
                    { id: 'disc', label: 'Диск', icon: Disc },
                    { id: 'headphones', label: 'Наушники', icon: Headphones },
                  ].map((ic) => {
                    const IconComp = ic.icon;
                    return (
                      <button
                        key={ic.id}
                        type="button"
                        onClick={() => { setCoverIcon(ic.id); setCoverImage(''); }}
                        className={`p-2 rounded-lg border flex items-center gap-1.5 text-xs font-medium transition-colors ${
                          coverIcon === ic.id && !coverImage
                            ? 'border-green-500 bg-green-500/5 text-zinc-100'
                            : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        <IconComp className="w-3.5 h-3.5 text-zinc-400" />
                        {ic.label}
                      </button>
                    );
                  })}

                  <label className="px-3 py-1.5 rounded-lg bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 cursor-pointer text-xs text-zinc-300 font-medium flex items-center gap-1.5 transition-colors">
                    <Upload className="w-3.5 h-3.5 text-zinc-400" />
                    <span>{coverImage ? 'Обложка выбрана' : 'Своя обложка...'}</span>
                    <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
                  </label>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Right Column: Live Spotify Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="sticky top-20">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Предпросмотр
              </span>
              <span className="text-xs text-zinc-500">
                Кликните строку для перемотки
              </span>
            </div>

            <SpotifyLyricsEngine
              karaoke={previewKaraoke}
              autoPlay={false}
              isCompact={true}
            />

            <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Шрифт:</span>
                <span className="text-zinc-200 font-medium">{font} ({fontSize.toUpperCase()})</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Цвет активной строки:</span>
                <span className="flex items-center gap-1.5 text-zinc-200 font-medium font-mono">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeColor }} />
                  {activeColor}
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Фон:</span>
                <span className="text-zinc-200 font-medium capitalize">{backgroundType}</span>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
