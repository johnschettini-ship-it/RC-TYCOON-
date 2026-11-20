/**
 * Supports under elevated track that shares a tile with lower track (2026-11-20, the floating helix): a helix that
 * starts on the ground carries its upper ring and exit lead ~4 m up over tiles whose lowest rail is on the ground, and
 * a tile used to get one support from its LOWEST rail only, so the upper ring floated. Now every elevated rail run of a
 * slice gets its own support, placed beside (never through) the lower rail where the tile leaves room, and down onto
 * another piece's rail where the design stacks track over track.
 */
import { describe, expect, it } from 'vitest';
import { buildRideSlices, chooseRunSupport, supportSample, type SliceRec, type SupportObstacles } from '../../../../src/render/track/layer';
import { viewFrame } from '../../../../src/render/track/project';
import { pieceWorldSamples } from '../../../../src/sim/rides/track/api';
import type { World } from '../../../../src/sim/types';
import { makeTestWorld } from '../../../helpers/world';
import { addAll, EAST, NORTH, place } from '../../track/helpers';

const f = viewFrame(0, 64, 64);

/** Every rail point of `pieceIndex` more than 1 m over its ground, standing upright, with its plan distance to the nearest support of the ride. */
function elevatedGaps(slices: readonly SliceRec[], pieceIndex: number): number[] {
  const sups = slices.flatMap((sl) => sl.supports);
  const out: number[] = [];
  for (const sl of slices) {
    if (sl.pieceIndex !== pieceIndex) continue;
    const s = sl.samples;
    for (let r = 0; r < sl.runs.length; r += 2) {
      for (let k = sl.runs[r]!; k <= sl.runs[r + 1]!; k++) {
        if (s.z[k]! - sl.ground < 1) continue;
        let d = Infinity;
        for (const su of sups) d = Math.min(d, Math.hypot(su.wx - s.x[k]!, su.wy - s.y[k]!));
        out.push(d);
      }
    }
  }
  return out;
}

/** Plan distance from each support to the nearest rail sample of the ride that runs under it (above its base). */
function clearances(slices: readonly SliceRec[]): number[] {
  const out: number[] = [];
  for (const sl of slices) {
    for (const su of sl.supports) {
      let d = Infinity;
      for (const o of slices) {
        const s = o.samples;
        for (let r = 0; r < o.runs.length; r += 2) {
          for (let k = o.runs[r]!; k <= o.runs[r + 1]!; k++) {
            const z = s.z[k]!;
            if (z >= su.top - 0.5 || z <= su.base + 0.3) continue;
            d = Math.min(d, Math.hypot(su.wx - s.x[k]!, su.wy - s.y[k]!));
          }
        }
      }
      out.push(d);
    }
  }
  return out;
}

function helixWorld(pre: string[]): { w: World; id: number; helix: number } {
  const w = makeTestWorld();
  const id = place(w, 'steel_coaster', 10, 20, EAST);
  addAll(w, id, ['station', ...pre, 'helix_right_up', 'straight', 'straight']);
  return { w, id, helix: 1 + pre.length + 1 };
}

describe('helix supports', () => {
  it('a helix at ground level: its upper ring and exit lead stand on supports', () => {
    const { w, id, helix } = helixWorld([]);
    const slices = buildRideSlices(w, id, f);
    const gaps = elevatedGaps(slices, helix);
    expect(gaps.length).toBeGreaterThan(40);
    // The exit lead 3.4-4 m up over the entry row used to be 8 m from the nearest support.
    expect(Math.max(...gaps)).toBeLessThanOrEqual(5);
    // ... and no column stands in the entry lead or the lower ring.
    for (const c of clearances(slices)) expect(c).toBeGreaterThanOrEqual(1);
    // Every support of this ride stands on the ground (nothing else is under it).
    for (const sl of slices) for (const su of sl.supports) expect(su.base).toBe(sl.ground);
  });

  it('a raised helix: both the lower lead and the ring over it are held, beside each other', () => {
    const { w, id, helix } = helixWorld(['flat_to_gentle_up', 'gentle_up', 'gentle_up', 'gentle_up_to_flat']);
    const slices = buildRideSlices(w, id, f);
    expect(Math.max(...elevatedGaps(slices, helix))).toBeLessThanOrEqual(5);
    for (const c of clearances(slices)) expect(c).toBeGreaterThanOrEqual(1);
    // `support` stays the slice's first support (the realistic look and older callers read it).
    for (const sl of slices) expect(sl.support).toBe(sl.supports[0] ?? null);
  });

  it('a single-run tile keeps exactly the support it had (one, at the old support point)', () => {
    const { w, id } = helixWorld(['flat_to_gentle_up', 'gentle_up', 'gentle_up', 'gentle_up_to_flat']);
    const slices = buildRideSlices(w, id, f);
    const climb = slices.find((sl) => sl.x === 14 && sl.y === 20)!;
    expect(climb.supports).toHaveLength(1);
    const k = supportSample(climb.samples, climb.runs, climb.x, climb.y);
    expect(climb.support).toEqual({ wx: climb.samples.x[k], wy: climb.samples.y[k], yaw: climb.samples.yaw[k], top: climb.samples.z[k]! - climb.look.drop, base: climb.ground });
  });
});

describe('track over other track', () => {
  /** Ride A runs east on the ground along row 20; ride B climbs north and crosses over it 6 m up. */
  function crossing(): { w: World; a: number; b: number } {
    const w = makeTestWorld();
    const a = place(w, 'steel_coaster', 10, 20, EAST);
    addAll(w, a, ['station', ...Array<string>(12).fill('straight')]);
    const b = place(w, 'steel_coaster', 20, 28, NORTH);
    addAll(w, b, ['station', 'flat_to_gentle_up', 'gentle_up', 'gentle_up', 'gentle_up_to_flat', 'straight', 'straight', 'straight', 'straight']);
    return { w, a, b };
  }

  it('the upper ride gets a support on the crossing tile, to the ground beside the lower rail', () => {
    const { w, b } = crossing();
    const sb = buildRideSlices(w, b, f);
    const cross = sb.find((sl) => sl.x === 20 && sl.y === 20)!;
    expect(cross.railMin).toBeGreaterThan(cross.ground + 4);
    expect(cross.supports).toHaveLength(1);
    const su = cross.supports[0]!;
    expect(su.base).toBe(cross.ground);
    // ride A's rail runs along y = 82 m (the row's centre line)
    expect(Math.abs(su.wy - 82)).toBeGreaterThanOrEqual(1.5);
  });

  it('where the upper rail lies right over another piece, its support stands on that rail', () => {
    // synthetic: an upper straight 6 m up, a lower piece's rail 0.2 m up exactly under it
    const s = pieceWorldSamples({ defId: 'straight', x: 0, y: 0, z: 14, dir: 0, chain: false, brakeSpeed: null, cost: 0 });
    const n = s.n;
    const ob: SupportObstacles = { n, x: Float64Array.from(s.x), y: Float64Array.from(s.y), z: new Float64Array(n).fill(8.2), other: new Uint8Array(n).fill(1), index: new Int32Array(n).fill(-1) };
    const c = chooseRunSupport(s, 0, n - 1, 8, true, ob, 2, 2);
    expect(c).not.toBeNull();
    expect(c!.base).toBeCloseTo(8.2, 9);
    // the same lower rail as part of the same piece is not a deck to stand on: no support rather than one through it
    ob.other.fill(0);
    ob.index.fill(10_000);
    expect(chooseRunSupport(s, 0, n - 1, 8, true, ob, 2, 2)).toBeNull();
    // with nothing under it, the support goes to the ground at the sample nearest the tile centre
    const none: SupportObstacles = { n: 0, x: new Float64Array(0), y: new Float64Array(0), z: new Float64Array(0), other: new Uint8Array(0), index: new Int32Array(0) };
    const g = chooseRunSupport(s, 0, n - 1, 8, true, none, 2, 2)!;
    expect(g.base).toBe(8);
    expect(s.x[g.k]).toBeCloseTo(2, 6);
    // a tile whose ground is not the track's (a path under it): no ground support
    expect(chooseRunSupport(s, 0, n - 1, 8, false, none, 2, 2)).toBeNull();
  });
});
