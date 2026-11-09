/**
 * Accessibility client (Phase 6 §4.7). Owner: W4-F. Called once from `main.ts` after the UI mounts.
 *
 * - Display prefs in step with `game.settings` (text scale, high contrast, reduced motion auto/on/off with the
 *   `prefers-reduced-motion` media query), applied to the UI root: `--ts` (text scale factor, used by every
 *   font size in `src/styles/`), classes `tc-hc` (high contrast) and `tc-rm` (no UI transitions).
 * - One `aria-live="polite"` region for month-end summaries and map cursor notes (toasts, awards, and message
 *   toasts have their own polite regions in `src/ui`).
 * - The canvas gets `role="img"`, an `aria-label`, and the cursor tile description line (`aria-describedby`).
 * - Key `?` opens the shortcut list.
 */
import type { Game } from '../game';
import { text } from '../data/strings/en';
import { h, setText } from '../ui/dom';
import { openDialog, type DialogHandle } from '../ui/dialogs';
import { bindDisplayPrefs, type MotionQuery } from './sync';
import { cursorChanged, mapCursor, onCursorChange, onShortcutList } from './cursor';
import { describeTile } from './describe';
import { monthEndSummary } from './summary';
import { SHORTCUTS } from './shortcuts';
import type { DisplayPrefs } from './prefs';

export { displayPrefs, resolveReducedMotion, setDisplayPrefs, type DisplayPrefs } from './prefs';

let liveEl: HTMLElement | null = null;
let liveTimer = 0;

/** Say `message` through the polite live region (no-op before `mountA11y`). */
export function announce(message: string): void {
  const el = liveEl;
  if (!el) return;
  // Clear first, so the same text twice is announced twice.
  el.textContent = '';
  window.clearTimeout(liveTimer);
  liveTimer = window.setTimeout(() => {
    el.textContent = message;
  }, 50);
}

function motionQuery(): MotionQuery | null {
  try {
    return typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  } catch {
    return null;
  }
}

/** Apply display prefs to the UI root and the document (dialogs and the title live under the root too). */
export function applyDisplayPrefs(root: HTMLElement, p: DisplayPrefs): void {
  const ts = String(p.textScale / 100);
  for (const el of [root, document.documentElement]) {
    el.style.setProperty('--ts', ts);
    el.classList.toggle('tc-hc', p.highContrast);
    el.classList.toggle('tc-rm', p.reducedMotion);
  }
  root.dataset.textScale = String(p.textScale);
}

function shortcutDialog(root: HTMLElement): DialogHandle {
  const rows = SHORTCUTS.map((s) => h('tr', {}, h('th', { scope: 'row' }, h('kbd', { text: s.keys })), h('td', { text: text(s.action) })));
  const table = h(
    'table',
    { class: 'shortcut-table' },
    h('caption', { class: 'sr-only', text: text('a11y.keys.title') }),
    h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: text('a11y.keys.key') }), h('th', { scope: 'col', text: text('a11y.keys.action') }))),
    h('tbody', {}, ...rows),
  );
  const d = openDialog(root, {
    title: text('a11y.keys.title'),
    className: 'shortcut-dialog',
    body: h('div', { class: 'shortcut-body', 'data-testid': 'shortcut-list' }, table),
    actions: [{ label: text('a11y.keys.close'), kind: 'primary', testId: 'shortcut-close', onClick: () => d.close() }],
  });
  return d;
}

export function mountA11y(game: Game, uiRoot: HTMLElement, canvas: HTMLCanvasElement): void {
  bindDisplayPrefs(game.settings, motionQuery(), (p) => applyDisplayPrefs(uiRoot, p));

  // Live region (polite) for summaries and cursor notes.
  liveEl = h('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true', 'data-testid': 'a11y-live' });

  // The cursor tile description line (Phase 6 §7: "the HUD shows the tile description").
  const lineText = h('span', { class: 'cursor-line-text', 'data-testid': 'cursor-line' });
  const line = h(
    'div',
    { class: 'cursor-line', id: 'tc-cursor-line', role: 'status', 'aria-live': 'polite', hidden: true },
    h('span', { class: 'cursor-line-label', text: text('a11y.cursorLine') }),
    lineText,
  );
  uiRoot.append(line, liveEl);

  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', text('a11y.canvas'));
  canvas.setAttribute('aria-describedby', 'tc-cursor-line');

  let wasOn = false;
  const refreshLine = (): void => {
    const on = mapCursor.on && mapCursor.tile >= 0;
    if (on !== wasOn) {
      announce(text(on ? 'a11y.cursorOn' : 'a11y.cursorOff'));
      wasOn = on;
    }
    line.hidden = !on;
    if (on) setText(lineText, describeTile(game.world, mapCursor.tile));
  };
  onCursorChange(refreshLine);
  game.onWorldChanged(() => cursorChanged());
  // A build or demolish changes the tile under the cursor (guests moving do not re-announce it).
  game.onCommand((_cmd, result) => {
    if (result.ok && mapCursor.on) refreshLine();
  });

  game.onEvents((events) => {
    for (const ev of events) {
      if (ev.type !== 'monthEnded') continue;
      const msg = monthEndSummary(game.world.state.economy.ledger, ev.monthIndex);
      if (msg) announce(msg);
    }
  });

  let shortcuts: DialogHandle | null = null;
  onShortcutList(() => {
    if (shortcuts && document.contains(shortcuts.el)) return;
    shortcuts = shortcutDialog(uiRoot);
  });
}
