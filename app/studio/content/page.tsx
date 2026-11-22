'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useDataVersion } from '@/components/DataProvider';
import { getKaraokesByAuthor, setKaraokeVisibility, softDeleteKaraoke } from '@/lib/storage';
import { deleteTrackFiles } from '@/lib/track-files';
import { Karaoke, Visibility } from '@/lib/types';
import Tabs from '@/components/ui/Tabs';

type Tab = 'all' | Visibility;

const VIS_LABEL: Record<Visibility, string> = {
  public: 'Опубликовано',
  unlisted: 'По ссылке',
  private: 'Только я',
};

export default function StudioContent() {
  const { user } = useAuth();
  const version = useDataVersion();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('all');
  const [copied, setCopied] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  /** Deleting a track also removes its audio, cover and font from storage, so they are not left downloadable by URL. */
  const removeTrack = (k: Karaoke) => {
    if (!window.confirm(`Удалить «${k.title}»? Аудио, обложка и шрифт трека будут удалены из хранилища без возможности восстановления.`)) return;
    softDeleteKaraoke(k.id);
    setNotice('');
    deleteTrackFiles(k).catch((e) => {
      console.warn('[studio] could not delete track files', e);
      setNotice('Трек удалён, но его файлы не удалось убрать из хранилища. Попробуйте позже или напишите в поддержку.');
    });
  };

  const items = useMemo(
    () => (user ? getKaraokesByAuthor(user.id).filter((k) => k.status !== 'deleted') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, version]
  );

  const count = (v: Visibility) => items.filter((k) => k.visibility === v).length;
  const shown = tab === 'all' ? items : items.filter((k) => k.visibility === tab);

  const copyLink = (id: string) => {
    navigator.clipboard?.writeText(`${window.location.origin}/karaoke/${encodeURIComponent(id)}`);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="pg-h">Контент</h1>
          <p className="pg-sub">Нажмите на караоке, чтобы отредактировать его. Доступ можно сменить прямо в таблице.</p>
        </div>
        <Link href="/create" className="bt pr">Создать караоке</Link>
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        label="Фильтр контента"
        tabs={[
          { id: 'all', label: 'Все', count: items.length },
          { id: 'public', label: 'Опубликованные', count: count('public') },
          { id: 'unlisted', label: 'По ссылке', count: count('unlisted') },
          { id: 'private', label: 'Только я', count: count('private') },
        ]}
      />

      {notice && <p className="err" role="alert" style={{ marginBottom: 12 }}>{notice}</p>}

      {shown.length === 0 ? (
        <div className="card em2">Здесь пока ничего нет.</div>
      ) : (
        <div className="tw">
          <table className="tbl">
            <thead>
              <tr><th>Караоке</th><th>Доступ</th><th>Прослушивания</th><th>Лайки</th><th className="ac">Действия</th></tr>
            </thead>
            <tbody>
              {shown.map((k) => (
                <tr key={k.id} className="rowlink" onClick={(e) => { if (!(e.target as HTMLElement).closest('button, select, a')) router.push(`/edit/${encodeURIComponent(k.id)}`); }}>
                  <td>
                    <Link href={`/edit/${encodeURIComponent(k.id)}`} className="lk"><b>{k.title}</b></Link>
                    <div className="mu sm">{k.artist}</div>
                    {k.status === 'blocked' && <span className="pill dg">Заблокировано модератором</span>}
                  </td>
                  <td>
                    <select
                      className="in"
                      style={{ width: 'auto', padding: '6px 10px' }}
                      value={k.visibility}
                      aria-label={`Доступ к «${k.title}»`}
                      onChange={(e) => setKaraokeVisibility(k.id, e.target.value as Visibility)}
                    >
                      {(Object.keys(VIS_LABEL) as Visibility[]).map((v) => (
                        <option key={v} value={v}>{VIS_LABEL[v]}</option>
                      ))}
                    </select>
                  </td>
                  <td>{k.viewsCount.toLocaleString('ru-RU')}</td>
                  <td>{k.likesCount.toLocaleString('ru-RU')}</td>
                  <td className="ac">
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <Link href={`/karaoke/${encodeURIComponent(k.id)}`} className="bt sm gh">Открыть</Link>
                      {k.visibility === 'unlisted' && (
                        <button className="bt sm" onClick={() => copyLink(k.id)}>
                          {copied === k.id ? 'Скопировано' : 'Копировать ссылку'}
                        </button>
                      )}
                      <button className="bt sm dg" onClick={() => removeTrack(k)}>
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
