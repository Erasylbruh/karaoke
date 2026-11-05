'use client';

import React, { useState } from 'react';

const fmtDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

/** Bar chart of daily counts with a hover readout. */
export default function DailyChart({
  title,
  data,
  color = 'var(--ac)',
}: {
  title: string;
  data: { day: string; count: number }[];
  color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.count, 0);
  const max = Math.max(1, ...data.map((d) => d.count));
  const W = 600;
  const H = 160;
  const gap = 3;
  const bw = W / data.length - gap;
  const shown = hover !== null ? data[hover] : null;

  return (
    <figure className="card chart">
      <figcaption className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="mu sm">{title}</span>
        <span className="mu sm">{shown ? `${fmtDay(shown.day)}: ${shown.count}` : 'за 30 дней'}</span>
      </figcaption>
      <b className="chart-total">{total.toLocaleString('ru-RU')}</b>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${title}: ${total} за 30 дней`} onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--ln)" strokeDasharray="3 4" strokeWidth="1" />
        ))}
        {data.map((d, i) => {
          const h = Math.max(d.count > 0 ? 2 : 0, (d.count / max) * (H - 6));
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)}>
              <rect x={i * (bw + gap)} y={0} width={bw + gap} height={H} fill="transparent" />
              <rect x={i * (bw + gap)} y={H - h} width={bw} height={h} rx="2" fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />
            </g>
          );
        })}
      </svg>
      <div className="row mu sm" style={{ justifyContent: 'space-between' }}>
        <span>{fmtDay(data[0].day)}</span>
        <span>{fmtDay(data[data.length - 1].day)}</span>
      </div>
    </figure>
  );
}
