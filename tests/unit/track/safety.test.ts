/**
 * R7 (owner 2026-11-12): hard safety limits at test and open time, with the place on the map (plan ride-work-1 Task 3).
 * Owner change: safety uses the strongest car. Review I-2 (controller 2026-11-12): each car's own 5-tick moving average,
 * then the largest over the cars.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/research/api', () => ({ isUnlocked: () => true }));

import { getTrackTypeDef, type TrackTypeDef } from '../../../src/data/track';
import { G_AVERAGE_TICKS } from '../../../src/data/tuning/track';
import { SAFETY_LIMIT } from '../../../src/data/tuning/track';
import { TRACK_ERR, fillTrackString } from '../../../src/data/strings/track';
import { executeCommand } from '../../../src/sim/commands';
import { inBounds, tileIndex } from '../../../src/sim/map';
import { canOpenTrackRide, trackTroublePlace, trackWarnings } from '../../../src/sim/rides/track/api';
import { pieceWorldTiles } from '../../../src/sim/rides/track/geometry';
import { getLayout } from '../../../src/sim/rides/track/layout';
import { carOffsetMm, stepTrain, trainGAt, type StepContext } from '../../../src/sim/rides/track/physics';
import { formatSafetyG, meterLevel, safetyBreachOf } from '../../../src/sim/rides/track/safety';
import { dispatchedTestTrain, runTestLap, runTestLapDetailed, trainLengthMm } from '../../../src/sim/rides/track/testRun';
import type { TrackRideData } from '../../../src/sim/rides/track/types';
import { updateTrackRides } from '../../../src/sim/rides/track/update';
import type { SimEvent } from '../../../src/sim/types';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, stateHash } from '../../helpers/world';
import {
  addAll,
  buildR1,
  dataOf,
  EAST,
  expectOk,
  NEAR_LIMIT_DROP_PIECES,
  place,
  R1_PIECES,
  rideOf,
  SHARP_TURN_PIECES,
  UNSAFE_DROP_PIECES,
  type PieceSpec,
} from './helpers';

const steel = getTrackTypeDef('steel_coaster') as TrackTypeDef;

function build(pieces: PieceSpec[]): { w: World; id: number; d: TrackRideData } {
  const w = makeTestWorld();
  const id = place(w, 'steel_coaster', 4, 2, EAST);
  addAll(w, id, pieces);
  return { w, id, d: dataOf(w, id) };
}

/** Run the live test to its end (the result is published when the lap ends). */
function publishTest(w: World, id: number): void {
  expectOk(executeCommand(w, { type: 'startTestRun', rideId: id }));
  const n = (dataOf(w, id).testRun?.ticksLeft ?? 0) + 1;
  for (let i = 0; i < n; i++) {
    updateTrackRides(w);
    w.state.tick++;
  }
  expect(rideOf(w, id).status).toBe('closed');
}

function placeGates(w: World, id: number): void {
  const ride = rideOf(w, id);
  ride.entrance = { gate: 0, outside: 0 };
  ride.exit = { gate: 1, outside: 1 };
}

function lastMessage(w: World): Extract<SimEvent, { type: 'message' }> {
  const ms = w.events.filter((e): e is Extract<SimEvent, { type: 'message' }> => e.type === 'message');
  const m = ms[ms.length - 1];
  if (!m) throw new Error('no message');
  return m;
}

function firstTile(w: World, d: TrackRideData, pieceIndex: number): number {
  const map = w.state.map;
  const t = pieceWorldTiles(d.pieces[pieceIndex]!).find((q) => inBounds(map, q.x, q.y))!;
  return tileIndex(map, t.x, t.y);
}

/**
 * Reference for review I-2, written out step by step: the test lap's train, each car's G sampled on its own
 * (`trainGAt` with one car at the car's offset), each car's own 5-tick window (the test lap's window: no station
 * ticks), then the largest over the cars. Also the other definition (a window of the per-tick strongest car), which
 * the controller rejected.
 */
function referenceWorst(d: TrackRideData): { perCar: number; perTick: number } {
  const layout = getLayout(d);
  const cars = d.trainConfig.carsPerTrain;
  const len = steel.vehicle.carLengthMm;
  const t = dispatchedTestTrain(layout, steel, cars);
  const ctx: StepContext = {
    layout, type: steel, pieces: d.pieces, trainLenMm: trainLengthMm(steel, cars), cars, carLenMm: len, laps: 1,
    holdFrontMm: null, leader: null, slowFactor: 1,
  };
  const wins: number[][] = Array.from({ length: cars }, () => []);
  const tickWin: number[] = [];
  let perCar = -Infinity;
  let perTick = -Infinity;
  for (let i = 0; i < 10_000; i++) {
    const r = stepTrain(ctx, t);
    if (r.stall) throw new Error('stall');
    if (layout.statics[r.pieceIndex]?.def.special !== 'station') {
      let tickMax = -Infinity;
      for (let k = 0; k < cars; k++) {
        const g = trainGAt(layout, t.s + carOffsetMm(k, cars, len), t.v / 1000, 1, len).gv;
        const win = wins[k]!;
        win.push(g);
        if (win.length > G_AVERAGE_TICKS) win.shift();
        perCar = Math.max(perCar, win.reduce((a, b) => a + b, 0) / win.length);
        tickMax = Math.max(tickMax, g);
      }
      tickWin.push(tickMax);
      if (tickWin.length > G_AVERAGE_TICKS) tickWin.shift();
      perTick = Math.max(perTick, tickWin.reduce((a, b) => a + b, 0) / tickWin.length);
    }
    if (r.arrived) break;
  }
  return { perCar: Math.round(perCar * 100), perTick: Math.round(perTick * 100) };
}

describe('hard safety limits (R7, owner 2026-11-12)', () => {
  it('the limits are the owner values', () => {
    expect(SAFETY_LIMIT).toEqual({ posGMax: 6.0, vertGMin: -2.0, latMax: 3.0 });
  });

  it('safetyBreachOf allows exactly the limit and refuses 0.01 G past it', () => {
    expect(safetyBreachOf({ posGMax: 600, vertGMin: -200, latMax: 300 })).toBeNull();
    expect(safetyBreachOf({ posGMax: 601, vertGMin: 100, latMax: 0 })).toEqual({ kind: 'posG', value: 601 });
    expect(safetyBreachOf({ posGMax: 100, vertGMin: -201, latMax: 0 })).toEqual({ kind: 'negG', value: -201 });
    expect(safetyBreachOf({ posGMax: 100, vertGMin: 100, latMax: 301 })).toEqual({ kind: 'lat', value: 301 });
    expect(safetyBreachOf({ posGMax: 700, vertGMin: -300, latMax: 400 })?.kind).toBe('posG');
  });

  it('meterLevel: ok, warn from 0.5 G before the penalty limit to the hard limit, over past it', () => {
    expect([449, 450, 600, 601].map((h) => meterLevel('posG', h))).toEqual(['ok', 'warn', 'warn', 'over']);
    expect([-99, -100, -200, -201].map((h) => meterLevel('negG', h))).toEqual(['ok', 'warn', 'warn', 'over']);
    expect([199, 200, 300, 301].map((h) => meterLevel('lat', h))).toEqual(['ok', 'warn', 'warn', 'over']);
  });

  it('formatSafetyG: one decimal and a Unicode minus', () => {
    expect([640, -230, 600, 0, 1234].map(formatSafetyG)).toEqual(['6.4', '−2.3', '6.0', '0.0', '12.3']);
  });

  it('a passed test whose strongest car passes 6.0 G blocks opening and names the value and the piece', () => {
    const { w, id, d } = build(UNSAFE_DROP_PIECES);
    const { result, troublePiece, troubleKind, worst } = runTestLapDetailed(w.state.map, d, steel);
    expect(result.passed).toBe(true);
    // Owner change: the train's average stays within the limit (ratings); its strongest car does not (safety).
    expect(result.posGMax).toBeLessThanOrEqual(600);
    expect(worst.posGMax).toBeGreaterThan(600); // precondition: the circuit is unsafe
    expect(troubleKind).toBe('posG');
    const reason = fillTrackString(TRACK_ERR.unsafePosG, { g: formatSafetyG(worst.posGMax), n: troublePiece! + 1, limit: '6.0' });
    publishTest(w, id);
    // The test message is the unsafe one and points at the trouble piece.
    const m = lastMessage(w);
    expect(m.textId).toBe('track.testUnsafe');
    expect(m.params).toEqual({ text: reason });
    expect(m.tile).toBe(firstTile(w, d, troublePiece!));
    expect(trackTroublePlace(w, id)).toEqual({ pieceIndex: troublePiece, kind: 'posG', tile: firstTile(w, d, troublePiece!), value: worst.posGMax });
    placeGates(w, id);
    expect(canOpenTrackRide(w, rideOf(w, id))).toBe(reason);
    expect(trackWarnings(w, id)[0]).toBe(canOpenTrackRide(w, rideOf(w, id)));
    expect(executeCommand(w, { type: 'setRideOpen', rideId: id, open: true })).toMatchObject({ ok: false, reason });
  });

  it('a long train whose rear cars take a small turn hard: sideways limit by the strongest car, not the average', () => {
    const { w, id, d } = build(SHARP_TURN_PIECES);
    const det = runTestLapDetailed(w.state.map, d, steel);
    expect(det.result.passed).toBe(true);
    expect(det.result.latMax).toBeLessThanOrEqual(300);
    expect(det.worst.latMax).toBeGreaterThan(300);
    expect(det.troubleKind).toBe('lat');
    publishTest(w, id);
    placeGates(w, id);
    expect(canOpenTrackRide(w, rideOf(w, id))).toBe(
      fillTrackString(TRACK_ERR.unsafeLat, { g: formatSafetyG(det.worst.latMax), n: det.troublePiece! + 1, limit: '3.0' }),
    );
  });

  it('the strongest car is each car’s own 5-tick window, then the largest over the cars (review I-2)', () => {
    const { w, id, d } = build(NEAR_LIMIT_DROP_PIECES);
    const ref = referenceWorst(d);
    // The two definitions differ across the limit on this circuit: the rejected one would refuse it.
    expect(ref.perCar).toBeLessThanOrEqual(600);
    expect(ref.perTick).toBeGreaterThan(600);
    const det = runTestLapDetailed(w.state.map, d, steel);
    expect(det.worst.posGMax).toBe(ref.perCar);
    expect(det.troubleKind).toBeNull();
    publishTest(w, id);
    placeGates(w, id);
    expect(trackTroublePlace(w, id)).toBeNull();
    expect(canOpenTrackRide(w, rideOf(w, id))).toBeNull();
  });

  it('runTestLap equals runTestLapDetailed(...).result and both are pure', () => {
    const { w, d } = build(UNSAFE_DROP_PIECES);
    const h0 = stateHash(w);
    const a = runTestLap(w.state.map, d, steel);
    const b = runTestLapDetailed(w.state.map, d, steel);
    expect(b.result).toEqual(a);
    expect(runTestLapDetailed(w.state.map, d, steel)).toEqual(b);
    expect(stateHash(w)).toBe(h0);
  });

  it('the trouble place of a stall is the stall piece, and the failure message points at its tile', () => {
    // R1 with the lift unchained: the test fails on piece 4.
    const { w, id, d } = build(R1_PIECES.map((p) => (typeof p === 'string' ? p : p.id === 'brakes' ? p : p.id)));
    const det = runTestLapDetailed(w.state.map, d, steel);
    expect([det.troublePiece, det.troubleKind]).toEqual([3, 'stall']);
    publishTest(w, id);
    expect(trackTroublePlace(w, id)).toEqual({ pieceIndex: 3, kind: 'stall', tile: firstTile(w, d, 3), value: null });
    expect(lastMessage(w).textId).toBe('track.testFailedStop');
    expect(lastMessage(w).tile).toBe(trackTroublePlace(w, id)!.tile);
    // The same object until the test changes (cached by the stored result).
    expect(trackTroublePlace(w, id)).toBe(trackTroublePlace(w, id));
  });

  it('an open ride is not closed by the safety rule; reopening checks the stored test', () => {
    const { w, id } = build(UNSAFE_DROP_PIECES);
    publishTest(w, id);
    placeGates(w, id);
    const ride = rideOf(w, id);
    ride.status = 'open'; // opened before the rule (an older park)
    for (let i = 0; i < 200; i++) {
      updateTrackRides(w);
      w.state.tick++;
    }
    expect(ride.status).toBe('open');
    ride.status = 'closed';
    expect(canOpenTrackRide(w, ride)).toMatch(/^Too strong for riders: \d+\.\d G on piece \d+ \(limit 6\.0 G\)$/);
  });

  it('a passed test within the limits has no trouble place and opens as before', () => {
    const w = makeTestWorld();
    const id = buildR1(w);
    publishTest(w, id);
    placeGates(w, id);
    expect(lastMessage(w).textId).toBe('track.testPassed');
    expect(trackTroublePlace(w, id)).toBeNull();
    expect(canOpenTrackRide(w, rideOf(w, id))).toBeNull();
    expect(runTestLapDetailed(w.state.map, dataOf(w, id), steel).troublePiece).toBeNull();
  });
});
