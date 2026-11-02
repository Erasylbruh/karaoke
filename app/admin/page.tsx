'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Heart, Music2, Play, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
import { TracksPanel } from '@/components/admin/TracksPanel';
import { UsersPanel } from '@/components/admin/UsersPanel';
import { buttonStyles, Button } from '@/components/ui/button';
import { Segmented, tabPanelProps } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { formatCount } from '@/lib/format';
import { useStoredKaraokes, useStoredUsers } from '@/lib/store';
import type { Karaoke, User } from '@/lib/types';

type Tab = 'tracks' | 'users' | 'system';

const ID_PREFIX = 'admin';

const ENVIRONMENT = [
  ['Фреймворк', 'Next.js 16 (App Router)'],
  ['Стили', 'Tailwind CSS v4, токены «Сцена»'],
  ['Звук', 'Web Audio API'],
  ['Хранилище', 'localStorage'],
] as const;

function AdminSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="h-10 w-64" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-8 h-10 w-80 max-w-full rounded-full" />
      <Skeleton className="mt-6 h-72 rounded-2xl" />
    </div>
  );
}

function StatTile({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface-1 p-4">
      <dt className="flex items-center gap-2 text-[14px] text-fg-muted">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {label}
      </dt>
      <dd className="mt-1.5 font-display text-[22px] leading-tight font-semibold whitespace-nowrap text-fg tabular-nums lg:text-[26px]">
        {formatCount(value)}
      </dd>
    </div>
  );
}

function SystemPanel() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-2xl border border-line bg-surface-1 p-5">
        <h2 className="font-display text-[17px] font-semibold text-fg">Модуль водяного знака</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-fg-muted">
          Все видеоролики, сгенерированные в KaraokeCraft, содержат защитную отметку в нижнем слое кадра:
        </p>
        <p className="mt-3 rounded-xl border border-line bg-ink px-3 py-3 text-center font-mono text-[13px] text-accent">
          ✦ KaraokeCraft • Spotify Lyrics Animation
        </p>
        <ul role="list" className="mt-4 space-y-2 text-[14px] text-fg-muted">
          <li className="flex items-start gap-2">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
            Интегрирован в пиксели видеопотока Canvas (30 FPS).
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
            Форматы 9:16 (вертикальный) и 16:9 (горизонтальный).
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-surface-1 p-5">
        <h2 className="font-display text-[17px] font-semibold text-fg">Окружение</h2>
        <dl className="mt-2 divide-y divide-line">
          {ENVIRONMENT.map(([term, value]) => (
            <div key={term} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
              <dt className="text-[14px] text-fg-muted">{term}</dt>
              <dd className="font-mono text-[13px] text-fg">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function AdminView({ user, karaokes, users }: { user: User; karaokes: Karaoke[]; users: User[] }) {
  const [tab, setTab] = useState<Tab>('tracks');

  const likes = karaokes.reduce((sum, track) => sum + (track.likesCount ?? 0), 0);
  const plays = karaokes.reduce((sum, track) => sum + (track.viewsCount ?? 0), 0);

  const options = [
    { value: 'tracks' as const, label: `Треки (${karaokes.length})` },
    { value: 'users' as const, label: `Пользователи (${users.length})` },
    { value: 'system' as const, label: 'Система' },
  ];

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-[26px] leading-tight font-bold tracking-[-0.01em] text-fg">Модерация</h1>
        <Link href="/create" className={buttonStyles({ variant: 'secondary' })}>
          Создать трек
        </Link>
      </header>

      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Треков" value={karaokes.length} icon={Music2} />
        <StatTile label="Пользователей" value={users.length} icon={Users} />
        <StatTile label="Лайков" value={likes} icon={Heart} />
        <StatTile label="Прослушиваний" value={plays} icon={Play} />
      </dl>

      <div className="mt-8 max-sm:-mx-4 max-sm:overflow-x-auto max-sm:px-4 max-sm:[scrollbar-width:none]">
        <Segmented
          mode="tabs"
          idPrefix={ID_PREFIX}
          label="Разделы модерации"
          value={tab}
          options={options}
          onChange={setTab}
          className="max-sm:max-w-none max-sm:overflow-visible"
        />
      </div>

      <div className="mt-6" {...tabPanelProps(ID_PREFIX, tab)}>
        {tab === 'tracks' && <TracksPanel karaokes={karaokes} />}
        {tab === 'users' && <UsersPanel users={users} currentUserId={user.id} />}
        {tab === 'system' && <SystemPanel />}
      </div>
    </>
  );
}

export default function AdminPage() {
  const { user, status, isAdmin, switchUser } = useAuth();
  const karaokes = useStoredKaraokes();
  const users = useStoredUsers();

  let content;
  if (status === 'loading') {
    content = <AdminSkeleton />;
  } else if (!isAdmin || !user) {
    content = (
      <div className="mx-auto flex max-w-md flex-col items-center rounded-3xl border border-line bg-surface-1 px-6 py-14 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-fg-muted">
          <ShieldCheck aria-hidden="true" className="size-6" />
        </span>
        <h1 className="mt-4 font-display text-[22px] font-semibold text-fg">Нужны права администратора</h1>
        <p className="mt-2 text-[15px] text-fg-muted">Здесь модерируют каталог и пользователей.</p>
        <Button variant="primary" className="mt-6" onClick={() => switchUser('user-admin')}>
          Войти как администратор (демо)
        </Button>
      </div>
    );
  } else if (karaokes === null || users === null) {
    content = <AdminSkeleton />;
  } else {
    content = <AdminView user={user} karaokes={karaokes} users={users} />;
  }

  return <div className="wrap py-8 pb-16 sm:py-12 sm:pb-24">{content}</div>;
}
