/**
 * Accessibility client (Phase 6 §4.7). Owner: W4-F. Called once from `main.ts` after the UI mounts.
 * Neutral stub: nothing changes (display prefs keep their defaults).
 *
 * Contract for the real body: keep `setDisplayPrefs` in step with `game.settings` (text scale, high contrast,
 * reduced motion auto/on/off with the `prefers-reduced-motion` media query); apply text scale and high contrast to
 * the UI root (CSS custom properties / classes, `src/styles/`); the `aria-live="polite"` region for toasts, awards,
 * and month-end summaries; the canvas `aria-label` and the cursor tile description line; focus ring.
 */
import type { Game } from '../game';

export function mountA11y(game: Game, uiRoot: HTMLElement, canvas: HTMLCanvasElement): void {
  void game;
  void uiRoot;
  void canvas;
}

export { displayPrefs, resolveReducedMotion, setDisplayPrefs, type DisplayPrefs } from './prefs';
