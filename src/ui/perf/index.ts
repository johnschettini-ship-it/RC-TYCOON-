/**
 * Performance overlay (Phase 6 §4.6, §7). Owner: W4-E. A top-left text block, hidden by default, shown by `F3`
 * (`../../perf/keys.ts`) or Settings → Performance overlay (`game.settings.perfOverlay`; F3 flips the same setting):
 * fps, frame time p50 / p95, tick time p50 / p95, `drawImage` calls per frame, sprite cache size in MB, and entity
 * counts (`perfProbe.snapshot()`). The probe runs only while the overlay shows or a perf run turned it on.
 *
 * Mounting also applies the render quality setting (`renderQuality`, `../../perf/quality.ts`) and exposes the probe
 * as `window.__tc.perf` for the Playwright perf run.
 */
import { text } from '../../data/strings/en';
import { perfProbe, type PerfSnapshot } from '../../perf/stats';
import { setRenderQuality } from '../../perf/quality';
import type { World } from '../../sim/types';
import type { UiExtension, UiPart } from '../extensions';
import type { UiContext } from '../context';
import { h, newId, setText } from '../dom';

/** Text refresh interval and the frames the numbers cover (about 2 s at 60 fps). */
export const OVERLAY_REFRESH_MS = 250;
export const OVERLAY_WINDOW_FRAMES = 120;

const CSS = `
.tc-perf {
  position: absolute; left: 8px; top: calc(var(--hud-bottom, 52px) + 8px); z-index: 5;
  margin: 0; padding: 6px 8px; border-radius: var(--radius);
  background: var(--surface); color: var(--ink); border: var(--control-outline);
  pointer-events: none;
}
.tc-perf[hidden] { display: none; }
.tc-perf h2 { margin: 0 0 2px; font-size: calc(12px * var(--ts, 1)); font-weight: 700; }
.tc-perf pre {
  margin: 0; white-space: pre;
  font: calc(12px * var(--ts, 1))/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
`;

function injectStyles(): void {
  if (document.getElementById('tc-perf-styles')) return;
  const style = document.createElement('style');
  style.id = 'tc-perf-styles';
  style.textContent = CSS;
  document.head.append(style);
}

const ms = (v: number): string => v.toFixed(1);

/** The overlay text: one line per measure (Phase 6 §4.6 list). */
export function overlayLines(s: PerfSnapshot, world: World): string[] {
  const st = world.state;
  return [
    text('perf.fps', { fps: Math.round(s.fps) }),
    text('perf.frame', { p50: ms(s.frameP50), p95: ms(s.frameP95) }),
    text('perf.tick', { p50: ms(s.tickP50), p95: ms(s.tickP95) }),
    text('perf.draws', { n: s.drawCalls }),
    text('perf.sprites', { mb: s.spriteCacheMb.toFixed(1) }),
    text('perf.entities', { guests: st.guests.length, rides: st.rides.length, stalls: st.stalls.length, staff: st.staff.members.length }),
  ];
}

function overlay(ctx: UiContext): UiPart {
  injectStyles();
  const { game } = ctx;
  // The Playwright perf run reads and drives the probe through the debug hook.
  Object.defineProperty(game, 'perf', { value: perfProbe, configurable: true });
  // A labelled region whose name is its visible heading.
  const titleId = newId('perf-title');
  const lines = h('pre', {});
  const el = h('section', { class: 'tc-perf', 'data-testid': 'perf-overlay', 'aria-labelledby': titleId, hidden: true }, h('h2', { id: titleId, text: text('perf.overlay') }), lines);
  let shown = false;
  /** The overlay turned the probe on (a perf run may have turned it on itself). */
  let ownsProbe = false;
  let refreshedAt = -Infinity;
  const apply = (): void => {
    setRenderQuality(game.settings.get('renderQuality'));
    const want = game.settings.get('perfOverlay');
    if (want === shown) return;
    shown = want;
    el.hidden = !want;
    if (want && !perfProbe.enabled) {
      perfProbe.enabled = true;
      ownsProbe = true;
    } else if (!want && ownsProbe) {
      perfProbe.enabled = false;
      ownsProbe = false;
    }
    refreshedAt = -Infinity;
  };
  game.settings.onChange(apply);
  apply();
  return {
    el,
    update(now) {
      if (!shown || now - refreshedAt < OVERLAY_REFRESH_MS) return;
      refreshedAt = now;
      setText(lines, overlayLines(perfProbe.snapshot(OVERLAY_WINDOW_FRAMES), game.world).join('\n'));
    },
  };
}

export const perfUi: UiExtension = {
  bars: overlay,
};
