'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Karaoke } from '@/lib/types';
import {
  getUserByUsername,
  getKaraokesByAuthor,
  getFollowersCount,
  isFollowing,
  toggleFollow,
  getPlaylists,
  createPlaylist,
  deletePlaylist,
  renamePlaylist,
  togglePlaylistItem,
  getKaraokeById,
  canViewKaraoke,
  getAuthor,
  normalizeUsername,
  tagOwner,
  userLoaded,
  USERNAME_RE,
} from '@/lib/storage';
import { safeDecode, safeMediaUrl, pluralRu } from '@/lib/format';
import { useAuth } from '@/context/AuthContext';
import { useDataVersion, useWatch } from '@/components/DataProvider';
import KaraokeTile from '@/components/karaoke/KaraokeTile';
import Tabs from '@/components/ui/Tabs';

type Tab = 'karaoke' | 'playlists' | 'about';

export default function PublicProfilePage() {
  const params = useParams();
  const tag = safeDecode(params?.tag as string);
  const { user: me, openAuthPrompt } = useAuth();
  const version = useDataVersion();

  const [tab, setTab] = useState<Tab>('karaoke');
  const [openList, setOpenList] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  // /u/{tag} → usernames/{tag} → the owner's profile, followers and playlists, read for this page only.
  const tagKey = normalizeUsername(tag);
  const validTag = USERNAME_RE.test(tagKey);
  const owner = validTag ? tagOwner(tagKey) : '';
  useWatch([
    validTag && `tag:${tagKey}`,
    owner && `user:${owner}`,
    owner && `follows:${owner}`,
    owner && `playlists:${owner}`,
  ]);
  const loading = owner === undefined || (!!owner && !userLoaded(owner));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const profile = useMemo(() => getUserByUsername(tag) ?? null, [tag, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tracks = useMemo(() => (profile ? getKaraokesByAuthor(profile.id, { publicOnly: true }) : []), [profile, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const playlists = useMemo(() => (profile ? getPlaylists(profile.id) : []), [profile, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const followers = useMemo(() => (profile ? getFollowersCount(profile.id) : 0), [profile, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const following = useMemo(() => (profile ? isFollowing(me?.id, profile.id) : false), [me?.id, profile, version]);

  if (!profile && loading) {
    return (
      <div className="pg">
        <p className="mu">Загружаем профиль…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="pg">
        <h1 className="pg-h">Профиль не найден</h1>
        <p className="pg-sub">Пользователя @{tag.replace(/^@/, '')} не существует.</p>
        <Link href="/" className="bt pr">В каталог</Link>
      </div>
    );
  }

  const isOwner = me?.id === profile.id;
  const c = profile.contacts || {};
  const visibleEmail = c.showEmail ? c.email : undefined;
  const hasContacts = !!(c.discord || c.social || visibleEmail);
  const avatarSrc = safeMediaUrl(profile.avatar);

  const handleFollow = () => {
    if (!me) {
      openAuthPrompt('Подписываться на авторов можно после входа.');
      return;
    }
    toggleFollow(me.id, profile.id);
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'karaoke', label: 'Караоке', count: tracks.length },
    { id: 'playlists', label: 'Плейлисты', count: playlists.length },
    { id: 'about', label: 'О себе' },
  ];

  return (
    <div className="pg">
      <div className="ph">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarSrc || '/brand/karaokecraft-app-icon.svg'} alt="" className="av lg" />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1>{profile.name}</h1>
          <div className="tag">@{profile.username}</div>
          <div className="fw">{pluralRu(followers, 'слушатель', 'слушателя', 'слушателей', true)}</div>
        </div>
        {isOwner ? (
          <Link href="/studio/settings" className="bt">Редактировать в студии</Link>
        ) : (
          <button className={`bt ${following ? '' : 'pr'}`} onClick={handleFollow} aria-pressed={following}>
            {following ? 'Вы подписаны' : 'Подписаться'}
          </button>
        )}
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Разделы профиля" />

      {tab === 'karaoke' &&
        (tracks.length === 0 ? (
          <p className="em2">Пока нет опубликованных караоке.</p>
        ) : (
          <div className="gr" style={{ padding: 0 }}>
            {tracks.map((k) => (
              <KaraokeTile key={k.id} karaoke={k} badge={k.isFeatured ? 'Рекомендовано' : undefined} />
            ))}
          </div>
        ))}

      {tab === 'playlists' && (
        <div className="stack">
          {isOwner && (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newName.trim()) return;
                createPlaylist(profile.id, newName);
                setNewName('');
              }}
            >
              <input className="in" style={{ maxWidth: 320 }} maxLength={100} placeholder="Название нового плейлиста" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <button className="bt pr" type="submit">Создать плейлист</button>
            </form>
          )}

          {playlists.length === 0 && (
            <p className="em2">
              {isOwner ? 'Плейлистов пока нет. Добавляйте караоке в плейлист из плеера.' : 'У автора пока нет плейлистов.'}
            </p>
          )}

          {playlists.map((p) => {
            const items = p.karaokeIds
              .map((id) => getKaraokeById(id))
              .filter((k): k is Karaoke => !!k && canViewKaraoke(k, me));
            const open = openList === p.id;
            return (
              <div key={p.id} className="card">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <button className="lk" style={{ textAlign: 'left' }} onClick={() => setOpenList(open ? null : p.id)}>
                    <b style={{ fontSize: 16 }}>{p.name}</b>
                    <span className="mu sm"> · {pluralRu(items.length, 'трек', 'трека', 'треков', true)}</span>
                  </button>
                  {isOwner && (
                    <div className="row">
                      <button
                        className="bt sm gh"
                        onClick={() => {
                          const n = window.prompt('Новое название', p.name);
                          if (n) renamePlaylist(p.id, n);
                        }}
                      >
                        Переименовать
                      </button>
                      <button
                        className="bt sm gh dg"
                        onClick={() => {
                          if (window.confirm(`Удалить плейлист «${p.name}»?`)) {
                            deletePlaylist(p.id);
                          }
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
                {open && (
                  <div style={{ marginTop: 16 }}>
                    {items.length === 0 ? (
                      <p className="mu sm">Плейлист пуст.</p>
                    ) : (
                      <div className="gr" style={{ padding: 0 }}>
                        {items.map((k) => (
                          <div key={k.id}>
                            <KaraokeTile karaoke={k} authorName={getAuthor(k).name} />
                            {isOwner && (
                              <button
                                className="bt sm gh"
                                style={{ marginTop: 8 }}
                                onClick={() => togglePlaylistItem(p.id, k.id)}
                              >
                                Убрать из плейлиста
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'about' && (
        <div className="card" style={{ maxWidth: 640 }}>
          <dl className="kv" style={{ margin: 0 }}>
            <dt>Дата регистрации</dt>
            <dd>{new Date(profile.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
            <dt>О себе</dt>
            <dd>{profile.bio || <span className="mu">Автор пока ничего не рассказал о себе.</span>}</dd>
            {hasContacts && <dt>Контакты</dt>}
            {hasContacts && (
              <dd>
                {c.discord && <div>Discord: {c.discord}</div>}
                {visibleEmail && <div>Почта: {visibleEmail}</div>}
                {c.social && <div>Соцсеть: {c.social}</div>}
              </dd>
            )}
          </dl>
          {!hasContacts && isOwner && (
            <p className="mu sm" style={{ marginBottom: 0 }}>
              Контакты можно добавить в <Link href="/studio/settings" style={{ color: 'var(--ac)' }}>Creator Studio</Link>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
