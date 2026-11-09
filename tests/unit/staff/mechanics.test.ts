import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/pathing', async () => (await import('./fakes')).fakePathing());
vi.mock('../../../src/sim/notifications', async () => (await import('./fakes')).fakeNotifications());
vi.mock('../../../src/sim/rides/flat/api', async () => (await import('./fakes')).fakeFlatApi());

import { executeCommand } from '../../../src/sim/commands';
import { tileIndex } from '../../../src/sim/map';
import { breakDown, onRideDispatch } from '../../../src/sim/breakdowns/api';
import { fixedReliability, inspectedReliability } from '../../../src/sim/breakdowns/reliability';
import { FIX_TICKS, INSPECTION_TICKS, STAFF_SEARCH_RADIUS } from '../../../src/data/tuning/staff';
import { STAFF_MESSAGES } from '../../../src/data/strings/staff';
import { makeTestWorld, placeRideDirect } from '../../helpers/world';
import { notifyLog, pathLine } from './fakes';
import { stepStaffSystems } from './steps';
import type { World } from '../../../src/sim/types';
import type { Staff } from '../../../src/sim/staff/types';
import type { Ride } from '../../../src/sim/rides/types';

const ROW = 9;

/**
 * Footpath row y = 9 from x = 2 to x = 60. Carousels at x = 20, 40, 50 (y = 10) have their exit
 * (service tile) on the row: (21, 9), (41, 9), (51, 9).
 */
function park() {
  const world = makeTestWorld();
  pathLine(world, 2, ROW, 60, ROW);
  const map = world.state.map;
  const mk = (x: number): Ride => {
    const r = placeRideDirect(world, 'carousel', x, 10);
    r.status = 'open';
    r.reliability = 8_000;
    r.inspectionIntervalTicks = 0;
    return r;
  };
  const rides = [mk(20), mk(40), mk(50)] as [Ride, Ride, Ride];
  return { world, map, rides, at: (x: number) => tileIndex(map, x, ROW) };
}

function mechanicAt(world: World, tile: number): Staff {
  const r = executeCommand(world, { type: 'hireStaff', staffType: 'mechanic' }, { setup: true });
  if (!r.ok || r.id === undefined) throw new Error('hire failed');
  const s = world.state.staff.members.find((m) => m.id === r.id) as Staff;
  s.tile = tile;
  return s;
}

function runUntil(world: World, pred: () => boolean, max = 5000): number {
  for (let k = 0; k < max; k++) {
    if (pred()) return k;
    stepStaffSystems(world, 1);
  }
  throw new Error('condition never held');
}

beforeEach(() => {
  notifyLog.length = 0;
});

describe('service tile', () => {
  it('is the footpath outside the exit gate', () => {
    const { rides, at } = park();
    expect(rides[0].exit?.outside).toBe(at(21));
    expect(rides[1].exit?.outside).toBe(at(41));
  });
});

describe('mechanic dispatch (§4.2)', () => {
  it('a Mechanic whose patrol contains the service tile is chosen before a nearer one', () => {
    const { world, rides, at } = park();
    const far = mechanicAt(world, at(5));
    const near = mechanicAt(world, at(23));
    executeCommand(world, { type: 'editPatrol', staffId: far.id, add: [at(5), at(21)], remove: [] });
    executeCommand(world, { type: 'editPatrol', staffId: near.id, add: [at(55)], remove: [] });
    breakDown(world, rides[0], 'stopped');
    expect(rides[0].assignedMechanicId).toBe(far.id);
    expect(far.fixRideId).toBe(rides[0].id);
    expect(near.fixRideId).toBe(-1);
  });

  it('an empty patrol counts as a candidate; the nearest wins', () => {
    const { world, rides, at } = park();
    mechanicAt(world, at(5)); // 16 steps
    const b = mechanicAt(world, at(25)); // 4 steps
    breakDown(world, rides[0], 'stopped');
    expect(rides[0].assignedMechanicId).toBe(b.id);
  });

  it('ties go to the lower id', () => {
    const { world, rides, at } = park();
    const a = mechanicAt(world, at(25));
    mechanicAt(world, at(17));
    breakDown(world, rides[0], 'stopped');
    expect(rides[0].assignedMechanicId).toBe(a.id);
  });

  it('falls back to any free Mechanic when no patrol contains the service tile', () => {
    const { world, rides, at } = park();
    const a = mechanicAt(world, at(5));
    const b = mechanicAt(world, at(30));
    executeCommand(world, { type: 'editPatrol', staffId: a.id, add: [at(5)], remove: [] });
    executeCommand(world, { type: 'editPatrol', staffId: b.id, add: [at(30)], remove: [] });
    breakDown(world, rides[0], 'stopped');
    expect(rides[0].assignedMechanicId).toBe(b.id);
  });

  it('a Mechanic already assigned to a breakdown is not free', () => {
    const { world, rides, at } = park();
    const a = mechanicAt(world, at(22));
    const b = mechanicAt(world, at(5));
    breakDown(world, rides[0], 'stopped');
    breakDown(world, rides[1], 'stopped');
    expect(rides[0].assignedMechanicId).toBe(a.id);
    expect(rides[1].assignedMechanicId).toBe(b.id);
  });

  it('pending breakdowns are FIFO: the next free Mechanic takes the oldest', () => {
    const { world, rides, at } = park();
    const m = mechanicAt(world, at(22));
    breakDown(world, rides[0], 'gate_stuck');
    breakDown(world, rides[2], 'stopped');
    breakDown(world, rides[1], 'stopped');
    expect(rides[0].assignedMechanicId).toBe(m.id);
    expect(world.state.staff.pendingBreakdowns).toEqual([rides[2].id, rides[1].id]);
    runUntil(world, () => rides[0].status === 'open');
    expect(m.fixRideId).toBe(rides[2].id);
    expect(world.state.staff.pendingBreakdowns).toEqual([rides[1].id]);
    runUntil(world, () => rides[2].status === 'open');
    expect(m.fixRideId).toBe(rides[1].id);
    expect(world.state.staff.pendingBreakdowns).toEqual([]);
  });

  it('firing a Mechanic puts the breakdown back at the front of the queue', () => {
    const { world, rides, at } = park();
    const m = mechanicAt(world, at(22));
    breakDown(world, rides[0], 'stopped');
    breakDown(world, rides[1], 'stopped');
    expect(world.state.staff.pendingBreakdowns).toEqual([rides[1].id]);
    stepStaffSystems(world, 30);
    executeCommand(world, { type: 'fireStaff', staffId: m.id });
    expect(world.state.staff.pendingBreakdowns).toEqual([rides[0].id, rides[1].id]);
    expect(rides[0].assignedMechanicId).toBeNull();
    const n = mechanicAt(world, at(45));
    stepStaffSystems(world, 1);
    expect(n.fixRideId).toBe(rides[0].id);
  });

  it('"No mechanic is available" appears once per breakdown when the park has none', () => {
    const { world, rides, at } = park();
    breakDown(world, rides[0], 'stopped');
    stepStaffSystems(world, 300);
    const noMech = () => notifyLog.filter((n) => n.textId === STAFF_MESSAGES.noMechanic).length;
    expect(noMech()).toBe(1);
    expect(world.state.staff.pendingBreakdowns).toEqual([rides[0].id]);
    breakDown(world, rides[1], 'stopped');
    expect(noMech()).toBe(2);
    expect(notifyLog.filter((n) => n.textId === STAFF_MESSAGES.breakdown)).toHaveLength(2);
    mechanicAt(world, at(30));
    breakDown(world, rides[2], 'stopped');
    expect(noMech()).toBe(2);
    stepStaffSystems(world, 1);
    expect(world.state.staff.members[0]?.fixRideId).toBe(rides[0].id);
  });
});

describe('fixing (§4.5)', () => {
  it('the Mechanic fixes on the service tile for FIX_TICKS × factor; the ride returns to its status', () => {
    const { world, rides, at } = park();
    const m = mechanicAt(world, at(25));
    const r = rides[0];
    breakDown(world, r, 'stopped');
    runUntil(world, () => m.state === 'fixing');
    expect(m.tile).toBe(at(21));
    expect(m.stateTicks).toBe(FIX_TICKS);
    const ticks = runUntil(world, () => r.status !== 'broken');
    expect(ticks).toBe(FIX_TICKS);
    expect(r.status).toBe('open');
    expect(r.breakdownType).toBeNull();
    expect(r.statusBeforeBreakdown).toBeNull();
    expect(r.assignedMechanicId).toBeNull();
    expect(r.reliability).toBe(fixedReliability(8_000, 0));
    expect(m.fixRideId).toBe(-1);
    expect(world.state.staff.recentFixes.map((f) => f.rideId)).toEqual([r.id]);
  });

  it.each([
    ['stopped', 1],
    ['gate_stuck', 0.5],
    ['slow_running', 0.75],
    ['train_stalled', 1.5],
  ] as const)('fix time for %s is FIX_TICKS × %s', (type, factor) => {
    const { world, rides, at } = park();
    const m = mechanicAt(world, at(21));
    if (type === 'train_stalled') rides[0].kind = 'track';
    breakDown(world, rides[0], type);
    runUntil(world, () => m.state === 'fixing');
    expect(m.stateTicks).toBe(Math.round(FIX_TICKS * factor));
  });

  it('a closed ride that broke returns to closed', () => {
    const { world, rides, at } = park();
    mechanicAt(world, at(21));
    rides[0].status = 'closed';
    breakDown(world, rides[0], 'gate_stuck');
    expect(rides[0].statusBeforeBreakdown).toBe('closed');
    runUntil(world, () => rides[0].status !== 'broken');
    expect(rides[0].status).toBe('closed');
  });
});

describe('inspections (§4.2, §4.5)', () => {
  it('a ride is due when now − lastInspectionTick ≥ interval', () => {
    const { world, rides, at } = park();
    const m = mechanicAt(world, at(23));
    rides[0].inspectionIntervalTicks = 1200;
    rides[0].lastInspectionTick = world.state.tick - 1199;
    stepStaffSystems(world, 1);
    expect(m.task).toBe('wander');
    const n = mechanicAt(world, at(23));
    rides[0].lastInspectionTick = world.state.tick - 1200;
    stepStaffSystems(world, 1);
    expect(n.task).toBe('inspect');
    expect(n.targetRideId).toBe(rides[0].id);
  });

  it('interval 0 means never', () => {
    const { world, rides, at } = park();
    const m = mechanicAt(world, at(23));
    rides[0].inspectionIntervalTicks = 0;
    rides[0].lastInspectionTick = -100_000;
    stepStaffSystems(world, 1);
    expect(m.task).toBe('wander');
  });

  it('picks the highest elapsed / interval; ties go to the lower ride id', () => {
    const { world, rides, at } = park();
    pathLine(world, 2, 8, 60, 8);
    // Put both service tiles within reach: rides 0 (21, 9) and a ride at (24, 10) → (25, 9).
    const r2 = placeRideDirect(world, 'carousel', 24, 12);
    r2.status = 'open';
    r2.exit = { gate: r2.exit?.gate ?? -1, outside: at(25) };
    const now = world.state.tick;
    rides[0].inspectionIntervalTicks = 1200;
    rides[0].lastInspectionTick = now - 1300; // 1.083
    r2.inspectionIntervalTicks = 600;
    r2.lastInspectionTick = now - 700; // 1.167
    const m = mechanicAt(world, at(23));
    stepStaffSystems(world, 1);
    expect(m.targetRideId).toBe(r2.id);
    r2.lastInspectionTick = now - 600; // 1.0 vs 1.083
    const n = mechanicAt(world, at(23));
    m.task = 'wander';
    m.targetRideId = -1;
    stepStaffSystems(world, 1);
    expect(n.targetRideId).toBe(rides[0].id);
    const w2 = park();
    const a = w2.rides[0];
    const b = placeRideDirect(w2.world, 'carousel', 24, 12);
    b.status = 'open';
    b.exit = { gate: b.exit?.gate ?? -1, outside: w2.at(25) };
    a.inspectionIntervalTicks = 600;
    b.inspectionIntervalTicks = 1200;
    a.lastInspectionTick = w2.world.state.tick - 600;
    b.lastInspectionTick = w2.world.state.tick - 1200;
    const k = mechanicAt(w2.world, w2.at(23));
    stepStaffSystems(w2.world, 1);
    expect(k.targetRideId).toBe(a.id);
  });

  it('only looks STAFF_SEARCH_RADIUS steps for due rides', () => {
    const { world, rides, at } = park();
    rides[0].inspectionIntervalTicks = 200;
    rides[0].lastInspectionTick = world.state.tick - 1000;
    const m = mechanicAt(world, at(21 + STAFF_SEARCH_RADIUS + 1));
    stepStaffSystems(world, 1);
    expect(m.task).toBe('wander');
  });

  it('waits for the cycle to end, inspects for INSPECTION_TICKS, then raises reliability', () => {
    const { world, rides, at } = park();
    const r = rides[0];
    r.inspectionIntervalTicks = 1200;
    r.lastInspectionTick = world.state.tick - 2000;
    r.reliability = 6_000;
    r.cycle = { phase: 'running', ticks: 10 };
    const m = mechanicAt(world, at(21));
    stepStaffSystems(world, 1);
    expect(m.state).toBe('inspecting');
    stepStaffSystems(world, 50);
    expect(r.status).toBe('open'); // still running: the Mechanic waits
    r.cycle = { phase: 'waiting', ticks: 0 };
    stepStaffSystems(world, 1);
    expect(r.status).toBe('inspecting');
    expect(onRideDispatch(world, r)).toBe(true); // no new cycle during the inspection
    expect(r.reliability).toBe(6_000);
    const ticks = runUntil(world, () => r.status !== 'inspecting');
    expect(ticks).toBe(INSPECTION_TICKS);
    expect(r.status).toBe('open');
    expect(r.reliability).toBe(inspectedReliability(6_000, 0));
    expect(r.lastInspectionTick).toBe(world.state.tick - 1);
    expect(m.state).toBe('walking');
  });

  it('a Mechanic inspecting on site finishes the inspection before a dispatch', () => {
    const { world, rides, at } = park();
    const r = rides[0];
    r.inspectionIntervalTicks = 1200;
    r.lastInspectionTick = world.state.tick - 2000;
    const m = mechanicAt(world, at(21));
    stepStaffSystems(world, 2);
    expect(r.status).toBe('inspecting');
    stepStaffSystems(world, 10);
    breakDown(world, rides[1], 'stopped');
    expect(rides[1].assignedMechanicId).toBe(m.id);
    expect(m.state).toBe('inspecting');
    runUntil(world, () => r.status === 'open');
    expect(m.task).toBe('fix');
    runUntil(world, () => rides[1].status === 'open');
  });

  it('a Mechanic walking to an inspection drops it for a dispatch', () => {
    const { world, rides, at } = park();
    rides[0].inspectionIntervalTicks = 1200;
    rides[0].lastInspectionTick = world.state.tick - 2000;
    const m = mechanicAt(world, at(28));
    stepStaffSystems(world, 1);
    expect(m.task).toBe('inspect');
    breakDown(world, rides[1], 'stopped');
    expect(m.task).toBe('fix');
    runUntil(world, () => rides[1].status === 'open');
    expect(rides[0].status).toBe('open');
  });

  it('firing an inspecting Mechanic gives the ride its status back', () => {
    const { world, rides, at } = park();
    rides[0].inspectionIntervalTicks = 1200;
    rides[0].lastInspectionTick = world.state.tick - 2000;
    const m = mechanicAt(world, at(21));
    stepStaffSystems(world, 3);
    expect(rides[0].status).toBe('inspecting');
    executeCommand(world, { type: 'fireStaff', staffId: m.id });
    expect(rides[0].status).toBe('open');
  });
});
