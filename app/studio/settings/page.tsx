'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { resetTutorials, validateUsername } from '@/lib/storage';
import Tabs from '@/components/ui/Tabs';

type Tab = 'profile' | 'contacts' | 'account';

/** Downscale an uploaded avatar so it stays small enough for storage. */
function fileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas'));
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('image'));
    img.src = url;
  });
}

export default function StudioSettings() {
  const { user, updateProfile } = useAuth();
  const [tab, setTab] = useState<Tab>('profile');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState('');
  const [discord, setDiscord] = useState('');
  const [email, setEmail] = useState('');
  const [social, setSocial] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [tag, setTag] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setBio(user.bio || '');
    setAvatar(user.avatar);
    setDiscord(user.contacts?.discord || '');
    setEmail(user.contacts?.email || '');
    setSocial(user.contacts?.social || '');
    setShowEmail(!!user.contacts?.showEmail);
    setTag(user.username);
  }, [user]);

  if (!user) return null;

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 2600);
  };

  const save = (patch: Parameters<typeof updateProfile>[0], okText = 'Сохранено') => {
    const res = updateProfile(patch);
    flash(res.ok, res.ok ? okText : res.error);
  };

  const tagError = tag !== user.username ? validateUsername(tag, user.id) : null;

  return (
    <>
      <h1 className="pg-h">Настройки</h1>
      <p className="pg-sub">Эти данные видны в вашем публичном профиле.</p>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        label="Разделы настроек"
        tabs={[
          { id: 'profile', label: 'Профиль' },
          { id: 'contacts', label: 'Контакты' },
          { id: 'account', label: 'Аккаунт' },
        ]}
      />

      {tab === 'profile' && (
        <form
          className="stack card"
          style={{ maxWidth: 520 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return flash(false, 'Имя не может быть пустым');
            save({ name: name.trim(), bio, avatar });
          }}
        >
          <div className="row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatar} alt="" className="av lg" />
            <label className="bt sm" style={{ cursor: 'pointer' }}>
              Загрузить фото
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    setAvatar(await fileToAvatar(f));
                  } catch {
                    flash(false, 'Не удалось прочитать изображение');
                  }
                }}
              />
            </label>
          </div>
          <label className="fld">Имя<input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="fld">О себе<textarea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} /></label>
          <button className="bt pr" type="submit">Сохранить</button>
        </form>
      )}

      {tab === 'contacts' && (
        <form
          className="stack card"
          style={{ maxWidth: 520 }}
          onSubmit={(e) => {
            e.preventDefault();
            save({ contacts: { discord: discord.trim(), email: email.trim(), social: social.trim(), showEmail } });
          }}
        >
          <label className="fld">Discord<input type="text" value={discord} onChange={(e) => setDiscord(e.target.value)} placeholder="nickname#0000" /></label>
          <label className="fld">Соцсеть<input type="text" value={social} onChange={(e) => setSocial(e.target.value)} placeholder="t.me/username" /></label>
          <label className="fld">Контактная почта<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="row sm">
            <input type="checkbox" checked={showEmail} onChange={(e) => setShowEmail(e.target.checked)} />
            Показывать почту в профиле
          </label>
          <button className="bt pr" type="submit">Сохранить</button>
        </form>
      )}

      {tab === 'account' && (
        <div className="stack" style={{ maxWidth: 520 }}>
          <form
            className="stack card"
            onSubmit={(e) => {
              e.preventDefault();
              if (tagError) return flash(false, tagError);
              save({ username: tag }, 'Тег изменён');
            }}
          >
            <label className="fld">
              Тег
              <input type="text" value={tag} onChange={(e) => setTag(e.target.value)} />
              {tagError && <span className="err">{tagError}</span>}
            </label>
            <button className="bt pr" type="submit" disabled={!!tagError || tag === user.username}>Сменить тег</button>
          </form>
          <div className="card">
            <p className="mu sm" style={{ marginTop: 0 }}>Обучающие подсказки на страницах можно показать снова.</p>
            <button
              className="bt"
              onClick={() => {
                resetTutorials(user.id);
                flash(true, 'Подсказки включены — откройте любую страницу');
              }}
            >
              Показать подсказки заново
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div className="ts on" role="status" style={{ background: msg.ok ? 'var(--tx)' : '#f87171', bottom: 24 }}>
          {msg.text}
        </div>
      )}
    </>
  );
}
