/** Water rating extras (Phase 4 §4.4): added to the Phase 2 result after its formula, with count limits. Owner: W3-C. */
import { describe, expect, it } from 'vitest';
import { getTrackPieceDef, getTrackTypeDef, type TrackPieceDef, type TrackTypeDef } from '../../../src/data/track';
import { WATER_RATING_EXTRAS } from '../../../src/data/tuning/track';
import { addWaterExtras, computeRatings, ratingInputsOf, waterRatingExtras } from '../../../src/sim/rides/track/ratings';

const defs = (counts: Record<string, number>): TrackPieceDef[] =>
  Object.entries(counts).flatMap(([id, n]) => Array.from({ length: n }, () => getTrackPieceDef(id) as TrackPieceDef));

describe('water rating extras (Phase 4 §4.4 table)', () => {
  it('each splashdown adds +0.40 excitement and +0.10 intensity, at most 3', () => {
    expect(waterRatingExtras(defs({ flume_splashdown: 1 }))).toEqual({ e: 40, i: 10, n: 0 });
    expect(waterRatingExtras(defs({ flume_splashdown: 3 }))).toEqual({ e: 120, i: 30, n: 0 });
    expect(waterRatingExtras(defs({ flume_splashdown: 5 }))).toEqual({ e: 120, i: 30, n: 0 });
  });

  it('each waterfall adds +0.30 excitement and +0.20 intensity, at most 3', () => {
    expect(waterRatingExtras(defs({ rapids_waterfall: 2 }))).toEqual({ e: 60, i: 40, n: 0 });
    expect(waterRatingExtras(defs({ rapids_waterfall: 4 }))).toEqual({ e: 90, i: 60, n: 0 });
  });

  it('each rough piece adds +0.10 intensity, at most 10', () => {
    expect(waterRatingExtras(defs({ rapids_rough: 7 }))).toEqual({ e: 0, i: 70, n: 0 });
    expect(waterRatingExtras(defs({ rapids_rough: 10 }))).toEqual({ e: 0, i: 100, n: 0 });
    expect(waterRatingExtras(defs({ rapids_rough: 14 }))).toEqual({ e: 0, i: 100, n: 0 });
  });

  it('each whirlpool adds +0.20 excitement and +0.50 nausea, at most 3', () => {
    expect(waterRatingExtras(defs({ rapids_whirlpool: 1 }))).toEqual({ e: 20, i: 0, n: 50 });
    expect(waterRatingExtras(defs({ rapids_whirlpool: 6 }))).toEqual({ e: 60, i: 0, n: 150 });
  });

  it('sources add up; other pieces add nothing; the table matches the tuning constants', () => {
    expect(waterRatingExtras(defs({ rapids_waterfall: 1, rapids_rough: 2, rapids_whirlpool: 1, rapids_straight: 9, rapids_station: 2 }))).toEqual({ e: 50, i: 40, n: 50 });
    expect(waterRatingExtras(defs({ straight: 4, brakes: 1, flume_drop: 3, flume_lift: 2 }))).toEqual({ e: 0, i: 0, n: 0 });
    expect(WATER_RATING_EXTRAS).toEqual({
      splashdown: { e: 40, i: 10, n: 0, max: 3 },
      waterfall: { e: 30, i: 20, n: 0, max: 3 },
      rough: { e: 0, i: 10, n: 0, max: 10 },
      whirlpool: { e: 20, i: 0, n: 50, max: 3 },
    });
  });

  it('extras land after the Phase 2 formula (soft cap, penalties, rounding) and clamp at 10.00', () => {
    const type = getTrackTypeDef('rapids_raft') as TrackTypeDef;
    const base = computeRatings(
      { vMax: 11, rideTime: 90, length: 160, drops: 1, dropMax: 6, posGMax: 1, vertGMin: 0.55, airtime: 0, latMax: 0.4, inversions: 0, turnPieces: 6, smallTurns: 4, spookyTunnels: 0, laps: 1 },
      type,
    );
    const out = addWaterExtras(base, { e: 50, i: 40, n: 50 });
    expect(out).toEqual({ ...base, excitement: base.excitement + 50, intensity: base.intensity + 40, nausea: base.nausea + 50 });
    expect(addWaterExtras({ excitement: 990, intensity: 1000, nausea: 0, penalty: false }, { e: 40, i: 10, n: 0 })).toEqual({ excitement: 1000, intensity: 1000, nausea: 0, penalty: false });
    expect(ratingInputsOf).toBeTypeOf('function');
  });
});
