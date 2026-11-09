/**
 * Phase 6 track ride types end to end (phase-6-polish.md §4.5; catalog §2, §8): an Inverted Coaster with a helix and a
 * corkscrew and a Bobsled Run with a helix complete a test run with ratings; a corkscrew entered too slowly fails the
 * test; the Monorail takes up to 4 stations, stops and dwells at the extra ones (master R26), and carries guests from
 * the first station; the `trainDrop` and `splash` sound cues (with and without riders). Building runs in setup mode
 * (Phase 6 types are research content).
 */
import { describe, expect, it } from 'vitest';
import { getTrackTypeDef, type TrackTypeDef } from '../../../src/data/track';
import { TRACK_ERR, TRACK_RATING_WARN, fillTrackString } from '../../../src/data/strings/track';
import { STOP_DWELL_TICKS } from '../../../src/data/tuning/track';
import { executeCommand } from '../../../src/sim/commands';
import { tileIndex } from '../../../src/sim/map';
import { canOpenTrackRide, checkTrackRideForLoad, nextTrackPieces, trackWarnings } from '../../../src/sim/rides/track/api';
import { getLayout } from '../../../src/sim/rides/track/layout';
import { cuePoints } from '../../../src/sim/rides/track/cues';
import type { World } from '../../../src/sim/types';
import { deserialize, serialize, validateState } from '../../../src/save';
import { addGuestDirect, makeTestWorld, placeFootpath, placeQueue, runTicks, stateHash } from '../../helpers/world';
import { add, addAll, buildR1, dataOf, EAST, expectOk, place, rideOf, times, type PieceSpec } from './helpers';

const chain = (id: string): PieceSpec => ({ id, chain: true });
const LIFT_16: PieceSpec[] = [chain('flat_to_gentle_up'), chain('gentle_to_steep_up'), chain('steep_up'), chain('steep_to_gentle_up'), chain('gentle_up_to_flat')];
const DROP_12: PieceSpec[] = ['flat_to_gentle_down', 'gentle_down', 'gentle_to_steep_down', 'steep_to_gentle_down', 'gentle_down_to_flat'];

/** Inverted Coaster from (4, 2) heading +x: lift to 16 m, a helix down to 12 m, a turn, a 12 m drop, a corkscrew. */
export const INVERTED: PieceSpec[] = [
  'station',
  'station',
  ...LIFT_16,
  'helix_right_down',
  'turn_medium_right',
  ...DROP_12,
  'corkscrew_right',
  { id: 'brakes', brakeSpeed: 8 },
  'turn_medium_right',
  ...times(11, 'straight'),
  'turn_medium_right',
  ...times(9, 'straight'),
  'turn_medium_right',
];

const bankedRight: PieceSpec[] = ['bank_right_in', 'banked_turn_medium_right', 'bank_right_out'];

/** Bobsled Run from (6, 4) heading +x: a gentle lift to 12 m, a helix down, banked turns, an 8 m drop. */
export const BOBSLED: PieceSpec[] = [
  'station',
  'station',
  chain('flat_to_gentle_up'),
  ...times(5, chain('gentle_up')),
  chain('gentle_up_to_flat'),
  chain('straight'),
  'helix_right_down',
  ...bankedRight,
  'flat_to_gentle_down',
  ...times(3, 'gentle_down'),
  'gentle_down_to_flat',
  { id: 'brakes', brakeSpeed: 8 },
  ...bankedRight,
  ...times(14, 'straight'),
  ...bankedRight,
  ...times(6, 'straight'),
  ...bankedRight,
];

/** Monorail from (4, 2) heading +x: the first station, a stop on the top side, a stop on the bottom side. */
export const MONORAIL: PieceSpec[] = [
  'station',
  'station',
  'straight',
  'straight',
  ...times(3, 'station'),
  'straight',
  'turn_medium_right',
  ...times(4, 'straight'),
  'turn_medium_right',
  ...times(3, 'station'),
  ...times(6, 'straight'),
  'turn_medium_right',
  ...times(4, 'straight'),
  'turn_medium_right',
];

function build(w: World, typeId: string, x: number, y: number, pieces: PieceSpec[]): number {
  const id = place(w, typeId, x, y, EAST);
  addAll(w, id, pieces);
  expect(dataOf(w, id).circuitClosed).toBe(true);
  return id;
}

function testAndWait(w: World, id: number): void {
  expectOk(executeCommand(w, { type: 'startTestRun', rideId: id }));
  runTicks(w, (dataOf(w, id).testRun?.ticksLeft ?? 0) + 1);
}

describe('Inverted Coaster and Bobsled Run complete a test run with ratings', () => {
  it('Inverted Coaster: helix, 12 m drop, corkscrew (1 inversion), passes with thrill ratings', () => {
    const w = makeTestWorld();
    const id = build(w, 'inverted_coaster', 4, 2, INVERTED);
    testAndWait(w, id);
    const t = dataOf(w, id).test!;
    expect(t.passed).toBe(true);
    expect(t.inversions).toBe(1);
    expect(t.vMaxMms).toBeGreaterThan(15_000);
    expect(t.excitement).toBeGreaterThan(400);
    expect(t.intensity).toBeGreaterThan(300);
    expect(t.nausea).toBeGreaterThan(100);
    expect(t.posGMax).toBeLessThan(500);
    expect(rideOf(w, id).stats).toEqual({ excitement: t.excitement, intensity: t.intensity, nausea: t.nausea });
    expect(checkTrackRideForLoad(dataOf(w, id), w.state)).toBeNull();
    expect(validateState(w.state)).toBeNull();
  });

  it('Bobsled Run: banked turns and a helix, no inversion, passes', () => {
    const w = makeTestWorld();
    const id = build(w, 'bobsled_run', 6, 4, BOBSLED);
    testAndWait(w, id);
    const t = dataOf(w, id).test!;
    expect(t.passed).toBe(true);
    expect(t.inversions).toBe(0);
    expect(t.excitement).toBeGreaterThan(300);
    expect(t.latMax).toBeLessThan(250);
    expect(validateState(w.state)).toBeNull();
  });

  it('the same build tests the same twice (deterministic)', () => {
    const a = makeTestWorld();
    const b = makeTestWorld();
    const ia = build(a, 'inverted_coaster', 4, 2, INVERTED);
    const ib = build(b, 'inverted_coaster', 4, 2, INVERTED);
    testAndWait(a, ia);
    testAndWait(b, ib);
    expect(dataOf(a, ia).test).toEqual(dataOf(b, ib).test);
    expect(stateHash(a)).toBe(stateHash(b));
  });
});

describe('corkscrew minimum entry speed (10 m/s)', () => {
  it('a corkscrew right after the station fails the test with the corkscrew message', () => {
    const w = makeTestWorld();
    // Station, then the corkscrew at 2 m/s, then a loop of flat track back to the station.
    const id = build(w, 'steel_coaster', 4, 2, ['station', 'station', 'corkscrew_right', 'turn_medium_right', ...times(2, 'straight'), 'turn_medium_right', ...times(6, 'straight'), 'turn_medium_right', ...times(2, 'straight'), 'turn_medium_right']);
    testAndWait(w, id);
    const t = dataOf(w, id).test!;
    expect(t.passed).toBe(false);
    expect(t.failKind).toBe('corkscrew');
    expect(t.failPiece).toBe(4);
    expect(trackWarnings(w, id)).toEqual([fillTrackString(TRACK_RATING_WARN.testFailedCorkscrew, { n: 4 })]);
    expect(TRACK_RATING_WARN.testFailedCorkscrew).toBe('Test failed: train is too slow for the corkscrew on piece {n}');
    expect(w.events.some((e) => e.type === 'message' && e.textId === 'track.testFailedCorkscrew' && e.params?.n === 4)).toBe(true);
    expect(validateState(w.state)).toBeNull();
  });
});

describe('Monorail stations (catalog §2: up to 4; master R26: extra stations are stops)', () => {
  it('lays a first station and two stops; the layout knows the stops', () => {
    const w = makeTestWorld();
    const id = build(w, 'monorail', 4, 2, MONORAIL);
    const L = getLayout(dataOf(w, id));
    expect(L.stationCount).toBe(3);
    expect(L.stopRuns).toEqual([{ start: 5, end: 8 }, { start: 15, end: 18 }]);
    expect(L.stops).toEqual([(L.startMm[8] as number) - 500, (L.startMm[18] as number) - 500]);
  });

  it('takes at most 4 station runs; other types still take one', () => {
    const w = makeTestWorld();
    const id = place(w, 'monorail', 4, 20, EAST);
    const pieces: PieceSpec[] = ['station', 'station', 'straight', 'station', 'straight', 'station', 'straight', 'station', 'straight'];
    addAll(w, id, pieces);
    expect(nextTrackPieces(w, id).map((p) => p.id)).not.toContain('station');
    expect(add(w, id, 'station')).toEqual({ ok: false, reason: fillTrackString(TRACK_ERR.tooManyStations, { n: 4 }) });
    expect(TRACK_ERR.tooManyStations).toBe('This ride takes at most {n} stations');
    // A stop run grows up to 12 tiles while it is the track end.
    const w2 = makeTestWorld();
    const id2 = place(w2, 'monorail', 4, 20, EAST);
    addAll(w2, id2, ['straight', 'station']);
    expect(nextTrackPieces(w2, id2).map((p) => p.id)).toContain('station');
    const steel = place(w2, 'steel_coaster', 4, 30, EAST);
    addAll(w2, steel, ['straight']);
    expect(add(w2, steel, 'station')).toEqual({ ok: false, reason: TRACK_ERR.doesNotFit });
    expect(nextTrackPieces(w2, steel).map((p) => p.id)).not.toContain('station');
  });

  it('every stop must hold the train', () => {
    const w = makeTestWorld();
    const short = MONORAIL.map((p, i) => (i === 15 ? 'straight' : p));
    const id = build(w, 'monorail', 4, 2, short);
    expect(executeCommand(w, { type: 'startTestRun', rideId: id })).toEqual({ ok: false, reason: fillTrackString(TRACK_ERR.stationTooShort, { n: 3 }) });
  });

  it('the test train stops at each stop for the dwell time; the ride time includes the stops', () => {
    const w = makeTestWorld();
    const id = build(w, 'monorail', 4, 2, MONORAIL);
    expectOk(executeCommand(w, { type: 'startTestRun', rideId: id }));
    const d = dataOf(w, id);
    const L = getLayout(d);
    const len = d.trainConfig.carsPerTrain * (getTrackTypeDef('monorail') as TrackTypeDef).vehicle.carLengthMm;
    const total = d.testRun!.ticksLeft;
    const stopsSeen = new Map<number, number>();
    for (let k = 0; k < total; k++) {
      runTicks(w, 1);
      const t = dataOf(w, id).trains[0];
      if (!t || t.state !== 'held') continue;
      const front = (t.s + Math.round(len / 2)) % L.lengthMm;
      stopsSeen.set(front, (stopsSeen.get(front) ?? 0) + 1);
    }
    runTicks(w, 1);
    expect([...stopsSeen.keys()].sort((a, b) => a - b)).toEqual(L.stops);
    for (const n of stopsSeen.values()) expect(n).toBe(STOP_DWELL_TICKS);
    const test = dataOf(w, id).test!;
    expect(test.passed).toBe(true);
    expect(test.rideTimeTicks).toBe(total);
    // Without the stops, the same distance at the same speeds takes 2 dwells less.
    expect(test.rideTimeTicks).toBeGreaterThan(2 * STOP_DWELL_TICKS);
    expect(test.vMaxMms).toBe(8000);
  });

  it('guests board at the first station only, stay seated through the stops, and leave at the first station', () => {
    const w = makeTestWorld();
    const id = build(w, 'monorail', 4, 2, MONORAIL);
    placeQueue(w, 4, 4);
    placeFootpath(w, 5, 4);
    expectOk(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 4, y: 3 }));
    expectOk(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'exit', x: 5, y: 3 }));
    // Gates go only beside the first station.
    expect(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'exit', x: 10, y: 3 })).toEqual({ ok: false, reason: TRACK_ERR.gateBesideStation });
    testAndWait(w, id);
    expect(canOpenTrackRide(w, rideOf(w, id))).toBeNull();
    expectOk(executeCommand(w, { type: 'setRideOpen', rideId: id, open: true }));
    const queue = tileIndex(w.state.map, 4, 4);
    const guests = Array.from({ length: 6 }, () => addGuestDirect(w, queue, { state: 'queueing', activityId: id, cash: 5_000 }));
    for (const g of guests) rideOf(w, id).queue.push(g.id);
    let sawHeldWithRiders = false;
    for (let k = 0; k < 3000; k++) {
      runTicks(w, 1);
      const t = dataOf(w, id).trains[0];
      if (t?.state === 'held' && t.seats.some((g) => g >= 0)) {
        sawHeldWithRiders = true;
        for (const g of guests) if (t.seats.includes(g.id)) expect(g.state).toBe('riding');
      }
      if (rideOf(w, id).totals.riders >= 6 && guests.every((g) => g.state !== 'riding' && g.state !== 'queueing')) break;
    }
    expect(sawHeldWithRiders).toBe(true);
    expect(rideOf(w, id).totals.riders).toBe(6);
    for (const g of guests) expect(g.ridden[String(id)] ?? 0).toBeGreaterThanOrEqual(1);
    expect(validateState(w.state)).toBeNull();
  });
});

describe('saves with Phase 6 rides (phase-2 §9.1 round trip)', () => {
  it('a Monorail train with riders dwelling at a stop and a stored corkscrew failure survive a round trip', () => {
    const w = makeTestWorld();
    const id = build(w, 'monorail', 4, 2, MONORAIL);
    placeQueue(w, 4, 4);
    placeFootpath(w, 5, 4);
    expectOk(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 4, y: 3 }));
    expectOk(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'exit', x: 5, y: 3 }));
    testAndWait(w, id);
    expectOk(executeCommand(w, { type: 'setRideOpen', rideId: id, open: true }));
    const queue = tileIndex(w.state.map, 4, 4);
    for (let k = 0; k < 6; k++) rideOf(w, id).queue.push(addGuestDirect(w, queue, { state: 'queueing', activityId: id, cash: 5_000 }).id);
    const steel = build(w, 'steel_coaster', 4, 30, ['station', 'station', 'corkscrew_right', 'turn_medium_right', ...times(2, 'straight'), 'turn_medium_right', ...times(6, 'straight'), 'turn_medium_right', ...times(2, 'straight'), 'turn_medium_right']);
    testAndWait(w, steel);
    expect(dataOf(w, steel).test?.failKind).toBe('corkscrew');
    let n = 0;
    while (n < 3000 && !dataOf(w, id).trains.some((t) => t.state === 'held' && t.dwellTicks > 5 && t.seats.some((g) => g >= 0))) {
      runTicks(w, 1);
      n++;
    }
    expect(n).toBeLessThan(3000);
    const r = deserialize(serialize(w, '0.3.0', '2026-11-09T10:15:00.000Z'));
    if (!r.ok) throw new Error(r.error);
    expect(r.world.state).toStrictEqual(w.state);
    runTicks(w, 600);
    runTicks(r.world, 600);
    expect(stateHash(r.world)).toBe(stateHash(w));
  });
});

describe('sound cues trainDrop and splash (Phase 6 §4.2, sim/sound.ts)', () => {
  function openR1(w: World): number {
    const id = buildR1(w);
    placeQueue(w, 4, 4);
    placeFootpath(w, 5, 4);
    expectOk(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 4, y: 3 }));
    expectOk(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'exit', x: 5, y: 3 }));
    testAndWait(w, id);
    expectOk(executeCommand(w, { type: 'setRideOpen', rideId: id, open: true }));
    return id;
  }

  it('R1 has one drop over 10 m (16 m) and no splash point', () => {
    const w = makeTestWorld();
    const id = buildR1(w);
    const c = cuePoints(getLayout(dataOf(w, id)));
    expect(c.drops.map((d) => d.metres)).toEqual([16]);
    expect(c.splashes).toEqual([]);
  });

  it('a train with riders that finishes the 16 m drop emits trainDrop with the drop in metres; an empty one does not', () => {
    for (const riders of [true, false]) {
      const w = makeTestWorld();
      const id = openR1(w);
      if (riders) {
        const queue = tileIndex(w.state.map, 4, 4);
        for (let k = 0; k < 4; k++) rideOf(w, id).queue.push(addGuestDirect(w, queue, { state: 'queueing', activityId: id, cash: 5_000, temperament: 90 }).id);
      }
      const cues: { value: number; entityId: number }[] = [];
      for (let k = 0; k < 2500; k++) {
        w.events.length = 0;
        runTicks(w, 1);
        for (const e of w.events) if (e.type === 'sound' && e.cue === 'trainDrop') cues.push({ value: e.value, entityId: e.entityId });
      }
      if (riders) {
        expect(cues.length).toBeGreaterThanOrEqual(1);
        expect(cues[0]).toEqual({ value: 16, entityId: id });
      } else {
        expect(cues).toEqual([]);
      }
    }
  });

  it('a log flume boat at its splashdown emits splash, with riders or without (test run included)', () => {
    const w = makeTestWorld();
    const id = place(w, 'log_flume', 10, 10, EAST);
    const p = (s: string): string => `flume_${s}`;
    addAll(w, id, [p('station'), ...times(3, p('lift')), p('straight'), p('turn_small_r'), 'flume_drop', 'flume_splashdown', p('turn_small_r'), ...times(6, p('straight')), p('turn_small_r'), ...times(3, p('straight')), p('turn_small_r')]);
    expect(cuePoints(getLayout(dataOf(w, id))).splashes).toHaveLength(1);
    expectOk(executeCommand(w, { type: 'startTestRun', rideId: id }));
    let splashes = 0;
    const n = (dataOf(w, id).testRun?.ticksLeft ?? 0) + 1;
    for (let k = 0; k < n; k++) {
      w.events.length = 0;
      runTicks(w, 1);
      for (const e of w.events) if (e.type === 'sound' && e.cue === 'splash') {
        splashes++;
        expect(e.entityId).toBe(id);
        expect(e.tile).toBeGreaterThanOrEqual(0);
      }
    }
    expect(dataOf(w, id).test?.passed).toBe(true);
    expect(splashes).toBe(1);
  });

  it('cues never change the state: a drained and an undrained run give the same hash', () => {
    const a = makeTestWorld();
    const b = makeTestWorld();
    const ia = openR1(a);
    openR1(b);
    for (const w of [a, b]) {
      const queue = tileIndex(w.state.map, 4, 4);
      for (let k = 0; k < 4; k++) rideOf(w, ia).queue.push(addGuestDirect(w, queue, { state: 'queueing', activityId: ia, cash: 5_000 }).id);
    }
    for (let k = 0; k < 1500; k++) {
      runTicks(a, 1);
      runTicks(b, 1);
      a.events.length = 0;
    }
    expect(stateHash(a)).toBe(stateHash(b));
  });
});
