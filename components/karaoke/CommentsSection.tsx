'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Send, Trash2 } from 'lucide-react';
import { Comment } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { useDataVersion } from '@/components/DataProvider';
import { getComments, addComment, deleteComment, uid } from '@/lib/storage';

const MAX_LENGTH = 1000;

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** Review form on top, live list below. Posting requires an account. */
export default function CommentsSection({ karaokeId }: { karaokeId: string }) {
  const { user, isAdmin, openAuthPrompt } = useAuth();
  useDataVersion(); // new reviews from other people appear immediately
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const comments = getComments(karaokeId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthPrompt('Чтобы оставить отзыв, войдите или зарегистрируйтесь.');
      return;
    }
    const content = text.trim();
    if (!content) {
      setError('Напишите текст отзыва');
      return;
    }
    const comment: Comment = {
      id: 'comm-' + uid(),
      karaokeId,
      userId: user.id,
      userName: user.name,
      userAvatar: user.avatar,
      content: content.slice(0, MAX_LENGTH),
      createdAt: new Date().toISOString(),
    };
    addComment(comment);
    setText('');
    setError('');
  };

  return (
    <section className="rv" aria-label="Отзывы">
      <form className="rv-form" onSubmit={handleSubmit}>
        <label htmlFor={`rv-${karaokeId}`} className="rv-label">
          {user ? `Ваш отзыв, ${user.name}` : 'Оставьте отзыв'}
        </label>
        <textarea
          id={`rv-${karaokeId}`}
          rows={3}
          maxLength={MAX_LENGTH}
          placeholder={user ? 'Что понравилось в этом караоке?' : 'Войдите, чтобы написать отзыв'}
          value={text}
          readOnly={!user}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError('');
          }}
          onClick={() => !user && openAuthPrompt('Чтобы оставить отзыв, войдите или зарегистрируйтесь.')}
        />
        <div className="rv-row">
          {error ? <span className="rv-err">{error}</span> : <span className="rv-count">{text.length}/{MAX_LENGTH}</span>}
          <button type="submit" className="bt pr sm">
            <Send size={15} aria-hidden="true" />
            Отправить
          </button>
        </div>
      </form>

      {comments.length === 0 ? (
        <p className="rv-empty">Отзывов пока нет. Будьте первым.</p>
      ) : (
        <ul className="rv-list">
          {comments.map((c) => {
            const canDelete = isAdmin || user?.id === c.userId;
            return (
              <li key={c.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.userAvatar} alt="" className="av" />
                <div className="rv-body">
                  <div className="rv-meta">
                    <b>{c.userName}</b>
                    <span>{formatDate(c.createdAt)}</span>
                  </div>
                  <p>{c.content}</p>
                </div>
                {canDelete && (
                  <button className="rv-del" aria-label="Удалить отзыв" onClick={() => deleteComment(c.id)}>
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!user && (
        <p className="rv-empty">
          <Link href="/login" className="lk">Войдите</Link>, чтобы оставлять отзывы.
        </p>
      )}
    </section>
  );
}
