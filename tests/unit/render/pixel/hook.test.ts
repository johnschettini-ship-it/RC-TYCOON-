/** Phase 8b stage 0b test (never merged): the tool hook (`surfaceArt`) switches the Classic art to the stage 0 twins. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { surfaceArt } from '../../../../src/render/artHook';
import { PIXEL_RIDE_ART } from '../../../../src/render/pixel/art/rides';
import { PixelSurface } from '../../../../src/render/pixel/surface';
import { clearSurfaceArt, installSurfaceArt } from '../../../../src/render/pixel/surfaceArt';
import { drawGuestArt, type GuestLook } from '../../../../src/render/sprites/props';
import { drawRideArt, rideArtBounds, type RideArtState } from '../../../../src/render/sprites/rides';
import { box } from '../../../../src/render/sprites/shapes';
import { drawStallArt, stallArtBounds } from '../../../../src/render/sprites/stalls';
import { buildRideSlices } from '../../../../src/render/track/layer';
import { viewFrame } from '../../../../src/render/track/project';
import { extent } from '../../../../src/sim/footprint';
import { makeTestWorld } from '../../../helpers/world';
import { buildR1 } from '../../track/helpers';
import { Recorder } from '../content/recorder';

const ST: RideArtState = { rotation: 2, angle: 0, swing: 0, occupancy: 0 };
const LOOK: GuestLook = { shirt: '#e8503a', skin: '#f3e0be', hair: '#3b2a20', facing: 2, walk: 0, ring: null };
const SHADOW_CSS = 'rgba(20,30,20,0.18)';

/** Op lists of four Classic calls on recorders. */
function classicOps(): string[][] {
  const calls: Array<(r: Recorder) => void> = [
    (r) => drawRideArt(r.ctx(), 'carousel', 3, 3, ST),
    (r) => drawGuestArt(r.ctx(), LOOK),
    (r) => drawStallArt(r.ctx(), 'snack_shack', 1),
    (r) => box(r.ctx(), 0.2, 0.2, 0.8, 0.8, 0, 20, '#f3e0be', '#d3b894', '#a48a78'),
  ];
  return calls.map((c) => {
    const r = new Recorder();
    c(r);
    return r.ops;
  });
}

// Recorded at load, before any test installs the hook.
const BEFORE = classicOps();

function rideSurface(): PixelSurface {
  const s = new PixelSurface(rideArtBounds('carousel', 3, 3, ST.rotation));
  drawRideArt(s as never, 'carousel', 3, 3, ST);
  s.finish();
  return s;
}

afterEach(() => {
  clearSurfaceArt();
  vi.restoreAllMocks();
});

describe('tool hook (surfaceArt)', () => {
  it("without the hook, art on a recorder gives today's ops", () => {
    installSurfaceArt();
    clearSurfaceArt();
    expect(surfaceArt.on).toBeNull();
    expect(classicOps()).toEqual(BEFORE);
    for (const ops of BEFORE) expect(ops.length).toBeGreaterThan(0);
  });

  it('with the hook on, a recorder still gets the Classic ops', () => {
    installSurfaceArt();
    expect(classicOps()).toEqual(BEFORE);
  });

  it('with the hook, a surface paints the stage 0 twin', () => {
    const { ex, ey } = extent(3, 3, ST.rotation);
    const b = rideArtBounds('carousel', 3, 3, ST.rotation);
    // Classic art on a surface (no hook) is the control.
    const classic = rideSurface();
    installSurfaceArt();
    const spy = vi.spyOn(PIXEL_RIDE_ART, 'carousel');
    const a = rideSurface();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]!.slice(1)).toEqual([ex, ey, ST]);
    expect(a.hash()).not.toBe(classic.hash());
    // The twin painted directly on a second surface with the same bounds.
    const twin = PIXEL_RIDE_ART.carousel!;
    const d = new PixelSurface(b);
    twin(d, ex, ey, ST);
    d.finish();
    // drawRideArt also paints the two gate marks (withGates); gates only: the twin stubbed out.
    spy.mockImplementation(() => {});
    const g = rideSurface();
    const near = (x: number, y: number): boolean => {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (g.pixel(x + dx, y + dy) !== 0) return true;
      return false;
    };
    let compared = 0;
    let opaque = 0;
    for (let y = 0; y < a.h; y++) {
      for (let x = 0; x < a.w; x++) {
        if (near(x, y)) continue;
        compared++;
        if (d.pixel(x, y) !== 0) opaque++;
        expect(a.pixel(x, y), `pixel (${x}, ${y})`).toBe(d.pixel(x, y));
      }
    }
    expect(opaque).toBeGreaterThan(500);
    expect(compared).toBeGreaterThan(0.9 * a.w * a.h);
  });

  it('the stall in-art shadow is skipped on a surface only', () => {
    installSurfaceArt();
    const rec = new Recorder();
    drawStallArt(rec.ctx(), 'snack_shack', 1);
    expect(rec.ops).toContain(`fillStyle=${SHADOW_CSS}`);
    const fills: string[] = [];
    const set = Object.getOwnPropertyDescriptor(PixelSurface.prototype, 'fillStyle')!.set!;
    vi.spyOn(PixelSurface.prototype, 'fillStyle', 'set').mockImplementation(function (this: PixelSurface, v: string) {
      fills.push(v);
      set.call(this, v);
    });
    const paint = (): void => {
      const s = new PixelSurface(stallArtBounds());
      drawStallArt(s as never, 'snack_shack', 1);
      s.finish();
    };
    paint();
    expect(fills.length).toBeGreaterThan(0);
    expect(fills).not.toContain(SHADOW_CSS);
    // Control: without the hook the surface gets the shadow fill.
    clearSurfaceArt();
    fills.length = 0;
    paint();
    expect(fills).toContain(SHADOW_CSS);
  });

  it('track slices widen their runs only with the hook on', () => {
    const world = makeTestWorld();
    const id = buildR1(world);
    const f = viewFrame(0, 64, 64);
    const classic = buildRideSlices(world, id, f);
    expect(buildRideSlices(world, id, f).map((s) => s.bounds)).toEqual(classic.map((s) => s.bounds));
    installSurfaceArt();
    const wide = buildRideSlices(world, id, f);
    expect(wide).toHaveLength(classic.length);
    expect(classic.length).toBeGreaterThan(0);
    let grown = 0;
    classic.forEach((c, i) => {
      const p = wide[i]!;
      expect(p.bounds.left).toBeLessThanOrEqual(c.bounds.left);
      expect(p.bounds.right).toBeGreaterThanOrEqual(c.bounds.right);
      expect(p.bounds.top).toBeLessThanOrEqual(c.bounds.top);
      expect(p.bounds.bottom).toBeGreaterThanOrEqual(c.bounds.bottom);
      if (p.bounds.left < c.bounds.left || p.bounds.right > c.bounds.right || p.bounds.top < c.bounds.top || p.bounds.bottom > c.bounds.bottom) grown++;
    });
    expect(grown).toBeGreaterThan(0);
  });
});
