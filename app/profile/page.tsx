'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Heart, Music2, Plus, UserRound } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { CATALOG_GRID, TrackCardSkeleton } from '@/components/catalog/CatalogSkeleton';
import { TrackCard } from '@/components/karaoke/TrackCard';
import { ProfileSettingsForm } from '@/components/profile/ProfileSettingsForm';
import { Avatar } from '@/components/ui/avatar';
import { buttonStyles } from '@/components/ui/button';
import { Segmented, tabPanelProps } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCount } from '@/lib/format';
import { useStoredKaraokes, useStoredLikedIds } from '@/lib/store';
import type { Karaoke, User } from '@/lib/types';

type Tab = 'my' | 'liked' | 'settings';

const ID_PREFIX = 'profile';
const DEFAULT_BIO = 'Создаю караоке-анимации на KaraokeCraft.';

function ProfileSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="h-48 rounded-3xl" />
      <div className={`${CATALOG_GRID} mt-8`} aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <TrackCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  text: string;
  href: string;
  action: string;
}

function EmptyState({ icon, title, text, href, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-fg-muted">{icon}</span>
      <p className="mt-4 font-display text-[20px] font-semibold text-fg">{title}</p>
      <p className="mt-2 max-w-[40ch] text-[15px] text-fg-muted">{text}</p>
      <Link href={href} className={`${buttonStyles({ variant: 'primary' })} mt-6`}>
        {action}
      </Link>
    </div>
  );
}

function TrackGrid({ tracks }: { tracks: Karaoke[] }) {
  return (
    <ul role="list" className={CATALOG_GRID}>
      {tracks.map((track) => (
        <li key={track.id} className="min-w-0">
          <TrackCard track={track} />
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    // The term comes first in the DOM (dt before dd): a row on phones, and `flex-col-reverse` puts the number above it from `sm`.
    <div className="flex items-baseline justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3 sm:flex-col-reverse sm:items-stretch sm:justify-end">
      <dt className="text-[14px] text-fg-muted sm:mt-0.5">{label}</dt>
      <dd className="font-display text-[20px] leading-tight whitespace-nowrap font-semibold text-fg tabular-nums lg:text-[26px]">{formatCount(value)}</dd>
    </div>
  );
}

function ProfileView({ user, karaokes }: { user: User; karaokes: Karaoke[] }) {
  const likedIds = useStoredLikedIds(user.id);
  const [tab, setTab] = useState<Tab>('my');

  const mine = useMemo(() => karaokes.filter((track) => track.authorId === user.id), [karaokes, user.id]);
  const liked = useMemo(() => {
    const ids = new Set(likedIds ?? []);
    return karaokes.filter((track) => ids.has(track.id));
  }, [karaokes, likedIds]);
  const likes = mine.reduce((sum, track) => sum + (track.likesCount ?? 0), 0);
  const plays = mine.reduce((sum, track) => sum + (track.viewsCount ?? 0), 0);

  const options = [
    { value: 'my' as const, label: `Мои треки (${mine.length})` },
    { value: 'liked' as const, label: `Понравившиеся (${liked.length})` },
    { value: 'settings' as const, label: 'Настройки' },
  ];

  return (
    <>
      <header className="rounded-3xl border border-line bg-surface-1 p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <Avatar name={user.name} src={user.avatar} size={88} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="font-display text-[26px] leading-tight font-bold tracking-[-0.01em] break-words text-fg">{user.name}</h1>
              {user.role === 'admin' && (
                <span className="inline-flex h-7 items-center rounded-full bg-accent-soft px-3 text-[13px] font-medium text-accent">Администратор</span>
              )}
            </div>
            <p className="mt-1 text-[14px] break-all text-fg-subtle">
              @{user.username} · {user.email}
            </p>
            <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-fg-muted">{user.bio || DEFAULT_BIO}</p>
          </div>
          <Link href="/create" className={`${buttonStyles({ variant: 'primary' })} self-start`}>
            <Plus aria-hidden="true" />
            Создать трек
          </Link>
        </div>

        <dl className="mt-6 grid gap-3 sm:grid-cols-3 border-t border-line pt-6">
          <Stat label="Треков" value={mine.length} />
          <Stat label="Лайков получено" value={likes} />
          <Stat label="Прослушиваний" value={plays} />
        </dl>
      </header>

      <div className="mt-8 max-sm:-mx-4 max-sm:overflow-x-auto max-sm:px-4 max-sm:[scrollbar-width:none]">
        <Segmented
          mode="tabs"
          idPrefix={ID_PREFIX}
          label="Разделы профиля"
          value={tab}
          options={options}
          onChange={setTab}
          className="max-sm:max-w-none max-sm:overflow-visible"
        />
      </div>

      <div className="mt-6" {...tabPanelProps(ID_PREFIX, tab)}>
        {tab === 'my' &&
          (mine.length > 0 ? (
            <TrackGrid tracks={mine} />
          ) : (
            <EmptyState
              icon={<Music2 aria-hidden="true" className="size-6" />}
              title="Создайте свой первый трек"
              text="Загрузите песню, расставьте строки по времени и опубликуйте караоке."
              href="/create"
              action="Открыть студию"
            />
          ))}
        {tab === 'liked' &&
          (liked.length > 0 ? (
            <TrackGrid tracks={liked} />
          ) : (
            <EmptyState
              icon={<Heart aria-hidden="true" className="size-6" />}
              title="Отмечайте треки сердцем"
              text="Понравившиеся треки соберутся здесь, чтобы их легко было найти."
              href="/"
              action="В каталог"
            />
          ))}
        {tab === 'settings' && <ProfileSettingsForm key={user.id} user={user} />}
      </div>
    </>
  );
}

export default function ProfilePage() {
  const { user, status } = useAuth();
  const karaokes = useStoredKaraokes();

  return (
    <div className="wrap py-8 pb-16 sm:py-12 sm:pb-24">
      {status === 'loading' || (status === 'user' && karaokes === null) ? (
        <ProfileSkeleton />
      ) : status === 'user' && user && karaokes ? (
        <ProfileView user={user} karaokes={karaokes} />
      ) : (
        <div className="mx-auto flex max-w-md flex-col items-center rounded-3xl border border-line bg-surface-1 px-6 py-14 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-fg-muted">
            <UserRound aria-hidden="true" className="size-6" />
          </span>
          <h1 className="mt-4 font-display text-[22px] font-semibold text-fg">Войдите, чтобы видеть свои треки</h1>
          <p className="mt-2 text-[15px] text-fg-muted">Ваши публикации и понравившиеся треки появятся здесь.</p>
          <Link href="/login?next=/profile" className={`${buttonStyles({ variant: 'primary' })} mt-6`}>
            Войти
          </Link>
        </div>
      )}
    </div>
  );
}
