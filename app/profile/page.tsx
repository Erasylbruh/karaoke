'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Heart, 
  Music, 
  Edit3, 
  Check, 
  PlusCircle, 
  Disc
} from 'lucide-react';
import { Karaoke } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { getKaraokes, getUserLikedKaraokeIds } from '@/lib/storage';
import KaraokeCard from '@/components/karaoke/KaraokeCard';

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'my' | 'liked' | 'edit'>('my');

  const [myKaraokes, setMyKaraokes] = useState<Karaoke[]>([]);
  const [likedKaraokes, setLikedKaraokes] = useState<Karaoke[]>([]);

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setBio(user.bio || '');
      setAvatar(user.avatar);

      const all = getKaraokes();
      setMyKaraokes(all.filter((k) => k.authorId === user.id || k.authorName === user.name));

      const likedIds = getUserLikedKaraokeIds(user.id);
      setLikedKaraokes(all.filter((k) => likedIds.includes(k.id)));
    }
  }, [user]);

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center space-y-3">
        <h2 className="text-xl font-semibold text-zinc-100">Вы не авторизованы</h2>
        <p className="text-zinc-500 text-xs">Войдите в аккаунт, чтобы просмотреть свой профиль.</p>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-500 text-black font-medium text-xs transition-colors"
        >
          Войти в профиль
        </Link>
      </div>
    );
  }

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile({
      name,
      bio,
      avatar,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const totalMyViews = myKaraokes.reduce((sum, k) => sum + (k.viewsCount || 0), 0);
  const totalMyLikes = myKaraokes.reduce((sum, k) => sum + (k.likesCount || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      {/* Profile Banner & Info */}
      <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6 space-y-5">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-5 text-center md:text-left">
          <img
            src={user.avatar}
            alt={user.name}
            className="w-20 h-20 rounded-xl object-cover border border-zinc-700 shrink-0"
          />

          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-zinc-100">{user.name}</h1>
              {user.role === 'admin' && (
                <span className="px-2 py-0.5 rounded text-[10px] font-medium uppercase bg-green-500/10 text-green-500 border border-green-500/20">
                  Администратор
                </span>
              )}
            </div>

            <p className="text-xs text-zinc-500 font-mono">@{user.username} • {user.email}</p>
            <p className="text-xs text-zinc-400 max-w-lg pt-1">{user.bio || 'Создаю караоке-анимации на KaraokeCraft.'}</p>
          </div>

          <Link
            href="/create"
            className="px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-black font-medium text-xs transition-colors flex items-center gap-1.5 self-center md:self-start"
          >
            <PlusCircle className="w-4 h-4" />
            Создать караоке
          </Link>
        </div>

        {/* Stats Row */}
        <div className="pt-4 border-t border-zinc-800 grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-lg font-bold text-zinc-100">{myKaraokes.length}</div>
            <div className="text-[11px] text-zinc-500">Создано треков</div>
          </div>
          <div>
            <div className="text-lg font-bold text-zinc-100">{totalMyLikes}</div>
            <div className="text-[11px] text-zinc-500">Лайков получено</div>
          </div>
          <div>
            <div className="text-lg font-bold text-zinc-100">{totalMyViews}</div>
            <div className="text-[11px] text-zinc-500">Просмотров</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-2">
        <button
          onClick={() => setActiveTab('my')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'my'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          Мои публикации ({myKaraokes.length})
        </button>

        <button
          onClick={() => setActiveTab('liked')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'liked'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Heart className="w-3.5 h-3.5" />
          Понравившиеся ({likedKaraokes.length})
        </button>

        <button
          onClick={() => setActiveTab('edit')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'edit'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Edit3 className="w-3.5 h-3.5" />
          Настройки
        </button>
      </div>

      {/* Tab 1: My Karaokes */}
      {activeTab === 'my' && (
        <div>
          {myKaraokes.length === 0 ? (
            <div className="text-center py-12 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
              <Disc className="w-8 h-8 text-zinc-600 mx-auto" />
              <h3 className="text-sm font-medium text-zinc-300">У вас пока нет публикаций</h3>
              <p className="text-xs text-zinc-500">Создайте свою первую анимацию за пару минут.</p>
              <Link
                href="/create"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-green-500 text-black font-medium text-xs transition-colors"
              >
                Создать караоке
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {myKaraokes.map((k) => (
                <KaraokeCard key={k.id} karaoke={k} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Liked Karaokes */}
      {activeTab === 'liked' && (
        <div>
          {likedKaraokes.length === 0 ? (
            <div className="text-center py-12 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
              <Heart className="w-8 h-8 text-zinc-600 mx-auto" />
              <h3 className="text-sm font-medium text-zinc-300">В избранном пока пусто</h3>
              <p className="text-xs text-zinc-500">Отмечайте понравившиеся треки в каталоге.</p>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors"
              >
                Перейти в каталог
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {likedKaraokes.map((k) => (
                <KaraokeCard key={k.id} karaoke={k} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Edit Profile */}
      {activeTab === 'edit' && (
        <form onSubmit={handleSaveProfile} className="max-w-lg p-5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-4">
          <h3 className="font-semibold text-sm text-zinc-200">Редактирование профиля</h3>

          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1">Имя</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-green-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1">О себе</label>
            <textarea
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-green-500 transition-colors resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1">URL аватара</label>
            <input
              type="text"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-green-500 transition-colors"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-black font-medium text-xs transition-colors"
            >
              Сохранить
            </button>
            {savedSuccess && (
              <span className="text-xs text-green-400 font-medium flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                Сохранено
              </span>
            )}
          </div>
        </form>
      )}

    </div>
  );
}
