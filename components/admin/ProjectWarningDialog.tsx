'use client';

import { useEffect, useState, type FormEvent } from 'react';
import ProjectModerationDialog from '@/components/ui/ProjectModerationDialog';
import { MODERATION_TEXT_LIMIT, sendProjectWarning, subscribeProjectWarningHistory, type ProjectWarning } from '@/lib/project-moderation';
import type { Karaoke } from '@/lib/types';

export default function ProjectWarningDialog({ project, moderatorId, onClose, onSent }: {
  project: Karaoke;
  moderatorId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<ProjectWarning[]>([]);
  const [historyError, setHistoryError] = useState(false);

  useEffect(() => subscribeProjectWarningHistory(project.authorId, project.id, setHistory, () => {
    setHistoryError(true);
  }), [project.authorId, project.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || !reason.trim()) return;
    setSending(true);
    setError('');
    try {
      await sendProjectWarning(project.id, moderatorId, reason);
    } catch (cause) {
      const message = cause instanceof Error && !('code' in cause) ? cause.message : 'Не удалось отправить предупреждение. Попробуйте ещё раз.';
      setError(message);
      setSending(false);
      return;
    }
    onSent();
  }

  return (
    <ProjectModerationDialog onClose={() => { if (!sending) onClose(); }} title="Предупреждение по проекту" description={`Автор проекта «${project.title}» получит уведомление.`}>
      <form className="stack" onSubmit={submit}>
        <label className="fld">
          Текст предупреждения
          <textarea required rows={4} maxLength={MODERATION_TEXT_LIMIT} disabled={sending}
            value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <div className="row">
          <button type="submit" className="bt pr" disabled={sending || !reason.trim()}>
            {sending ? 'Отправляем…' : 'Отправить предупреждение'}
          </button>
          <button type="button" className="bt" disabled={sending} onClick={onClose}>Отмена</button>
        </div>
        {historyError && <p className="mu sm">Не удалось загрузить предыдущие предупреждения.</p>}
        {history.length > 0 && (
          <details>
            <summary className="mu sm">Предыдущие предупреждения ({history.length})</summary>
            <ul className="mt-2 space-y-2">
              {history.map((warning) => (
                <li key={warning.id} className="text-sm">
                  <time className="mu">{warning.createdAt.toDate().toLocaleDateString('ru-RU')}</time>
                  <p className="whitespace-pre-wrap wrap-anywhere">{warning.reason}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </form>
    </ProjectModerationDialog>
  );
}
