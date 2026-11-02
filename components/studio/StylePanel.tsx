'use client';

import { useId, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { RectangleHorizontal, RectangleVertical } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { Segmented } from '@/components/ui/segmented';
import { STYLE_FONTS } from '@/lib/fonts';
import { PALETTES } from '@/lib/palettes';
import type { StudioDraft } from './Studio';

export interface StylePanelProps {
  draft: StudioDraft;
  onChange: (patch: Partial<StudioDraft>) => void;
}

const MIN_FONT_SIZE = 20;
const MAX_FONT_SIZE = 56;

const COLOR_FIELDS: ReadonlyArray<{ key: 'backgroundColor' | 'textColor' | 'activeColor'; label: string }> = [
  { key: 'backgroundColor', label: 'Фон' },
  { key: 'textColor', label: 'Текст' },
  { key: 'activeColor', label: 'Активная строка' },
];

const ASPECT_OPTIONS: ReadonlyArray<{ value: StudioDraft['aspect']; label: ReactNode }> = [
  {
    value: 'v',
    label: (
      <>
        <RectangleVertical aria-hidden="true" />
        9:16
      </>
    ),
  },
  {
    value: 'h',
    label: (
      <>
        <RectangleHorizontal aria-hidden="true" />
        16:9
      </>
    ),
  },
];

const sameColor = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Arrow keys, Home and End move the choice within a radio group of buttons, like native radios.
 * The buttons must be the group's direct children.
 */
function onRadioKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number, count: number, select: (index: number) => void) {
  let next: number;
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      next = (index + 1) % count;
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      next = (index - 1 + count) % count;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = count - 1;
      break;
    default:
      return;
  }
  event.preventDefault();
  select(next);
  (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
}

/** Small heading of one group of settings; `id` names the control it describes. */
function GroupLabel({ id, children, aside }: { id: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h3 id={id} className="text-[14px] font-medium text-fg">
        {children}
      </h3>
      {aside}
    </div>
  );
}

const optionStyles = (checked: boolean) =>
  cn(
    'rounded-2xl border transition-[border-color,background-color,color] duration-150',
    checked ? 'border-accent bg-accent-soft text-fg' : 'border-line bg-surface-2 text-fg-muted hover:border-line-strong hover:text-fg',
  );

/** Step 3 of the studio: font, palette, own colours, text size and frame format. */
export function StylePanel({ draft, onChange }: StylePanelProps) {
  const id = useId();
  const fontIndex = STYLE_FONTS.findIndex((font) => font.key === draft.font);
  const paletteIndex = PALETTES.findIndex(
    (palette) =>
      sameColor(palette.background, draft.backgroundColor) &&
      sameColor(palette.text, draft.textColor) &&
      sameColor(palette.active, draft.activeColor),
  );
  const sizeFill = ((draft.fontSize - MIN_FONT_SIZE) / (MAX_FONT_SIZE - MIN_FONT_SIZE)) * 100;

  function selectFont(index: number) {
    onChange({ font: STYLE_FONTS[index].key });
  }

  function selectPalette(index: number) {
    const palette = PALETTES[index];
    onChange({ backgroundColor: palette.background, textColor: palette.text, activeColor: palette.active });
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <GroupLabel id={`${id}-font`}>Шрифт</GroupLabel>
        <div role="radiogroup" aria-labelledby={`${id}-font`} className="grid grid-cols-4 gap-1.5 sm:grid-cols-7 lg:max-xl:grid-cols-4">
          {STYLE_FONTS.map((font, index) => {
            const checked = index === fontIndex;
            return (
              <button
                key={font.key}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={index === Math.max(0, fontIndex) ? 0 : -1}
                onClick={() => selectFont(index)}
                onKeyDown={(event) => onRadioKeyDown(event, index, STYLE_FONTS.length, selectFont)}
                className={cn(optionStyles(checked), 'flex min-w-0 flex-col items-center gap-1 px-0.5 pt-3 pb-2.5')}
              >
                <span aria-hidden="true" className="text-[24px] leading-none text-fg" style={{ fontFamily: font.family }}>
                  Аа
                </span>
                <span className="max-w-full truncate text-[13px]">{font.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <GroupLabel id={`${id}-palette`}>Палитра</GroupLabel>
        <div role="radiogroup" aria-labelledby={`${id}-palette`} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PALETTES.map((palette, index) => {
            const checked = index === paletteIndex;
            return (
              <button
                key={palette.id}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={index === Math.max(0, paletteIndex) ? 0 : -1}
                onClick={() => selectPalette(index)}
                onKeyDown={(event) => onRadioKeyDown(event, index, PALETTES.length, selectPalette)}
                className={cn(optionStyles(checked), 'flex items-center gap-3 p-2.5 text-left text-[14px] font-medium')}
              >
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-full ring-1 ring-white/15"
                  style={{ backgroundColor: palette.background }}
                >
                  <span className="size-3 rounded-full" style={{ backgroundColor: palette.active }} />
                </span>
                <span className="truncate">{palette.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <fieldset>
        <legend className="mb-3 text-[14px] font-medium text-fg">Свои цвета</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2">
          {COLOR_FIELDS.map(({ key, label }) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface-2 p-2.5 transition-colors hover:border-line-strong"
            >
              <input
                type="color"
                value={draft[key]}
                onChange={(event) => onChange({ [key]: event.target.value })}
                className="size-9 shrink-0 cursor-pointer rounded-full border-0 bg-transparent p-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border [&::-moz-color-swatch]:border-white/15 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border [&::-webkit-color-swatch]:border-white/15 [&::-webkit-color-swatch-wrapper]:p-0"
              />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[14px] font-medium text-fg">{label}</span>
                <span className="font-mono text-[13px] text-fg-muted uppercase">{draft[key]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-8 sm:grid-cols-2 sm:gap-6">
        <div>
          <GroupLabel id={`${id}-size`} aside={<span className="text-[14px] text-fg-muted tabular-nums">{draft.fontSize} px</span>}>
            Размер текста
          </GroupLabel>
          <input
            type="range"
            className="range w-full"
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            step={1}
            value={draft.fontSize}
            aria-labelledby={`${id}-size`}
            aria-valuetext={`${draft.fontSize} px`}
            onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
            style={{ '--fill': `${sizeFill}%` } as CSSProperties}
          />
        </div>
        <div>
          <GroupLabel id={`${id}-aspect`}>Формат</GroupLabel>
          <Segmented
            label="Формат"
            mode="radio"
            value={draft.aspect}
            options={ASPECT_OPTIONS}
            onChange={(aspect) => onChange({ aspect })}
          />
        </div>
      </div>
    </div>
  );
}
