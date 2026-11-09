/**
 * Performance probes (Phase 6 §4.6). Owner: W4-E. `Game.frame` calls the frame and tick probes; the renderer and
 * sprite caches may call `countDraw`. Neutral stubs: no timing, no cost (one empty call per tick).
 *
 * Contract for the real body: `enabled` only while the overlay or a perf run needs it (no `performance.now()`
 * otherwise); a ring buffer of frame and tick times for p50/p95; `snapshot()` for the overlay and the Playwright
 * perf run (`window.__tc.perf`).
 */

export interface PerfSnapshot {
  fps: number;
  frameP50: number;
  frameP95: number;
  tickP50: number;
  tickP95: number;
  drawCalls: number;
  spriteCacheMb: number;
}

export interface PerfProbe {
  enabled: boolean;
  frameStart(nowMs: number): void;
  frameEnd(): void;
  tickStart(): void;
  tickEnd(): void;
  /** One `drawImage` (or other draw call) this frame. */
  countDraw(n?: number): void;
  snapshot(): PerfSnapshot;
}

export const perfProbe: PerfProbe = {
  enabled: false,
  frameStart() {},
  frameEnd() {},
  tickStart() {},
  tickEnd() {},
  countDraw() {},
  snapshot: () => ({ fps: 0, frameP50: 0, frameP95: 0, tickP50: 0, tickP95: 0, drawCalls: 0, spriteCacheMb: 0 }),
};
