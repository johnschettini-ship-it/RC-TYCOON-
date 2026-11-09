/**
 * The shortcut list (key `?`, Phase 6 §4.7): every key of keyboard play and the Phase 1–4 key map. Owner: W4-F.
 * `action` is a string id (`a11y.keys.*`); keys are shown as typed.
 */
export interface ShortcutRow {
  keys: string;
  action: string;
}

export const SHORTCUTS: readonly ShortcutRow[] = [
  { keys: 'Tab / Shift + Tab', action: 'a11y.keys.tab' },
  { keys: 'C', action: 'a11y.keys.cursor' },
  { keys: '← ↑ → ↓', action: 'a11y.keys.arrows' },
  { keys: 'Enter', action: 'a11y.keys.enter' },
  { keys: 'Shift + ← ↑ → ↓', action: 'a11y.keys.shiftArrows' },
  { keys: 'R', action: 'a11y.keys.rotate' },
  { keys: 'Esc', action: 'a11y.keys.escape' },
  { keys: 'W A S D', action: 'a11y.keys.pan' },
  { keys: '+ / −', action: 'a11y.keys.zoom' },
  { keys: 'Space', action: 'a11y.keys.pause' },
  { keys: '1 / 2 / 3', action: 'a11y.keys.speeds' },
  { keys: 'P / Q / Delete', action: 'a11y.keys.tools' },
  { keys: 'F / H / O / M', action: 'a11y.keys.panels' },
  { keys: 'B / N', action: 'a11y.keys.pathItems' },
  { keys: '[ / ]', action: 'a11y.keys.view' },
  { keys: 'Page Up / Page Down', action: 'a11y.keys.pathHeight' },
  { keys: 'V', action: 'a11y.keys.overlays' },
  { keys: '?', action: 'a11y.keys.help' },
];
