/** Ready-made colour sets for a track: background, lyric text and the line being sung. */
export const PALETTES: ReadonlyArray<{ id: string; name: string; background: string; text: string; active: string }> = [
  { id: 'night', name: 'Ночь', background: '#1d1b3a', text: '#f4f4f5', active: '#ffb547' },
  { id: 'sea', name: 'Море', background: '#0f2a2a', text: '#f4f4f5', active: '#5eead4' },
  { id: 'sunset', name: 'Закат', background: '#3b1220', text: '#fdf2f8', active: '#fda4af' },
  { id: 'neon', name: 'Неон', background: '#0a0618', text: '#f5f3ff', active: '#3df5ff' },
  { id: 'forest', name: 'Лес', background: '#10231a', text: '#ecfdf5', active: '#a3e635' },
  { id: 'sepia', name: 'Сепия', background: '#2a1f14', text: '#fbf3e4', active: '#fb923c' },
];
