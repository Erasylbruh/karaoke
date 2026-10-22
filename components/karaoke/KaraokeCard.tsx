'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Heart, 
  Eye, 
  Play, 
  Flame, 
  Disc, 
  Headphones, 
  Mic2,
  Clock
} from 'lucide-react';
import { Karaoke } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { toggleKaraokeLike, hasUserLiked } from '@/lib/storage';

interface KaraokeCardProps {
  karaoke: Karaoke;
  onLikeChange?: (newCount: number, isLiked: boolean) => void;
}

export default function KaraokeCard({ karaoke, onLikeChange }: KaraokeCardProps) {
  const { user } = useAuth();
  const [likesCount, setLikesCount] = useState(karaoke.likesCount);
  const [isLiked, setIsLiked] = useState(() => hasUserLiked(karaoke.id, user?.id));

  const handleLike = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const userId = user?.id || 'guest-user';
    const res = toggleKaraokeLike(karaoke.id, userId);
    setIsLiked(res.isLiked);
    setLikesCount(res.count);
    onLikeChange?.(res.count, res.isLiked);
  };

  const renderIcon = () => {
    switch (karaoke.style.coverIcon) {
      case 'flame': return <Flame className="w-6 h-6 text-zinc-400" />;
      case 'disc': return <Disc className="w-6 h-6 text-zinc-400" />;
      case 'headphones': return <Headphones className="w-6 h-6 text-zinc-400" />;
      default: return <Mic2 className="w-6 h-6 text-zinc-400" />;
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="group relative rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors flex flex-col overflow-hidden">
      
      {/* Card Header / Cover */}
      <div className="relative h-44 w-full overflow-hidden bg-zinc-950">
        {karaoke.style.coverImage ? (
          <img
            src={karaoke.style.coverImage}
            alt={karaoke.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-950">
            <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              {renderIcon()}
            </div>
          </div>
        )}

        {/* Gradient overlay for text contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-black/30" />

        {/* Featured Badge */}
        {karaoke.isFeatured && (
          <div className="absolute top-3 left-3 px-2 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-500 border border-green-500/20">
            Рекомендовано
          </div>
        )}

        {/* Duration badge */}
        <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-black/70 text-zinc-300 border border-zinc-800">
          <Clock className="w-3 h-3 text-zinc-400" />
          {formatDuration(karaoke.duration)}
        </div>

        {/* Play Floating Button */}
        <Link
          href={`/karaoke/${karaoke.id}`}
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        >
          <div className="w-11 h-11 rounded-full bg-green-500 hover:bg-green-400 flex items-center justify-center transition-colors">
            <Play className="w-5 h-5 fill-black text-black translate-x-0.5" />
          </div>
        </Link>
      </div>

      {/* Card Content */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        
        <div>
          {/* Title & Artist */}
          <Link href={`/karaoke/${karaoke.id}`} className="block group/title">
            <h3 className="font-semibold text-base text-zinc-100 group-hover/title:text-green-400 transition-colors line-clamp-1">
              {karaoke.title}
            </h3>
            <p className="text-xs font-medium text-zinc-400 mt-0.5 line-clamp-1">
              {karaoke.artist}
            </p>
          </Link>

          {/* Description snippet */}
          <p className="text-xs text-zinc-500 mt-2 line-clamp-2 leading-relaxed">
            {karaoke.description}
          </p>

          {/* Tags */}
          <div className="flex flex-wrap gap-1 mt-3">
            {karaoke.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-800"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>

        {/* Card Footer: Author & Social Stats */}
        <div className="mt-4 pt-3 border-t border-zinc-800 flex items-center justify-between">
          
          {/* Author */}
          <div className="flex items-center gap-2">
            <img
              src={karaoke.authorAvatar}
              alt={karaoke.authorName}
              className="w-5 h-5 rounded-full object-cover border border-zinc-700"
            />
            <span className="text-xs text-zinc-400 font-medium truncate max-w-[100px]">
              {karaoke.authorName}
            </span>
          </div>

          {/* Views & Likes */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-xs text-zinc-500" title="Просмотры">
              <Eye className="w-3.5 h-3.5" />
              <span>{karaoke.viewsCount || 0}</span>
            </div>

            <button
              onClick={handleLike}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${
                isLiked
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                  : 'text-zinc-500 hover:text-red-400'
              }`}
              title={isLiked ? 'Убрать лайк' : 'Поставить лайк'}
            >
              <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-red-400 text-red-400' : ''}`} />
              <span>{likesCount}</span>
            </button>
          </div>

        </div>

      </div>

    </div>
  );
}
