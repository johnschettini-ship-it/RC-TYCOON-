/** Phase 8 stage 0 prototype (never merged): the carousel twin and its branch in `drawRideArt` (spec §5.4, §11.3). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PIXEL_RIDE_ART } from '../../../../src/render/pixel/art/rides';
import { INK_SLOT } from '../../../../src/render/pixel/palette';
import { PixelSurface } from '../../../../src/render/pixel/surface';
import { drawRideArt, rideArtBounds, type RideArtState } from '../../../../src/render/sprites/rides';
import { Recorder } from '../content/recorder';
import { clearSurfaceArt, installSurfaceArt } from '../../../../src/render/pixel/surfaceArt';

// Phase 8b: the stage 0 branches run through the tool hook.
beforeEach(installSurfaceArt);
afterEach(clearSurfaceArt);

const st: RideArtState = { rotation: 2 as const, angle: 0, swing: 0, occupancy: 0 };

function twin(state: RideArtState): PixelSurface {
  const s = new PixelSurface(rideArtBounds('carousel', 3, 3, state.rotation));
  const art = PIXEL_RIDE_ART.carousel;
  if (!art) throw new Error('no carousel twin');
  art(s, 3, 3, state);
  s.finish();
  return s;
}

/** True when the outer row or column of the image holds an opaque pixel. */
function touchesEdge(s: PixelSurface): boolean {
  for (let x = 0; x < s.w; x++) if (s.pixel(x, 0) !== 0 || s.pixel(x, s.h - 1) !== 0) return true;
  for (let y = 0; y < s.h; y++) if (s.pixel(0, y) !== 0 || s.pixel(s.w - 1, y) !== 0) return true;
  return false;
}

/** Count of ink pixels with an opaque non-ink pixel directly above and below. */
function inkBetweenSolid(s: PixelSurface): number {
  const solid = (x: number, y: number): boolean => {
    const v = s.pixel(x, y);
    return v !== 0 && v !== INK_SLOT;
  };
  let found = 0;
  for (let y = 1; y < s.h - 1; y++) {
    for (let x = 0; x < s.w; x++) if (s.pixel(x, y) === INK_SLOT && solid(x, y - 1) && solid(x, y + 1)) found++;
  }
  return found;
}

describe('carousel twin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drawRideArt calls the twin on a surface and not on a recorder', () => {
    const spy = vi.spyOn(PIXEL_RIDE_ART, 'carousel');
    const s = new PixelSurface(rideArtBounds('carousel', 3, 3, 2));
    drawRideArt(s as never, 'carousel', 3, 3, st);
    expect(spy).toHaveBeenCalledTimes(1);
    drawRideArt(new Recorder().ctx(), 'carousel', 3, 3, st);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('the twin stays inside the Classic bounds', () => {
    const s = twin(st);
    expect(touchesEdge(s)).toBe(false);
    expect(s.misses).toBe(0);
  });

  it('the roof layer puts ink over the body', () => {
    const s = twin(st);
    expect(inkBetweenSolid(s)).toBeGreaterThan(0);
  });

  it('the roof is drawn in its own layer, and the layer adds ink over the body', () => {
    // The horse stamps alone already meet the check above, so this case proves the roof layer matters.
    const s = new PixelSurface(rideArtBounds('carousel', 3, 3, 2));
    const spy = vi.spyOn(s, 'layer');
    const art = PIXEL_RIDE_ART.carousel;
    if (!art) throw new Error('no carousel twin');
    art(s, 3, 3, st);
    expect(spy).toHaveBeenCalledTimes(1);
    s.finish();
    const countWith = inkBetweenSolid(s);
    // Same drawing through a context that hides `layer`, so the roof is painted in the body layer.
    const s2 = new PixelSurface(rideArtBounds('carousel', 3, 3, 2));
    const t2 = s2 as unknown as Record<PropertyKey, unknown>;
    const noLayer = new Proxy(t2, {
      get: (t, p) => {
        if (p === 'layer') return undefined;
        const v = t[p];
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v;
      },
      set: (t, p, v) => ((t[p] = v), true),
    });
    art(noLayer as unknown as PixelSurface, 3, 3, st);
    s2.finish();
    const countWithout = inkBetweenSolid(s2);
    expect(countWith).toBeGreaterThan(countWithout);
  });

  it('the horses turn with the angle', () => {
    expect(twin(st).hash()).not.toBe(twin({ ...st, angle: 1 / 16 }).hash());
  });

  it('each view rotation paints inside the bounds', () => {
    // No rule on equal or different hashes: stage 3 asks for 4 different hashes of a hero ride (§13.3).
    for (const rotation of [0, 1, 2, 3] as const) expect(touchesEdge(twin({ ...st, rotation }))).toBe(false);
  });
});
