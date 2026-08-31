// Minimal inline icon set — one coherent stroke style, no dependencies.

const base = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const IcUndo = () => (
  <svg {...base}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
)
export const IcRedo = () => (
  <svg {...base}><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></svg>
)
export const IcSoundOn = () => (
  <svg {...base}><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 6a9 9 0 0 1 0 12" /></svg>
)
export const IcSoundOff = () => (
  <svg {...base}><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="m16 9 5 6" /><path d="m21 9-5 6" /></svg>
)
export const IcPrint = () => (
  <svg {...base}><path d="M7 8V3h10v5" /><rect x="4" y="8" width="16" height="8" rx="1.5" /><path d="M7 13h10v8H7z" /></svg>
)
export const IcExport = () => (
  <svg {...base}><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>
)
export const IcReset = () => (
  <svg {...base}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
)
export const IcPlus = () => (
  <svg {...base}><path d="M12 5v14" /><path d="M5 12h14" /></svg>
)
export const IcMinus = () => (
  <svg {...base}><path d="M5 12h14" /></svg>
)
export const IcFit = () => (
  <svg {...base}><path d="M9 3H3v6" /><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M15 21h6v-6" /></svg>
)
export const IcSparkle = () => (
  <svg {...base}><path d="M12 3v4" /><path d="M12 17v4" /><path d="M3 12h4" /><path d="M17 12h4" /><path d="M12 8.5 13.2 11l2.6 1-2.6 1L12 15.5 10.8 13l-2.6-1 2.6-1L12 8.5Z" /></svg>
)
export const IcPin = () => (
  <svg {...base} strokeWidth={2.2}><path d="M12 17v5" /><path d="M8 7c0-2.2 1.8-4 4-4s4 1.8 4 4c0 2.5 1.2 3.5 2 4.5H6c.8-1 2-2 2-4.5Z" /><path d="M6 11.5h12" /></svg>
)
export const IcClose = () => (
  <svg {...base}><path d="m6 6 12 12" /><path d="M18 6 6 18" /></svg>
)
export const IcCaretDown = () => (
  <svg {...base}><path d="m6 9 6 6 6-6" /></svg>
)
export const IcCaretRight = () => (
  <svg {...base}><path d="m9 6 6 6-6 6" /></svg>
)
export const IcWarn = () => (
  <svg {...base}><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4" /><path d="M12 17.2v.3" /></svg>
)
