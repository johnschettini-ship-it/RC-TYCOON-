import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/pathing', async () => (await import('./fakes')).fakePathing());
vi.mock('../../../src/sim/notifications', async () => (await import('./fakes')).fakeNotifications());
vi.mock('../../../src/sim/rides/flat/api', async () => (await import('./fakes')).fakeFlatApi());

import {
  breakDown,
  initRideReliability,
  onRideDispatch,
  recentBreakFactor,
  reliabilityScore,
} from '../../../src/sim/breakdowns/api';
import { breakdownChance, wearAmount } from '../../../src/sim/breakdowns/reliability';
import { updateStaff } from '../../../src/sim/staff/update';
import { executeCommand } from '../../../src/sim/commands';
import { tileIndex } from '../../../src/sim/map';
import {
  INSPECT_DEFAULT,
  RECENT_BREAK_SCORE,
  RECENT_BREAK_TICKS,
  REL_MAX,
  STUCK_RIDER_INTERVAL,
} from '../../../src/data/tuning/staff';
import { STAFF_MESSAGES } from '../../../src/data/strings/staff';
import { THOUGHT } from '../../../src/sim/guests/thoughts';
import { TICKS_PER_MONTH, MONTHS_PER_YEAR } from '../../../src/data/tuning/core';
import { addGuestDirect, makeTestWorld, placeRideDirect } from '../../helpers/world';
import { notifyLog, pathLine, stopRideSpy } from './fakes';
import { forceNextAtLeast, forceNextBelow } from './rngForce';
import { stepStaffSystems } from './steps';
import type { World } from '../../../src/sim/types';
import type { Ride } from '../../../src/sim/rides/types';

function setup(kind: 'flat' | 'track' = 'flat') {
  const world = makeTestWorld();
  pathLine(world, 2, 9, 60, 9);
  const ride = placeRideDirect(world, 'carousel', 20, 10);
  initRideReliability(world, ride);
  ride.kind = kind;
  ride.status = 'open';
  return { world, ride };
}

/** Force the next dispatch roll to break the ride, and the type draw to land on `index` in the kind's table. */
function forceBreak(world: World, ride: Ride): boolean {
  forceNextBelow(world, breakdownChance(ride.reliability));
  return onRideDispatch(world, ride);
}

beforeEach(() => {
  notifyLog.length = 0;
  stopRideSpy.mockClear();
});

describe('initRideReliability', () => {
  it('a new ride starts at 100.00 with the default inspection interval', () => {
    const { world, ride } = setup();
    expect(ride.reliability).toBe(REL_MAX);
    expect(ride.inspectionIntervalTicks).toBe(INSPECT_DEFAULT);
    expect(ride.lastInspectionTick).toBe(world.state.tick);
    expect(ride.breakdownType).toBeNull();
    expect(ride.assignedMechanicId).toBeNull();
  });
});

describe('onRideDispatch: wear and breakdown roll (§4.5)', () => {
  it('a dispatch without a breakdown applies wear and lets the cycle start', () => {
    const { world, ride } = setup();
    forceNextAtLeast(world, breakdownChance(ride.reliability));
    expect(onRideDispatch(world, ride)).toBe(false);
    expect(ride.reliability).toBe(REL_MAX - wearAmount(0));
    expect(ride.status).toBe('open');
  });

  it('wear grows with age', () => {
    const { world, ride } = setup();
    ride.builtTick = world.state.tick - 2 * TICKS_PER_MONTH * MONTHS_PER_YEAR;
    forceNextAtLeast(world, 0.99);
    onRideDispatch(world, ride);
    expect(ride.reliability).toBe(REL_MAX - wearAmount(2));
    expect(wearAmount(2)).toBe(225);
  });

  it('a breakdown on a flat ride: status, counters, riders stay on board, message, and the cycle does not start', () => {
    const { world, ride } = setup();
    ride.riders = [101, 102];
    ride.cycle = { phase: 'loading', ticks: 50 };
    expect(forceBreak(world, ride)).toBe(true);
    expect(ride.status).toBe('broken');
    expect(['stopped', 'gate_stuck', 'slow_running']).toContain(ride.breakdownType);
    expect(ride.statusBeforeBreakdown).toBe('open');
    expect(ride.breakdownsThisMonth).toBe(1);
    expect(ride.lastBreakdownTick).toBe(world.state.tick);
    expect(ride.reliability).toBe(REL_MAX); // no wear without a cycle
    expect(stopRideSpy).not.toHaveBeenCalled(); // riders wait on board (Phase 3 §4.5)
    expect(ride.cycle.phase).not.toBe('running');
    const msg = notifyLog.find((n) => n.textId === STAFF_MESSAGES.breakdown);
    expect(msg?.category).toBe('breakdown');
    expect(msg?.opts.entityId).toBe(ride.id);
    expect(msg?.opts.params?.ride).toBe(ride.name);
  });

  it.each(['stopped', 'gate_stuck', 'slow_running'] as const)('breakdown %s keeps riders on board and refuses new dispatches', (type) => {
    const { world, ride } = setup();
    ride.cycle = { phase: 'loading', ticks: 10 };
    breakDown(world, ride, type);
    expect(stopRideSpy).not.toHaveBeenCalled(); // riders wait on board (Phase 3 §4.5)
    expect(ride.status).toBe('broken');
    expect(ride.cycle.phase).not.toBe('running');
    // While broken, every dispatch is refused and nothing wears or rolls.
    const rng = world.state.rng;
    for (let k = 0; k < 5; k++) expect(onRideDispatch(world, ride)).toBe(true);
    expect(world.state.rng).toBe(rng);
    expect(ride.reliability).toBe(REL_MAX);
  });

  it.each(['train_stalled', 'gate_stuck'] as const)('track %s holds the train at the station; riders stay seated', (type) => {
    const { world, ride } = setup('track');
    const rider = addGuestDirect(world, tileIndex(world.state.map, 21, 11), {
      state: 'riding',
      activityId: ride.id,
      seat: { rideId: ride.id, trainId: 0, car: 0, seat: 0 },
    });
    breakDown(world, ride, type);
    expect(stopRideSpy).not.toHaveBeenCalled();
    expect(onRideDispatch(world, ride)).toBe(true);
    expect(rider.state).toBe('riding');
    expect(rider.seat).not.toBeNull();
  });

  it('track slow_running keeps dispatching', () => {
    const { world, ride } = setup('track');
    breakDown(world, ride, 'slow_running');
    expect(ride.status).toBe('broken');
    expect(onRideDispatch(world, ride)).toBe(false);
  });

  it('track rides draw only track types; flat rides only flat types', () => {
    const flat = new Set<string>();
    const track = new Set<string>();
    for (let k = 0; k < 400; k++) {
      const a = setup('flat');
      a.world.state.rng = k + 1;
      a.ride.reliability = 0;
      a.world.state.modifiers.breakdownChance = 100;
      onRideDispatch(a.world, a.ride);
      flat.add(String(a.ride.breakdownType));
      const b = setup('track');
      b.world.state.rng = k + 1;
      b.world.state.modifiers.breakdownChance = 1000;
      onRideDispatch(b.world, b.ride);
      track.add(String(b.ride.breakdownType));
    }
    expect([...flat].sort()).toEqual(['gate_stuck', 'slow_running', 'stopped']);
    expect([...track].sort()).toEqual(['gate_stuck', 'slow_running', 'train_stalled']);
  });

  it('type weights are 40 / 30 / 30', () => {
    const counts: Record<string, number> = {};
    const n = 30_000;
    const { world, ride } = setup();
    world.state.modifiers.breakdownChance = 1000;
    for (let k = 0; k < n; k++) {
      ride.status = 'open';
      onRideDispatch(world, ride);
      counts[String(ride.breakdownType)] = (counts[String(ride.breakdownType)] ?? 0) + 1;
      world.state.staff.pendingBreakdowns = [];
    }
    expect((counts.stopped ?? 0) / n).toBeCloseTo(0.4, 1);
    expect((counts.gate_stuck ?? 0) / n).toBeCloseTo(0.3, 1);
    expect((counts.slow_running ?? 0) / n).toBeCloseTo(0.3, 1);
  });

  it('modifiers.breakdownChance scales the chance (0 = never)', () => {
    const { world, ride } = setup();
    ride.reliability = 0;
    world.state.modifiers.breakdownChance = 0;
    for (let k = 0; k < 5000; k++) {
      ride.reliability = 0;
      expect(onRideDispatch(world, ride)).toBe(false);
    }
    let broke = 0;
    world.state.modifiers.breakdownChance = 1;
    const n = 20_000;
    for (let k = 0; k < n; k++) {
      ride.status = 'open';
      ride.reliability = 0;
      if (onRideDispatch(world, ride)) broke++;
      world.state.staff.pendingBreakdowns = [];
    }
    expect(broke / n).toBeGreaterThan(0.19);
    expect(broke / n).toBeLessThan(0.215);
  });

  it('no roll and no wear while closed, testing, or inspecting', () => {
    const { world, ride } = setup();
    const rng = world.state.rng;
    ride.status = 'closed';
    expect(onRideDispatch(world, ride)).toBe(false);
    ride.status = 'testing';
    expect(onRideDispatch(world, ride)).toBe(false);
    ride.status = 'inspecting';
    expect(onRideDispatch(world, ride)).toBe(true);
    expect(world.state.rng).toBe(rng);
    expect(ride.reliability).toBe(REL_MAX);
  });
});

describe('guests and breakdowns', () => {
  it('queueing guests think "The ride broke down. Typical!"', () => {
    const { world, ride } = setup();
    const g = addGuestDirect(world, tileIndex(world.state.map, 21, 13), { state: 'queueing', activityId: ride.id });
    ride.queue = [g.id];
    breakDown(world, ride, 'stopped');
    expect(g.thoughts.map((t) => t.id)).toContain(THOUGHT.rideBrokeDown);
  });

  it('riders on a stopped track ride lose 1 happiness per decision interval and think "We are stuck!"', () => {
    const { world, ride } = setup('track');
    const g = addGuestDirect(world, tileIndex(world.state.map, 21, 11), {
      state: 'riding',
      activityId: ride.id,
      seat: { rideId: ride.id, trainId: 0, car: 0, seat: 0 },
    });
    breakDown(world, ride, 'train_stalled');
    stepStaffSystems(world, STUCK_RIDER_INTERVAL);
    expect(g.needs.happiness).toBe(180);
    stepStaffSystems(world, 1);
    expect(g.needs.happiness).toBe(179);
    expect(g.thoughts.map((t) => t.id)).toEqual([THOUGHT.stuck]);
    stepStaffSystems(world, STUCK_RIDER_INTERVAL);
    expect(g.needs.happiness).toBe(178);
  });

  it('slow_running riders are not stuck', () => {
    const { world, ride } = setup('track');
    const g = addGuestDirect(world, 0, { state: 'riding', activityId: ride.id, seat: { rideId: ride.id, trainId: 0, car: 0, seat: 0 } });
    breakDown(world, ride, 'slow_running');
    stepStaffSystems(world, 3 * STUCK_RIDER_INTERVAL + 1);
    expect(g.needs.happiness).toBe(180);
  });

  it('guests score a ride ×RECENT_BREAK_SCORE for 1 day after a fix', () => {
    const { world, ride } = setup();
    expect(recentBreakFactor(world, ride)).toBe(1);
    const r = executeCommand(world, { type: 'hireStaff', staffType: 'mechanic' }, { setup: true });
    expect(r.ok).toBe(true);
    const m = world.state.staff.members[0];
    if (!m) throw new Error('no mechanic');
    m.tile = ride.exit?.outside ?? -1;
    breakDown(world, ride, 'gate_stuck');
    for (let k = 0; k < 2000 && ride.status === 'broken'; k++) stepStaffSystems(world, 1);
    expect(ride.status).toBe('open');
    expect(recentBreakFactor(world, ride)).toBe(RECENT_BREAK_SCORE);
    stepStaffSystems(world, RECENT_BREAK_TICKS);
    expect(recentBreakFactor(world, ride)).toBe(1);
    expect(world.state.staff.recentFixes).toEqual([]);
  });
});

describe('reliabilityScore (rating sub-score B, §4.13)', () => {
  it('is 1 with no rides', () => {
    expect(reliabilityScore(makeTestWorld())).toBe(1);
  });

  it('1 − min(1, (brokenNow + 0.5 × brokeThisMonth) / rides)', () => {
    const world = makeTestWorld();
    const rides = [10, 20, 30, 40].map((x) => placeRideDirect(world, 'carousel', x, 30));
    for (const r of rides) r.status = 'open';
    expect(reliabilityScore(world)).toBe(1);
    (rides[0] as Ride).status = 'broken';
    (rides[0] as Ride).breakdownsThisMonth = 1;
    (rides[1] as Ride).breakdownsThisMonth = 2;
    expect(reliabilityScore(world)).toBeCloseTo(1 - (1 + 0.5 * 2) / 4, 12);
    for (const r of rides) {
      r.status = 'broken';
      r.breakdownsThisMonth = 1;
    }
    expect(reliabilityScore(world)).toBe(0);
  });

  it('breakdownsThisMonth resets at month start', () => {
    const world = makeTestWorld();
    const ride = placeRideDirect(world, 'carousel', 10, 30);
    ride.breakdownsThisMonth = 3;
    world.state.tick = TICKS_PER_MONTH - 1;
    updateStaff(world);
    expect(ride.breakdownsThisMonth).toBe(3);
    world.state.tick = TICKS_PER_MONTH;
    updateStaff(world);
    expect(ride.breakdownsThisMonth).toBe(0);
  });
});

describe('reference integrity', () => {
  it('a demolished broken ride leaves the queue and frees its Mechanic', () => {
    const { world, ride } = setup();
    const r = executeCommand(world, { type: 'hireStaff', staffType: 'mechanic' }, { setup: true });
    if (!r.ok) throw new Error('hire');
    const m = world.state.staff.members[0];
    if (!m) throw new Error('no mechanic');
    m.tile = tileIndex(world.state.map, 30, 9);
    const other = placeRideDirect(world, 'carousel', 40, 10);
    other.status = 'open';
    breakDown(world, ride, 'stopped');
    breakDown(world, other, 'stopped');
    expect(m.fixRideId).toBe(ride.id);
    stepStaffSystems(world, 5);
    world.state.rides = world.state.rides.filter((x) => x.id !== ride.id);
    stepStaffSystems(world, 1);
    expect(m.fixRideId).toBe(other.id);
    expect(world.state.staff.pendingBreakdowns).toEqual([]);
    world.state.rides = [];
    stepStaffSystems(world, 1);
    expect(m.fixRideId).toBe(-1);
    expect(m.targetRideId).toBe(-1);
  });
});
