'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Users, 
  Music, 
  Eye, 
  Heart, 
  Trash2, 
  Star, 
  ExternalLink, 
  CheckCircle, 
  ShieldCheck
} from 'lucide-react';
import { Karaoke, User } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { 
  getKaraokes, 
  deleteKaraoke, 
  toggleFeatured, 
  getUsers, 
  updateUserRole, 
  deleteUser 
} from '@/lib/storage';

export default function AdminPage() {
  const { user, isAdmin, switchUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'karaokes' | 'users' | 'stats'>('karaokes');
  const [karaokes, setKaraokes] = useState<Karaoke[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [searchFilter, setSearchFilter] = useState('');

  const refreshData = () => {
    setKaraokes(getKaraokes());
    setUsers(getUsers());
  };

  useEffect(() => {
    refreshData();
  }, []);

  const handleDeleteKaraoke = (id: string, title: string) => {
    if (confirm(`Удалить караоке "${title}"?`)) {
      deleteKaraoke(id);
      refreshData();
    }
  };

  const handleToggleFeatured = (id: string) => {
    toggleFeatured(id);
    refreshData();
  };

  const handleRoleToggle = (userId: string, currentRole: 'user' | 'admin') => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    updateUserRole(userId, newRole);
    refreshData();
  };

  const handleDeleteUser = (userId: string, name: string) => {
    if (confirm(`Удалить пользователя "${name}"?`)) {
      deleteUser(userId);
      refreshData();
    }
  };

  const totalLikes = karaokes.reduce((sum, k) => sum + (k.likesCount || 0), 0);
  const totalViews = karaokes.reduce((sum, k) => sum + (k.viewsCount || 0), 0);

  const filteredKaraokes = karaokes.filter(
    (k) =>
      k.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      k.artist.toLowerCase().includes(searchFilter.toLowerCase()) ||
      k.authorName.toLowerCase().includes(searchFilter.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
        <h2 className="text-xl font-semibold text-zinc-100">Требуются права администратора</h2>
        <p className="text-zinc-400 text-xs leading-relaxed">
          Этот раздел предназначен для управления каталогом и пользователями.
        </p>

        <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3 text-left">
          <p className="text-xs text-zinc-400">
            Переключитесь на предустановленный аккаунт администратора:
          </p>
          <button
            onClick={() => switchUser('user-admin')}
            className="w-full py-2.5 rounded-lg bg-green-500 hover:bg-green-600 text-black font-medium text-xs transition-colors flex items-center justify-center gap-1.5"
          >
            <ShieldCheck className="w-4 h-4" />
            Войти как администратор
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      {/* Admin Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-zinc-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 tracking-tight">
            Администрирование
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Модерация каталога, управление статусами и пользователями.
          </p>
        </div>

        <Link
          href="/create"
          className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-medium transition-colors self-start md:self-auto"
        >
          Создать караоке
        </Link>
      </div>

      {/* KPI Metrics Dashboard Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Всего треков', value: karaokes.length, icon: Music },
          { label: 'Пользователей', value: users.length, icon: Users },
          { label: 'Всего лайков', value: totalLikes, icon: Heart },
          { label: 'Всего просмотров', value: totalViews, icon: Eye },
        ].map((card, i) => {
          const IconComp = card.icon;
          return (
            <div key={i} className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500">{card.label}</p>
                <p className="text-xl font-bold text-zinc-100 mt-0.5">{card.value}</p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400">
                <IconComp className="w-4 h-4" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-2">
        <button
          onClick={() => setActiveTab('karaokes')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'karaokes'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Модерация ({karaokes.length})
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'users'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Пользователи ({users.length})
        </button>

        <button
          onClick={() => setActiveTab('stats')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'stats'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Система и безопасность
        </button>
      </div>

      {/* TAB 1: KARAOKES MODERATION TABLE */}
      {activeTab === 'karaokes' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <input
              type="text"
              placeholder="Поиск по названию или артисту..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="max-w-sm w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-green-500"
            />
            <span className="text-xs text-zinc-500">
              Найдено: <strong className="text-zinc-300">{filteredKaraokes.length}</strong>
            </span>
          </div>

          <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950 text-zinc-400 uppercase tracking-wider font-medium text-[11px] border-b border-zinc-800">
                  <tr>
                    <th className="p-3.5">Трек</th>
                    <th className="p-3.5">Автор</th>
                    <th className="p-3.5">Статистика</th>
                    <th className="p-3.5">Статус</th>
                    <th className="p-3.5 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {filteredKaraokes.map((k) => (
                    <tr key={k.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded bg-zinc-950 border border-zinc-800 overflow-hidden flex items-center justify-center shrink-0">
                            {k.style.coverImage ? (
                              <img src={k.style.coverImage} alt={k.title} className="w-full h-full object-cover" />
                            ) : (
                              <Music className="w-3.5 h-3.5 text-zinc-400" />
                            )}
                          </div>
                          <div>
                            <Link href={`/karaoke/${k.id}`} className="font-medium text-zinc-200 hover:text-green-400 transition-colors line-clamp-1">
                              {k.title}
                            </Link>
                            <p className="text-zinc-500 text-[11px]">{k.artist}</p>
                          </div>
                        </div>
                      </td>

                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5">
                          <img src={k.authorAvatar} alt={k.authorName} className="w-4 h-4 rounded-full object-cover border border-zinc-700" />
                          <span className="text-zinc-400">{k.authorName}</span>
                        </div>
                      </td>

                      <td className="p-3.5">
                        <div className="flex items-center gap-3 text-zinc-400">
                          <span className="flex items-center gap-1">
                            <Heart className="w-3 h-3 text-red-400" />
                            {k.likesCount}
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3 text-zinc-500" />
                            {k.viewsCount}
                          </span>
                        </div>
                      </td>

                      <td className="p-3.5">
                        <button
                          onClick={() => handleToggleFeatured(k.id)}
                          className={`px-2.5 py-0.5 rounded text-[10px] font-medium tracking-wide uppercase transition-colors flex items-center gap-1 ${
                            k.isFeatured
                              ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                              : 'bg-zinc-950 text-zinc-500 hover:text-zinc-300 border border-zinc-800'
                          }`}
                        >
                          <Star className={`w-3 h-3 ${k.isFeatured ? 'fill-current' : ''}`} />
                          {k.isFeatured ? 'Рекомендован' : 'Обычный'}
                        </button>
                      </td>

                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/karaoke/${k.id}`}
                            className="p-1.5 rounded bg-zinc-950 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-colors"
                            title="Открыть"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            onClick={() => handleDeleteKaraoke(k.id, k.title)}
                            className="p-1.5 rounded bg-zinc-950 hover:bg-red-500/10 text-zinc-500 hover:text-red-400 border border-zinc-800 transition-colors"
                            title="Удалить"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: USERS TABLE */}
      {activeTab === 'users' && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950 text-zinc-400 uppercase tracking-wider font-medium text-[11px] border-b border-zinc-800">
                <tr>
                  <th className="p-3.5">Пользователь</th>
                  <th className="p-3.5">Email</th>
                  <th className="p-3.5">Роль</th>
                  <th className="p-3.5">Дата регистрации</th>
                  <th className="p-3.5 text-right">Управление</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="p-3.5">
                      <div className="flex items-center gap-2.5">
                        <img src={u.avatar} alt={u.name} className="w-7 h-7 rounded-full object-cover border border-zinc-700" />
                        <div>
                          <div className="font-medium text-zinc-200">{u.name}</div>
                          <div className="text-zinc-500 text-[11px]">@{u.username}</div>
                        </div>
                      </div>
                    </td>

                    <td className="p-3.5 text-zinc-400 font-mono">
                      {u.email}
                    </td>

                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${
                        u.role === 'admin'
                          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                          : 'bg-zinc-950 text-zinc-500 border border-zinc-800'
                      }`}>
                        {u.role}
                      </span>
                    </td>

                    <td className="p-3.5 text-zinc-500">
                      {new Date(u.createdAt).toLocaleDateString('ru-RU')}
                    </td>

                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleRoleToggle(u.id, u.role)}
                          className="px-2.5 py-1 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-medium transition-colors"
                        >
                          {u.role === 'admin' ? 'Снять админа' : 'Сделать админом'}
                        </button>
                        {u.id !== user?.id && (
                          <button
                            onClick={() => handleDeleteUser(u.id, u.name)}
                            className="p-1 rounded bg-zinc-950 hover:bg-red-500/10 text-zinc-500 hover:text-red-400 border border-zinc-800 transition-colors"
                            title="Удалить"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: SYSTEM & WATERMARK */}
      {activeTab === 'stats' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
            <h3 className="text-sm font-semibold text-zinc-200">
              Модуль водяного знака
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Все видеоролики, сгенерированные в KaraokeCraft, содержат защитную отметку в нижнем слое кадра:
            </p>
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-green-400 text-xs text-center">
              ✦ KaraokeCraft • Spotify Lyrics Animation
            </div>
            <ul className="text-xs text-zinc-400 space-y-1.5 pt-1">
              <li className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                Интегрирован в пиксели видеопотока Canvas (30 FPS).
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                Форматы 9:16 (вертикальный) и 16:9 (горизонтальный).
              </li>
            </ul>
          </div>

          <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
            <h3 className="text-sm font-semibold text-zinc-200">
              Окружение
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-zinc-800">
                <span className="text-zinc-500">Фреймворк:</span>
                <span className="font-mono text-zinc-300">Next.js 16 (App Router)</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-zinc-800">
                <span className="text-zinc-500">Стилизация:</span>
                <span className="font-mono text-zinc-300">Tailwind CSS (Zinc Palette)</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-zinc-800">
                <span className="text-zinc-500">Синтезатор:</span>
                <span className="font-mono text-zinc-300">Web Audio API</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-zinc-500">Хранилище:</span>
                <span className="font-mono text-zinc-300">Persistent Local Storage</span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
