import {
  collection, doc, onSnapshot, orderBy, query, runTransaction, serverTimestamp, updateDoc, where,
  type Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { AppNotification, Karaoke } from './types';

export const REPORT_TYPES = {
  copyright: 'Нарушение авторских прав',
  inappropriate: 'Неприемлемый контент',
  abuse: 'Оскорбления или травля',
  spam: 'Спам или мошенничество',
  other: 'Другое',
} as const;

export type ReportType = keyof typeof REPORT_TYPES;
export const REPORT_OPTIONS = Object.entries(REPORT_TYPES) as [ReportType, string][];
export const MODERATION_TEXT_LIMIT = 1000;

export interface ProjectReport {
  id: string;
  karaokeId: string;
  karaokeTitle: string;
  reporterId: string;
  type: ReportType;
  details: string;
  status: 'open' | 'reviewed';
  createdAt: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
}

export interface ProjectWarning {
  id: string;
  karaokeId: string;
  karaokeTitle: string;
  moderatorId: string;
  reason: string;
  createdAt: Timestamp;
  read: boolean;
}

const reports = collection(db, 'projectReports');
const warnings = (authorId: string) => collection(db, 'users', authorId, 'projectWarnings');
const projectRef = (id: string) => doc(db, 'karaokes', id);

export function canReportProject(project: Karaoke, reporterId?: string) {
  const visibility = project.visibility ?? 'public';
  return (project.status ?? 'active') === 'active' &&
    (visibility === 'public' || visibility === 'unlisted') && project.authorId !== reporterId;
}

export async function submitProjectReport(karaokeId: string, reporterId: string, type: ReportType, details: string) {
  const note = details.trim();
  if (note.length > MODERATION_TEXT_LIMIT || (type === 'other' && !note)) {
    throw new Error('Проверьте описание жалобы.');
  }
  const reportRef = doc(reports);
  const target = projectRef(karaokeId);
  await runTransaction(db, async (transaction) => {
    const project = (await transaction.get(target)).data() as Karaoke | undefined;
    if (!project || !canReportProject(project, reporterId)) {
      throw new Error('На этот проект сейчас нельзя пожаловаться.');
    }
    transaction.set(reportRef, {
      karaokeId,
      karaokeTitle: project.title,
      reporterId,
      type,
      details: note,
      status: 'open',
      createdAt: serverTimestamp(),
    });
  });
}

export function subscribeProjectReports(onChange: (reports: ProjectReport[]) => void, onError: () => void) {
  return onSnapshot(query(reports, orderBy('createdAt', 'desc')), (snapshot) => {
    onChange(snapshot.docs.map((row) => ({ ...row.data(), id: row.id }) as ProjectReport));
  }, onError);
}

export async function reviewProjectReport(reportId: string, moderatorId: string) {
  const reportRef = doc(reports, reportId);
  await runTransaction(db, async (transaction) => {
    const report = await transaction.get(reportRef);
    if (!report.exists()) throw new Error('Жалоба больше недоступна.');
    if (report.data().status === 'reviewed') return;
    transaction.update(reportRef, { status: 'reviewed', reviewedAt: serverTimestamp(), reviewedBy: moderatorId });
  });
}

export async function sendProjectWarning(karaokeId: string, moderatorId: string, reason: string) {
  const message = reason.trim();
  if (!message || message.length > MODERATION_TEXT_LIMIT) throw new Error('Проверьте текст предупреждения.');

  const target = projectRef(karaokeId);
  // Keep the ID stable across transaction retries, even if the project changes.
  const warningId = doc(reports).id;
  await runTransaction(db, async (transaction) => {
    const project = (await transaction.get(target)).data() as Karaoke | undefined;
    if (!project || project.status === 'deleted') throw new Error('Проект удалён.');
    const author = await transaction.get(doc(db, 'users', project.authorId));
    if (!author.exists()) throw new Error('Профиль автора проекта не найден.');
    transaction.set(doc(warnings(project.authorId), warningId), {
      karaokeId,
      karaokeTitle: project.title,
      moderatorId,
      reason: message,
      createdAt: serverTimestamp(),
      read: false,
    });
  });
}

export function subscribeProjectWarningNotifications(userId: string, onChange: (items: AppNotification[]) => void, onError: () => void) {
  return onSnapshot(query(warnings(userId), orderBy('createdAt', 'desc')), (snapshot) => {
    onChange(snapshot.docs.map((row) => {
      const warning = { ...row.data(), id: row.id } as ProjectWarning;
      return {
        id: warning.id,
        type: 'warning',
        userId,
        karaokeId: warning.karaokeId,
        text: `Предупреждение по проекту «${warning.karaokeTitle}». ${warning.reason}`,
        read: warning.read,
        createdAt: warning.createdAt.toDate().toISOString(),
      };
    }));
  }, onError);
}

export async function markProjectWarningsRead(userId: string, items: AppNotification[]) {
  await Promise.all(items.filter((item) => !item.read).map((item) => (
    updateDoc(doc(warnings(userId), item.id), { read: true })
  )));
}

export function subscribeProjectWarningHistory(authorId: string, karaokeId: string, onChange: (items: ProjectWarning[]) => void, onError: () => void) {
  return onSnapshot(query(warnings(authorId), where('karaokeId', '==', karaokeId)), (snapshot) => {
    onChange(snapshot.docs
      .map((row) => ({ ...row.data(), id: row.id }) as ProjectWarning)
      .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()));
  }, onError);
}
