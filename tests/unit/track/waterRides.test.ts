/**
 * Log Flume and Rapids Raft end to end (Phase 4 §4.4, §9.1): build by commands, test, open, carry real guests, and
 * get them wet. Owner: W3-C. Water rides are Phase 4 research content, so building runs in setup mode until
 * BUILD_MAX_PHASE reaches 4 (W3-D).
 */
import { describe, expect, it } from 'vitest';
import { getTrackTypeDef, type TrackTypeDef } from '../../../src/data/track';
import { TRACK_ERR, TRACK_WARN, fillTrackString } from '../../../src/data/strings/track';
import { WET_TICKS } from '../../../src/data/tuning/track';
import { executeCommand } from '../../../src/sim/commands';
import { tileIndex } from '../../../src/sim/map';
import { canOpenTrackRide, checkTrackRideForLoad } from '../../../src/sim/rides/track/api';
import { getLayout } from '../../../src/sim/rides/track/layout';
import { addWaterExtras, computeRatings, ratingInputsOf, waterRatingExtras } from '../../../src/sim/rides/track/ratings';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, makeTestWorld, placeFootpath, placeQueue, runTicks, stateHash } from '../../helpers/world';
import { add, addAll, dataOf, EAST, expectOk, place, rideOf, type PieceSpec } from './helpers';

const times = (n: number, p: string): PieceSpec[] => Array.from({ length: n }, () => p);

/**
 * A closed water circuit from a 2-tile station at (10, 10) heading +x: a 6 m lift, a turn, a 6 m drop into the
 * splash feature(s) at (16, 12)–(16, 13), and small turns and straights back to the station.
 */
function circuit(set: 'flume' | 'rapids'): PieceSpec[] {
  const p = (s: string): string => `${set}_${s}`;
  const feature = set === 'flume' ? ['flume_drop', 'flume_splashdown'] : ['rapids_waterfall', 'rapids_rough', 'rapids_whirlpool'];
  return [
    p('station'),
    ...times(3, p('lift')),
    p('straight'),
    p('turn_small_r'),
    ...feature,
    p('turn_small_r'),
    ...times(6, p('straight')),
    p('turn_small_r'),
    ...times(3, p('straight')),
    p('turn_small_r'),
  ];
}

const TYPE: Record<'flume' | 'rapids', string> = { flume: 'log_flume', rapids: 'rapids_raft' };

/** Build the circuit by commands (setup mode: water rides are research content), with gates and paths. */
function build(w: World, set: 'flume' | 'rapids'): number {
  const id = place(w, TYPE[set], 10, 10, EAST);
  addAll(w, id, circuit(set));
  placeQueue(w, 10, 8);
  placeFootpath(w, 11, 8);
  expectOk(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 10, y: 9 }));
  expectOk(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'exit', x: 11, y: 9 }));
  return id;
}

function testAndWait(w: World, id: number): void {
  expectOk(executeCommand(w, { type: 'startTestRun', rideId: id }));
  runTicks(w, (dataOf(w, id).testRun?.ticksLeft ?? 0) + 1);
}

describe('placeStation accepts the water types', () => {
  it('lays the type station piece on the ground and pays base + piece', () => {
    for (const set of ['flume', 'rapids'] as const) {
      const w = makeTestWorld();
      const cash = w.state.park.cash;
      const r = expectOk(executeCommand(w, { type: 'placeStation', typeId: TYPE[set], x: 20, y: 20, dir: EAST }, { setup: true }));
      const d = dataOf(w, r.id!);
      const type = getTrackTypeDef(TYPE[set]) as TrackTypeDef;
      expect(d.pieces).toHaveLength(1);
      expect(d.pieces[0]).toMatchObject({ defId: `${set}_station`, x: 20, y: 20, z: 8, dir: 0 });
      expect(r.cost).toBe(type.costs.base + d.pieces[0]!.cost);
      expect(d.trainConfig).toEqual({ trains: 1, carsPerTrain: 1 });
      expect(rideOf(w, r.id!).name).toBe(set === 'flume' ? 'Log Flume 1' : 'Rapids Raft 1');
      expect(w.state.park.cash).toBe(cash); // setup mode
    }
  });

  it('water rides are research content: "This ride type is not available yet" outside setup mode', () => {
    const w = makeTestWorld();
    const r = executeCommand(w, { type: 'placeStation', typeId: 'log_flume', x: 10, y: 10, dir: EAST });
    expect(r).toEqual({ ok: false, reason: TRACK_ERR.notResearched });
  });

  it('a water type builds only pieces of its own set', () => {
    const w = makeTestWorld();
    const flume = place(w, 'log_flume', 10, 10, EAST);
    expect(add(w, flume, 'straight')).toEqual({ ok: false, reason: TRACK_ERR.typeCannotUse });
    expect(add(w, flume, 'station')).toEqual({ ok: false, reason: TRACK_ERR.typeCannotUse });
    expect(add(w, flume, 'rapids_straight')).toEqual({ ok: false, reason: TRACK_ERR.typeCannotUse });
    expect(add(w, flume, 'flume_station').ok).toBe(true);
    const coaster = place(w, 'steel_coaster', 10, 20, EAST);
    expect(add(w, coaster, 'flume_straight')).toEqual({ ok: false, reason: TRACK_ERR.typeCannotUse });
  });
});

describe.each(['flume', 'rapids'] as const)('%s circuit', (set) => {
  it('closes, passes its test with the water extras, opens, and carries guests who get wet', () => {
    const w = makeTestWorld();
    const id = place(w, TYPE[set], 10, 10, EAST);
    const specs = circuit(set);
    addAll(w, id, specs.slice(0, -1));
    const last = add(w, id, specs[specs.length - 1]!);
    expect(last).toMatchObject({ ok: true, warnings: [TRACK_WARN.circuitComplete] });
    placeQueue(w, 10, 8);
    placeFootpath(w, 11, 8);
    expectOk(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 10, y: 9 }));
    expectOk(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'exit', x: 11, y: 9 }));
    testAndWait(w, id);
    const d = dataOf(w, id);
    const t = d.test!;
    expect(t.passed).toBe(true);
    expect(t.highestM).toBe(6);
    expect(t.drops).toBe(1);
    expect(t.dropMaxMm).toBe(6000);
    // Ratings = Phase 2 formula, then the water extras.
    const type = getTrackTypeDef(TYPE[set]) as TrackTypeDef;
    const extras = waterRatingExtras(getLayout(d).statics.map((s) => s.def));
    expect(extras).toEqual(set === 'flume' ? { e: 40, i: 10, n: 0 } : { e: 50, i: 30, n: 50 });
    const want = addWaterExtras(computeRatings(ratingInputsOf(t), type), extras);
    expect([t.excitement, t.intensity, t.nausea]).toEqual([want.excitement, want.intensity, want.nausea]);
    expect(t.excitement).toBeGreaterThan(200);
    expect(t.intensity).toBeLessThan(800);

    const ride = rideOf(w, id);
    expect(canOpenTrackRide(w, ride)).toBeNull();
    expectOk(executeCommand(w, { type: 'setRideOpen', rideId: id, open: true }));
    expect(ride.status).toBe('open');
    const queue = tileIndex(w.state.map, 10, 8);
    const wetAt = new Map<number, number>();
    for (let k = 0; k < 400; k++) {
      if (k % 20 === 0) {
        const g = addGuestDirect(w, queue, { state: 'queueing', activityId: id, cash: 5_000 });
        ride.queue.push(g.id);
      }
      runTicks(w, 5);
      for (const g of w.state.guests) if (g.wetUntilTick > 0 && !wetAt.has(g.id)) wetAt.set(g.id, g.wetUntilTick);
    }
    expect(ride.status).toBe('open');
    expect(ride.totals.riders).toBeGreaterThan(4);
    // Every rider who finished got wet for 1 game hour from the ride's end (splashdown / waterfall).
    expect(wetAt.size).toBeGreaterThan(0);
    for (const [, until] of wetAt) expect(until % 1).toBe(0);
    const finished = w.state.guests.filter((g) => (g.ridden[String(id)] ?? 0) > 0);
    expect(finished.length).toBeGreaterThan(0);
    for (const g of finished) expect(wetAt.has(g.id)).toBe(true);
    expect(checkTrackRideForLoad(d, w.state)).toBeNull();
  });
});

describe('boats and stations (1 boat per station tile)', () => {
  it('more boats than station tiles fail the test with the station message', () => {
    const w = makeTestWorld();
    const id = build(w, 'flume');
    expectOk(executeCommand(w, { type: 'setTrainConfig', rideId: id, trains: 3, carsPerTrain: 1 }, { setup: true }));
    expect(executeCommand(w, { type: 'startTestRun', rideId: id })).toEqual({ ok: false, reason: fillTrackString(TRACK_ERR.stationTooShort, { n: 3 }) });
    expect(executeCommand(w, { type: 'setTrainConfig', rideId: id, trains: 7, carsPerTrain: 1 }, { setup: true })).toEqual({
      ok: false,
      reason: fillTrackString(TRACK_ERR.trainsRange, { n: 6 }),
    });
    expectOk(executeCommand(w, { type: 'setTrainConfig', rideId: id, trains: 2, carsPerTrain: 1 }, { setup: true }));
    testAndWait(w, id);
    expect(dataOf(w, id).test?.passed).toBe(true);
  });

  it('two boats keep at least the 3 m gap for a game day and both carry guests', () => {
    const w = makeTestWorld();
    const id = build(w, 'rapids');
    expectOk(executeCommand(w, { type: 'setTrainConfig', rideId: id, trains: 2, carsPerTrain: 1 }, { setup: true }));
    testAndWait(w, id);
    expectOk(executeCommand(w, { type: 'setRideOpen', rideId: id, open: true }));
    const ride = rideOf(w, id);
    const d = dataOf(w, id);
    const L = getLayout(d).lengthMm;
    const queue = tileIndex(w.state.map, 10, 8);
    const usedBoats = new Set<number>();
    for (let k = 0; k < 1200; k++) {
      if (k % 15 === 0) {
        const g = addGuestDirect(w, queue, { state: 'queueing', activityId: id, cash: 5_000 });
        ride.queue.push(g.id);
      }
      runTicks(w, 1);
      const live = d.trains.filter((t) => !t.parked);
      for (const t of live) if (t.seats.some((s) => s >= 0)) usedBoats.add(t.id);
      if (live.length === 2) {
        const [a, b] = live as [typeof live[0], typeof live[0]];
        const gap = Math.min((((a.s - b.s) % L) + L) % L, (((b.s - a.s) % L) + L) % L) - 4000;
        expect(gap).toBeGreaterThanOrEqual(2900);
      }
    }
    expect(ride.status).toBe('open');
    expect(usedBoats.size).toBe(2);
  });

  it('the same water ride script twice gives the same state hash', () => {
    const run = (): string => {
      const w = makeTestWorld();
      const id = build(w, 'flume');
      testAndWait(w, id);
      expectOk(executeCommand(w, { type: 'setRideOpen', rideId: id, open: true }));
      const queue = tileIndex(w.state.map, 10, 8);
      for (let k = 0; k < 10; k++) rideOf(w, id).queue.push(addGuestDirect(w, queue, { state: 'queueing', activityId: id, cash: 5_000 }).id);
      runTicks(w, 1500);
      return stateHash(w);
    };
    expect(run()).toBe(run());
  });
});

describe('wet riders last one game hour', () => {
  it('a rider leaving the flume is wet until ride end + 1 game hour', () => {
    const w = makeTestWorld();
    const id = build(w, 'flume');
    testAndWait(w, id);
    expectOk(executeCommand(w, { type: 'setRideOpen', rideId: id, open: true }));
    const g = addGuestDirect(w, tileIndex(w.state.map, 10, 8), { state: 'queueing', activityId: id, cash: 5_000 });
    rideOf(w, id).queue.push(g.id);
    let endTick = -1;
    for (let k = 0; k < 6000 && endTick < 0; k++) {
      const before = g.state;
      runTicks(w, 1);
      if (before === 'riding' && g.state !== 'riding') endTick = w.state.tick - 1;
    }
    expect(endTick).toBeGreaterThan(0);
    expect(g.wetUntilTick).toBe(endTick + WET_TICKS);
  });
});
