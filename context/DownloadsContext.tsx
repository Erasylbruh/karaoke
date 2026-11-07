'use client';

/**
 * Background video downloads. Jobs live here, above every page, so a render keeps going while
 * the user moves around the site (only reloading or closing the tab stops it). Jobs run one at
 * a time; a finished video is saved to the device automatically and recorded in the history.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Karaoke } from '@/lib/types';
import { ExportFormat, VideoQuality, getPreferredQuality, renderKaraokeVideo, videoFileName } from '@/lib/video-render';
import { addDownloadRecord, getKaraokeById, registerDownload, uid } from '@/lib/storage';
import { useAuth } from '@/context/AuthContext';

export type JobStatus = 'queued' | 'rendering' | 'done' | 'error' | 'canceled';

export interface DownloadJob {
  id: string;
  karaoke: Karaoke;
  format: ExportFormat;
  quality: VideoQuality;
  status: JobStatus;
  progress: number; // 0..1
  url?: string;
  fileName?: string;
  error?: string;
  createdAt: string;
}

interface DownloadsApi {
  jobs: DownloadJob[];
  /** True while something is queued or rendering. */
  busy: boolean;
  /** Progress of the job being rendered (0..1), or null. */
  activeProgress: number | null;
  /** `quality` defaults to the one last chosen in the download menu. */
  startDownload: (karaoke: Karaoke, format: ExportFormat, quality?: VideoQuality) => void;
  cancelJob: (id: string) => void;
  saveAgain: (id: string) => void;
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
}

const Ctx = createContext<DownloadsApi | null>(null);

/** Finished videos kept in memory for "save again"; older ones are released. */
const KEEP_IN_MEMORY = 6;

function saveFile(url: string, fileName: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function DownloadsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const controllers = useRef(new Map<string, AbortController>());
  const running = useRef(false);
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const patch = useCallback((id: string, p: Partial<DownloadJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...p } : j)));
  }, []);

  // Runs the oldest queued job whenever nothing is rendering.
  useEffect(() => {
    if (running.current) return;
    const next = [...jobs].reverse().find((j) => j.status === 'queued');
    if (!next) return;
    running.current = true;
    const ctrl = new AbortController();
    controllers.current.set(next.id, ctrl);
    patch(next.id, { status: 'rendering', progress: 0 });

    let lastShown = 0;
    renderKaraokeVideo(next.karaoke, next.format, {
      signal: ctrl.signal,
      quality: next.quality,
      onProgress: (share) => {
        // Re-render the panel at most every 1 %.
        if (share - lastShown >= 0.01 || share === 1) {
          lastShown = share;
          patch(next.id, { progress: share });
        }
      },
    })
      .then(({ blob, ext }) => {
        const url = URL.createObjectURL(blob);
        const fileName = videoFileName(next.karaoke, next.format, ext, next.quality);
        // Mark done and release the oldest finished videos still held in memory.
        setJobs((prev) => {
          let kept = 0;
          return prev.map((j) => {
            if (j.id === next.id) return { ...j, status: 'done', progress: 1, url, fileName };
            if (j.url && ++kept >= KEEP_IN_MEMORY) {
              URL.revokeObjectURL(j.url);
              return { ...j, url: undefined };
            }
            return j;
          });
        });
        saveFile(url, fileName);
        const u = userRef.current;
        if (u) {
          registerDownload(next.karaoke.id, u.id);
          addDownloadRecord({
            id: next.id,
            userId: u.id,
            karaokeId: next.karaoke.id,
            title: next.karaoke.title,
            artist: next.karaoke.artist,
            format: next.format,
            quality: next.quality,
            color: next.karaoke.style?.backgroundColor,
            createdAt: new Date().toISOString(),
          });
        }
      })
      .catch((e: unknown) => {
        const canceled = ctrl.signal.aborted;
        patch(next.id, {
          status: canceled ? 'canceled' : 'error',
          error: canceled ? undefined : e instanceof Error ? e.message : 'Не удалось создать видео',
        });
      })
      .finally(() => {
        controllers.current.delete(next.id);
        running.current = false;
        // Kick the queue again.
        setJobs((prev) => [...prev]);
      });
  }, [jobs, patch]);

  const busy = jobs.some((j) => j.status === 'queued' || j.status === 'rendering');

  // Closing or reloading the tab would lose an unfinished video, so ask first.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const startDownload = useCallback((karaoke: Karaoke, format: ExportFormat, quality: VideoQuality = getPreferredQuality()) => {
    setJobs((prev) => {
      // The same video already in progress: just show it.
      if (
        prev.some(
          (j) =>
            j.karaoke.id === karaoke.id &&
            j.format === format &&
            j.quality === quality &&
            (j.status === 'queued' || j.status === 'rendering')
        )
      ) {
        return prev;
      }
      // Newest on top.
      return [
        { id: 'dl-' + uid(), karaoke, format, quality, status: 'queued', progress: 0, createdAt: new Date().toISOString() },
        ...prev,
      ];
    });
    setPanelOpen(true);
  }, []);

  const cancelJob = useCallback(
    (id: string) => {
      const ctrl = controllers.current.get(id);
      if (ctrl) ctrl.abort();
      else patch(id, { status: 'canceled' });
    },
    [patch]
  );

  const saveAgain = useCallback(
    (id: string) => {
      const j = jobs.find((x) => x.id === id);
      if (j?.url && j.fileName) saveFile(j.url, j.fileName);
    },
    [jobs]
  );

  const active = jobs.find((j) => j.status === 'rendering');
  const api = useMemo<DownloadsApi>(
    () => ({
      jobs,
      busy,
      activeProgress: active ? active.progress : null,
      startDownload,
      cancelJob,
      saveAgain,
      panelOpen,
      openPanel: () => setPanelOpen(true),
      closePanel: () => setPanelOpen(false),
    }),
    [jobs, busy, active, startDownload, cancelJob, saveAgain, panelOpen]
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useDownloads(): DownloadsApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDownloads must be used inside DownloadsProvider');
  return v;
}

/** Whether a project still exists, so a history card can link to it. */
export const projectExists = (id: string) => !!getKaraokeById(id);
