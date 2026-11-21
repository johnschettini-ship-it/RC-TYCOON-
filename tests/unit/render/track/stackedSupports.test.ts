/**
 * Supports under elevated track that shares a tile with lower track (2026-11-20, the floating helix): a helix that
 * starts on the ground carries its upper ring and exit lead ~4 m up over tiles whose lowest rail is on the ground, and
 * a tile used to get one support from its LOWEST rail only, so the upper ring floated. Now every elevated rail run of a
 * slice gets its own support, placed beside (never through) the lower rail where the tile leaves room, and down onto
 * another piece's rail where the design stacks track over track.
 */
import { describe, expect, it } from 'vitest';
import { buildRideSlices, chooseRunSupport, supportSample, type SliceRec, type SupportObstacles, type SupportRec } from '../../../../src/render/track/layer';
import { viewFrame } from '../../../../src/render/track/project';
import { pieceWorldSamples } from '../../../../src/sim/rides/track/api';
import type { World } from '../../../../src/sim/types';
import { makeTestWorld } from '../../../helpers/world';
import { addAll, EAST, NORTH, place, type PieceSpec } from '../../track/helpers';

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

/** The highest rail line of the ride within 1 m in plan under a support (below its top), or -Infinity: the rail it stands on. */
function railUnder(slices: readonly SliceRec[], su: SupportRec): number {
  let top = -Infinity;
  for (const o of slices) {
    const s = o.samples;
    for (let r = 0; r < o.runs.length; r += 2) {
      for (let k = o.runs[r]!; k <= o.runs[r + 1]!; k++) {
        if (s.z[k]! < su.top - 0.5 && Math.hypot(su.wx - s.x[k]!, su.wy - s.y[k]!) < 1) top = Math.max(top, s.z[k]!);
      }
    }
  }
  return top;
}

/**
 * The longest stretch of the ride's rail (m, measured along the track in plan) that is at least SUPPORT_MIN_H (1.5 m)
 * over its ground and has no support under it (2026-11-21). A rail point counts as held where a support's top is right
 * under it (upright cars: plan < 0.6 m, the rail line `drop` over the top) or it is lower than SUPPORT_MIN_H.
 */
function longestUnheldSpan(slices: readonly SliceRec[]): number {
  const byPiece = new Map<number, SliceRec[]>();
  for (const sl of slices) byPiece.set(sl.pieceIndex, [...(byPiece.get(sl.pieceIndex) ?? []), sl]);
  const sups = slices.flatMap((sl) => sl.supports.map((su) => ({ su, drop: sl.look.drop })));
  let best = 0;
  let run = 0;
  let px = NaN;
  let py = NaN;
  for (const p of [...byPiece.keys()].sort((a, b) => a - b)) {
    const sls = byPiece.get(p)!;
    const s = sls[0]!.samples;
    const ground = new Float64Array(s.n).fill(-Infinity);
    for (const sl of sls) for (let r = 0; r < sl.runs.length; r += 2) for (let k = sl.runs[r]!; k <= sl.runs[r + 1]!; k++) ground[k] = sl.ground;
    for (let k = 0; k < s.n; k++) {
      const x = s.x[k]!;
      const y = s.y[k]!;
      const z = s.z[k]!;
      if (!Number.isNaN(px)) run += Math.hypot(x - px, y - py);
      px = x;
      py = y;
      const held = z - ground[k]! < 1.5 || sups.some(({ su, drop }) => Math.hypot(su.wx - x, su.wy - y) < 0.6 && Math.abs(su.top + drop - z) < 0.6);
      if (held) {
        best = Math.max(best, run);
        run = 0;
      }
    }
  }
  return Math.max(best, run);
}

/** One support per tile holds straight track every TILE_M (4 m); curves and stacked runs get SUPPORT_SPACING (2 m) more. */
const MAX_SPAN_M = 6;

function helixWorld(pre: PieceSpec[], type = 'steel_coaster', helix = 'helix_right_up'): { w: World; id: number; helix: number } {
  const w = makeTestWorld();
  const id = place(w, type, 10, 20, EAST);
  addAll(w, id, ['station', ...pre, helix, 'straight', 'straight']);
  return { w, id, helix: 1 + pre.length + 1 };
}

const RAISE: PieceSpec[] = ['flat_to_gentle_up', 'gentle_up', 'gentle_up', 'gentle_up_to_flat'];

describe('helix spans (2026-11-21)', () => {
  // A raised helix's exit lead runs right over its own entry lead: no ground under it, and the entry lead (the same
  // piece) was no deck to stand on, so ~13 m of it floated (7 m once that was allowed but a column next to the entry
  // lead's own blocked the next); a helix on the ground left 7 m.
  const cases: [string, PieceSpec[], string, string][] = [
    ['raised, steel, right', RAISE, 'steel_coaster', 'helix_right_up'],
    ['raised, steel, left', RAISE, 'steel_coaster', 'helix_left_up'],
    ['raised on a chain lift', RAISE.map((id) => ({ id: id as string, chain: true })), 'steel_coaster', 'helix_right_up'],
    ['raised by a first helix, mine train', ['helix_right_up', 'straight'], 'mine_train', 'helix_right_up'],
    ['on the ground, steel', [], 'steel_coaster', 'helix_right_up'],
    ['coming down, steel', [...RAISE, ...RAISE], 'steel_coaster', 'helix_right_down'],
  ];
  for (const [name, pre, type, helix] of cases) {
    it(`${name}: no elevated rail longer than ${MAX_SPAN_M} m without a support`, () => {
      const { w, id } = helixWorld(pre, type, helix);
      const slices = buildRideSlices(w, id, f);
      expect(longestUnheldSpan(slices)).toBeLessThanOrEqual(MAX_SPAN_M);
      // no column through rail: each stands on the ground or right on the ride's own rail, 1 m clear of any other
      for (const c of clearances(slices)) expect(c).toBeGreaterThanOrEqual(1);
      for (const sl of slices) for (const su of sl.supports) if (su.base !== sl.ground) expect(railUnder(slices, su)).toBeCloseTo(su.base, 6);
    });
  }
});

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
    // Every support of this ride stands on the ground, or (2026-11-21) on the helix's own entry lead under its exit lead.
    for (const sl of slices) for (const su of sl.supports) if (su.base !== sl.ground) expect(railUnder(slices, su)).toBeCloseTo(su.base, 6);
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
    // the same lower rail as part of the same piece, far along it (a helix's entry lead under its exit lead,
    // 2026-11-21): stood on as well; with `ownStack` off (hanging cars) no support rather than one through it
    ob.other.fill(0);
    ob.index.fill(10_000);
    expect(chooseRunSupport(s, 0, n - 1, 8, true, ob, 2, 2)!.base).toBeCloseTo(8.2, 9);
    expect(chooseRunSupport(s, 0, n - 1, 8, true, ob, 2, 2, undefined, undefined, false)).toBeNull();
    // `fits` turns a point down; the run takes the next best one rather than none
    const first = chooseRunSupport(s, 0, n - 1, 8, true, ob, 2, 2)!.k;
    const next = chooseRunSupport(s, 0, n - 1, 8, true, ob, 2, 2, undefined, (k) => k !== first)!;
    expect(next.k).not.toBe(first);
    // with nothing under it, the support goes to the ground at the sample nearest the tile centre
    const none: SupportObstacles = { n: 0, x: new Float64Array(0), y: new Float64Array(0), z: new Float64Array(0), other: new Uint8Array(0), index: new Int32Array(0) };
    const g = chooseRunSupport(s, 0, n - 1, 8, true, none, 2, 2)!;
    expect(g.base).toBe(8);
    expect(s.x[g.k]).toBeCloseTo(2, 6);
    // a tile whose ground is not the track's (a path under it): no ground support
    expect(chooseRunSupport(s, 0, n - 1, 8, false, none, 2, 2)).toBeNull();
  });
});
