'use client';

import React from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
}

export default function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label?: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          className="tb"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count !== undefined && <span className="n">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
