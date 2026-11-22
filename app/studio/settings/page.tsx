'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { validateUsername } from '@/lib/storage';
import { uploadPublicFile } from '@/lib/blob-store';
import { safeMediaUrl } from '@/lib/format';
import { User } from '@/lib/types';
import Tabs from '@/components/ui/Tabs';
import ChangeEmailForm from '@/components/profile/ChangeEmailForm';
import DeleteAccountForm from '@/components/profile/DeleteAccountForm';

type Tab = 'profile' | 'contacts' | 'account';

/** Downscale an uploaded avatar and store it in Supabase Storage (falling back to JPEG data URL). */
async function fileToAvatar(file: File): Promise<string> {
  const { blob, dataUrl } = await new Promise<{ blob: Blob; dataUrl: string }>((resolve, reject) => {
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
      const fallback = canvas.toDataURL('image/jpeg', 0.85);
      canvas.toBlob((b) => (b ? resolve({ blob: b, dataUrl: fallback }) : reject(new Error('blob'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image'));
    };
    img.src = url;
  });
  try {
    return await uploadPublicFile(blob, 'covers');
  } catch {
    return dataUrl;
  }
}

export default function StudioSettings() {
  const { user } = useAuth();
  if (!user) return null;
  return <StudioSettingsForm key={user.id} user={user} />;
}

function StudioSettingsForm({ user }: { user: User }) {
  const { updateProfile, changeUsername } = useAuth();
  const [tab, setTab] = useState<Tab>('profile');
  const [savingTag, setSavingTag] = useState(false);
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio || '');
  const [avatar, setAvatar] = useState(user.avatar);
  const [discord, setDiscord] = useState(user.contacts?.discord || '');
  const [email, setEmail] = useState(user.contacts?.email || '');
  const [social, setSocial] = useState(user.contacts?.social || '');
  const [showEmail, setShowEmail] = useState(!!user.contacts?.showEmail);
  const [tag, setTag] = useState(user.username);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
            <img src={safeMediaUrl(avatar) || '/brand/karaokecraft-app-icon.svg'} alt="" className="av lg" />
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
            onSubmit={async (e) => {
              e.preventDefault();
              if (tagError) return flash(false, tagError);
              setSavingTag(true);
              const res = await changeUsername(tag);
              setSavingTag(false);
              flash(res.ok, res.ok ? 'Тег изменён' : res.error);
            }}
          >
            <label className="fld">
              Тег
              <input type="text" value={tag} onChange={(e) => setTag(e.target.value)} />
              {tagError && <span className="err">{tagError}</span>}
            </label>
            <button className="bt pr" type="submit" disabled={savingTag || !!tagError || tag === user.username}>
              {savingTag ? 'Сохраняем…' : 'Сменить тег'}
            </button>
          </form>
          <ChangeEmailForm />
          <DeleteAccountForm />
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
