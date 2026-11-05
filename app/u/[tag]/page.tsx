'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Karaoke, Playlist, User } from '@/lib/types';
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
} from '@/lib/storage';
import { useAuth } from '@/context/AuthContext';
import KaraokeTile from '@/components/karaoke/KaraokeTile';
import Tabs from '@/components/ui/Tabs';
import Tutorial from '@/components/ui/Tutorial';

type Tab = 'karaoke' | 'playlists' | 'about';

export default function PublicProfilePage() {
  const params = useParams();
  const tag = decodeURIComponent((params?.tag as string) || '');
  const { user: me, openAuthPrompt } = useAuth();

  const [profile, setProfile] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('karaoke');
  const [tracks, setTracks] = useState<Karaoke[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [openList, setOpenList] = useState<string | null>(null);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(false);
  const [newName, setNewName] = useState('');

  const reload = (u: User) => {
    setTracks(getKaraokesByAuthor(u.id, { publicOnly: true }));
    setPlaylists(getPlaylists(u.id));
    setFollowers(getFollowersCount(u.id));
  };

  useEffect(() => {
    const u = getUserByUsername(tag) ?? null;
    setProfile(u);
    setReady(true);
    if (u) reload(u);
  }, [tag]);

  useEffect(() => {
    if (profile) setFollowing(isFollowing(me?.id, profile.id));
  }, [me?.id, profile]);

  if (ready && !profile) {
    return (
      <div className="pg">
        <h1 className="pg-h">Профиль не найден</h1>
        <p className="pg-sub">Пользователя @{tag} не существует.</p>
        <Link href="/" className="bt pr">В каталог</Link>
      </div>
    );
  }
  if (!profile) return <div style={{ minHeight: '60vh' }} />;

  const isOwner = me?.id === profile.id;
  const c = profile.contacts || {};
  const hasContacts = !!(c.discord || c.social || (c.email && c.showEmail));

  const handleFollow = () => {
    if (!me) {
      openAuthPrompt('Подписываться на авторов можно после входа.');
      return;
    }
    const res = toggleFollow(me.id, profile.id);
    setFollowing(res.following);
    setFollowers(res.count);
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'karaoke', label: 'Караоке', count: tracks.length },
    { id: 'playlists', label: 'Плейлисты', count: playlists.length },
    { id: 'about', label: 'О себе' },
  ];

  return (
    <div className="pg">
      <Tutorial
        page="profile"
        steps={[
          { title: 'Профиль автора', text: 'Здесь опубликованные караоке, плейлисты и информация об авторе.' },
          { title: 'Подписка', text: 'Подпишитесь на автора, чтобы он попал в ваши слушатели. Число слушателей видно под ником.' },
          { title: 'Плейлисты', text: 'В плейлисте можно собрать как свои, так и чужие караоке. Добавлять треки можно прямо из плеера.' },
        ]}
      />

      <div className="ph">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={profile.avatar} alt="" className="av lg" />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1>{profile.name}</h1>
          <div className="tag">@{profile.username}</div>
          <div className="fw">{followers} {pluralListeners(followers)}</div>
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
                reload(profile);
              }}
            >
              <input className="in" style={{ maxWidth: 320 }} placeholder="Название нового плейлиста" value={newName} onChange={(e) => setNewName(e.target.value)} />
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
                    <span className="mu sm"> · {items.length} трек.</span>
                  </button>
                  {isOwner && (
                    <div className="row">
                      <button
                        className="bt sm gh"
                        onClick={() => {
                          const n = window.prompt('Новое название', p.name);
                          if (n) {
                            renamePlaylist(p.id, n);
                            reload(profile);
                          }
                        }}
                      >
                        Переименовать
                      </button>
                      <button
                        className="bt sm gh dg"
                        onClick={() => {
                          if (window.confirm(`Удалить плейлист «${p.name}»?`)) {
                            deletePlaylist(p.id);
                            reload(profile);
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
                                onClick={() => {
                                  togglePlaylistItem(p.id, k.id);
                                  reload(profile);
                                }}
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
                {c.email && c.showEmail && <div>Почта: {c.email}</div>}
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

function pluralListeners(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'слушатель';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'слушателя';
  return 'слушателей';
}
