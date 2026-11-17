/**
 * Title-to-play bridge, part 1 (VITE_ART=real build): the push through the arch and the arrival glow
 * (`docs/superpowers/specs/2026-11-17-title-to-play-bridge-design.md` §1, §2). The timing is pure (`pushFrame`), the
 * controller (`startPush`) runs on an injected clock, and the glow's rule (`glowWanted`) is a plain function, so the
 * rules are checked without a browser: the push starts only when the title is left (after the park is set), reduced
 * motion gives a 300 ms cross-fade with no zoom, a tap skips it, the poster bitmap is closed when it ends, and the
 * glow shows only after a title transition and never with reduced motion.
 */
import { describe, expect, it, vi } from 'vitest';
import { PUSH_MS, PUSH_RM_MS, PUSH_SCALE, pushFrame, startPush, type PushDeps } from '../../../src/ui/titleScreen/real/push';
import { GLOW_MS, GLOW_START, glowOpacity, glowWanted } from '../../../src/ui/bridge/glow';
import { arrivalPlan, arrived, markNewPark, onArrival, takeNewPark } from '../../../src/ui/bridge/arrival';
import { createTitleSession, loadTitleArt, type TitleBitmap } from '../../../src/ui/titleScreen/real/load';
import { checkCoverIndex, type CoverIndex } from '../../../src/ui/titleScreen/real/layout';
import COVER from '../../../art-src/title/index.json';

/** A clock and a frame queue the test advances by hand. */
function clock(): { deps: Omit<PushDeps, 'apply' | 'end'>; advance(ms: number): void; pending(): number } {
  let now = 1000;
  let next = 1;
  const queue = new Map<number, (t: number) => void>();
  return {
    deps: {
      now: () => now,
      frame(cb) {
        const id = next++;
        queue.set(id, cb);
        return id;
      },
      cancel(id) {
        queue.delete(id);
      },
    },
    advance(ms) {
      // One frame per 16 ms, as a display would.
      const end = now + ms;
      while (now < end) {
        now = Math.min(end, now + 16);
        const run = [...queue.entries()];
        queue.clear();
        for (const [, cb] of run) cb(now);
      }
    },
    pending: () => queue.size,
  };
}

describe('pushFrame (the push through the arch)', () => {
  it('scales the poster from 1 to 2.4 over 900 ms, easing in', () => {
    expect(pushFrame(0, false).scale).toBe(1);
    expect(pushFrame(PUSH_MS, false).scale).toBeCloseTo(PUSH_SCALE, 6);
    expect(PUSH_SCALE).toBe(2.4);
    expect(PUSH_MS).toBe(900);
    // Easing in: less than half the zoom at half the time, and never shrinking.
    expect(pushFrame(PUSH_MS / 2, false).scale - 1).toBeLessThan((PUSH_SCALE - 1) / 2);
    let last = 1;
    for (let t = 0; t <= PUSH_MS; t += 30) {
      const s = pushFrame(t, false).scale;
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
  });

  it('fades the menu and the name in the first 200 ms, and the title layer in the last 400 ms', () => {
    expect(pushFrame(0, false).ui).toBe(1);
    expect(pushFrame(200, false).ui).toBe(0);
    expect(pushFrame(100, false).ui).toBeCloseTo(0.5, 6);
    expect(pushFrame(PUSH_MS - 400, false).layer).toBe(1);
    expect(pushFrame(PUSH_MS - 200, false).layer).toBeCloseTo(0.5, 6);
    expect(pushFrame(PUSH_MS, false).layer).toBe(0);
    expect(pushFrame(PUSH_MS - 1, false).done).toBe(false);
    expect(pushFrame(PUSH_MS, false).done).toBe(true);
  });

  it('reduced motion: no zoom, only a 300 ms cross-fade', () => {
    expect(PUSH_RM_MS).toBe(300);
    for (const t of [0, 100, 200, 300, 600]) expect(pushFrame(t, true).scale).toBe(1);
    expect(pushFrame(0, true).layer).toBe(1);
    expect(pushFrame(150, true).layer).toBeCloseTo(0.5, 6);
    expect(pushFrame(300, true).layer).toBe(0);
    expect(pushFrame(299, true).done).toBe(false);
    expect(pushFrame(300, true).done).toBe(true);
  });
});

describe('startPush (the controller)', () => {
  it('does nothing until started (the title starts it when a park is set behind it), then ends once at 900 ms', () => {
    const c = clock();
    const apply = vi.fn();
    const end = vi.fn();
    // Nothing runs on its own: no frame is asked for before startPush.
    expect(c.pending()).toBe(0);
    const p = startPush({ ...c.deps, apply, end }, false);
    expect(p.running()).toBe(true);
    // The first frame is applied at once (no frame of the old layout).
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ scale: 1, layer: 1 }));
    c.advance(PUSH_MS - 20);
    expect(end).not.toHaveBeenCalled();
    c.advance(40);
    expect(end).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledWith(false);
    expect(p.running()).toBe(false);
    expect(c.pending()).toBe(0);
    c.advance(500);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('a tap or a key skips it at once', () => {
    const c = clock();
    const end = vi.fn();
    const p = startPush({ ...c.deps, apply: () => undefined, end }, false);
    c.advance(100);
    p.skip();
    expect(end).toHaveBeenCalledWith(true);
    expect(p.running()).toBe(false);
    expect(c.pending()).toBe(0);
    p.skip();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('reduced motion: ends after the 300 ms cross-fade, every frame at scale 1', () => {
    const c = clock();
    const frames: number[] = [];
    const end = vi.fn();
    startPush({ ...c.deps, apply: (f) => frames.push(f.scale), end }, true);
    c.advance(PUSH_RM_MS + 20);
    expect(end).toHaveBeenCalledTimes(1);
    expect(frames.every((s) => s === 1)).toBe(true);
  });

  it('stop() (the title shown again mid-push) cancels without ending', () => {
    const c = clock();
    const end = vi.fn();
    const p = startPush({ ...c.deps, apply: () => undefined, end }, false);
    c.advance(100);
    p.stop();
    c.advance(2000);
    expect(end).not.toHaveBeenCalled();
    expect(c.pending()).toBe(0);
  });

  it('the poster bitmap stays decoded during the push and is closed when it ends', async () => {
    const live = new Set<TitleBitmap>();
    const art = {
      fetch: vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => COVER, blob: async () => new Blob([url]) })),
      decode: vi.fn(async () => {
        const b: TitleBitmap = { width: 10, height: 10, close: () => live.delete(b) };
        live.add(b);
        return b;
      }),
    };
    const s = createTitleSession({ load: () => loadTitleArt('t/', art), releasePark: () => undefined, changed: () => undefined });
    s.open();
    s.want('wide');
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
    expect(live.size).toBe(1);
    const c = clock();
    startPush({ ...c.deps, apply: () => undefined, end: () => s.close() }, false);
    c.advance(PUSH_MS / 2);
    expect(live.size).toBe(1);
    c.advance(PUSH_MS);
    expect(live.size).toBe(0);
    expect(s.current()).toBeNull();
  });
});

describe('the arch point in the cover index', () => {
  it('the cover index names the arch at (690, 560) on the wide file, inside it', () => {
    const idx = checkCoverIndex(COVER);
    expect(idx).not.toBeInstanceOf(Error);
    expect((idx as CoverIndex).arch).toEqual({ x: 690, y: 560 });
  });
  it('refuses an arch outside the file', () => {
    expect(checkCoverIndex({ ...COVER, arch: { x: 5000, y: 10 } })).toBeInstanceOf(Error);
    expect(checkCoverIndex({ ...COVER, arch: { x: 'a', y: 10 } })).toBeInstanceOf(Error);
  });
});

describe('the arrival glow', () => {
  it('shows only after a title transition, never with reduced motion', () => {
    expect(glowWanted({ fromTitle: true, reduced: false })).toBe(true);
    expect(glowWanted({ fromTitle: true, reduced: true })).toBe(false);
    expect(glowWanted({ fromTitle: false, reduced: false })).toBe(false);
    expect(glowWanted({ fromTitle: false, reduced: true })).toBe(false);
  });
  it('fades from 0.35 to 0 over 2000 ms, easing out', () => {
    expect(GLOW_START).toBe(0.35);
    expect(GLOW_MS).toBe(2000);
    expect(glowOpacity(0)).toBe(GLOW_START);
    expect(glowOpacity(GLOW_MS)).toBe(0);
    expect(glowOpacity(GLOW_MS + 500)).toBe(0);
    // Easing out: more than half gone at half the time.
    expect(glowOpacity(GLOW_MS / 2)).toBeLessThan(GLOW_START / 2);
  });
});

describe('arrival (what follows the push)', () => {
  it('the glow follows a title transition; the welcome card only a new sandbox or free-play park', () => {
    expect(arrivalPlan({ reduced: false, newPark: true, kind: 'freePlay' })).toEqual({ glow: true, welcome: true });
    expect(arrivalPlan({ reduced: false, newPark: true, kind: 'sandbox' })).toEqual({ glow: true, welcome: true });
    expect(arrivalPlan({ reduced: true, newPark: true, kind: 'freePlay' })).toEqual({ glow: false, welcome: true });
    // Continue and Load: no welcome.
    expect(arrivalPlan({ reduced: false, newPark: false, kind: 'freePlay' })).toEqual({ glow: true, welcome: false });
    // A scenario or the tutorial has its own briefing.
    expect(arrivalPlan({ reduced: false, newPark: true, kind: 'scenario' })).toEqual({ glow: true, welcome: false });
    expect(arrivalPlan({ reduced: false, newPark: true, kind: 'tutorial' })).toEqual({ glow: true, welcome: false });
  });
  it('the new-park mark is taken once', () => {
    expect(takeNewPark()).toBe(false);
    markNewPark();
    expect(takeNewPark()).toBe(true);
    expect(takeNewPark()).toBe(false);
  });
  it('arrived() reaches the listener', () => {
    const fn = vi.fn();
    onArrival(fn);
    arrived({ reduced: true });
    expect(fn).toHaveBeenCalledWith({ reduced: true });
    onArrival(null);
    arrived({ reduced: false });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
