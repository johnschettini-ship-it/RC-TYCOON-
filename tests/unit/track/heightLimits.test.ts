/** R2 (owner 2026-11-12): higher height limits (climb above the station) and the intensity step above the old limit. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/research/api', () => ({ isUnlocked: () => true }));

import { ALL_TRACK_TYPES, getTrackTypeDef, type TrackTypeDef } from '../../../src/data/track';
import { TRACK_ERR, fillTrackString } from '../../../src/data/strings/track';
import { getLayout } from '../../../src/sim/rides/track/layout';
import { checkPieceTiles, climbAboveStationM } from '../../../src/sim/rides/track/placement';
import { addWaterExtras, computeRatings, heightIntensityStep, ratingInputsOf, waterRatingExtras } from '../../../src/sim/rides/track/ratings';
import { runTestLap } from '../../../src/sim/rides/track/testRun';
import type { TrackPieceInstance } from '../../../src/sim/rides/track/types';
import type { World } from '../../../src/sim/types';
import { makeTestWorld } from '../../helpers/world';
import { addAll, buildR1, dataOf, EAST, place, RAIL_HILL_PIECES } from './helpers';

const LIMITS: Record<string, [number, number]> = {
  steel_coaster: [75, 50], inverted_coaster: [70, 45], wooden_coaster: [60, 40], bobsled_run: [35, 25],
  log_flume: [30, 20], spinning_mouse: [24, 16], junior_coaster: [20, 12], monorail: [24, 12],
  rapids_raft: [15, 10], mini_railway: [16, 8], ghost_train: [10, 6], go_karts: [6, 4],
};

const defsOf = (w: World, id: number) => getLayout(dataOf(w, id)).statics.map((st) => st.def);

describe('height limits and the intensity step (R2, owner 2026-11-12)', () => {
  it('every track ride has the 2026-11-12 height limit and keeps its old limit as the intensity height', () => {
    for (const [id, [max, old]] of Object.entries(LIMITS)) {
      expect([getTrackTypeDef(id)!.maxHeightM, getTrackTypeDef(id)!.intensityHeightM], id).toEqual([max, old]);
    }
    expect(ALL_TRACK_TYPES.map((t) => t.id).sort()).toEqual(Object.keys(LIMITS).sort());
  });

  it('a Junior Coaster piece may climb 20 m above the station, not 21 m', () => {
    // Station on flat ground (z 8); a `straight` checked with checkPieceTiles at z 28 and z 29 two tiles after the station.
    const w = makeTestWorld();
    const junior = getTrackTypeDef('junior_coaster') as TrackTypeDef;
    const id = place(w, 'junior_coaster', 10, 10, EAST);
    const own = dataOf(w, id).pieces;
    expect(own[0]!.z).toBe(8);
    const checkAt = (z: number) => {
      const piece: TrackPieceInstance = { defId: 'straight', x: 12, y: 10, z, dir: 0, chain: false, brakeSpeed: null, cost: 0 };
      return checkPieceTiles(w, id, own.length, piece, junior, own);
    };
    expect(checkAt(28).ok).toBe(true);
    expect(checkAt(29)).toEqual({ ok: false, reason: fillTrackString(TRACK_ERR.tooHigh, { n: 20 }) });
  });

  it('heightIntensityStep: 0 up to the old limit, 0.10 per metre above it, capped at 2.00', () => {
    const junior = getTrackTypeDef('junior_coaster')!;
    const steel = getTrackTypeDef('steel_coaster')!;
    expect([12, 13, 20].map((m) => heightIntensityStep(m, junior))).toEqual([0, 10, 80]);
    // Whole metres above the old limit (review M-5): 0.9 m over counts nothing, 1.5 m over counts one metre.
    expect([12.9, 13.5].map((m) => heightIntensityStep(m, junior))).toEqual([0, 10]);
    expect([50, 70, 75].map((m) => heightIntensityStep(m, steel))).toEqual([0, 200, 200]);
  });

  it('climbAboveStationM is 0 without a station piece', () => {
    expect(climbAboveStationM([])).toBe(0);
  });

  it('the test lap adds the step after the formula and the water extras', () => {
    // RAIL_HILL_PIECES: a closed Mini Railway circuit that climbs 10 m above its station (2 m over the old 8 m).
    const w = makeTestWorld();
    const rail = getTrackTypeDef('mini_railway') as TrackTypeDef;
    const id = place(w, 'mini_railway', 10, 10, EAST);
    addAll(w, id, RAIL_HILL_PIECES);
    const r = runTestLap(w.state.map, dataOf(w, id), rail);
    expect(r.passed).toBe(true);
    const base = addWaterExtras(computeRatings(ratingInputsOf(r), rail), waterRatingExtras(defsOf(w, id))).intensity;
    expect(climbAboveStationM(dataOf(w, id).pieces)).toBe(10);
    expect(r.intensity).toBe(Math.min(1000, base + 20));
  });

  it('R1 (16 m on a 50 m-old-limit coaster) gets no step', () => {
    const w = makeTestWorld();
    const steel = getTrackTypeDef('steel_coaster') as TrackTypeDef;
    const id = buildR1(w);
    const r = runTestLap(w.state.map, dataOf(w, id), steel);
    expect(climbAboveStationM(dataOf(w, id).pieces)).toBe(16);
    const base = addWaterExtras(computeRatings(ratingInputsOf(r), steel), waterRatingExtras(defsOf(w, id))).intensity;
    expect(r.intensity).toBe(base);
  });
});
