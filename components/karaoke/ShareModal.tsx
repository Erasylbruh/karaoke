'use client';

import React, { useState } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  Share2, 
  Code, 
  Send, 
  MessageSquare,
  Music
} from 'lucide-react';
import { Karaoke } from '@/lib/types';

interface ShareModalProps {
  karaoke: Karaoke;
  isOpen: boolean;
  onClose: () => void;
}

export default function ShareModal({ karaoke, isOpen, onClose }: ShareModalProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  if (!isOpen) return null;

  const currentUrl = typeof window !== 'undefined' ? window.location.href : `https://karaokecraft.app/karaoke/${karaoke.id}`;
  const embedCode = `<iframe src="${currentUrl}" width="100%" height="600" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen" title="${karaoke.title} - Spotify Lyrics"></iframe>`;

  const copyToClipboard = async (text: string, type: 'link' | 'embed') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'link') {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } else {
        setCopiedEmbed(true);
        setTimeout(() => setCopiedEmbed(false), 2000);
      }
    } catch {
      // fallback
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
      <div className="relative w-full max-w-lg rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl space-y-4">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-green-500" />
            <h3 className="font-semibold text-base text-zinc-100">Поделиться караоке</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Track Preview Info */}
        <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-zinc-900 border border-zinc-800 overflow-hidden flex items-center justify-center shrink-0">
            {karaoke.style.coverImage ? (
              <img src={karaoke.style.coverImage} alt={karaoke.title} className="w-full h-full object-cover" />
            ) : (
              <Music className="w-5 h-5 text-zinc-400" />
            )}
          </div>
          <div className="flex-1 truncate">
            <h4 className="font-medium text-zinc-200 text-sm truncate">{karaoke.title}</h4>
            <p className="text-xs text-zinc-500 truncate">{karaoke.artist}</p>
          </div>
        </div>

        {/* Copy Direct Link */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-400">Прямая ссылка</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={currentUrl}
              className="flex-1 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 font-mono focus:outline-none"
            />
            <button
              onClick={() => copyToClipboard(currentUrl, 'link')}
              className="px-3.5 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-black font-medium text-xs flex items-center gap-1.5 transition-colors"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedLink ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
        </div>

        {/* Copy Embed Code */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
            <Code className="w-3.5 h-3.5 text-zinc-400" />
            Код для вставки на сайт (iframe)
          </label>
          <div className="relative">
            <textarea
              readOnly
              rows={2}
              value={embedCode}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-400 font-mono resize-none focus:outline-none"
            />
            <button
              onClick={() => copyToClipboard(embedCode, 'embed')}
              className="absolute right-2.5 bottom-2.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1 border border-zinc-700 transition-colors"
            >
              {copiedEmbed ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copiedEmbed ? 'В буфере' : 'Копировать'}
            </button>
          </div>
        </div>

        {/* Social Share Buttons */}
        <div className="pt-1">
          <label className="text-xs font-medium text-zinc-500 block mb-2">Поделиться в мессенджерах</label>
          <div className="grid grid-cols-3 gap-2">
            <a
              href={`https://t.me/share/url?url=${encodeURIComponent(currentUrl)}&text=${encodeURIComponent(`Послушай караоке: ${karaoke.title} - ${karaoke.artist}`)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-medium transition-colors"
            >
              <Send className="w-3.5 h-3.5 text-zinc-400" />
              Telegram
            </a>

            <a
              href={`https://vk.com/share.php?url=${encodeURIComponent(currentUrl)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-medium transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
              ВКонтакте
            </a>

            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${karaoke.title} - ${currentUrl}`)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-medium transition-colors"
            >
              <Share2 className="w-3.5 h-3.5 text-zinc-400" />
              WhatsApp
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
