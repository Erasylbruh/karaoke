'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Download, Loader2, RotateCcw, X } from 'lucide-react';
import { useDownloads, DownloadJob, projectExists } from '@/context/DownloadsContext';
import { useAuth } from '@/context/AuthContext';
import { useDataVersion } from '@/components/DataProvider';
import { getDownloadHistory, getKaraokeById } from '@/lib/storage';
import { DownloadRecord } from '@/lib/types';

/** How many projects the side panel shows; the full list is in Creator Studio. */
export const PANEL_LIMIT = 6;

const FORMAT_LABEL = { reel: '9:16', landscape: '16:9' } as const;

type Item =
  | { kind: 'job'; job: DownloadJob }
  | { kind: 'record'; record: DownloadRecord };

export function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** The project's current cover, or its background colour when it has none. */
export function DownloadCover({ karaokeId, color }: { karaokeId: string; color?: string }) {
  const cover = getKaraokeById(karaokeId)?.style?.coverImage;
  return cover ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={cover} alt="" className="dlp-cover" />
  ) : (
    <span className="dlp-cover" style={{ background: color || '#1d1b3a' }} aria-hidden="true">♪</span>
  );
}

/** Downloads panel: what is rendering now plus the latest finished videos. */
export default function DownloadsPanel() {
  const { jobs, panelOpen, closePanel, cancelJob, saveAgain, startDownload } = useDownloads();
  const { user } = useAuth();
  useDataVersion();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (panelOpen && !d.open) d.showModal();
    if (!panelOpen && d.open) d.close();
  }, [panelOpen]);

  const sessionIds = new Set(jobs.map((j) => j.id));
  const items: Item[] = [
    ...jobs.filter((j) => j.status !== 'canceled').map((job) => ({ kind: 'job' as const, job })),
    ...getDownloadHistory(user?.id)
      .filter((r) => !sessionIds.has(r.id))
      .map((record) => ({ kind: 'record' as const, record })),
  ].slice(0, PANEL_LIMIT);

  const projectLink = (id: string, title: string) =>
    projectExists(id) ? (
      <Link href={`/karaoke/${encodeURIComponent(id)}`} className="dlp-title" onClick={closePanel}>
        {title}
      </Link>
    ) : (
      <span className="dlp-title">{title}</span>
    );

  return (
    <dialog
      ref={ref}
      className="dlp"
      aria-labelledby="dlp-h"
      onClose={closePanel}
      onClick={(e) => e.target === ref.current && closePanel()}
    >
      <div className="dlp-head">
        <h3 id="dlp-h">Загрузки</h3>
        <button type="button" className="player-icon" aria-label="Закрыть" onClick={closePanel}>
          <X aria-hidden="true" size={22} />
        </button>
      </div>
      <p className="dlp-note">Видео создаётся в фоне — можно переходить по сайту. Не закрывайте и не обновляйте вкладку, пока идёт загрузка.</p>

      {items.length === 0 ? (
        <p className="dlp-empty">Здесь появятся ваши загрузки. Нажмите «Скачать» на странице караоке.</p>
      ) : (
        <ul className="dlp-list">
          {items.map((it) => {
            if (it.kind === 'record') {
              const r = it.record;
              return (
                <li key={r.id} className="dlp-card">
                  <DownloadCover karaokeId={r.karaokeId} color={r.color} />
                  <div className="dlp-body">
                    {projectLink(r.karaokeId, r.title)}
                    <span className="dlp-meta">{r.artist} · {FORMAT_LABEL[r.format]}{r.quality ? ` ${r.quality}` : ''} · {formatDate(r.createdAt)}</span>
                  </div>
                </li>
              );
            }
            const j = it.job;
            const pct = Math.round(j.progress * 100);
            return (
              <li key={j.id} className={`dlp-card ${j.status}`}>
                <DownloadCover karaokeId={j.karaoke.id} color={j.karaoke.style?.backgroundColor} />
                <div className="dlp-body">
                  {projectLink(j.karaoke.id, j.karaoke.title)}
                  <span className="dlp-meta">{j.karaoke.artist} · {FORMAT_LABEL[j.format]} {j.quality}</span>
                  {(j.status === 'rendering' || j.status === 'queued') && (
                    <>
                      <div className="dlp-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Готовность видео">
                        <i style={{ width: `${pct}%` }} />
                      </div>
                      <span className="dlp-status">
                        {j.status === 'queued' ? (
                          'В очереди'
                        ) : (
                          <>
                            <Loader2 size={12} className="spin" aria-hidden="true" /> Создаётся… {pct}%
                          </>
                        )}
                      </span>
                    </>
                  )}
                  {j.status === 'done' && <span className="dlp-status ok">Сохранено на устройство</span>}
                  {j.status === 'error' && <span className="dlp-status err">Ошибка: {j.error}</span>}
                </div>
                <div className="dlp-act">
                  {(j.status === 'rendering' || j.status === 'queued') && (
                    <button type="button" className="bt sm gh" onClick={() => cancelJob(j.id)} aria-label={`Отменить загрузку «${j.karaoke.title}»`}>
                      <X size={15} aria-hidden="true" />
                    </button>
                  )}
                  {j.status === 'done' && j.url && (
                    <button type="button" className="bt sm gh" onClick={() => saveAgain(j.id)} aria-label="Сохранить ещё раз" title="Сохранить ещё раз">
                      <Download size={15} aria-hidden="true" />
                    </button>
                  )}
                  {j.status === 'error' && (
                    <button type="button" className="bt sm gh" onClick={() => startDownload(j.karaoke, j.format, j.quality)} aria-label="Повторить" title="Повторить">
                      <RotateCcw size={15} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {user && (
        <Link href="/studio/downloads" className="bt sm dlp-all" onClick={closePanel}>
          Вся история загрузок
        </Link>
      )}
    </dialog>
  );
}

/** Header button: opens the panel and shows progress while a video is being made. */
export function DownloadsButton({ className = 'bt nb-btn' }: { className?: string }) {
  const { openPanel, activeProgress, busy } = useDownloads();
  const pct = activeProgress === null ? null : Math.round(activeProgress * 100);
  return (
    <button
      type="button"
      className={`${className} dlp-btn`}
      onClick={openPanel}
      aria-label={pct === null ? 'Загрузки' : `Загрузки, видео готово на ${pct}%`}
      title="Загрузки"
    >
      <Download size={18} aria-hidden="true" />
      {busy && <span className="nb-dot">{pct === null ? '…' : `${pct}%`}</span>}
    </button>
  );
}
