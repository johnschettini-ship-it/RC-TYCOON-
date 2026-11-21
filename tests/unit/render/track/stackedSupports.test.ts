/**
 * Supports under elevated track that shares a tile with lower track (2026-11-20, the floating helix): a helix that
 * starts on the ground carries its upper ring and exit lead ~4 m up over tiles whose lowest rail is on the ground, and
 * a tile used to get one support from its LOWEST rail only, so the upper ring floated. Now every elevated rail run of a
 * slice gets its own support, placed beside (never through) the lower rail where the tile leaves room. 2026-11-21: no
 * column stands inside the car envelope of any rail (no more columns standing on a lower rail's centre line, which its
 * cars ran through), and a run whose best point is too near another column takes its next best instead of none.
 * 2026-11-21 (goalposts): where rail lies over other rail (a helix's exit lead over its entry lead, a ride along a row
 * over another) two legs beside the lower rail hold a beam over its cars, under the upper rail.
 */
import { describe, expect, it } from 'vitest';
import { buildRideSlices, chooseGoalpost, chooseRunSupport, GOAL_BEAM_DEPTH, GOAL_BEAM_MAX, realGoalBeams, realGoalLegPlacement, realSupportPlacement, setGoalpostsForTest, SUB_GOAL_LEG, supportSample, TrackLayer, type SliceRec, type SupportObstacles, type SupportRec } from '../../../../src/render/track/layer';
import { carDims, riderHeightM } from '../../../../src/render/track/paint';
import { getTrackTypeDef } from '../../../../src/data/track';
import { Content, tileIndex } from '../../../../src/sim/map';
import { projectY, tileDepthView, viewFrame } from '../../../../src/render/track/project';
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

/**
 * The car envelope (m in plan from a rail's centre line; layer.ts SUPPORT_CLEAR_MIN): the widest upright car reaches
 * 0.8 m to a side (`carDims` b), the bobsled trough 0.85 m, and a column is ~0.15 m thick. A banked rail tips its car
 * out: up to b·cosβ + h1·|sinβ| (h1 0.9 m, the tallest car top) on the inside of a 35° bank.
 */
function envelopeAt(bankCos: number): number {
  const sin = Math.sqrt(Math.max(0, 1 - bankCos * bankCos));
  return Math.max(0.85, 0.8 * bankCos + 0.9 * sin) + 0.15;
}

/**
 * Every support of `slices` against every rail sample of `all` (the ride, and other rides on the map) that it could
 * meet: lower than its top (its own rail and the rail right before and after it along the same piece excepted), the
 * rail on the ground included (cars run there too). Returns the worst margin (plan distance less the envelope); a
 * column through cars makes it negative.
 */
function envelopeMargin(slices: readonly SliceRec[], all: readonly SliceRec[] = slices): number {
  let worst = Infinity;
  for (const sl of slices) {
    for (const su of sl.supports) {
      if (su.goal) {
        worst = Math.min(worst, legMargin(sl, su, all));
        continue;
      }
      // the support's own rail sample
      const s0 = sl.samples;
      let own = -1;
      let bd = Infinity;
      for (let r = 0; r < sl.runs.length; r += 2) {
        for (let k = sl.runs[r]!; k <= sl.runs[r + 1]!; k++) {
          const d = Math.hypot(su.wx - s0.x[k]!, su.wy - s0.y[k]!) + Math.abs(su.top - s0.z[k]! + sl.look.drop);
          if (d < bd) {
            bd = d;
            own = k;
          }
        }
      }
      for (const o of all) {
        const s = o.samples;
        for (let r = 0; r < o.runs.length; r += 2) {
          for (let k = o.runs[r]!; k <= o.runs[r + 1]!; k++) {
            if (o.rideId === sl.rideId && o.pieceIndex === sl.pieceIndex && Math.abs(k - own) < 16) continue;
            if (s.z[k]! >= su.top - 0.5) continue;
            worst = Math.min(worst, Math.hypot(su.wx - s.x[k]!, su.wy - s.y[k]!) - envelopeAt(s.bankCos[k]!));
          }
        }
      }
    }
  }
  return worst;
}

/**
 * A goalpost's legs against every rail sample of `all` lower than its rail by 0.5 m (the column check; no sample
 * excepted, the rail it holds included): the worst plan distance less the envelope. A lattice leg is a frame of two
 * posts 0.75 m to each side of its axis, square to the beam or to the beam's nearest map axis (the realistic bents):
 * each post counts.
 */
function legMargin(sl: SliceRec, su: SupportRec, all: readonly SliceRec[]): number {
  const g = su.goal!;
  const pts: [number, number][] = [];
  const bx = g.x1 - g.x0;
  const by = g.y1 - g.y0;
  const len = Math.hypot(bx, by);
  for (const [lx, ly] of [[g.x0, g.y0], [g.x1, g.y1]] as const) {
    if (sl.supportStyle !== 'lattice') {
      pts.push([lx, ly]);
      continue;
    }
    const q = (Math.round(Math.atan2(by, bx) / (Math.PI / 2)) * Math.PI) / 2;
    for (const [rx, ry] of [[-by / len, bx / len], [-Math.sin(q), Math.cos(q)]]) for (const sg of [-1, 1]) pts.push([lx + rx! * 0.75 * sg, ly + ry! * 0.75 * sg]);
  }
  let worst = Infinity;
  for (const o of all) {
    const s = o.samples;
    for (let r = 0; r < o.runs.length; r += 2) {
      for (let k = o.runs[r]!; k <= o.runs[r + 1]!; k++) {
        if (s.z[k]! >= su.top + sl.look.drop - 0.5) continue;
        for (const [px, py] of pts) worst = Math.min(worst, Math.hypot(px - s.x[k]!, py - s.y[k]!) - envelopeAt(s.bankCos[k]!));
      }
    }
  }
  return worst;
}

/** Plan distance from (px, py) to the segment (x0, y0)-(x1, y1). */
function segDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - x0 - t * dx, py - y0 - t * dy);
}

/** How high a ride's cars reach over their rail line (m), riders' heads included: carDims h1 + 0.3 (`riderHeightM`). */
function carTop(o: SliceRec): number {
  const shape = getTrackTypeDef(o.data.typeId)!.render.car;
  return Math.max(riderHeightM(shape, carDims(shape, false)), riderHeightM(shape, carDims(shape, true)));
}

/**
 * Every goalpost beam of `slices` against the cars of every rail sample of `all` whose car envelope it crosses in plan
 * (the samples of the rail it holds, within 4 m along, excepted): the worst room (m) between the beam's bottom
 * (GOAL_BEAM_DEPTH under its top) and the cars' top (riders' heads; a banked car tips up b·|sinβ| more), or for rail
 * well over the beam (its rail line 1.2 m over the beam's top) none. Negative: a beam through a car or a rider.
 */
function beamMargin(slices: readonly SliceRec[], all: readonly SliceRec[] = slices): number {
  let worst = Infinity;
  for (const sl of slices) {
    for (const su of sl.supports) {
      const g = su.goal;
      if (!g) continue;
      expect(Math.hypot(g.x1 - g.x0, g.y1 - g.y0)).toBeLessThanOrEqual(GOAL_BEAM_MAX + 1e-6);
      // the beam passes under the rail it holds
      expect(segDist(su.wx, su.wy, g.x0, g.y0, g.x1, g.y1)).toBeLessThan(0.05);
      const bot = g.z - GOAL_BEAM_DEPTH;
      const s0 = sl.samples;
      let own = -1;
      let bd = Infinity;
      for (let k = 0; k < s0.n; k++) {
        const d = Math.hypot(su.wx - s0.x[k]!, su.wy - s0.y[k]!);
        if (d < bd) {
          bd = d;
          own = k;
        }
      }
      for (const o of all) {
        const s = o.samples;
        const h = carTop(o);
        for (let r = 0; r < o.runs.length; r += 2) {
          for (let k = o.runs[r]!; k <= o.runs[r + 1]!; k++) {
            if (o.rideId === sl.rideId && o.pieceIndex === sl.pieceIndex && Math.abs(k - own) < 16) continue;
            if (segDist(s.x[k]!, s.y[k]!, g.x0, g.y0, g.x1, g.y1) >= envelopeAt(s.bankCos[k]!)) continue;
            if (s.z[k]! - 1.2 >= g.z) continue;
            const c = s.bankCos[k]!;
            worst = Math.min(worst, bot - (s.z[k]! + h * c + 0.8 * Math.sqrt(Math.max(0, 1 - c * c))));
          }
        }
      }
    }
  }
  return worst;
}

/** Every goalpost of `slices` stands both legs on a track tile of the support's ground. */
function legsOnGround(w: World, slices: readonly SliceRec[]): void {
  const m = w.state.map;
  for (const sl of slices) {
    for (const su of sl.supports) {
      if (!su.goal) continue;
      expect(su.base).toBe(sl.ground);
      for (const [x, y] of [[su.goal.x0, su.goal.y0], [su.goal.x1, su.goal.y1]] as const) {
        const i = tileIndex(m, Math.floor(x / 4), Math.floor(y / 4));
        expect(m.content[i]).toBe(Content.Track);
        expect(m.heights[i]).toBe(sl.ground);
      }
    }
  }
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

/**
 * One support per tile holds straight track every TILE_M (4 m). A helix's exit lead and the end of its ring run over
 * its entry lead and the start of its ring, inside their car envelope, for 7.46 m of track (helix samples 131-161): no
 * ground column fits there (the rail spanned 7.96 m), so a goalpost holds it (2026-11-21). Measured: 3.5-4.0 m.
 */
const MAX_SPAN_M = 6;

function helixWorld(pre: PieceSpec[], type = 'steel_coaster', helix = 'helix_right_up'): { w: World; id: number; helix: number } {
  const w = makeTestWorld();
  const id = place(w, type, 10, 20, EAST);
  addAll(w, id, ['station', ...pre, helix, 'straight', 'straight']);
  return { w, id, helix: 1 + pre.length + 1 };
}

const RAISE: PieceSpec[] = ['flat_to_gentle_up', 'gentle_up', 'gentle_up', 'gentle_up_to_flat'];

describe('helix spans (2026-11-21)', () => {
  // A raised helix's exit lead runs right over its own entry lead: no ground clear of the entry lead's cars under it,
  // and the entry lead (the same piece) was no deck to stand on, so 13.6 m of it floated; a helix on the ground left
  // 7.2 m. Then the highest run of a tile picked its column first and a run took its next best point rather than none
  // (7.96 m left over the entry lead); now a goalpost holds that stretch.
  const cases: [string, PieceSpec[], string, string][] = [
    ['raised, steel, right', RAISE, 'steel_coaster', 'helix_right_up'],
    ['raised, steel, left', RAISE, 'steel_coaster', 'helix_left_up'],
    ['raised on a chain lift', RAISE.map((id) => ({ id: id as string, chain: true })), 'steel_coaster', 'helix_right_up'],
    ['raised by a first helix, mine train', ['helix_right_up', 'straight'], 'mine_train', 'helix_right_up'],
    ['on the ground, steel', [], 'steel_coaster', 'helix_right_up'],
    ['coming down, steel', [...RAISE, ...RAISE], 'steel_coaster', 'helix_right_down'],
    ['raised, bobsled (its trough is the widest)', RAISE, 'bobsled_run', 'helix_right_up'],
    ['on the ground, bobsled', [], 'bobsled_run', 'helix_left_up'],
  ];
  for (const [name, pre, type, helix] of cases) {
    it(`${name}: no elevated rail longer than ${MAX_SPAN_M} m without a support`, () => {
      const { w, id } = helixWorld(pre, type, helix);
      const slices = buildRideSlices(w, id, f);
      // no column inside the car envelope of any rail; every column stands on the ground
      expect(envelopeMargin(slices)).toBeGreaterThanOrEqual(0);
      for (const sl of slices) for (const su of sl.supports) expect(su.base).toBe(sl.ground);
      expect(longestUnheldSpan(slices)).toBeLessThanOrEqual(MAX_SPAN_M);
      // the stretch over the entry lead stands on a goalpost whose beam clears the entry lead's cars
      expect(slices.some((sl) => sl.supports.some((su) => su.goal))).toBe(true);
      expect(beamMargin(slices)).toBeGreaterThanOrEqual(0);
      legsOnGround(w, slices);
    });
  }

  it('a tile with two runs gives each its column: the upper one first, the lower one its next best point', () => {
    const { w, id, helix } = helixWorld(RAISE);
    const slices = buildRideSlices(w, id, f);
    // tiles (16, 20) and (18, 20): the entry lead or ring start below, the ring end or exit lead over it
    for (const x of [16, 18]) {
      const sl = slices.find((o) => o.pieceIndex === helix && o.x === x && o.y === 20)!;
      expect(sl.runs).toHaveLength(4);
      expect(sl.supports).toHaveLength(2);
      const zs = sl.supports.map((su) => su.top);
      expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(2.5);
      expect(Math.hypot(sl.supports[0]!.wx - sl.supports[1]!.wx, sl.supports[0]!.wy - sl.supports[1]!.wy)).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('helix supports', () => {
  it('a helix at ground level: its upper ring and exit lead stand on supports', () => {
    const { w, id, helix } = helixWorld([]);
    const slices = buildRideSlices(w, id, f);
    const gaps = elevatedGaps(slices, helix);
    expect(gaps.length).toBeGreaterThan(40);
    // The exit lead 3.4-4 m up over the entry row used to be 8 m from the nearest support.
    expect(Math.max(...gaps)).toBeLessThanOrEqual(5);
    // ... and no column stands in the entry lead or the lower ring, or in their cars.
    expect(envelopeMargin(slices)).toBeGreaterThanOrEqual(0);
    // Every support of this ride stands on the ground (nothing else is under it).
    for (const sl of slices) for (const su of sl.supports) expect(su.base).toBe(sl.ground);
  });

  it('a raised helix: both the lower lead and the ring over it are held, beside each other', () => {
    const { w, id, helix } = helixWorld(['flat_to_gentle_up', 'gentle_up', 'gentle_up', 'gentle_up_to_flat']);
    const slices = buildRideSlices(w, id, f);
    expect(Math.max(...elevatedGaps(slices, helix))).toBeLessThanOrEqual(5);
    expect(envelopeMargin(slices)).toBeGreaterThanOrEqual(0);
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
    const { w, a, b } = crossing();
    const sb = buildRideSlices(w, b, f);
    const cross = sb.find((sl) => sl.x === 20 && sl.y === 20)!;
    expect(cross.railMin).toBeGreaterThan(cross.ground + 4);
    expect(cross.supports).toHaveLength(1);
    const su = cross.supports[0]!;
    expect(su.base).toBe(cross.ground);
    // ride A's rail runs along y = 82 m (the row's centre line)
    expect(Math.abs(su.wy - 82)).toBeGreaterThanOrEqual(1.5);
    // and no column of either ride stands in the other's cars
    const sa = buildRideSlices(w, a, f);
    expect(envelopeMargin(sb, [...sa, ...sb])).toBeGreaterThanOrEqual(0);
    expect(envelopeMargin(sa, [...sa, ...sb])).toBeGreaterThanOrEqual(0);
  });

  it('where the upper rail lies right over lower rail, no column stands in its cars', () => {
    // synthetic: an upper straight 6 m up, a lower piece's rail 0.2 m up exactly under it
    const s = pieceWorldSamples({ defId: 'straight', x: 0, y: 0, z: 14, dir: 0, chain: false, brakeSpeed: null, cost: 0 });
    const n = s.n;
    const ob: SupportObstacles = { n, x: Float64Array.from(s.x), y: Float64Array.from(s.y), z: new Float64Array(n).fill(8.2), other: new Uint8Array(n).fill(1), index: new Int32Array(n).fill(-1) };
    // 2026-11-21: it used to stand on that rail's centre line, in the lower cars' way; now the rail spans over it
    expect(chooseRunSupport(s, 0, n - 1, 8, true, ob, 2, 2)).toBeNull();
    // the same, as the piece's own rail further along (a helix's entry lead under its exit lead)
    ob.other.fill(0);
    ob.index.fill(10_000);
    expect(chooseRunSupport(s, 0, n - 1, 8, true, ob, 2, 2)).toBeNull();
    // the lower rail 1.2 m to the side: a column beside it, clear of its cars
    const side: SupportObstacles = { ...ob, y: Float64Array.from(s.y, (v) => v + 1.2) };
    const b = chooseRunSupport(s, 0, n - 1, 8, true, side, 2, 2)!;
    expect(b.base).toBe(8);
    // `fits` turns a point down; the run takes the next best one rather than none
    const none0: SupportObstacles = { n: 0, x: new Float64Array(0), y: new Float64Array(0), z: new Float64Array(0), other: new Uint8Array(0), index: new Int32Array(0) };
    const first = chooseRunSupport(s, 0, n - 1, 8, true, none0, 2, 2)!.k;
    const next = chooseRunSupport(s, 0, n - 1, 8, true, none0, 2, 2, undefined, (k) => Math.abs(k - first) > 4)!;
    expect(Math.abs(next.k - first)).toBeGreaterThan(4);
    // with nothing under it, the support goes to the ground at the sample nearest the tile centre
    const none: SupportObstacles = { n: 0, x: new Float64Array(0), y: new Float64Array(0), z: new Float64Array(0), other: new Uint8Array(0), index: new Int32Array(0) };
    const g = chooseRunSupport(s, 0, n - 1, 8, true, none, 2, 2)!;
    expect(g.base).toBe(8);
    expect(s.x[g.k]).toBeCloseTo(2, 6);
    // a tile whose ground is not the track's (a path under it): no ground support
    expect(chooseRunSupport(s, 0, n - 1, 8, false, none, 2, 2)).toBeNull();
  });
});

describe('goalposts (2026-11-21)', () => {
  /**
   * Ride A comes up column 20 from its station at (20, 23), turns east onto row 20 at x 20 and runs a straight at x 21;
   * ride B starts at x 4 on row 20, climbs to 6 m and runs straight on along the row, right over A for the two tiles the
   * sim allows (MAX_UNSUPPORTED_TILES), and on past it. `lower` A's type and pieces (water rides have their own).
   */
  function sameRow(upper: string, lower = 'steel_coaster', pieces = ['straight', 'straight', 'turn_small_right', 'straight']): { w: World; a: number; b: number } {
    const w = makeTestWorld();
    const a = place(w, lower, 20, 23, NORTH);
    addAll(w, a, pieces);
    const b = place(w, upper, 4, 20, EAST);
    addAll(w, b, ['station', ...RAISE, ...Array<string>(16).fill('straight')]);
    return { w, a, b };
  }

  /**
   * No leg on another ride's station deck (paint.ts paintPlatform: 0.85-1.95 m beside a coaster's rail) or in a water
   * channel (its walls at its half width), with a leg's 0.4 m footing (the realistic foot's radius).
   */
  function legsOffDecksAndWater(slices: readonly SliceRec[], all: readonly SliceRec[]): void {
    for (const sl of slices) {
      for (const su of sl.supports) {
        if (!su.goal) continue;
        for (const [lx, ly] of [[su.goal.x0, su.goal.y0], [su.goal.x1, su.goal.y1]] as const) {
          for (const o of all) {
            if (o === sl) continue;
            const look = o.look;
            const keep = o.special === 'station' ? 1.95 + 0.4 : look.channel > 0 && !look.trough ? look.channel + 0.4 : 0;
            if (keep === 0) continue;
            const s = o.samples;
            for (let r = 0; r < o.runs.length; r += 2) for (let k = o.runs[r]!; k <= o.runs[r + 1]!; k++) expect(Math.hypot(lx - s.x[k]!, ly - s.y[k]!)).toBeGreaterThanOrEqual(keep - 1e-9);
          }
        }
      }
    }
  }

  for (const upper of ['steel_coaster', 'mine_train', 'bobsled_run']) {
    it(`${upper} along a row over another ride: a goalpost over the lower cars, no span over ${MAX_SPAN_M} m`, () => {
      const { w, a, b } = sameRow(upper);
      const sa = buildRideSlices(w, a, f);
      const sb = buildRideSlices(w, b, f);
      const all = [...sa, ...sb];
      // B is right over A's rail on A's two tiles of row 20 (8.5 m unsupported before goalposts)
      const over = sb.filter((sl) => sa.some((o) => o.x === sl.x && o.y === sl.y));
      expect(over).toHaveLength(2);
      const goals = sb.flatMap((sl) => sl.supports.filter((su) => su.goal));
      expect(goals.length).toBeGreaterThanOrEqual(1);
      expect(longestUnheldSpan(sb)).toBeLessThanOrEqual(MAX_SPAN_M);
      // legs clear of both rides' cars, beams over A's cars and riders, both legs on track ground
      expect(envelopeMargin(sb, all)).toBeGreaterThanOrEqual(0);
      expect(beamMargin(sb, all)).toBeGreaterThanOrEqual(0);
      legsOnGround(w, sb);
      // the lower ride has none (nothing is over it but B's rail)
      expect(sa.some((sl) => sl.supports.some((su) => su.goal))).toBe(false);
    });
  }

  it("no leg on a station deck: over another ride's station the goalpost stands past the deck", () => {
    // A's station at x 20 and a straight at x 21 along row 20, under B
    const w = makeTestWorld();
    const a = place(w, 'steel_coaster', 20, 20, EAST);
    addAll(w, a, ['straight']);
    const b = place(w, 'steel_coaster', 4, 20, EAST);
    addAll(w, b, ['station', ...RAISE, ...Array<string>(16).fill('straight')]);
    const sa = buildRideSlices(w, a, f);
    const sb = buildRideSlices(w, b, f);
    expect(sb.some((sl) => sl.supports.some((su) => su.goal))).toBe(true);
    legsOffDecksAndWater(sb, [...sa, ...sb]);
    expect(envelopeMargin(sb, [...sa, ...sb])).toBeGreaterThanOrEqual(0);
    expect(beamMargin(sb, [...sa, ...sb])).toBeGreaterThanOrEqual(0);
    // the decks keep the legs 2.35 m off a station's rail (a 4.7 m beam, over GOAL_BEAM_MAX), so the goalpost stands past
    // A's station and the span stays longer there: 11 m before goalposts, 7.25 m with them (a known limit)
    expect(longestUnheldSpan(sb)).toBeLessThan(7.5);
  });

  it('no leg in a water channel: B along a row over the rapids', () => {
    const { w, a, b } = sameRow('steel_coaster', 'rapids_raft', ['rapids_straight', 'rapids_straight', 'rapids_turn_small_r', 'rapids_straight']);
    const sa = buildRideSlices(w, a, f);
    const sb = buildRideSlices(w, b, f);
    const all = [...sa, ...sb];
    expect(sb.some((sl) => sl.supports.some((su) => su.goal))).toBe(true);
    legsOffDecksAndWater(sb, all);
    expect(envelopeMargin(sb, all)).toBeGreaterThanOrEqual(0);
    expect(beamMargin(sb, all)).toBeGreaterThanOrEqual(0);
    expect(longestUnheldSpan(sb)).toBeLessThanOrEqual(MAX_SPAN_M);
  });

  it('every goalpost leg stands on a flat track tile: a sloped tile is no leg spot', () => {
    const { w, b } = sameRow('steel_coaster');
    const m = w.state.map;
    const goals = (): SupportRec[] => buildRideSlices(w, b, f).flatMap((sl) => sl.supports.filter((su) => su.goal));
    const g0 = goals()[0]!.goal!;
    // tip the tile under the first leg: that spot goes (another leg spot, or none)
    const i = tileIndex(m, Math.floor(g0.x0 / 4), Math.floor(g0.y0 / 4));
    m.slope[i] = 1;
    for (const su of goals()) {
      for (const [x, y] of [[su.goal!.x0, su.goal!.y0], [su.goal!.x1, su.goal!.y1]] as const) expect(m.slope[tileIndex(m, Math.floor(x / 4), Math.floor(y / 4))]).toBe(0);
    }
  });

  it('rebuild cost: goalposts keep buildRideSlices within 2x of the build without them', () => {
    // TrackLayer.rebuild builds every ride on any track edit and every view turn (measured 2026-11-21, warm, ms per
    // build, without -> with: raised helix 0.55 -> 0.65, two mine helices 0.75 -> 0.97, same row 0.34 -> 0.42, over a
    // station, where no goalpost fits, 0.24 -> 0.47)
    const station = (() => {
      const w = makeTestWorld();
      place(w, 'steel_coaster', 20, 20, EAST);
      const id = place(w, 'steel_coaster', 4, 20, EAST);
      addAll(w, id, ['station', ...RAISE, ...Array<string>(16).fill('straight')]);
      return { w, id };
    })();
    const cases = [helixWorld(RAISE), helixWorld(['helix_right_up', 'straight'], 'mine_train'), (() => { const r = sameRow('steel_coaster'); return { w: r.w, id: r.b }; })(), station];
    const time = (on: boolean): number => {
      setGoalpostsForTest(on);
      const runs: number[] = [];
      for (let rep = 0; rep < 7; rep++) {
        const t = performance.now();
        for (let i = 0; i < 10; i++) for (const c of cases) buildRideSlices(c.w, c.id, f);
        runs.push(performance.now() - t);
      }
      setGoalpostsForTest(true);
      return runs.sort((p, q) => p - q)[3]!;
    };
    time(true);
    time(false);
    const off = time(false);
    const on = time(true);
    expect(on / off).toBeLessThan(2);
  });

  it('the goalposts depend only on the world: a copy built fresh after other rides gives the same ones', () => {
    const one = buildRideSlices(sameRow('steel_coaster').w, 2, f).map((sl) => [sl.key, sl.supports]);
    // build other rides first (caches warm, other order), then the same scene again in all four view turns and back
    const { w } = sameRow('mine_train');
    for (const r of [0, 1, 2, 3]) for (const id of [1, 2]) buildRideSlices(w, id, viewFrame(r, 64, 64));
    const two = buildRideSlices(sameRow('steel_coaster').w, 2, f).map((sl) => [sl.key, sl.supports]);
    expect(two).toEqual(one);
    // and the goalpost itself does not depend on the view turn
    const w3 = sameRow('steel_coaster').w;
    const g = (r: number) => buildRideSlices(w3, 2, viewFrame(r, 64, 64)).flatMap((sl) => sl.supports.filter((su) => su.goal));
    for (const r of [1, 2, 3]) expect(g(r)).toEqual(g(0));
  });

  it('realistic look: the saddle stands on the beam, the legs are columns from the ground into it, far leg first', () => {
    for (const rot of [0, 1, 2, 3]) {
      const fr = viewFrame(rot, 64, 64);
      const { w, id } = helixWorld(RAISE);
      const sl = buildRideSlices(w, id, fr).find((o) => o.supports.some((su) => su.goal))!;
      const su = sl.supports.find((o) => o.goal)!;
      const g = su.goal!;
      // the saddle alone, on the beam's top
      expect(realSupportPlacement(sl, fr, su)!.pieces.map((p) => [p.part, p.z])).toEqual([['top', g.z]]);
      const legs = realGoalLegPlacement(sl, fr, su);
      expect(legs).toHaveLength(2);
      expect(legs[0]!.pieces[0]!.ay).toBeLessThan(legs[1]!.pieces[0]!.ay);
      for (const l of legs) {
        expect(l.pieces[0]).toMatchObject({ part: 'foot', z: sl.ground });
        // segments (drawn 1.1 m tall) end inside the beam, under its top
        const last = l.pieces.at(-1)!;
        expect(last.part).toBe('seg');
        expect(last.z + 1.1).toBeLessThanOrEqual(g.z);
        expect(last.z + 1.1).toBeGreaterThan(g.z - 0.4);
      }
      // the beam's two halves meet under the saddle and make the whole
      const far = realGoalBeams(sl, su, fr, 'far')[0]!;
      const near = realGoalBeams(sl, su, fr, 'near')[0]!;
      const all = realGoalBeams(sl, su, fr)[0]!;
      expect(far.a + near.a).toBeCloseTo(all.a, 6);
      expect(far.h1).toBe(g.z);
    }
  });

  it('paint order: each leg is a drawable of its own tile in every view turn, the far one first there, the near one last', () => {
    const { w, b } = sameRow('steel_coaster');
    for (const rot of [0, 1, 2, 3]) {
      const fr = viewFrame(rot, 64, 64);
      const layer = new TrackLayer();
      const items: { ref: number; sub: number; depth: number; z: number }[] = [];
      layer.collect(w, { push: (_k, ref, sub, _ax, _ay, _s, depth, z) => items.push({ ref, sub, depth, z }) }, { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 }, 1, 1, 0, 0, 0, rot);
      const legs = items.filter((it) => it.sub === SUB_GOAL_LEG);
      const goals = buildRideSlices(w, b, fr).flatMap((sl) => sl.supports.filter((su) => su.goal));
      expect(goals.length).toBeGreaterThan(0);
      expect(legs).toHaveLength(goals.length * 2);
      for (const su of goals) {
        const g = su.goal!;
        const near0 = projectY(g.x0, g.y0, 0, fr) > projectY(g.x1, g.y1, 0, fr);
        for (const [x, y, near] of [[g.x0, g.y0, near0], [g.x1, g.y1, !near0]] as const) {
          const d = tileDepthView(Math.floor(x / 4), Math.floor(y / 4), fr);
          expect(legs.some((l) => l.depth === d && l.z === (near ? 255 : 0))).toBe(true);
        }
      }
    }
  });

  it('hanging coasters keep their arm supports: no goalposts (they hang from an arm beside the track)', () => {
    const { w, id } = helixWorld(RAISE, 'inverted_coaster');
    const slices = buildRideSlices(w, id, f);
    expect(slices.some((sl) => sl.supports.some((su) => su.goal))).toBe(false);
  });

  it('chooseGoalpost: legs beside the lower rail, the beam under the upper rail and over the lower cars', () => {
    // an upper straight 6 m up (rail line z 14 over ground 8), a lower piece's rail 0.2 m up exactly under it
    const s = pieceWorldSamples({ defId: 'straight', x: 0, y: 0, z: 14, dir: 0, chain: false, brakeSpeed: null, cost: 0 });
    const n = s.n;
    const lower = (z: number): SupportObstacles => ({ n, x: Float64Array.from(s.x), y: Float64Array.from(s.y), z: new Float64Array(n).fill(z), other: new Uint8Array(n).fill(1), index: new Int32Array(n).fill(-1), top: new Float64Array(n).fill(1.15) });
    const flat = (): number => 8;
    const k = (n - 1) >> 1;
    const g = chooseGoalpost(s, k, 8, lower(8.2), flat)!;
    expect(g).not.toBeNull();
    // square across the rail (it runs along x), each leg SUPPORT_CLEAR_GOOD (1.5 m) out, the beam 1.2 m under the rail
    expect(g.x0).toBeCloseTo(s.x[k]!, 6);
    expect(g.x1).toBeCloseTo(s.x[k]!, 6);
    expect(Math.abs(g.y0 - s.y[k]!)).toBeCloseTo(1.5, 6);
    expect(Math.abs(g.y1 - s.y[k]!)).toBeCloseTo(1.5, 6);
    expect(g.z).toBeCloseTo(14 - 1.2, 6);
    // the lower cars' riders reach 8.2 + 1.15 + 0.2 m: a rail 4.5 m up leaves the beam (bottom 12.2 − 0.6) no room
    const low = pieceWorldSamples({ defId: 'straight', x: 0, y: 0, z: 12.5, dir: 0, chain: false, brakeSpeed: null, cost: 0 });
    expect(chooseGoalpost(low, k, 8, lower(8.2), flat)).not.toBeNull();
    const lower2 = lower(8.2);
    lower2.z.fill(9.5);
    expect(chooseGoalpost(low, k, 8, lower2, flat)).toBeNull();
    // no track ground beside the rail: no legs
    expect(chooseGoalpost(s, k, 8, lower(8.2), () => NaN)).toBeNull();
    // lower rail 1.4 m to one side: that leg goes further out, the beam stays within GOAL_BEAM_MAX
    const side = lower(8.2);
    side.y = Float64Array.from(s.y, (v) => v - 1.4);
    const g2 = chooseGoalpost(s, k, 8, side, flat)!;
    expect(Math.hypot(g2.x1 - g2.x0, g2.y1 - g2.y0)).toBeLessThanOrEqual(GOAL_BEAM_MAX + 1e-9);
    for (const [x, y] of [[g2.x0, g2.y0], [g2.x1, g2.y1]]) expect(Math.abs(y! - (s.y[k]! - 1.4))).toBeGreaterThanOrEqual(1);
  });
});
