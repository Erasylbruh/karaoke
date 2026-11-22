/**
 * What the bell shows for a notification. Notifications from other people are rebuilt from their
 * type and the real profile and track names, so the stored `text` (written by the sender's browser)
 * can't be used to show made-up messages. Only admin-created ones (warnings, bans, answers to
 * complaints) show their stored text.
 */
import type { AppNotification } from './types';
import { getKaraokeById, getUserById } from './storage';
import { commentText } from './store';

const ADMIN_TYPES: AppNotification['type'][] = ['warning', 'ban', 'report'];

export const isAdminNotification = (n: AppNotification) => ADMIN_TYPES.includes(n.type);

/** The reply's own text (cached review, or read once by id: NotificationsBell calls loadCommentText). */
function quoteOf(n: AppNotification): string {
  if (!n.commentId) return '';
  const text = commentText(n.commentId);
  if (!text) return '';
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

export function notificationText(n: AppNotification): string {
  if (isAdminNotification(n)) return n.text;
  // actorName is checked against the sender's real name when the notification is written (rules).
  const actor = (n.actorId && getUserById(n.actorId)?.name) || n.actorName || 'Кто-то';
  const track = (n.karaokeId && getKaraokeById(n.karaokeId)?.title) || n.karaokeTitle || 'ваш трек';
  switch (n.type) {
    case 'like':
      return `${actor} оценил(а) «${track}»`;
    case 'comment':
      return `${actor} оставил(а) отзыв о «${track}»`;
    case 'reply': {
      const quote = quoteOf(n);
      return quote ? `${actor} ответил(а) на ваш отзыв: «${quote}»` : `${actor} ответил(а) на ваш отзыв`;
    }
    case 'playlist':
      return `${actor} добавил(а) в плейлист «${track}»`;
    case 'follow':
      return `${actor} подписался(-ась) на вас`;
    case 'download':
      return `${actor} скачал(а) видео «${track}»`;
    default:
      return 'Новое уведомление';
  }
}
