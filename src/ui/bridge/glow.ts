/**
 * The arrival glow (VITE_ART=real build with the realistic look only; title-to-play bridge §2): when the push through
 * the arch ends, the park first shows under a warm sunset wash that fades to daylight. A full-window layer over the
 * game canvas and under the UI (`#game` + 1 in the page), `GLOW_COLOUR` in soft-light, from `GLOW_START` to 0 over
 * `GLOW_MS`, easing out; it takes no pointer events and is removed when it ends. Only after a title transition, never
 * with reduced motion (`glowWanted`).
 */

export const GLOW_COLOUR = '#ff9a4a';
export const GLOW_START = 0.35;
export const GLOW_MS = 2000;

/** Shown only after a title transition, and never with reduced motion. */
export function glowWanted(o: { fromTitle: boolean; reduced: boolean }): boolean {
  return o.fromTitle && !o.reduced;
}

/** The glow's opacity `t` ms after the push ended (ease-out: most of it goes early). */
export function glowOpacity(t: number): number {
  const p = Math.min(1, Math.max(0, t / GLOW_MS));
  if (p >= 1) return 0;
  return GLOW_START * (1 - p) ** 3;
}

let current: { el: HTMLElement; raf: number } | null = null;

/** Lays the glow over the game canvas (under `#ui`) and fades it out; a second call restarts it. */
export function showGlow(): void {
  stopGlow();
  const game = document.getElementById('game');
  if (!game) return;
  const el = document.createElement('div');
  el.className = 'tc-arrival-glow';
  el.setAttribute('aria-hidden', 'true');
  el.style.opacity = String(GLOW_START);
  game.after(el);
  const t0 = performance.now();
  const state = { el, raf: 0 };
  const tick = (now: number): void => {
    const o = glowOpacity(now - t0);
    el.style.opacity = o.toFixed(4);
    if (o <= 0) {
      stopGlow();
      return;
    }
    state.raf = requestAnimationFrame(tick);
  };
  state.raf = requestAnimationFrame(tick);
  current = state;
}

/** Removes the glow now. */
export function stopGlow(): void {
  if (!current) return;
  cancelAnimationFrame(current.raf);
  current.el.remove();
  current = null;
}
