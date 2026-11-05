'use client';

import React, { useState } from 'react';
import { WARNING_REASONS } from '@/lib/storage';

export type ModerationKind = 'warn' | 'ban_temp' | 'ban_perm';

const TITLE: Record<ModerationKind, string> = {
  warn: 'Предупреждение',
  ban_temp: 'Бан на срок',
  ban_perm: 'Бан навсегда',
};

const OTHER = '__other';

/** Reason picker: a preset from the list, or "Другое" with free text. */
export default function ModerationModal({
  kind,
  target,
  onCancel,
  onConfirm,
}: {
  kind: ModerationKind;
  target: string;
  onCancel: () => void;
  onConfirm: (opts: { reason: string; days?: number }) => void;
}) {
  const [reason, setReason] = useState<string>(WARNING_REASONS[0]);
  const [custom, setCustom] = useState('');
  const [days, setDays] = useState(7);
  const finalReason = reason === OTHER ? custom.trim() : reason;

  return (
    <div className="mdl" onClick={onCancel} role="dialog" aria-modal="true" aria-label={TITLE[kind]}>
      <div onClick={(e) => e.stopPropagation()}>
        <h3>{TITLE[kind]}</h3>
        <p>Пользователь: @{target}. Он получит уведомление с причиной.</p>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!finalReason) return;
            onConfirm({ reason: finalReason, days: kind === 'ban_temp' ? days : undefined });
          }}
        >
          <label className="fld">
            Причина
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {WARNING_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
              <option value={OTHER}>Другое…</option>
            </select>
          </label>
          {reason === OTHER && (
            <label className="fld">
              Опишите причину
              <textarea rows={3} value={custom} onChange={(e) => setCustom(e.target.value)} autoFocus />
            </label>
          )}
          {kind === 'ban_temp' && (
            <label className="fld">
              Срок
              <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {[1, 3, 7, 14, 30].map((d) => (
                  <option key={d} value={d}>{d} дн.</option>
                ))}
              </select>
            </label>
          )}
          <div className="row">
            <button type="submit" className={`bt ${kind === 'warn' ? 'pr' : 'dg'}`} disabled={!finalReason}>
              {kind === 'warn' ? 'Выдать предупреждение' : 'Забанить'}
            </button>
            <button type="button" className="bt" onClick={onCancel}>Отмена</button>
          </div>
        </form>
      </div>
    </div>
  );
}
