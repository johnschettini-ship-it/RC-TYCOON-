/** Water ride physics (Phase 4 §4.4): current, conveyor, splash brake, whirlpool, rough water, stalls. Owner: W3-C. */
import { describe, expect, it } from 'vitest';
import { getTrackTypeDef, type TrackTypeDef } from '../../../src/data/track';
import {
  DT,
  FLUME_K,
  FLUME_V_CURRENT,
  G,
  RAPIDS_V_CURRENT,
  ROUGH_AMPLITUDE,
  SPLASH_MAX_V,
  V_LIFT,
  V_STATION_CONVEYOR,
  WHIRLPOOL_MAX_V,
} from '../../../src/data/tuning/track';
import { pieceExitJoint } from '../../../src/sim/rides/track/geometry';
import { buildLayout, pieceIndexAt } from '../../../src/sim/rides/track/layout';
import { newTrain, stepTrain, stopCentreMm, type StepContext } from '../../../src/sim/rides/track/physics';
import { runTestLap } from '../../../src/sim/rides/track/testRun';
import type { TrackPieceInstance, TrackRideData, TrainState } from '../../../src/sim/rides/track/types';
import { makeTestWorld } from '../../helpers/world';

/** Lay pieces end to end from (10, 10), heading +x, z 8 (no world checks). */
function lay(ids: string[]): TrackPieceInstance[] {
  const out: TrackPieceInstance[] = [];
  let x = 10;
  let y = 10;
  let z = 8;
  let dir: 0 | 1 | 2 | 3 = 0;
  for (const id of ids) {
    const piece: TrackPieceInstance = { defId: id, x, y, z, dir, chain: false, brakeSpeed: null, cost: 0 };
    out.push(piece);
    const j = pieceExitJoint(piece);
    x = j.x;
    y = j.y;
    z = j.z;
    dir = j.dir;
  }
  return out;
}

const flume = getTrackTypeDef('log_flume') as TrackTypeDef;
const rapids = getTrackTypeDef('rapids_raft') as TrackTypeDef;

function ctxFor(pieces: TrackPieceInstance[], type: TrackTypeDef): StepContext {
  const layout = buildLayout(pieces);
  return { layout, type, pieces, trainLenMm: type.vehicle.carLengthMm, cars: 1, carLenMm: type.vehicle.carLengthMm, laps: 1000, holdFrontMm: null, leader: null, slowFactor: 1 };
}

/** A boat running from the station stop point. */
function boat(ctx: StepContext): TrainState {
  const t = newTrain(1, stopCentreMm(ctx.layout, ctx.trainLenMm), 1, ctx.type.vehicle.seatsPerCar);
  t.state = 'running';
  return t;
}

/**
 * Step until the centre is past `endMm` (circuit position). After every step, `each` gets the new speed and the piece
 * the centre was on during that step (the piece whose drive set the speed).
 */
function runTo(ctx: StepContext, t: TrainState, endMm: number, each: (t: TrainState, pieceIndex: number) => void = () => {}): void {
  for (let i = 0; i < 20_000; i++) {
    const on = pieceIndexAt(ctx.layout, t.s);
    const r = stepTrain(ctx, t);
    if (r.stall) throw new Error(`stalled on piece ${r.pieceIndex + 1}`);
    each(t, on);
    if (t.dist >= endMm - stopCentreMm(ctx.layout, ctx.trainLenMm)) return;
  }
  throw new Error('did not get there');
}

describe('water current (a = −g·sinθ − k·(v − vCurrent))', () => {
  it('pulls the boat toward the current speed on a flat channel', () => {
    const pieces = lay(['flume_station', ...Array(8).fill('flume_straight')]);
    const ctx = ctxFor(pieces, flume);
    const t = boat(ctx);
    t.s = 8000;
    t.dist = 6000;
    t.v = 1000;
    stepTrain(ctx, t);
    const expected = 1 + FLUME_K * (FLUME_V_CURRENT - 1) * DT;
    expect(t.v).toBe(Math.round(expected * 1000));
    // A fast boat slows toward the current, never below it.
    t.v = 5000;
    let prev = t.v;
    for (let i = 0; i < 200; i++) {
      stepTrain(ctx, t);
      expect(t.v).toBeLessThanOrEqual(prev);
      expect(t.v).toBeGreaterThanOrEqual(FLUME_V_CURRENT * 1000);
      prev = t.v;
    }
  });

  it('adds gravity on a slope down (current + gravity)', () => {
    const pieces = lay(['rapids_station', 'rapids_straight', 'rapids_slope_down', 'rapids_slope_down', 'rapids_straight', 'rapids_straight']);
    const ctx = ctxFor(pieces, rapids);
    const t = boat(ctx);
    let maxOnSlope = 0;
    runTo(ctx, t, ctx.layout.startMm[4] as number, (tr, pi) => {
      if (pi === 2 || pi === 3) maxOnSlope = Math.max(maxOnSlope, tr.v);
    });
    expect(maxOnSlope).toBeGreaterThan(RAPIDS_V_CURRENT * 1000 + 500);
  });
});

describe('conveyors (v = vLift, gravity ignored)', () => {
  it('runs the station at exactly 1.5 m/s and the lift at exactly 2.0 m/s', () => {
    const pieces = lay(['flume_station', 'flume_station', 'flume_lift', 'flume_lift', 'flume_lift', 'flume_straight', 'flume_straight']);
    const ctx = ctxFor(pieces, flume);
    const t = boat(ctx);
    let liftTicks = 0;
    let stationTicks = 0;
    runTo(ctx, t, ctx.layout.startMm[5] as number, (tr, pi) => {
      if (pi >= 2 && pi <= 4) {
        liftTicks++;
        expect(tr.v).toBe(V_LIFT * 1000);
      } else if (pi <= 1) {
        stationTicks++;
        expect(tr.v).toBe(V_STATION_CONVEYOR * 1000);
      }
    });
    expect(liftTicks).toBeGreaterThan(100);
    expect(stationTicks).toBeGreaterThan(0);
  });
});

describe('splash brake and whirlpool', () => {
  it('a splashdown caps the speed at 4 m/s by its end, after a 6 m drop and after an 18 m drop', () => {
    for (const drops of [1, 3]) {
      const pieces = lay([
        'flume_station',
        ...Array(3 * drops).fill('flume_lift'),
        'flume_straight',
        ...Array(drops).fill('flume_drop'),
        'flume_splashdown',
        'flume_straight',
        'flume_straight',
      ]);
      const ctx = ctxFor(pieces, flume);
      const t = boat(ctx);
      const splash = 2 + 3 * drops + drops - 1 + 1;
      let peak = 0;
      let atEnd = -1;
      runTo(ctx, t, (ctx.layout.startMm[splash + 1] as number) + 100, (tr, pi) => {
        if (pi < splash) peak = Math.max(peak, tr.v);
        if (pi === splash) atEnd = tr.v;
      });
      expect(peak).toBeGreaterThan(SPLASH_MAX_V * 1000 + 3000);
      expect(atEnd).toBeGreaterThan(0);
      expect(atEnd).toBeLessThanOrEqual(SPLASH_MAX_V * 1000);
    }
  });

  it('the splash brake slows at 12 m/s² when that is enough', () => {
    const pieces = lay(['flume_station', 'flume_straight', 'flume_splashdown', 'flume_straight']);
    const ctx = ctxFor(pieces, flume);
    const t = boat(ctx);
    t.s = (ctx.layout.startMm[2] as number) + 1000;
    t.dist = 50_000;
    t.v = 6000;
    stepTrain(ctx, t);
    expect(t.v).toBe(6000 - 12 * DT * 1000);
  });

  it('a whirlpool caps the speed at 2 m/s', () => {
    const pieces = lay(['rapids_station', ...Array(4).fill('rapids_straight'), 'rapids_whirlpool', 'rapids_whirlpool', 'rapids_straight', 'rapids_straight']);
    const ctx = ctxFor(pieces, rapids);
    const t = boat(ctx);
    let before = 0;
    let onPool = 0;
    let after = 0;
    runTo(ctx, t, ctx.layout.startMm[9] as number, (tr, pi) => {
      if (pi === 4) before = Math.max(before, tr.v);
      if (pi === 5 || pi === 6) {
        onPool++;
        expect(tr.v).toBeLessThanOrEqual(WHIRLPOOL_MAX_V * 1000);
      }
      if (pi === 8) after = Math.max(after, tr.v);
    });
    expect(before).toBeGreaterThan(WHIRLPOOL_MAX_V * 1000 + 500);
    expect(onPool).toBeGreaterThan(50);
    expect(after).toBeGreaterThan(WHIRLPOOL_MAX_V * 1000);
  });
});

describe('gravity drops and rough water', () => {
  it('a 6 m drop gives v² = v0² + 2·g·h minus channel friction (within 3%)', () => {
    const pieces = lay(['flume_station', 'flume_lift', 'flume_lift', 'flume_lift', 'flume_straight', 'flume_drop', 'flume_straight', 'flume_straight']);
    const ctx = ctxFor(pieces, flume);
    const t = boat(ctx);
    let v0 = 0;
    let v1 = 0;
    runTo(ctx, t, (ctx.layout.startMm[6] as number) + 50, (tr, pi) => {
      if (pi === 4) v0 = tr.v / 1000;
      if (pi === 5) v1 = tr.v / 1000;
    });
    const ideal = Math.sqrt(v0 * v0 + 2 * G * 6);
    expect(v1).toBeLessThan(ideal);
    expect(v1).toBeGreaterThan(ideal * 0.97);
  });

  it('rough water varies the speed as a fixed function of the position, the same on every run', () => {
    const pieces = lay(['rapids_station', ...Array(3).fill('rapids_straight'), ...Array(4).fill('rapids_rough'), 'rapids_straight', 'rapids_straight']);
    const profile = (): number[] => {
      const ctx = ctxFor(pieces, rapids);
      const t = boat(ctx);
      const out: number[] = [];
      runTo(ctx, t, ctx.layout.startMm[9] as number, (tr, pi) => {
        if (pi >= 4 && pi <= 7) out.push(tr.v);
      });
      return out;
    };
    const a = profile();
    expect(a).toEqual(profile());
    const lo = Math.min(...a);
    const hi = Math.max(...a);
    // The current swings by ± ROUGH_AMPLITUDE around 3 m/s; the boat follows part of the swing.
    expect(hi - lo).toBeGreaterThan(200);
    expect(hi).toBeLessThan(RAPIDS_V_CURRENT * (1 + ROUGH_AMPLITUDE) * 1000);
  });
});

describe('stalls (a boat at v ≤ 0 outside a conveyor fails the test run)', () => {
  function data(pieces: TrackPieceInstance[], typeId: string): TrackRideData {
    return {
      rideId: 1,
      typeId,
      pieces,
      circuitClosed: true,
      trainConfig: { trains: 1, carsPerTrain: 1 },
      operation: { minDwellTicks: 60, maxDwellTicks: 300, laps: 1 },
      trains: [],
      test: null,
      colours: { track: 0, supports: 0, cars: 0 },
      openedOnce: false,
      testRun: null,
      lastDispatchTick: -1,
      bestLapTicks: null,
    };
  }

  // A closed loop from (10, 10): station, a hump, back down, small turns and straights home.
  const loop = (hump: string[]): string[] => [
    'flume_station',
    ...hump,
    'flume_turn_small_r',
    'flume_turn_small_r',
    ...Array(hump.length + 1).fill('flume_straight'),
    'flume_turn_small_r',
    'flume_turn_small_r',
  ];

  it('a channel that climbs without a conveyor stops the boat and fails on that piece', () => {
    const w = makeTestWorld();
    // Rail transition pieces have no conveyor: the current cannot push the boat up 1 m.
    const pieces = lay(loop(['flat_to_gentle_up', 'gentle_up_to_flat', 'flume_slope_down']));
    const ctx = ctxFor(pieces, flume);
    const t = boat(ctx);
    let stall: string | null = null;
    let at = -1;
    for (let i = 0; i < 2000 && !stall; i++) {
      const r = stepTrain(ctx, t);
      stall = r.stall;
      at = r.pieceIndex;
    }
    expect(stall).toBe('stop');
    expect([1, 2]).toContain(at);
    const res = runTestLap(w.state.map, data(pieces, 'log_flume'), flume);
    expect(res.passed).toBe(false);
    expect(res.failKind).toBe('stop');
    expect([2, 3]).toContain(res.failPiece);
  });

  it('the same hump with a conveyor lift passes', () => {
    const w = makeTestWorld();
    const pieces = lay(loop(['flume_lift', 'flume_slope_down']));
    const last = pieces[pieces.length - 1]!;
    expect(pieceExitJoint(last)).toMatchObject({ x: 10, y: 10, z: 8, dir: 0 });
    const res = runTestLap(w.state.map, data(pieces, 'log_flume'), flume);
    expect(res.passed).toBe(true);
    expect(pieceIndexAt(buildLayout(pieces), 0)).toBe(0);
  });
});
