'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProjectWarningDialog from '@/components/admin/ProjectWarningDialog';
import Tabs from '@/components/ui/Tabs';
import { useAuth } from '@/context/AuthContext';
import { REPORT_OPTIONS, REPORT_TYPES, reviewProjectReport, subscribeProjectReports, type ProjectReport, type ReportType } from '@/lib/project-moderation';
import { getKaraokeById, getUserById } from '@/lib/storage';
import type { Karaoke } from '@/lib/types';

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
      setNotice('Жалоба отмечена как рассмотренная.');
    } catch {
      setActionError('Не удалось отметить жалобу как рассмотренную. Попробуйте ещё раз.');
    } finally {
      setReviewing(null);
    }
  }

  return (
    <>
      <h1 className="pg-h">Жалобы</h1>
      <p className="pg-sub">Жалобы пользователей на караоке-проекты.</p>

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
                  <time className="mu sm">{report.createdAt.toDate().toLocaleString('ru-RU')}</time>
                </div>
                <h2 className="mt-2 font-semibold wrap-anywhere">
                  {available ? <Link className="lk" href={`/karaoke/${project.id}`}>{project.title}</Link> : report.karaokeTitle}
                </h2>
                {!available && <p className="mu sm">Проект удалён или недоступен</p>}
                <p className="mu sm">
                  Отправитель {reporter ? <Link className="lk" href={`/u/${reporter.username}`}>@{reporter.username}</Link> : 'недоступен'}
                </p>
                {report.details && <p className="mt-2 whitespace-pre-wrap wrap-anywhere">{report.details}</p>}
                {report.reviewedAt && (
                  <p className="mu sm mt-2">
                    Рассмотрена {report.reviewedAt.toDate().toLocaleString('ru-RU')}{reviewedBy ? ` · @${reviewedBy.username}` : ''}
                  </p>
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
