'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface ActionItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

/** "Действия ▾" button with a dropdown list. */
export default function ActionMenu({ items, label = 'Действия' }: { items: ActionItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="am" ref={ref}>
      <button className="bt sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {label} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="am-menu" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className={it.danger ? 'dg' : ''}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
