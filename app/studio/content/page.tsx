'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { getKaraokesByAuthor, setKaraokeVisibility, softDeleteKaraoke } from '@/lib/storage';
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
  const router = useRouter();
  const [items, setItems] = useState<Karaoke[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [copied, setCopied] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (user) setItems(getKaraokesByAuthor(user.id).filter((k) => k.status !== 'deleted'));
  }, [user]);
  useEffect(reload, [reload]);

  const count = (v: Visibility) => items.filter((k) => k.visibility === v).length;
  const shown = tab === 'all' ? items : items.filter((k) => k.visibility === tab);

  const copyLink = (id: string) => {
    navigator.clipboard?.writeText(`${window.location.origin}/karaoke/${id}`);
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

      {shown.length === 0 ? (
        <div className="card em2">Здесь пока ничего нет.</div>
      ) : (
        <div className="tw">
          <table className="tbl">
            <thead>
              <tr><th>Караоке</th><th>Доступ</th><th>Просмотры</th><th>Лайки</th><th className="ac">Действия</th></tr>
            </thead>
            <tbody>
              {shown.map((k) => (
                <tr key={k.id} className="rowlink" onClick={(e) => { if (!(e.target as HTMLElement).closest('button, select, a')) router.push(`/edit/${k.id}`); }}>
                  <td>
                    <Link href={`/edit/${k.id}`} className="lk"><b>{k.title}</b></Link>
                    <div className="mu sm">{k.artist}</div>
                    {k.status === 'blocked' && <span className="pill dg">Заблокировано модератором</span>}
                  </td>
                  <td>
                    <select
                      className="in"
                      style={{ width: 'auto', padding: '6px 10px' }}
                      value={k.visibility}
                      aria-label={`Доступ к «${k.title}»`}
                      onChange={(e) => {
                        setKaraokeVisibility(k.id, e.target.value as Visibility);
                        reload();
                      }}
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
                      <Link href={`/karaoke/${k.id}`} className="bt sm gh">Открыть</Link>
                      {k.visibility === 'unlisted' && (
                        <button className="bt sm" onClick={() => copyLink(k.id)}>
                          {copied === k.id ? 'Скопировано' : 'Копировать ссылку'}
                        </button>
                      )}
                      <button
                        className="bt sm dg"
                        onClick={() => {
                          if (window.confirm(`Удалить «${k.title}»?`)) {
                            softDeleteKaraoke(k.id);
                            reload();
                          }
                        }}
                      >
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
