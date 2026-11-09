import { describe, expect, it } from 'vitest';
import { getTrackTypeDef, type TrackTypeDef } from '../../../src/data/track';
import { TRACK_RATING_WARN } from '../../../src/data/strings/track';
import { computeRatings, ratingWarnings, type RatingInputs } from '../../../src/sim/rides/track/ratings';

const steel = getTrackTypeDef('steel_coaster') as TrackTypeDef;

/** Worked example: reference circuit R1 (phase-2 §4.10). */
const R1: RatingInputs = {
  vMax: 17.4,
  rideTime: 52.0,
  length: 204.4,
  drops: 1,
  dropMax: 16,
  posGMax: 2.24,
  vertGMin: 0.57,
  airtime: 0,
  latMax: 0.66,
  inversions: 0,
  turnPieces: 4,
  smallTurns: 0,
  spookyTunnels: 0,
  laps: 1,
};

describe('ratings (phase-2 §4.10)', () => {
  it('reproduces the worked example R1: 500 / 314 / 143', () => {
    const r = computeRatings(R1, steel);
    expect(r.excitement).toBe(500);
    expect(r.intensity).toBe(314);
    expect(r.nausea).toBe(143);
    expect(r.penalty).toBe(false);
  });

  it('soft-caps values above 6', () => {
    const big = { ...R1, vMax: 40, dropMax: 50, drops: 5, inversions: 3, airtime: 3, latMax: 2 };
    const raw = 0.08 * 40 + 0.04 * 50 + 0.3 * 5 + 0.6 * 3 + 0.6 * 3 + 0.25 * 2 + 1.5 + 1.0;
    expect(raw).toBeGreaterThan(6);
    const r = computeRatings(big, steel);
    expect(r.excitement).toBe(Math.round((6 + (raw - 6) * 0.5) * 100));
  });

  it('applies each penalty to excitement', () => {
    const base = computeRatings({ ...R1, posGMax: 5.0 }, steel);
    const pos = computeRatings({ ...R1, posGMax: 5.5 }, steel);
    expect(pos.penalty).toBe(true);
    // Intensity and nausea also rise with posGMax; excitement only drops by the penalty.
    expect(base.excitement - pos.excitement).toBe(Math.round(1.5 * 0.5 * 100));

    const neg = computeRatings({ ...R1, vertGMin: -2.0 }, steel);
    expect(neg.penalty).toBe(true);
    expect(computeRatings({ ...R1, vertGMin: -1.5 }, steel).excitement - neg.excitement).toBe(75);

    const lat0 = computeRatings({ ...R1, latMax: 2.5 }, steel);
    const lat = computeRatings({ ...R1, latMax: 3.0 }, steel);
    expect(lat.penalty).toBe(true);
    expect(lat0.excitement - lat.excitement).toBe(75);

    const short = computeRatings({ ...R1, rideTime: 10 }, steel);
    expect(short.penalty).toBe(true);
    const shortRaw = 0.08 * 17.4 + 0.04 * 16 + 0.3 + 0.165 + 10 / 30 + 1.0;
    expect(short.excitement).toBe(Math.round(shortRaw * 0.5 * 100));
  });

  it('clamps to 0.00–10.00', () => {
    const wild = computeRatings({ ...R1, posGMax: 12, latMax: 6, vMax: 60, inversions: 3, dropMax: 50, vertGMin: -3 }, steel);
    expect(wild.intensity).toBe(1000);
    expect(wild.excitement).toBe(0);
    expect(wild.nausea).toBeLessThanOrEqual(1000);
  });

  it('uses each type extra term', () => {
    const G0: RatingInputs = { ...R1, vMax: 5, rideTime: 60, drops: 0, dropMax: 0, latMax: 0.32, posGMax: 1.2, vertGMin: 0.8 };
    const rail = getTrackTypeDef('mini_railway') as TrackTypeDef;
    const a = computeRatings({ ...G0, length: 100 }, rail);
    const b = computeRatings({ ...G0, length: 250 }, rail);
    expect(b.excitement - a.excitement).toBe(50); // min(length / 100, 1.5): 1.0 → 1.5
    const ghost = getTrackTypeDef('ghost_train') as TrackTypeDef;
    expect(computeRatings({ ...G0, spookyTunnels: 6 }, ghost).excitement - computeRatings({ ...G0, spookyTunnels: 0 }, ghost).excitement).toBe(200);
    const mouse = getTrackTypeDef('spinning_mouse') as TrackTypeDef;
    expect(computeRatings({ ...G0, smallTurns: 4 }, mouse).excitement - computeRatings(G0, mouse).excitement).toBe(40);
    const karts = getTrackTypeDef('go_karts') as TrackTypeDef;
    expect(computeRatings({ ...G0, laps: 3 }, karts).excitement - computeRatings({ ...G0, laps: 1 }, karts).excitement).toBe(40);
  });

  it('warns about intense, nauseating, dull, and penalised rides', () => {
    expect(ratingWarnings({ excitement: 150, intensity: 801, nausea: 701, penalty: true })).toEqual([
      TRACK_RATING_WARN.veryIntense,
      TRACK_RATING_WARN.nauseating,
      TRACK_RATING_WARN.dull,
      TRACK_RATING_WARN.penalty,
    ]);
    expect(ratingWarnings({ excitement: 500, intensity: 800, nausea: 700, penalty: false })).toEqual([]);
  });
});
