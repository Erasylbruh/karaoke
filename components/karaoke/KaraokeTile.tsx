'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Karaoke } from '@/lib/types';
import { cssUrl, pluralRu, safeColor } from '@/lib/format';
import { lineFillShare } from '@/lib/karaoke-fill';

const fmt = (n: number) =>
  n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '').replace('.', ',') + ' тыс.' : '' + n;

/**
 * Touch screens have no hover, so one tile plays its lyric preview by itself: the tile in the
 * middle half of the screen whose centre is nearest the screen centre. A single choice for all
 * tiles, so a row of tiles side by side (the recommended strip, the 2-column grid) never plays
 * two at once. Scroll events are listened to in the capture phase to catch horizontal strips.
 */
const touchTiles = new Map<HTMLElement, (playing: boolean) => void>();
let touchCurrent: HTMLElement | null = null;
let touchFrame = 0;

function pickTouchTile() {
  touchFrame = 0;
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  let best: HTMLElement | null = null;
  let bestDist = Infinity;
  for (const el of touchTiles.keys()) {
    const r = el.getBoundingClientRect();
    if (r.bottom < window.innerHeight * 0.25 || r.top > window.innerHeight * 0.75) continue;
    if (r.right <= 0 || r.left >= window.innerWidth) continue;
    const d = Math.hypot((r.left + r.right) / 2 - cx, (r.top + r.bottom) / 2 - cy);
    if (d < bestDist) {
      bestDist = d;
      best = el;
    }
  }
  if (best === touchCurrent) return;
  if (touchCurrent) touchTiles.get(touchCurrent)?.(false);
  touchCurrent = best;
  if (best) touchTiles.get(best)?.(true);
}

const scheduleTouchPick = () => {
  if (!touchFrame) touchFrame = requestAnimationFrame(pickTouchTile);
};

function registerTouchTile(el: HTMLElement, setPlaying: (playing: boolean) => void) {
  touchTiles.set(el, setPlaying);
  if (touchTiles.size === 1) {
    window.addEventListener('scroll', scheduleTouchPick, { capture: true, passive: true });
    window.addEventListener('resize', scheduleTouchPick);
  }
  scheduleTouchPick();
  return () => {
    touchTiles.delete(el);
    if (touchCurrent === el) touchCurrent = null;
    if (touchTiles.size === 0) {
      window.removeEventListener('scroll', scheduleTouchPick, { capture: true });
      window.removeEventListener('resize', scheduleTouchPick);
    } else {
      scheduleTouchPick();
    }
  };
}

const HeartIcon = () => (
  <svg className="ic" viewBox="0 0 24 24">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);
const PlayIcon = () => (
  <svg className="ic" viewBox="0 0 24 24">
    <polygon points="6 3 20 12 6 21 6 3" />
  </svg>
);

/**
 * Plays the song's own lyrics as a silent karaoke inside the cover.
 * Runs only while `active`, so a page full of tiles doesn't animate at once.
 */
function LyricsPreview({ karaoke, active }: { karaoke: Karaoke; active: boolean }) {
  const lines = karaoke.lyrics;
  const [t, setT] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!active || lines.length === 0) return;
    const first = Math.max(0, lines[0].time - 0.3);
    const last = (lines[lines.length - 1].end ?? lines[lines.length - 1].time + 4) + 1;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const elapsed = first + (now - start) / 1000;
      setT(elapsed > last ? first : elapsed);
      if (elapsed > last) start = now;
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      setT(0);
    };
  }, [active, lines]);

  if (lines.length === 0) return null;
  let idx = 0;
  lines.forEach((l, i) => {
    if (l.time <= t) idx = i;
  });
  const cur = lines[idx];
  const pct = lineFillShare(cur, lines[idx + 1]?.time, t, cur.time + 4, karaoke.style?.fillAnimation !== false) * 100;
  const visible = lines.slice(Math.max(0, idx - 1), idx + 2);

  return (
    <div className="lp" aria-hidden="true" style={{ '--lpa': safeColor(karaoke.style?.activeColor, '#ffb547') } as React.CSSProperties}>
      {visible.map((l) => {
        const i = lines.indexOf(l);
        const cls = i === idx ? 'on' : i < idx ? 'pa' : '';
        return (
          <p key={l.id} className={cls}>
            <span style={i === idx ? ({ '--w': `${pct}%` } as React.CSSProperties) : undefined}>{l.text}</span>
          </p>
        );
      })}
    </div>
  );
}

export default function KaraokeTile({
  karaoke,
  authorName,
  badge,
  href,
  versions,
}: {
  karaoke: Karaoke;
  authorName?: string;
  badge?: string;
  href?: string;
  versions?: number;
}) {
  const [hover, setHover] = useState(false);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLAnchorElement | null>(null);

  // Touch screens have no hover: the tile nearest the screen centre plays (see pickTouchTile).
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined' || !window.matchMedia('(hover: none)').matches) return;
    return registerTouchTile(el, setInView);
  }, []);

  const bg = safeColor(karaoke.style?.backgroundColor, '#1d1b3a');
  const ac = safeColor(karaoke.style?.activeColor, '#ffb547');
  const coverBg = cssUrl(karaoke.style?.coverImage);
  const playing = hover || inView;

  return (
    <Link
      href={href || `/karaoke/${encodeURIComponent(karaoke.id)}`}
      ref={ref}
      className="cd"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <div className="cwrap">
        <div
          className={`cv ${coverBg ? 'img' : ''} ${playing ? 'lpon' : ''}`}
          style={{
            background: coverBg ?? `linear-gradient(145deg, ${bg}, ${ac})`,
          }}
        >
          {!coverBg && karaoke.title[0]}
          <LyricsPreview karaoke={karaoke} active={playing} />
        </div>
        {badge && <span className="ft2">{badge}</span>}
      </div>
      <b>{karaoke.title}</b>
      <small>{karaoke.artist}</small>
      {authorName && <span className="by">от {authorName}</span>}
      {versions && versions > 1 ? (
        <span className="by">{pluralRu(versions, 'версия', 'версии', 'версий', true)} караоке</span>
      ) : (
        <div className="st">
          <span>
            <HeartIcon />
            {fmt(karaoke.likesCount)}
          </span>
          <span>
            <PlayIcon />
            {fmt(karaoke.viewsCount)}
          </span>
        </div>
      )}
    </Link>
  );
}
