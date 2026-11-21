'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProjectWarningDialog from '@/components/admin/ProjectWarningDialog';
import Tabs from '@/components/ui/Tabs';
import { useAuth } from '@/context/AuthContext';
import { REPORT_OPTIONS, REPORT_TYPES, reviewProjectReport, subscribeProjectReports, timestampToDate, type ProjectReport, type ReportType } from '@/lib/project-moderation';
import { getKaraokeById, getUserById, notify } from '@/lib/storage';
import { COMPLAINT_ANSWER_DAYS } from '@/lib/legal';
import type { Karaoke } from '@/lib/types';

const DAY_MS = 86400000;

/** Notification text limit in firestore.rules. */
const NOTIFICATION_TEXT_LIMIT = 500;

type ReportStatus = ProjectReport['status'];

export default function AdminReports() {
  const { user, isAdmin } = useAuth();
  return isAdmin && user ? <ProjectReports key={user.id} moderatorId={user.id} /> : null;
}

function ProjectReports({ moderatorId }: { moderatorId: string }) {
  const [reports, setReports] = useState<ProjectReport[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<ReportStatus>('open');
  const [type, setType] = useState<ReportType | 'all'>('all');
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [warningTarget, setWarningTarget] = useState<Karaoke | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => subscribeProjectReports(setReports, () => setLoadError(true)), []);

  const byType = (reports ?? []).filter((report) => type === 'all' || report.type === type);
  const count = (status: ReportStatus) => byType.filter((report) => report.status === status).length;
  const visible = byType.filter((report) => report.status === tab);

  async function review(report: ProjectReport) {
    setReviewing(report.id);
    setActionError('');
    setNotice('');
    try {
      await reviewProjectReport(report.id, moderatorId);
      // The law asks for a reasoned answer to the person who complained; it arrives in their notifications.
      const answer = (answers[report.id] || '').trim();
      if (answer) {
        const prefix = `Ответ по вашей жалобе на «${report.karaokeTitle}»: `;
        notify(report.reporterId, 'report', (prefix + answer).slice(0, NOTIFICATION_TEXT_LIMIT), {
          actorId: moderatorId,
          karaokeId: report.karaokeId,
        });
      }
      setNotice(answer ? 'Жалоба рассмотрена, ответ отправлен заявителю.' : 'Жалоба отмечена как рассмотренная.');
    } catch {
      setActionError('Не удалось отметить жалобу как рассмотренную. Попробуйте ещё раз.');
    } finally {
      setReviewing(null);
    }
  }

  return (
    <>
      <h1 className="pg-h">Жалобы</h1>
      <p className="pg-sub">
        Жалобы пользователей на караоке-проекты. На каждую нужно дать мотивированный ответ заявителю не позже чем через{' '}
        {COMPLAINT_ANSWER_DAYS} календарных дней. Жалобы, пришедшие на почту, отвечайте письмом.
      </p>

      <Tabs<ReportStatus> value={tab} onChange={setTab} label="Статус жалоб" tabs={[
        { id: 'open', label: 'Новые', count: count('open') },
        { id: 'reviewed', label: 'Рассмотренные', count: count('reviewed') },
      ]} />

      <label className="fld mb-4 max-w-xs">
        Тип жалобы
        <select value={type} onChange={(event) => setType(event.target.value as ReportType | 'all')}>
          <option value="all">Все типы</option>
          {REPORT_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>

      {actionError && <p className="mb-4 text-sm text-red-400" role="alert">{actionError}</p>}
      {notice && <p className="mb-4 text-sm" role="status">{notice}</p>}

      {loadError ? (
        <p className="card em2" role="alert">Не удалось загрузить жалобы. Проверьте права доступа и обновите страницу.</p>
      ) : reports === null ? (
        <p className="card em2" role="status">Загрузка жалоб…</p>
      ) : visible.length === 0 ? (
        <p className="card em2">Жалоб с выбранным статусом и типом нет.</p>
      ) : (
        <ul className="stack">
          {visible.map((report) => {
            const project = getKaraokeById(report.karaokeId);
            const available = project && project.status !== 'deleted';
            const reporter = getUserById(report.reporterId);
            const reviewedBy = report.reviewedBy ? getUserById(report.reviewedBy) : undefined;
            return (
              <li key={report.id} className="card p-4">
                <div className="row">
                  <span className="pill wn">{REPORT_TYPES[report.type]}</span>
                  <time className="mu sm">{timestampToDate(report.createdAt).toLocaleString('ru-RU')}</time>
                  {report.status === 'open' && (() => {
                    const left = Math.ceil((timestampToDate(report.createdAt).getTime() + COMPLAINT_ANSWER_DAYS * DAY_MS - Date.now()) / DAY_MS);
                    return <span className={`pill ${left <= 3 ? 'dg' : 'ok'}`}>{left > 0 ? `ответить в течение ${left} дн.` : 'срок ответа истёк'}</span>;
                  })()}
                </div>
                <h2 className="mt-2 font-semibold wrap-anywhere">
                  {available ? <Link className="lk" href={`/karaoke/${encodeURIComponent(project.id)}`}>{project.title}</Link> : report.karaokeTitle}
                </h2>
                {!available && <p className="mu sm">Проект удалён или недоступен</p>}
                <p className="mu sm">
                  Отправитель {reporter ? <Link className="lk" href={`/u/${reporter.username}`}>@{reporter.username}</Link> : 'недоступен'}
                </p>
                {report.details && <p className="mt-2 whitespace-pre-wrap wrap-anywhere">{report.details}</p>}
                {report.reviewedAt && (
                  <p className="mu sm mt-2">
                    Рассмотрена {timestampToDate(report.reviewedAt).toLocaleString('ru-RU')}{reviewedBy ? ` · @${reviewedBy.username}` : ''}
                  </p>
                )}
                {report.status === 'open' && (
                  <label className="fld mt-3">
                    Ответ заявителю (придёт ему в уведомления)
                    <textarea
                      rows={2}
                      maxLength={NOTIFICATION_TEXT_LIMIT - 80}
                      value={answers[report.id] ?? ''}
                      placeholder="Например: проект заблокирован, файлы удалены. Или: нарушение не подтвердилось, потому что…"
                      onChange={(event) => setAnswers((cur) => ({ ...cur, [report.id]: event.target.value }))}
                    />
                  </label>
                )}
                <div className="row mt-3">
                  {available && <button type="button" className="bt sm" aria-haspopup="dialog" onClick={() => setWarningTarget(project)}>Предупредить автора</button>}
                  {report.status === 'open' && (
                    <button type="button" className="bt sm" disabled={reviewing !== null} onClick={() => void review(report)}>
                      {reviewing === report.id ? 'Сохраняем…' : 'Отметить рассмотренной'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {warningTarget && (
        <ProjectWarningDialog key={warningTarget.id} project={warningTarget} moderatorId={moderatorId}
          onClose={() => setWarningTarget(null)} onSent={() => {
            setWarningTarget(null);
            setActionError('');
            setNotice('Предупреждение отправлено автору проекта.');
          }} />
      )}
    </>
  );
}
