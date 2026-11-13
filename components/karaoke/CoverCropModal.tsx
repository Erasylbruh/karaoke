'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import type { CropRect } from '@/lib/cover';

/** CSS background that shows the `area` (in % of the image) of `src` in a square box. */
function areaBackground(src: string, area: Area | null): CSSProperties {
  if (!area) return { backgroundImage: `url("${src}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
  const pos = (start: number, size: number) => (size >= 100 ? 0 : (start / (100 - size)) * 100);
  return {
    backgroundImage: `url("${src}")`,
    backgroundSize: `${10000 / area.width}% ${10000 / area.height}%`,
    backgroundPosition: `${pos(area.x, area.width)}% ${pos(area.y, area.height)}%`,
    backgroundRepeat: 'no-repeat',
  };
}

/**
 * Square crop of a new cover with previews of every place it shows up: the catalog card, the player
 * page, the downloads panel and the vinyl label in videos (a circle, so the corners are lost).
 */
export default function CoverCropModal({ src, busy, onCancel, onDone }: {
  src: string;
  busy?: boolean;
  onCancel: () => void;
  onDone: (rect: CropRect) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [pixels, setPixels] = useState<Area | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const bg = areaBackground(src, area);
  const label: CSSProperties = { fontSize: 12, color: 'var(--mu)', marginTop: 6 };

  return (
    <dialog
      ref={dialogRef}
      className="project-dialog"
      style={{ width: 'min(760px, 100% - 32px)' }}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="card stack">
        <header>
          <h2 id={titleId} className="text-lg font-semibold">Обложка</h2>
          <p className="mu sm mt-1">Перетащите картинку и приблизьте, чтобы выбрать квадрат. Превью показывают, как обложка будет выглядеть на сайте и в видео.</p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, alignItems: 'start' }}>
          <div className="stack" style={{ gap: 10 }}>
            <div style={{ position: 'relative', width: '100%', aspectRatio: '1', borderRadius: 14, overflow: 'hidden', background: '#000' }}>
              <Cropper
                image={src}
                crop={crop}
                zoom={zoom}
                aspect={1}
                maxZoom={5}
                showGrid
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropAreaChange={(a, p) => {
                  setArea(a);
                  setPixels(p);
                }}
                onCropComplete={(a, p) => {
                  setArea(a);
                  setPixels(p);
                }}
              />
            </div>
            <label className="row sm mu" style={{ gap: 10, flexWrap: 'nowrap' }}>
              Масштаб
              <input type="range" min={1} max={5} step={0.01} value={zoom} onChange={(e) => setZoom(+e.target.value)} style={{ flex: 1 }} aria-label="Масштаб обложки" />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, alignItems: 'end' }}>
            <div>
              <div style={{ ...bg, width: '100%', aspectRatio: '1', borderRadius: 16 }} />
              <div style={label}>Каталог</div>
            </div>
            <div>
              <div style={{ ...bg, width: 72, height: 72, borderRadius: 14 }} />
              <div style={label}>Плеер</div>
            </div>
            <div>
              <div style={{ width: 96, height: 96, borderRadius: '50%', background: '#121214', display: 'grid', placeItems: 'center' }}>
                <div style={{ ...bg, width: '55%', height: '55%', borderRadius: '50%' }} />
              </div>
              <div style={label}>Пластинка в видео</div>
            </div>
            <div>
              <div style={{ ...bg, width: 52, height: 52, borderRadius: 10 }} />
              <div style={label}>Загрузки</div>
            </div>
          </div>
        </div>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="bt" onClick={onCancel} disabled={busy}>
            Отмена
          </button>
          <button type="button" className="bt pr" disabled={busy || !pixels} onClick={() => pixels && onDone(pixels)}>
            {busy ? 'Сохраняем…' : 'Сохранить обложку'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
