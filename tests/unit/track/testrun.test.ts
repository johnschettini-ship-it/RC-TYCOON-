import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/research/api', () => ({ isUnlocked: () => true }));

import { executeCommand } from '../../../src/sim/commands';
import { getTrackTypeDef, type TrackTypeDef } from '../../../src/data/track';
import { canOpenTrackRide, trackWarnings, trackIsTall } from '../../../src/sim/rides/track/api';
import { getLayout } from '../../../src/sim/rides/track/layout';
import { stopCentreMm } from '../../../src/sim/rides/track/physics';
import { runTestLap } from '../../../src/sim/rides/track/testRun';
import { updateTrackRides } from '../../../src/sim/rides/track/update';
import { TRACK_ERR } from '../../../src/data/strings/track';
import { makeTestWorld } from '../../helpers/world';
import { addAll, buildR1, dataOf, EAST, expectOk, place, R1_PIECES, rideOf, type PieceSpec } from './helpers';
import type { World } from '../../../src/sim/types';

const steel = getTrackTypeDef('steel_coaster') as TrackTypeDef;

function tickRides(w: World, n: number): void {
  for (let i = 0; i < n; i++) {
    updateTrackRides(w);
    w.state.tick++;
  }
}

describe('test run (phase-2 §4.9)', () => {
  it('R1 passes with measured values close to the worked example', () => {
    const w = makeTestWorld();
    const id = buildR1(w);
    const r = runTestLap(w.state.map, dataOf(w, id), steel);
    expect(r.passed).toBe(true);
    expect(r.lengthMm).toBe(204_374);
    // R6 (owner 2026-11-12): forces averaged over 4 cars (17.41 → 17.35 m/s with the review I-1 chain rule).
    expect(r.vMaxMms / 1000).toBeCloseTo(17.3, 1);
    expect(r.drops).toBe(1);
    expect(r.dropMaxMm).toBe(16_000);
    // R6 (owner 2026-11-12): forces averaged over 4 cars; the valley peak is shared by the train (2.25 → 1.99 G), the
    // chain pulls until the last car leaves the lift (controller decision 2026-11-12), and the station departure keeps
    // control of the train while its centre is in the station (review I-1).
    expect(r.posGMax / 100).toBeCloseTo(1.99, 2);
    // R6 (owner 2026-11-12): forces averaged over 4 cars (0.65 → 0.63).
    expect(r.latMax / 100).toBeCloseTo(0.63, 2);
    expect(r.airtimeTicks).toBe(0);
    expect(r.inversions).toBe(0);
    expect(r.turnPieces).toBe(4);
    expect(r.highestM).toBe(16);
    expect(r.rideTimeTicks / 20).toBeGreaterThan(45);
    expect(r.rideTimeTicks / 20).toBeLessThan(60);
    // Worked example: 5.00 / 3.14 / 1.43. The spec's vertGMin 0.57 cannot occur on R1 under §4.9
    // (steep_down alone gives cos 56.31° = 0.555 and the gentle-to-steep crest at ~10 m/s goes lower),
    // so intensity sits about 0.3 above the example. See the W1-G report.
    expect(Math.abs(r.excitement - 500)).toBeLessThanOrEqual(30);
    expect(Math.abs(r.nausea - 143)).toBeLessThanOrEqual(30);
    expect(Math.abs(r.intensity - 314)).toBeLessThanOrEqual(35);
    expect(r.chart.speedCms.length).toBe(Math.floor(r.ticks / 10));
  });

  it('runs identically twice (same TestResult)', () => {
    const a = makeTestWorld();
    const b = makeTestWorld();
    const ia = buildR1(a);
    const ib = buildR1(b);
    expect(runTestLap(a.state.map, dataOf(a, ia), steel)).toEqual(runTestLap(b.state.map, dataOf(b, ib), steel));
  });

  it('a lift without a chain fails: "Test failed: train stops on piece 4 (Flat to gentle up)"', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 4, 2, EAST);
    const noChain: PieceSpec[] = R1_PIECES.map((p) => (typeof p === 'string' ? p : p.id === 'brakes' ? p : p.id));
    addAll(w, id, noChain);
    expectOk(executeCommand(w, { type: 'startTestRun', rideId: id }));
    const ride = rideOf(w, id);
    expect(ride.status).toBe('testing');
    const run = dataOf(w, id).testRun;
    expect(run?.result.passed).toBe(false);
    expect(run?.result.failKind).toBe('stop');
    tickRides(w, (run?.ticksLeft ?? 0) + 1);
    expect(ride.status).toBe('closed');
    expect(ride.stats).toBeNull();
    expect(trackWarnings(w, id)).toEqual(['Test failed: train stops on piece 4 (Flat to gentle up)']);
    expect(canOpenTrackRide(w, ride)).toBe(TRACK_ERR.needGates);
    ride.entrance = { gate: 0, outside: 0 };
    ride.exit = { gate: 1, outside: 1 };
    expect(canOpenTrackRide(w, ride)).toBe(TRACK_ERR.runTestFirst);
    const ev = w.events.find((e) => e.type === 'message' && e.textId === 'track.testFailedStop');
    expect(ev).toBeDefined();
  });

  it('a loop after a 6 m drop fails with the loop message', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 4, 20, EAST);
    const c = (s: string): PieceSpec => ({ id: s, chain: true });
    addAll(w, id, ['station', 'station', c('flat_to_gentle_up'), c('gentle_up'), c('gentle_up'), c('gentle_up_to_flat'), 'flat_to_gentle_down', 'gentle_down', 'gentle_down', 'gentle_down_to_flat', 'vertical_loop_right', 'straight', 'straight']);
    const d = dataOf(w, id);
    const r = runTestLap(w.state.map, d, steel);
    expect(r.passed).toBe(false);
    expect(r.failKind).toBe('loop');
    expect(r.failPiece).toBe(12);
    d.test = r;
    expect(trackWarnings(w, id)).toEqual(['Test failed: train is too slow for the loop on piece 12']);
  });

  it('a loop after a 16 m drop gets over the top only with enough speed (negative G at the top fails)', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 4, 20, EAST);
    const c = (s: string): PieceSpec => ({ id: s, chain: true });
    addAll(w, id, ['station', 'station', c('flat_to_gentle_up'), c('gentle_to_steep_up'), c('steep_up'), c('steep_to_gentle_up'), c('gentle_up_to_flat'), 'flat_to_gentle_down', 'gentle_to_steep_down', 'steep_down', 'steep_to_gentle_down', 'gentle_down_to_flat', 'vertical_loop_right', 'straight']);
    const r = runTestLap(w.state.map, dataOf(w, id), steel);
    expect(r.passed).toBe(false);
    expect(r.failKind).toBe('loop');
  });

  it('the live test runs in game time, then publishes the result and the ratings', () => {
    const w = makeTestWorld();
    const id = buildR1(w);
    expectOk(executeCommand(w, { type: 'startTestRun', rideId: id }));
    const d = dataOf(w, id);
    const ride = rideOf(w, id);
    const total = d.testRun?.ticksLeft ?? 0;
    expect(total).toBeGreaterThan(800);
    expect(d.trains).toHaveLength(1);
    expect(d.trains[0]?.state).toBe('running');
    tickRides(w, total - 1);
    expect(ride.status).toBe('testing');
    // The live train followed the same physics: one tick before the end it is about to stop in the station.
    const layout = getLayout(d);
    const live = d.trains[0];
    expect(Math.abs((live?.s ?? 0) - stopCentreMm(layout, 10_000))).toBeLessThan(20);
    expect(live?.v ?? 9999).toBeLessThan(300);
    tickRides(w, 1);
    expect(live?.s).toBe(stopCentreMm(layout, 10_000));
    expect(live?.v).toBe(0);
    expect(ride.status).toBe('closed');
    expect(d.test?.passed).toBe(true);
    expect(ride.stats).toEqual({ excitement: d.test?.excitement, intensity: d.test?.intensity, nausea: d.test?.nausea });
    expect(trackIsTall(w, id)).toBe(false);
    expect(w.events.some((e) => e.type === 'message' && e.textId === 'track.testPassed')).toBe(true);
  });

  it('any change clears the test result', () => {
    const w = makeTestWorld();
    const id = buildR1(w);
    expectOk(executeCommand(w, { type: 'startTestRun', rideId: id }));
    tickRides(w, 2000);
    const ride = rideOf(w, id);
    expect(ride.stats).not.toBeNull();
    expectOk(executeCommand(w, { type: 'setPieceOptions', rideId: id, index: 16, brakeSpeed: 9 }));
    expect(ride.stats).toBeNull();
    expect(dataOf(w, id).test).toBeNull();
    expect(canOpenTrackRide(w, ride)).toBe(TRACK_ERR.needGates);
  });
});
