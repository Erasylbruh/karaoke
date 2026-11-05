'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Heart, Play, Search, Trash2 } from 'lucide-react';
import { LyricCover } from '@/components/karaoke/LyricCover';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/field';
import { IconButton, iconButtonStyles } from '@/components/ui/icon-button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { formatCount } from '@/lib/format';
import { deleteKaraoke, toggleFeatured } from '@/lib/storage';
import type { Karaoke } from '@/lib/types';

interface RowProps {
  track: Karaoke;
  onDelete: (track: Karaoke) => void;
}

// The same pieces fill a table row from `md` and a card below it.

function TrackCell({ track }: { track: Karaoke }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <LyricCover track={track} variant="thumb" className="size-10 shrink-0" />
      <div className="min-w-0">
        <Link href={`/karaoke/${track.id}`} className="block truncate text-[15px] font-medium text-fg hover:text-accent">
          {track.title}
        </Link>
        <p className="truncate text-[14px] text-fg-muted">{track.artist}</p>
      </div>
    </div>
  );
}

function AuthorCell({ track }: { track: Karaoke }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar name={track.authorName} src={track.authorAvatar} size={20} />
      <span className="truncate text-[14px] text-fg-muted">{track.authorName}</span>
    </div>
  );
}

function StatsCell({ track }: { track: Karaoke }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-fg-muted tabular-nums">
      <span className="inline-flex items-center gap-1.5" title="Лайки">
        <Heart aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="sr-only">Лайки:</span>
        {formatCount(track.likesCount ?? 0)}
      </span>
      <span className="inline-flex items-center gap-1.5" title="Прослушивания">
        <Play aria-hidden="true" className="size-3.5 shrink-0 fill-current" />
        <span className="sr-only">Прослушивания:</span>
        {formatCount(track.viewsCount ?? 0)}
      </span>
    </div>
  );
}

function StatusChip({ track }: { track: Karaoke }) {
  const featured = Boolean(track.isFeatured);
  return (
    <Chip size="sm" pressed={featured} onClick={() => toggleFeatured(track.id)}>
      {featured ? (
        <>
          <span aria-hidden="true">★</span> Выбор редакции
        </>
      ) : (
        'Обычный'
      )}
    </Chip>
  );
}

function Actions({ track, onDelete }: RowProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/karaoke/${track.id}`} aria-label="Открыть трек" title="Открыть трек" className={iconButtonStyles({ size: 'sm' })}>
        <ExternalLink aria-hidden="true" />
      </Link>
      <IconButton label="Удалить трек" variant="danger" size="sm" onClick={() => onDelete(track)}>
        <Trash2 aria-hidden="true" />
      </IconButton>
    </div>
  );
}

const TH = 'px-4 py-3 text-left text-[13px] font-medium text-fg-subtle';
const TD = 'px-4 py-3 align-middle';

export function TracksPanel({ karaokes }: { karaokes: Karaoke[] }) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<Karaoke | null>(null);

  const found = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return karaokes;
    return karaokes.filter((track) => [track.title, track.artist, track.authorName].some((value) => (value ?? '').toLowerCase().includes(needle)));
  }, [karaokes, query]);

  function confirmDelete() {
    if (!pending) return;
    // The toast sits under an open dialog, so the dialog is closed first and the toast shows over the page.
    deleteKaraoke(pending.id);
    setPending(null);
    toast.show('Трек удалён', 'success');
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="relative w-full min-w-0 sm:max-w-sm sm:flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            type="search"
            aria-label="Поиск треков"
            placeholder="Название, артист или автор"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
          />
        </div>
        <p role="status" className="shrink-0 text-[14px] text-fg-muted">
          Найдено: <span className="font-medium text-fg tabular-nums">{found.length}</span>
        </p>
      </div>

      {found.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-line px-6 py-12 text-center text-[15px] text-fg-muted">
          {karaokes.length === 0 ? 'В каталоге пока нет треков.' : 'Ничего не найдено. Попробуйте другой запрос.'}
        </p>
      ) : (
        <>
          <div className="mt-4 hidden overflow-hidden rounded-2xl border border-line bg-surface-1 md:block">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-[36%]" />
                <col className="w-[16%]" />
                <col className="w-[14%]" />
                <col className="w-[18%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className={TH}>Трек</th>
                  <th scope="col" className={TH}>Автор</th>
                  <th scope="col" className={TH}>Статистика</th>
                  <th scope="col" className={TH}>Статус</th>
                  <th scope="col" className={TH}>Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {found.map((track) => (
                  <tr key={track.id}>
                    <td className={TD}><TrackCell track={track} /></td>
                    <td className={TD}><AuthorCell track={track} /></td>
                    <td className={TD}><StatsCell track={track} /></td>
                    <td className={TD}><StatusChip track={track} /></td>
                    <td className={TD}><Actions track={track} onDelete={setPending} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul role="list" className="mt-4 space-y-3 md:hidden">
            {found.map((track) => (
              <li key={track.id} className="rounded-2xl border border-line bg-surface-1 p-4">
                <TrackCell track={track} />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <AuthorCell track={track} />
                  <StatsCell track={track} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                  <StatusChip track={track} />
                  <Actions track={track} onDelete={setPending} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        size="sm"
        title="Удалить трек?"
        description={pending ? `"${pending.title}" исчезнет из каталога. Это действие нельзя отменить.` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              Отмена
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              Удалить
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </div>
  );
}
