'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { 
  Heart, 
  Share2, 
  Download, 
  ArrowLeft, 
  Eye, 
  Disc, 
  Calendar
} from 'lucide-react';
import { Karaoke } from '@/lib/types';
import { getKaraokeById, getKaraokes, toggleKaraokeLike, hasUserLiked, incrementViewCount } from '@/lib/storage';
import { useAuth } from '@/context/AuthContext';
import SpotifyLyricsEngine from '@/components/karaoke/SpotifyLyricsEngine';
import CommentsSection from '@/components/karaoke/CommentsSection';
import VideoDownloaderModal from '@/components/karaoke/VideoDownloaderModal';
import ShareModal from '@/components/karaoke/ShareModal';
import KaraokeCard from '@/components/karaoke/KaraokeCard';

function KaraokeDetailContent() {
  const params = useParams();
  const { user } = useAuth();
  const id = params?.id as string;

  const [karaoke, setKaraoke] = useState<Karaoke | null>(null);
  const [likesCount, setLikesCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [relatedKaraokes, setRelatedKaraokes] = useState<Karaoke[]>([]);

  useEffect(() => {
    if (!id) return;
    const item = getKaraokeById(id);
    if (item) {
      setKaraoke(item);
      setLikesCount(item.likesCount);
      setIsLiked(hasUserLiked(item.id, user?.id));
      incrementViewCount(item.id);

      const all = getKaraokes();
      setRelatedKaraokes(all.filter((k) => k.id !== item.id).slice(0, 3));
    }
  }, [id, user?.id]);

  if (!karaoke) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-24 text-center space-y-4">
        <h2 className="text-xl font-semibold text-zinc-100">Караоке не найдено</h2>
        <p className="text-zinc-500 text-sm">Возможно, композиция была удалена или ссылка неверна.</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Вернуться в каталог
        </Link>
      </div>
    );
  }

  const handleLike = () => {
    const userId = user?.id || 'guest-user';
    const res = toggleKaraokeLike(karaoke.id, userId);
    setIsLiked(res.isLiked);
    setLikesCount(res.count);
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-20">
      
      {/* Top Breadcrumb & Actions Bar */}
      <div className="border-b border-zinc-800 bg-zinc-950/95 sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Каталог
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsShareOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-300 hover:text-zinc-100 transition-colors flex items-center gap-1.5"
            >
              <Share2 className="w-3.5 h-3.5 text-zinc-400" />
              Поделиться
            </button>

            <button
              onClick={() => setIsDownloadOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-black font-medium text-xs transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Скачать видео
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        
        {/* Track Title & Author Info Card */}
        <div className="p-5 sm:p-6 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-5">
          
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-14 h-14 rounded-lg bg-zinc-950 border border-zinc-800 overflow-hidden flex items-center justify-center shrink-0">
              {karaoke.style.coverImage ? (
                <img src={karaoke.style.coverImage} alt={karaoke.title} className="w-full h-full object-cover" />
              ) : (
                <Disc className="w-6 h-6 text-zinc-400" />
              )}
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">
                  {karaoke.title}
                </h1>
                {karaoke.isFeatured && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-500 border border-green-500/20">
                    Рекомендовано
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-zinc-400">
                {karaoke.artist}
              </p>
              <div className="flex items-center gap-3 text-xs text-zinc-500 pt-1 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <img src={karaoke.authorAvatar} alt={karaoke.authorName} className="w-4 h-4 rounded-full object-cover border border-zinc-700" />
                  <span className="text-zinc-400">{karaoke.authorName}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  {formatDate(karaoke.createdAt)}
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5 text-zinc-500" />
                  {karaoke.viewsCount || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Social Interaction Buttons */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              onClick={handleLike}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                isLiked
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                  : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-red-400 text-red-400' : ''}`} />
              <span>{likesCount}</span>
            </button>

            <button
              onClick={() => setIsShareOpen(true)}
              className="p-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-colors"
              title="Поделиться"
            >
              <Share2 className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsDownloadOpen(true)}
              className="p-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-colors"
              title="Скачать видео"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* Primary Spotify Lyrics Engine Display */}
        <div>
          <SpotifyLyricsEngine
            karaoke={karaoke}
            autoPlay={true}
          />
        </div>

        {/* Description & Tags Section */}
        <div className="p-5 sm:p-6 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
          <h3 className="font-semibold text-sm text-zinc-200">О композиции</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            {karaoke.description || 'Караоке-анимация с синхронизацией текста.'}
          </p>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {karaoke.tags.map((t) => (
              <Link
                key={t}
                href={`/?search=${encodeURIComponent(t)}`}
                className="text-xs px-2.5 py-0.5 rounded-full bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                #{t}
              </Link>
            ))}
          </div>
        </div>

        {/* Comments Section */}
        <CommentsSection karaokeId={karaoke.id} />

        {/* Related Karaokes */}
        {relatedKaraokes.length > 0 && (
          <div className="space-y-3 pt-4">
            <h3 className="text-base font-semibold text-zinc-200">
              Похожие композиции
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {relatedKaraokes.map((rel) => (
                <KaraokeCard key={rel.id} karaoke={rel} />
              ))}
            </div>
          </div>
        )}

      </div>

      <VideoDownloaderModal
        karaoke={karaoke}
        isOpen={isDownloadOpen}
        onClose={() => setIsDownloadOpen(false)}
      />

      <ShareModal
        karaoke={karaoke}
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
      />

    </div>
  );
}

export default function KaraokeDetailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <KaraokeDetailContent />
    </Suspense>
  );
}
