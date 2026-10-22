'use client';

import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { Comment } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { getComments, addComment, deleteComment } from '@/lib/storage';

interface CommentsSectionProps {
  karaokeId: string;
}

export default function CommentsSection({ karaokeId }: CommentsSectionProps) {
  const { user, isAdmin } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [guestName, setGuestName] = useState('');

  useEffect(() => {
    setComments(getComments(karaokeId));
  }, [karaokeId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    const newComment: Comment = {
      id: 'comm-' + Date.now(),
      karaokeId,
      userId: user?.id || 'guest-' + Date.now(),
      userName: user?.name || guestName.trim() || 'Гость',
      userAvatar: user?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      content: text.trim(),
      createdAt: new Date().toISOString(),
    };

    const saved = addComment(newComment);
    setComments([saved, ...comments]);
    setText('');
  };

  const handleDelete = (commentId: string) => {
    deleteComment(commentId);
    setComments(comments.filter((c) => c.id !== commentId));
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Только что';
    }
  };

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-5 md:p-6 space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-zinc-400" />
          <h3 className="font-semibold text-base text-zinc-100">
            Комментарии ({comments.length})
          </h3>
        </div>
      </div>

      {/* Add Comment Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        {!user && (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Ваше имя"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="w-full sm:w-64 px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-green-500"
            />
          </div>
        )}

        <div className="space-y-2">
          <textarea
            rows={2}
            placeholder="Оставьте комментарий..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-green-500 transition-colors resize-none"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!text.trim()}
              className="px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-black font-medium text-xs flex items-center gap-1.5 transition-colors disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
              Отправить
            </button>
          </div>
        </div>
      </form>

      {/* Comments List */}
      <div className="space-y-3 pt-1">
        {comments.length === 0 ? (
          <div className="text-center py-6 text-zinc-500 text-xs">
            Нет комментариев. Будьте первым!
          </div>
        ) : (
          comments.map((comm) => {
            const canDelete = isAdmin || (user && user.id === comm.userId);
            return (
              <div
                key={comm.id}
                className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <img
                    src={comm.userAvatar}
                    alt={comm.userName}
                    className="w-7 h-7 rounded-full object-cover border border-zinc-700 shrink-0"
                  />
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-xs text-zinc-200">{comm.userName}</span>
                      <span className="text-[10px] text-zinc-500">{formatDate(comm.createdAt)}</span>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed break-words">{comm.content}</p>
                  </div>
                </div>

                {canDelete && (
                  <button
                    onClick={() => handleDelete(comm.id)}
                    className="p-1 rounded text-zinc-500 hover:text-red-400 transition-colors"
                    title="Удалить"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
