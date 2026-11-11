/** Phase 8 stage 0 prototype (never merged): track slices with the cut rule (spec §11.3, stage 4a track rules 1 to 3). */
import { afterEach, describe, expect, it } from 'vitest';
import { PixelSurface } from '../../../../src/render/pixel/surface';
import { setArtStyle } from '../../../../src/render/pixel/style';
import { buildRideSlices, paintSlice } from '../../../../src/render/track/layer';
import { viewFrame } from '../../../../src/render/track/project';
import { makeTestWorld } from '../../../helpers/world';
import { addAll, buildR1, EAST, place } from '../../track/helpers';

type Slices = ReturnType<typeof buildRideSlices>;
type Frame = ReturnType<typeof viewFrame>;

/** The surface itself, or a wrapper whose `cut()` does nothing (the control: extras painted without the cut rule). */
function noCut(s: PixelSurface): PixelSurface {
  return new Proxy(s, {
    get(t, k) {
      if (k === 'cut') return () => {};
      const v = Reflect.get(t, k, t) as unknown;
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v;
    },
    set: (t, k, v) => Reflect.set(t, k, v, t),
  });
}

/**
 * For every slice: paint `a` with the extras (through `wrap`) and `b` without; the pixels opaque in `a` and empty in `b`
 * are the ones only the extra samples paint. `check` sees each with its ink bit; returns the counts.
 */
function extraOnly(slices: Slices, f: Frame, wrap: (s: PixelSurface) => PixelSurface, check: (ink: number, where: string) => void): { extra: number; inked: number } {
  let extra = 0;
  let inked = 0;
  for (const sl of slices) {
    const a = new PixelSurface(sl.bounds);
    paintSlice(wrap(a) as never, sl, f, true);
    a.finish();
    const b = new PixelSurface(sl.bounds);
    paintSlice(b as never, sl, f, false);
    b.finish();
    const ink = a.inkMask();
    for (let y = 0; y < a.h; y++) {
      for (let x = 0; x < a.w; x++) {
        if (a.pixel(x, y) === 0 || b.pixel(x, y) !== 0) continue;
        extra++;
        const m = ink[y * a.w + x] as number;
        if (m !== 0) inked++;
        check(m, `slice (${sl.x}, ${sl.y}) pixel (${x}, ${y})`);
      }
    }
  }
  return { extra, inked };
}

/** True when the outer row or column of the image holds an opaque pixel. */
function touchesEdge(s: PixelSurface): boolean {
  for (let x = 0; x < s.w; x++) if (s.pixel(x, 0) !== 0 || s.pixel(x, s.h - 1) !== 0) return true;
  for (let y = 0; y < s.h; y++) if (s.pixel(0, y) !== 0 || s.pixel(s.w - 1, y) !== 0) return true;
  return false;
}

describe('Pixel track slices (cut rule)', () => {
  afterEach(() => {
    setArtStyle('classic');
  });

  it('Pixel slice bounds contain the Classic bounds and some grow', () => {
    const world = makeTestWorld();
    const id = buildR1(world);
    const f = viewFrame(0, 64, 64);
    const classic = buildRideSlices(world, id, f);
    setArtStyle('pixel');
    const pixel = buildRideSlices(world, id, f);
    expect(pixel).toHaveLength(classic.length);
    expect(classic.length).toBeGreaterThan(0);
    let grown = 0;
    classic.forEach((c, i) => {
      const p = pixel[i]!;
      expect(p.bounds.left).toBeLessThanOrEqual(c.bounds.left);
      expect(p.bounds.right).toBeGreaterThanOrEqual(c.bounds.right);
      expect(p.bounds.top).toBeLessThanOrEqual(c.bounds.top);
      expect(p.bounds.bottom).toBeGreaterThanOrEqual(c.bounds.bottom);
      const bigger =
        p.bounds.left < c.bounds.left || p.bounds.right > c.bounds.right || p.bounds.top < c.bounds.top || p.bounds.bottom > c.bounds.bottom;
      if (bigger) grown++;
    });
    expect(grown).toBeGreaterThan(0);
  });

  it('every Pixel slice paints inside its bounds, in 4 view rotations', () => {
    const world = makeTestWorld();
    const id = buildR1(world);
    setArtStyle('pixel');
    for (let r = 0; r < 4; r++) {
      const f = viewFrame(r, 64, 64);
      const slices = buildRideSlices(world, id, f);
      expect(slices.length).toBeGreaterThan(0);
      for (const sl of slices) {
        const s = new PixelSurface(sl.bounds);
        paintSlice(s as never, sl, f);
        s.finish();
        expect(touchesEdge(s), `rotation ${r}, slice (${sl.x}, ${sl.y})`).toBe(false);
      }
    }
  });

  it('the extra samples make no ink', () => {
    const strict = (m: number, where: string): void => {
      expect(m, where).toBe(0);
    };
    // R1 (steel): the extras paint rails, spine and ties, all strokes; stroke pixels never make ink (§5.3 raster
    // rule 3), so on R1 this holds with or without the cut rule.
    const world = makeTestWorld();
    const id = buildR1(world);
    setArtStyle('pixel');
    const f = viewFrame(0, 64, 64);
    const r1 = extraOnly(buildRideSlices(world, id, f), f, (s) => s, strict);
    expect(r1.extra).toBeGreaterThan(0);
    // A rapids channel (channel 1.45): its runs are fills (paintChannel bands and quads), so ink can come from them.
    const w2 = makeTestWorld();
    const rid = place(w2, 'rapids_raft', 10, 10, EAST);
    addAll(w2, rid, ['rapids_station', 'rapids_straight', 'rapids_turn_medium_r', 'rapids_straight', 'rapids_turn_medium_r', 'rapids_straight']);
    const water = buildRideSlices(w2, rid, f);
    expect(water.length).toBeGreaterThan(0);
    const cutOn = extraOnly(water, f, (s) => s, strict);
    expect(cutOn.extra).toBeGreaterThan(0);
    // Control: the same extras painted through a surface whose cut() does nothing make ink, so cut(true) is what clears it.
    const cutOff = extraOnly(water, f, noCut, () => {});
    expect(cutOff.extra).toBeGreaterThan(0);
    expect(cutOff.inked).toBeGreaterThanOrEqual(1);
  });
});
