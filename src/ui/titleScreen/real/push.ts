/**
 * The push through the arch (VITE_ART=real build with the realistic look only; title-to-play bridge §1,
 * `docs/superpowers/specs/2026-11-17-title-to-play-bridge-design.md`). When a park opens from the title, the poster
 * zooms into its lit arch and the title layer dissolves into the park below.
 *
 * - It starts only when the title is left (`view.ts` `leave`, called by `title.ts` `hide` after the park is set behind
 *   the title), so it never delays play.
 * - The poster scales from 1 to `PUSH_SCALE` about the arch over `PUSH_MS`, easing in; the menu and the name fade out
 *   in the first `PUSH_UI_MS`; the title layer fades out in the last `PUSH_FADE_MS`.
 * - Reduced motion: no zoom, a `PUSH_RM_MS` cross-fade only.
 * - A tap or a key skips it (`skip`); `end` then frees the poster and hides the title.
 *
 * Pure timing (`pushFrame`) and a controller on an injected clock (`startPush`): no DOM here.
 */

export const PUSH_MS = 900;
export const PUSH_SCALE = 2.4;
/** The title layer fades out over the last this many ms of the push. */
export const PUSH_FADE_MS = 400;
/** The menu and the name fade out over the first this many ms. */
export const PUSH_UI_MS = 200;
/** Reduced motion: the cross-fade, ms. */
export const PUSH_RM_MS = 300;

export interface PushFrame {
  /** The poster's scale about the arch. */
  scale: number;
  /** The title layer's opacity (the poster and its fills over the park). */
  layer: number;
  /** The menu's and the name's opacity. */
  ui: number;
  done: boolean;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/** Ease-in (cubic): slow start, fast end, as a push into the picture. */
const easeIn = (p: number): number => p * p * p;

/** The push at `t` ms after it started. */
export function pushFrame(t: number, reduced: boolean): PushFrame {
  if (reduced) {
    const k = clamp01(t / PUSH_RM_MS);
    return { scale: 1, layer: 1 - k, ui: 1 - k, done: t >= PUSH_RM_MS };
  }
  const p = clamp01(t / PUSH_MS);
  return {
    scale: 1 + (PUSH_SCALE - 1) * easeIn(p),
    layer: 1 - clamp01((t - (PUSH_MS - PUSH_FADE_MS)) / PUSH_FADE_MS),
    ui: 1 - clamp01(t / PUSH_UI_MS),
    done: t >= PUSH_MS,
  };
}

export interface PushDeps {
  now(): number;
  frame(cb: (now: number) => void): number;
  cancel(id: number): void;
  /** Draw this frame (the poster's transform and the layers' opacity). */
  apply(f: PushFrame): void;
  /** The push is over (ran out, or skipped by a tap or a key): free the poster and hide the title. Called once. */
  end(skipped: boolean): void;
}
export interface Push {
  /** A tap or a key: end at once. */
  skip(): void;
  /** The title shown again mid-push: stop without ending (the title stays). */
  stop(): void;
  running(): boolean;
}

export function startPush(deps: PushDeps, reduced: boolean): Push {
  const t0 = deps.now();
  let raf = 0;
  let live = true;
  const finish = (skipped: boolean): void => {
    if (!live) return;
    live = false;
    if (raf) deps.cancel(raf);
    raf = 0;
    deps.end(skipped);
  };
  const tick = (now: number): void => {
    raf = 0;
    if (!live) return;
    const f = pushFrame(now - t0, reduced);
    deps.apply(f);
    if (f.done) finish(false);
    else raf = deps.frame(tick);
  };
  deps.apply(pushFrame(0, reduced));
  raf = deps.frame(tick);
  return {
    skip: () => finish(true),
    stop() {
      if (!live) return;
      live = false;
      if (raf) deps.cancel(raf);
      raf = 0;
    },
    running: () => live,
  };
}
