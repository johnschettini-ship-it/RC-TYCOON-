import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/research/api', () => ({ isUnlocked: () => true }));
vi.mock('../../../src/sim/breakdowns/api', () => ({ onRideDispatch: vi.fn(() => false), reliabilityScore: () => 1 }));
vi.mock('../../../src/sim/guests/api', async () => {
  const ledger = await import('../../../src/sim/economy/ledger');
  type W = import('../../../src/sim/types').World;
  type G = import('../../../src/sim/guests/types').Guest;
  type R = import('../../../src/sim/rides/types').Ride;
  return {
    findGuest: (world: W, id: number) => world.state.guests.find((g) => g.id === id),
    boardRide: vi.fn((world: W, guest: G, ride: R) => {
      if (guest.cash < ride.price) return false;
      guest.cash -= ride.price;
      ledger.recordLedger(world, 'rideTickets', ride.price);
      guest.state = 'riding';
      return true;
    }),
    finishRide: vi.fn((_world: W, guest: G, ride: R) => {
      guest.state = 'walking';
      guest.activityId = -1;
      if (ride.exit) guest.tile = ride.exit.outside;
    }),
    leaveQueue: vi.fn((_world: W, guest: G, ride: R) => {
      const i = ride.queue.indexOf(guest.id);
      if (i >= 0) ride.queue.splice(i, 1);
      guest.state = 'walking';
      guest.activityId = -1;
    }),
    forgetDestination: vi.fn(),
  };
});

import { onRideDispatch } from '../../../src/sim/breakdowns/api';
import { boardRide, finishRide, leaveQueue } from '../../../src/sim/guests/api';
import { executeCommand } from '../../../src/sim/commands';
import { Content, tileIndex } from '../../../src/sim/map';
import { TRACK_ERR } from '../../../src/data/strings/track';
import { getTrackTypeDef, type TrackTypeDef } from '../../../src/data/track';
import {
  canOpenTrackRide,
  checkTrackRideForLoad,
  demolishTrackRide,
  trackAssetValue,
  trackHighestPointM,
  trackRunningCostMonthly,
  trackThroughputPerHour,
  trainCarPoses,
} from '../../../src/sim/rides/track/api';
import { getLayout } from '../../../src/sim/rides/track/layout';
import { updateTrackRides } from '../../../src/sim/rides/track/update';
import type { TrackRideData } from '../../../src/sim/rides/track/types';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, makeTestWorld, placeFootpath, placeQueue, stateHash } from '../../helpers/world';
import { addAll, buildR1, dataOf, EAST, expectOk, place, R1_BLOCKS, rideOf, type PieceSpec } from './helpers';

function modL(x: number, L: number): number {
  return ((x % L) + L) % L;
}

/** Smallest centre-to-centre distance between two trains on the circuit, minus the train length (mm). */
function minClearance(data: TrackRideData, type: TrackTypeDef): number {
  const L = getLayout(data).lengthMm;
  const len = data.trainConfig.carsPerTrain * type.vehicle.carLengthMm;
  const on = data.trains.filter((t) => !t.parked);
  let best = Infinity;
  for (let i = 0; i < on.length; i++) {
    for (let j = i + 1; j < on.length; j++) {
      const a = on[i]!.s;
      const b = on[j]!.s;
      best = Math.min(best, modL(a - b, L) - len, modL(b - a, L) - len);
    }
  }
  return best;
}

function tick(w: World, n = 1, each?: () => void): void {
  for (let i = 0; i < n; i++) {
    updateTrackRides(w);
    w.state.tick++;
    each?.();
  }
}

/** Build, gate, test, and open a ride (setup mode: no cash). */
function readyRide(w: World, typeId: string, x: number, y: number, pieces: PieceSpec[], trains = 1, cars?: number): number {
  const id = place(w, typeId, x, y, EAST);
  addAll(w, id, pieces);
  const type = getTrackTypeDef(typeId) as TrackTypeDef;
  expectOk(executeCommand(w, { type: 'setTrainConfig', rideId: id, trains, carsPerTrain: cars ?? type.vehicle.defaultCars }, { setup: true }));
  const long = getLayout(dataOf(w, id)).stationCount >= 2;
  const ex = long ? { x: x + 1, y: y + 1, ox: x + 1, oy: y + 2 } : { x, y: y - 1, ox: x, oy: y - 2 };
  placeQueue(w, x, y + 2);
  placeFootpath(w, ex.ox, ex.oy);
  expectOk(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'entrance', x, y: y + 1 }));
  expectOk(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'exit', x: ex.x, y: ex.y }));
  expectOk(executeCommand(w, { type: 'startTestRun', rideId: id }));
  const run = dataOf(w, id).testRun;
  tick(w, (run?.ticksLeft ?? 0) + 1);
  const d = dataOf(w, id);
  if (!d.test?.passed) throw new Error(`test failed on piece ${d.test?.failPiece}`);
  expect(canOpenTrackRide(w, rideOf(w, id))).toBeNull();
  rideOf(w, id).status = 'open';
  return id;
}

beforeEach(() => {
  vi.mocked(onRideDispatch).mockReset();
  vi.mocked(onRideDispatch).mockReturnValue(false);
  vi.mocked(boardRide).mockClear();
  vi.mocked(finishRide).mockClear();
  vi.mocked(leaveQueue).mockClear();
});

describe('blocks and dispatch (phase-2 §4.8)', () => {
  it('max trains = max(1, block brakes), and every block must hold a train', () => {
    const w = makeTestWorld();
    const id = buildR1(w);
    expectOk(executeCommand(w, { type: 'setTrainConfig', rideId: id, trains: 2, carsPerTrain: 4 }, { setup: true }));
    expect(executeCommand(w, { type: 'startTestRun', rideId: id })).toEqual({ ok: false, reason: TRACK_ERR.tooManyTrains });
    const w2 = makeTestWorld();
    const id2 = place(w2, 'steel_coaster', 4, 2, EAST);
    addAll(w2, id2, R1_BLOCKS);
    expect(getLayout(dataOf(w2, id2)).blockBrakeCount).toBe(3);
    expectOk(executeCommand(w2, { type: 'setTrainConfig', rideId: id2, trains: 3, carsPerTrain: 4 }, { setup: true }));
    expectOk(executeCommand(w2, { type: 'startTestRun', rideId: id2 }));
  });

  it('3 trains with 3 block brakes run 10 game days with no contact', () => {
    const w = makeTestWorld();
    const id = readyRide(w, 'steel_coaster', 4, 2, R1_BLOCKS, 3);
    const d = dataOf(w, id);
    const type = getTrackTypeDef('steel_coaster') as TrackTypeDef;
    let worst = Infinity;
    let dispatches = 0;
    let last = d.lastDispatchTick;
    const seen = new Set<number>();
    tick(w, 12_000, () => {
      worst = Math.min(worst, minClearance(d, type));
      if (d.lastDispatchTick !== last) {
        dispatches++;
        last = d.lastDispatchTick;
      }
      for (const t of d.trains) if (!t.parked && t.state === 'running') seen.add(t.id);
    });
    expect(rideOf(w, id).status).toBe('open');
    expect(worst).toBeGreaterThanOrEqual(1000);
    expect(seen).toEqual(new Set([1, 2, 3]));
    expect(dispatches).toBeGreaterThan(15); // station cycle (unload + 15 s max dwell + block wait) ≈ 700 ticks
  });

  it('a breakdown at dispatch holds the train in the station (R16)', () => {
    const w = makeTestWorld();
    const id = readyRide(w, 'steel_coaster', 4, 2, R1_BLOCKS, 1);
    vi.mocked(onRideDispatch).mockReturnValue(true);
    tick(w, 400);
    const t = dataOf(w, id).trains[0]!;
    expect(t.state).toBe('waiting');
    expect(t.dist).toBe(0);
    expect(vi.mocked(onRideDispatch)).toHaveBeenCalled();
    vi.mocked(onRideDispatch).mockReturnValue(false);
    tick(w, 2);
    expect(t.state).toBe('running');
  });

  it('broken and storm-hold rides finish the circuit, hold at a station or block brake, and do not dispatch', () => {
    for (const status of ['broken', 'stormHold'] as const) {
      const w = makeTestWorld();
      const id = readyRide(w, 'steel_coaster', 4, 2, R1_BLOCKS, 3);
      tick(w, 1500);
      const ride = rideOf(w, id);
      ride.status = status;
      ride.breakdownType = status === 'broken' ? 'train_stalled' : null;
      const d = dataOf(w, id);
      tick(w, 3000);
      const layout = getLayout(d);
      const type = getTrackTypeDef('steel_coaster') as TrackTypeDef;
      const half = 5_000;
      for (const t of d.trains.filter((x) => !x.parked)) {
        expect(t.v).toBe(0);
        const front = modL(t.s + half, layout.lengthMm);
        expect(layout.blockPoints).toContain(front);
      }
      const before = d.lastDispatchTick;
      tick(w, 500);
      expect(d.lastDispatchTick).toBe(before);
      expect(minClearance(d, type)).toBeGreaterThanOrEqual(1000);
      ride.status = 'open';
      ride.breakdownType = null;
      tick(w, 600);
      expect(d.lastDispatchTick).toBeGreaterThan(before);
    }
  });
});

describe('guests on track rides (phase-2 §4.11) and the R1 script (§9.2)', () => {
  function r1Script() {
    const w = makeTestWorld();
    placeQueue(w, 5, 4);
    placeFootpath(w, 6, 4);
    for (let x = 7; x <= 20; x++) placeFootpath(w, x, 6);
    const id = buildR1(w, false);
    expectOk(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 5, y: 3 }));
    expectOk(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'exit', x: 6, y: 3 }));
    expectOk(executeCommand(w, { type: 'startTestRun', rideId: id }));
    tick(w, (dataOf(w, id).testRun?.ticksLeft ?? 0) + 1);
    const ride = rideOf(w, id);
    expect(canOpenTrackRide(w, ride)).toBeNull();
    ride.status = 'open';
    const boarded = new Set<number>();
    const type = getTrackTypeDef('steel_coaster') as TrackTypeDef;
    const d = dataOf(w, id);
    let worst = Infinity;
    const queueTile = tileIndex(w.state.map, 5, 4);
    tick(w, 3600, () => {
      if (w.state.tick % 40 === 0) {
        const g = addGuestDirect(w, queueTile, { state: 'queueing', activityId: id, temperament: (w.state.tick / 40) % 101 });
        ride.queue.push(g.id);
      }
      for (const t of d.trains) for (const s of t.seats) if (s >= 0) boarded.add(s);
      worst = Math.min(worst, minClearance(d, type));
    });
    return { w, id, ride, d, boarded, worst };
  }

  it('builds R1 by commands, tests, opens, and carries guests for a month', () => {
    const { w, ride, d, boarded, worst } = r1Script();
    expect(d.test?.passed).toBe(true);
    expect(Math.abs((d.test?.excitement ?? 0) - 500)).toBeLessThanOrEqual(30);
    expect(Math.abs((d.test?.nausea ?? 0) - 143)).toBeLessThanOrEqual(30);
    expect(Math.abs((d.test?.intensity ?? 0) - 314)).toBeLessThanOrEqual(35);
    expect(ride.totals.riders).toBeGreaterThan(0);
    expect(boarded.size).toBe(ride.totals.riders);
    const tickets = w.state.economy.ledger.reduce((a, m) => a + m.lines.rideTickets, 0);
    expect(tickets).toBe(ride.totals.riders * ride.price);
    expect(ride.totals.income).toBe(ride.totals.riders * ride.price);
    // Every guest who boarded also unloaded or is still seated.
    const seated = new Set(d.trains.flatMap((t) => t.seats.filter((s) => s >= 0)));
    for (const gid of boarded) {
      const g = w.state.guests.find((x) => x.id === gid)!;
      if (seated.has(gid)) {
        expect(g.state).toBe('riding');
        expect(g.seat?.rideId).toBe(ride.id);
      } else {
        expect(g.state).toBe('walking');
        expect(g.seat).toBeNull();
        expect(g.tile).toBe(ride.exit?.outside);
      }
    }
    expect(vi.mocked(finishRide).mock.calls.length + seated.size).toBe(boarded.size);
    expect(worst).toBe(Infinity); // one train: nothing to touch
    expect(d.openedOnce).toBe(true);
    expect(checkTrackRideForLoad(d, w.state)).toBeNull();
  });

  it('seats fill front car first; a guest who cannot board leaves the queue', () => {
    const w = makeTestWorld();
    const id = readyRide(w, 'steel_coaster', 4, 2, R1_BLOCKS, 1);
    const ride = rideOf(w, id);
    const poor = addGuestDirect(w, 0, { state: 'queueing', cash: 0 });
    const a = addGuestDirect(w, 0, { state: 'queueing' });
    const b = addGuestDirect(w, 0, { state: 'queueing' });
    ride.queue.push(poor.id, a.id, b.id);
    const t = dataOf(w, id).trains[0]!;
    t.state = 'loading';
    t.dwellTicks = 0;
    tick(w, 1);
    expect(t.seats.slice(0, 3)).toEqual([a.id, b.id, -1]);
    expect(a.seat).toEqual({ rideId: id, trainId: 1, car: 0, seat: 0 });
    expect(b.seat).toEqual({ rideId: id, trainId: 1, car: 0, seat: 1 });
    expect(vi.mocked(leaveQueue)).toHaveBeenCalledWith(w, poor, ride, null);
    expect(ride.queue).toEqual([]);
    expect(ride.totals.riders).toBe(2);
    expect(ride.totals.ridersThisMonth).toBe(2);
    expect(ride.totals.incomeThisMonth).toBe(2 * ride.price);
  });

  it('runs the same R1 script twice to identical train states and state hash', () => {
    const a = r1Script();
    const b = r1Script();
    expect(a.d.trains).toEqual(b.d.trains);
    expect(stateHash(a.w)).toBe(stateHash(b.w));
  });

  it('thrill guests love airtime; chill guests dislike inversions', () => {
    const w = makeTestWorld();
    const id = readyRide(w, 'steel_coaster', 4, 2, R1_BLOCKS, 1);
    const d = dataOf(w, id);
    d.test = { ...d.test!, airtimeTicks: 30, inversions: 1 };
    const thrill = addGuestDirect(w, 0, { state: 'queueing', temperament: 80 });
    const chill = addGuestDirect(w, 0, { state: 'queueing', temperament: 20 });
    const ride = rideOf(w, id);
    ride.queue.push(thrill.id, chill.id);
    const h0 = thrill.needs.happiness;
    const c0 = chill.needs.happiness;
    tick(w, 1500);
    expect(thrill.thoughts.map((t) => t.id)).toContain('airtimeAwesome');
    expect(chill.thoughts.map((t) => t.id)).toContain('neverUpsideDown');
    expect(thrill.needs.happiness).toBe(h0 + 10);
    expect(chill.needs.happiness).toBe(c0 - 10);
  });

  it('a closed ride finishes the lap, unloads, and can then be edited', () => {
    const w = makeTestWorld();
    const id = readyRide(w, 'steel_coaster', 4, 2, R1_BLOCKS, 3);
    tick(w, 2000);
    const ride = rideOf(w, id);
    ride.status = 'closed';
    tick(w, 4000);
    expectOk(executeCommand(w, { type: 'editTrack', rideId: id }));
    expect(ride.status).toBe('building');
  });
});

describe('fault guard (§4.7)', () => {
  it('a stall in operation closes the ride and unloads riders at the exit', () => {
    const w = makeTestWorld();
    const id = readyRide(w, 'steel_coaster', 4, 2, R1_BLOCKS, 1);
    const ride = rideOf(w, id);
    const g = addGuestDirect(w, 0, { state: 'queueing' });
    ride.queue.push(g.id);
    // A bug: the chain disappears without clearing the test.
    for (const p of dataOf(w, id).pieces) p.chain = false;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    tick(w, 1500);
    expect(ride.status).toBe('closed');
    expect(ride.stats).toBeNull();
    expect(g.state).toBe('walking');
    expect(err).toHaveBeenCalled();
    expect(w.events.some((e) => e.type === 'message' && e.textId === 'track.fault')).toBe(true);
    err.mockRestore();
  });
});

describe('powered, guest-driven, and spinning types', () => {
  /** 2-tile station at (10, 10) and four medium turns (closes exactly). */
  const loop8: PieceSpec[] = [
    'station', 'straight', 'straight', 'turn_medium_right', 'straight', 'straight', 'straight', 'turn_medium_right',
    'straight', 'straight', 'straight', 'straight', 'turn_medium_right', 'straight', 'straight', 'straight', 'turn_medium_right',
  ];

  it('mini railway: 2 powered trains keep the gap and carry guests', () => {
    const w = makeTestWorld();
    const id = readyRide(w, 'mini_railway', 10, 10, loop8, 2, 2);
    const d = dataOf(w, id);
    const type = getTrackTypeDef('mini_railway') as TrackTypeDef;
    let worst = Infinity;
    let maxV = 0;
    tick(w, 6000, () => {
      worst = Math.min(worst, minClearance(d, type));
      for (const t of d.trains) maxV = Math.max(maxV, t.v);
    });
    expect(worst).toBeGreaterThanOrEqual(3000);
    expect(maxV).toBe(5000);
    expect(d.trains.every((t) => !t.parked)).toBe(true);
  });

  it('go-karts: 4 karts, 2 laps, gap ≥ 3 m, best lap recorded, speed from temperament', () => {
    const w = makeTestWorld();
    const id = readyRide(w, 'go_karts', 10, 10, loop8, 4, 1);
    const ride = rideOf(w, id);
    const d = dataOf(w, id);
    expect(d.test?.laps).toBe(2);
    const type = getTrackTypeDef('go_karts') as TrackTypeDef;
    let worst = Infinity;
    const speeds = new Set<number>();
    tick(w, 8000, () => {
      if (w.state.tick % 30 === 0) {
        const g = addGuestDirect(w, 0, { state: 'queueing', temperament: (w.state.tick / 30) % 2 === 0 ? 0 : 100 });
        ride.queue.push(g.id);
      }
      worst = Math.min(worst, minClearance(d, type));
      for (const t of d.trains) if (t.state === 'running') speeds.add(t.driveMms);
    });
    expect(worst).toBeGreaterThanOrEqual(3000);
    expect(d.bestLapTicks).not.toBeNull();
    expect(speeds.has(6000) || speeds.has(9000)).toBe(true);
    expect(ride.totals.riders).toBeGreaterThan(10);
  });

  it('spinning mouse: single cars with 2 block brakes run without contact', () => {
    const w = makeTestWorld();
    const c = (id: string): PieceSpec => ({ id, chain: true });
    const mouse: PieceSpec[] = [
      c('flat_to_gentle_up'), c('gentle_up'), c('gentle_up_to_flat'), 'block_brake', c('straight'), 'turn_small_right',
      'flat_to_gentle_down', 'gentle_down', 'gentle_down_to_flat', 'brakes', 'turn_small_right',
      'straight', 'straight', 'straight', 'straight', 'straight', 'straight', 'turn_small_right',
      'straight', 'straight', 'straight', 'block_brake', 'turn_small_right',
    ];
    const id = readyRide(w, 'spinning_mouse', 10, 10, mouse, 2, 1);
    const d = dataOf(w, id);
    expect(d.circuitClosed).toBe(true);
    expect(getTrackTypeDef('spinning_mouse')?.vehicle.spins).toBe(true);
    const type = getTrackTypeDef('spinning_mouse') as TrackTypeDef;
    let worst = Infinity;
    tick(w, 6000, () => {
      worst = Math.min(worst, minClearance(d, type));
    });
    expect(rideOf(w, id).status).toBe('open');
    expect(worst).toBeGreaterThanOrEqual(1000);
    expect(d.lastDispatchTick).toBeGreaterThan(0);
  });
});

describe('demolish, value, running cost, and load checks', () => {
  it('demolish refunds 100% if never opened and 50% once opened; tiles, gates, and guests are cleared', () => {
    const w = makeTestWorld();
    const id = buildR1(w, false);
    const ride = rideOf(w, id);
    const total = ride.totalBuildCost;
    const cash = w.state.park.cash;
    const r = demolishTrackRide(w, ride, { setup: false });
    expect(r).toEqual({ ok: true, cost: -total, warnings: [] });
    expect(w.state.park.cash).toBe(cash + total);
    expect(w.state.rides.find((x) => x.id === id)).toBeUndefined();
    expect(w.state.track.rides[String(id)]).toBeUndefined();
    expect(Array.from(w.state.map.contentRef).some((x) => x === id)).toBe(false);
    expect(w.state.map.content[tileIndex(w.state.map, 4, 2)]).toBe(Content.Empty);

    const w2 = makeTestWorld();
    const id2 = readyRide(w2, 'steel_coaster', 4, 2, R1_BLOCKS, 1);
    tick(w2, 2);
    const ride2 = rideOf(w2, id2);
    const q = addGuestDirect(w2, 0, { state: 'queueing' });
    ride2.queue.push(q.id);
    const rider = addGuestDirect(w2, 0, { state: 'riding' });
    dataOf(w2, id2).trains[0]!.seats[0] = rider.id;
    rider.seat = { rideId: id2, trainId: 1, car: 0, seat: 0 };
    const total2 = ride2.totalBuildCost;
    const cash2 = w2.state.park.cash;
    const r2 = demolishTrackRide(w2, ride2, { setup: false });
    expect(r2.ok && r2.cost).toBe(-Math.floor(total2 / 2));
    expect(w2.state.park.cash).toBe(cash2 + Math.floor(total2 / 2));
    expect(vi.mocked(finishRide)).toHaveBeenCalledWith(w2, rider, ride2);
    expect(rider.seat).toBeNull();
    expect(vi.mocked(leaveQueue)).toHaveBeenCalledWith(w2, q, ride2, null);
    expect(Array.from(w2.state.map.contentRef).some((x) => x === id2)).toBe(false);
  });

  it('asset value, running cost, highest point, throughput, and car poses', () => {
    const w = makeTestWorld();
    const id = buildR1(w, false);
    const ride = rideOf(w, id);
    const total = ride.totalBuildCost;
    expect(trackAssetValue(w, id)).toBe(total);
    w.state.tick += 60 * 3600;
    expect(trackAssetValue(w, id)).toBe(Math.round(total * (1 - 0.7 * 60 / 120)));
    w.state.tick += 200 * 3600;
    expect(trackAssetValue(w, id)).toBe(Math.round(total * 0.3));
    expect(trackRunningCostMonthly(w, ride)).toBe(12_000 + 150 * 36);
    expectOk(executeCommand(w, { type: 'setTrainConfig', rideId: id, trains: 3, carsPerTrain: 4 }, { setup: true }));
    expect(trackRunningCostMonthly(w, ride)).toBe(12_000 + 150 * 36 + 4_000 * 2);
    expect(trackHighestPointM(w, id)).toBe(16);
    expect(trackThroughputPerHour(w, id)).toBeNull();
    const w2 = makeTestWorld();
    const id2 = readyRide(w2, 'steel_coaster', 4, 2, R1_BLOCKS, 1);
    const t = dataOf(w2, id2).test!;
    expect(trackThroughputPerHour(w2, id2)).toBeCloseTo((16 * 50) / (t.rideTimeTicks + 300), 9);
    const poses = trainCarPoses(w2, id2);
    expect(poses).toHaveLength(1);
    expect(poses[0]!.cars).toHaveLength(4);
    expect(poses[0]!.cars[0]!.z).toBe(8);
  });

  it('build cost totals: R1 = base + pieces + chain + height', () => {
    const w = makeTestWorld();
    const id = buildR1(w, false);
    const d = dataOf(w, id);
    expect(rideOf(w, id).totalBuildCost).toBe(300_000 + d.pieces.reduce((a, p) => a + p.cost, 0));
    expect(w.state.park.cash).toBe(1_500_000 - rideOf(w, id).totalBuildCost);
  });

  it('load checks reject corrupted track data', () => {
    const w = makeTestWorld();
    const id = readyRide(w, 'steel_coaster', 4, 2, R1_BLOCKS, 1);
    const good = dataOf(w, id);
    expect(checkTrackRideForLoad(good, w.state)).toBeNull();
    const clone = (): TrackRideData => JSON.parse(JSON.stringify(good)) as TrackRideData;
    const a = clone();
    a.pieces[5]!.z += 1;
    expect(checkTrackRideForLoad(a)).toBe('Track pieces do not join');
    const b = clone();
    b.circuitClosed = false;
    expect(checkTrackRideForLoad(b)).toBe('Circuit flag does not match the track');
    const c = clone();
    c.trains[0]!.s = getLayout(good).lengthMm;
    expect(checkTrackRideForLoad(c)).toBe('Train position is outside the circuit');
    const e = clone();
    e.trains[0]!.seats[0] = -2;
    expect(checkTrackRideForLoad(e)).toBe('Train seat is not valid');
    const f = clone();
    f.trains[0]!.seats[0] = 99_999;
    expect(checkTrackRideForLoad(f, w.state)).toBe('Seated guest is not riding this ride');
    const g = clone();
    g.pieces[3]!.defId = 'nope';
    expect(checkTrackRideForLoad(g)).toBe('Unknown track piece');
  });
});
