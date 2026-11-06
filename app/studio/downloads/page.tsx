'use client';

import React from 'react';
import Link from 'next/link';
import { Download, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useDataVersion } from '@/components/DataProvider';
import { useDownloads, projectExists } from '@/context/DownloadsContext';
import { DownloadCover, formatDate, PANEL_LIMIT } from '@/components/downloads/DownloadsPanel';
import { deleteDownloadRecord, getDownloadHistory, getKaraokeById } from '@/lib/storage';

const FORMAT_LABEL = { reel: 'Вертикальное 9:16', landscape: 'Горизонтальное 16:9' } as const;

/** Full history of the user's video downloads. */
export default function StudioDownloads() {
  const { user } = useAuth();
  useDataVersion();
  const { startDownload } = useDownloads();
  const history = getDownloadHistory(user?.id);

  return (
    <>
      <h1 className="pg-h">Загрузки</h1>
      <p className="pg-sub">Все видео, которые вы скачивали. Последние {PANEL_LIMIT} также видны в панели загрузок.</p>

      {history.length === 0 ? (
        <div className="card em2">Вы ещё ничего не скачивали.</div>
      ) : (
        <div className="tw">
          <table className="tbl">
            <thead>
              <tr><th>Караоке</th><th>Формат</th><th>Дата</th><th className="ac">Действия</th></tr>
            </thead>
            <tbody>
              {history.map((r) => {
                const k = getKaraokeById(r.karaokeId);
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="row" style={{ flexWrap: 'nowrap', gap: 12 }}>
                        <DownloadCover karaokeId={r.karaokeId} color={r.color} />
                        <div style={{ minWidth: 0 }}>
                          {projectExists(r.karaokeId) ? (
                            <Link href={`/karaoke/${encodeURIComponent(r.karaokeId)}`} className="lk"><b>{r.title}</b></Link>
                          ) : (
                            <b>{r.title}</b>
                          )}
                          <div className="mu sm">{r.artist}</div>
                        </div>
                      </div>
                    </td>
                    <td>{FORMAT_LABEL[r.format]}</td>
                    <td>{formatDate(r.createdAt)}</td>
                    <td className="ac">
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        {k && (
                          <button className="bt sm" onClick={() => startDownload(k, r.format)}>
                            <Download size={14} aria-hidden="true" /> Скачать снова
                          </button>
                        )}
                        <button
                          className="bt sm gh"
                          aria-label={`Убрать «${r.title}» из истории`}
                          onClick={() => deleteDownloadRecord(r.id)}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
