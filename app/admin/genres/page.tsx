'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useDataVersion } from '@/components/DataProvider';
import { DEFAULT_GENRES, genreUsage, getGenres, normalizeGenre, saveGenres } from '@/lib/storage';

/** Admin: the genres authors pick from in the editor. Removing one keeps it on existing projects. */
export default function AdminGenres() {
  useDataVersion();
  const [value, setValue] = useState('');
  const [notice, setNotice] = useState('');
  const genres = getGenres();
  const usage = genreUsage();
  const legacy = [...usage.keys()].filter((g) => !genres.includes(g)).sort();

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const g = normalizeGenre(value);
    if (!g) return setNotice('Введите название жанра');
    if (genres.includes(g)) return setNotice(`«${g}» уже есть в списке`);
    saveGenres([...genres, g]);
    setValue('');
    setNotice(`Добавлен жанр «${g}»`);
  };

  const remove = (g: string) => {
    saveGenres(genres.filter((x) => x !== g));
    setNotice(`Жанр «${g}» убран из списка. У проектов, где он уже стоит, он останется.`);
  };

  return (
    <>
      <h1 className="pg-h">Жанры</h1>
      <p className="pg-sub">Авторы выбирают жанры проекта из этого списка, не больше шести на проект.</p>

      <form className="row" onSubmit={add} style={{ marginBottom: 16, flexWrap: 'nowrap', maxWidth: 480 }}>
        <input
          className="in"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setNotice('');
          }}
          placeholder="Например, синтвейв"
          aria-label="Новый жанр"
          maxLength={30}
        />
        <button type="submit" className="bt pr">Добавить</button>
      </form>
      {notice && <p className="mb-4 text-sm" role="status">{notice}</p>}

      <div className="card">
        <div className="chips" role="list" aria-label="Жанры">
          {genres.map((g) => (
            <span key={g} className="chip" role="listitem">
              {g}
              {!!usage.get(g) && <span className="chip-n">{usage.get(g)}</span>}
              <button type="button" className="chip-x" onClick={() => remove(g)} aria-label={`Убрать жанр ${g}`}>
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
        <p className="mu sm" style={{ margin: '14px 0 0' }}>
          Жанров: {genres.length}. Число рядом с жанром — сколько опубликованных проектов его используют.
        </p>
      </div>

      {legacy.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="sm" style={{ marginTop: 0 }}>Есть у проектов, но нет в списке. Можно добавить в один клик:</p>
          <div className="chips">
            {legacy.map((g) => (
              <button key={g} type="button" className="chip" onClick={() => saveGenres([...genres, g])}>
                + {g} <span className="chip-n">{usage.get(g)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        className="bt sm gh"
        style={{ marginTop: 16 }}
        onClick={() => {
          if (window.confirm('Вернуть стандартный список жанров? Добавленные вручную пропадут из списка.')) {
            saveGenres(DEFAULT_GENRES);
            setNotice('Восстановлен стандартный список');
          }
        }}
      >
        Вернуть стандартный список
      </button>
    </>
  );
}
