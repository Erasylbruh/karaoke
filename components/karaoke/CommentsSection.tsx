'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { CornerDownRight, Flag, Pin, PinOff, Reply, Send, Trash2 } from 'lucide-react';
import { Comment } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { useDataVersion, useWatch } from '@/components/DataProvider';
import { getComments, commentsLoaded, addComment, deleteComment, togglePinComment, uid, getUserById } from '@/lib/storage';
import { safeMediaUrl } from '@/lib/format';
import { mailto } from '@/lib/legal';

const VERIFY_HINT = 'Подтвердите email по ссылке из письма, чтобы оставлять отзывы';

const MAX_LENGTH = 1000;

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const byDate = (a: Comment, b: Comment) => +new Date(a.createdAt) - +new Date(b.createdAt);

/**
 * Reviews with one level of replies. The track author (or an admin) can pin one review.
 * `highlightId` scrolls to and highlights a review, e.g. when opened from a reply notification.
 * The page watches the reviews (comments:{karaokeId}); `live` (the reviews are open) also loads
 * each reviewer's current name and avatar, otherwise the copy stored in the review is shown.
 */
export default function CommentsSection({
  karaokeId,
  trackAuthorId,
  highlightId,
  live = false,
}: {
  karaokeId: string;
  trackAuthorId?: string;
  highlightId?: string | null;
  live?: boolean;
}) {
  const { user, isAdmin, openAuthPrompt, ensureVerified } = useAuth();
  useDataVersion(); // new reviews from other people appear immediately
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [replyText, setReplyText] = useState('');

  const all = getComments(karaokeId);
  const loaded = commentsLoaded(karaokeId);
  useWatch(live ? all.map((c) => `user:${c.userId}`) : []);
  const top = all
    .filter((c) => !c.parentId)
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || +new Date(b.createdAt) - +new Date(a.createdAt));
  const repliesOf = (id: string) => all.filter((c) => c.parentId === id).sort(byDate);
  const canPin = !!user && (isAdmin || user.id === trackAuthorId);

  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => document.getElementById(`c-${highlightId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150);
    return () => clearTimeout(t);
  }, [highlightId]);

  const askLogin = () => openAuthPrompt('Чтобы оставлять отзывы и отвечать, войдите или зарегистрируйтесь.');

  const post = async (content: string, parentId?: string): Promise<boolean> => {
    if (!user) {
      askLogin();
      return false;
    }
    const value = content.trim();
    if (!value) return false;
    // The rules accept reviews only from confirmed emails; without this check the review would vanish silently.
    if (!(await ensureVerified())) {
      setError(VERIFY_HINT);
      return false;
    }
    addComment({
      id: 'comm-' + uid(),
      karaokeId,
      userId: user.id,
      userName: user.name,
      userAvatar: user.avatar,
      content: value.slice(0, MAX_LENGTH),
      createdAt: new Date().toISOString(),
      parentId,
    });
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return askLogin();
    if (!text.trim()) return setError('Напишите текст отзыва');
    if (await post(text)) {
      setText('');
      setError('');
    }
  };

  const startReply = (c: Comment) => {
    if (!user) return askLogin();
    setReplyTo(c);
    setReplyText('');
  };

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (replyTo && (await post(replyText, replyTo.id))) {
      setReplyTo(null);
      setReplyText('');
    }
  };

  const item = (c: Comment, isReply: boolean) => {
    const canDelete = isAdmin || user?.id === c.userId;
    // Shown from the author's current profile: the copy stored in the review may be outdated.
    const author = getUserById(c.userId);
    const name = author?.name || c.userName;
    const avatar = author ? author.avatar : c.userAvatar;
    const complain = () => {
      window.location.href = mailto(
        'Жалоба на отзыв',
        `Ссылка на отзыв: ${window.location.origin}/karaoke/${encodeURIComponent(karaokeId)}#c-${c.id}\nЧто не так: `
      );
    };
    return (
      <div id={`c-${c.id}`} className={`rv-item ${c.pinned ? 'pinned' : ''} ${highlightId === c.id ? 'hl' : ''}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={safeMediaUrl(avatar) || '/brand/karaokecraft-app-icon.svg'} alt="" className="av" />
        <div className="rv-body">
          {c.pinned && (
            <span className="rv-pin-label">
              <Pin size={12} aria-hidden="true" /> Закреплено автором
            </span>
          )}
          <div className="rv-meta">
            <b>{name}</b>
            {c.userId === trackAuthorId && <span className="rv-badge">автор</span>}
            <span>{formatDate(c.createdAt)}</span>
          </div>
          <p>{c.content}</p>
          <div className="rv-actions">
            {!isReply && (
              <button onClick={() => startReply(c)}>
                <Reply size={14} aria-hidden="true" /> Ответить
              </button>
            )}
            {!isReply && canPin && (
              <button onClick={() => togglePinComment(c.id)}>
                {c.pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}
                {c.pinned ? 'Открепить' : 'Закрепить'}
              </button>
            )}
            {canDelete && (
              <button className="dg" onClick={() => deleteComment(c.id)} aria-label="Удалить">
                <Trash2 size={14} aria-hidden="true" /> Удалить
              </button>
            )}
            {user?.id !== c.userId && (
              <button type="button" onClick={complain} aria-label={`Пожаловаться на отзыв ${name}`}>
                <Flag size={14} aria-hidden="true" /> Пожаловаться
              </button>
            )}
          </div>
        </div>
      </div>
    );
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
          onClick={() => !user && askLogin()}
        />
        <div className="rv-row">
          {error ? <span className="rv-err">{error}</span> : <span className="rv-count">{text.length}/{MAX_LENGTH}</span>}
          <button type="submit" className="bt pr sm">
            <Send size={15} aria-hidden="true" />
            Отправить
          </button>
        </div>
      </form>

      {top.length === 0 ? (
        <p className="rv-empty">{loaded ? 'Отзывов пока нет. Будьте первым.' : 'Загружаем отзывы…'}</p>
      ) : (
        <ul className="rv-list">
          {top.map((c) => {
            const replies = repliesOf(c.id);
            return (
              <li key={c.id}>
                {item(c, false)}
                {(replies.length > 0 || replyTo?.id === c.id) && (
                  <div className="rv-replies">
                    {replies.map((r) => (
                      <div key={r.id} className="rv-reply">
                        <CornerDownRight size={14} aria-hidden="true" className="rv-reply-ic" />
                        {item(r, true)}
                      </div>
                    ))}
                    {replyTo?.id === c.id && (
                      <form className="rv-form rv-reply-form" onSubmit={sendReply}>
                        <textarea
                          rows={2}
                          maxLength={MAX_LENGTH}
                          autoFocus
                          placeholder={`Ответ для ${getUserById(c.userId)?.name || c.userName}`}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                        />
                        <div className="rv-row">
                          <button type="button" className="bt sm gh" onClick={() => setReplyTo(null)}>Отмена</button>
                          <button type="submit" className="bt pr sm" disabled={!replyText.trim()}>
                            <Send size={15} aria-hidden="true" /> Ответить
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!user && (
        <p className="rv-empty">
          <Link href="/login" className="lk">Войдите</Link>, чтобы оставлять отзывы и отвечать.
        </p>
      )}
    </section>
  );
}
