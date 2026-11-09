'use client';

import { useState, type FormEvent } from 'react';
import ProjectModerationDialog from '@/components/ui/ProjectModerationDialog';
import { MODERATION_TEXT_LIMIT, REPORT_OPTIONS, submitProjectReport, type ReportType } from '@/lib/project-moderation';
import type { Karaoke } from '@/lib/types';

export default function ProjectReportDialog({ project, reporterId, onClose, onSent }: {
  project: Karaoke;
  reporterId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [type, setType] = useState<ReportType | ''>('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || !type || (type === 'other' && !details.trim())) return;
    setSending(true);
    setError('');
    try {
      await submitProjectReport(project.id, reporterId, type, details);
    } catch {
      setError('Не удалось отправить жалобу. Проверьте подключение и доступ к проекту, затем попробуйте снова.');
      setSending(false);
      return;
    }
    onSent();
  }

  return (
    <ProjectModerationDialog onClose={() => { if (!sending) onClose(); }} title="Пожаловаться на проект" description={project.title}>
      <form className="stack" onSubmit={submit}>
        <label className="fld">
          Тип жалобы
          <select required value={type} disabled={sending} onChange={(event) => setType(event.target.value as ReportType | '')}>
            <option value="" disabled>Выберите тип жалобы</option>
            {REPORT_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label className="fld">
          {type === 'other' ? 'Описание нарушения' : 'Описание нарушения (необязательно)'}
          <textarea rows={4} maxLength={MODERATION_TEXT_LIMIT} value={details}
            required={type === 'other'} disabled={sending} onChange={(event) => setDetails(event.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <div className="row">
          <button type="submit" className="bt pr" disabled={sending || !type || (type === 'other' && !details.trim())}>
            {sending ? 'Отправляем…' : 'Отправить жалобу'}
          </button>
          <button type="button" className="bt" disabled={sending} onClick={onClose}>Отмена</button>
        </div>
      </form>
    </ProjectModerationDialog>
  );
}
