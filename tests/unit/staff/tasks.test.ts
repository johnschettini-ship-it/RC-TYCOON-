import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/pathing', async () => (await import('./fakes')).fakePathing());
vi.mock('../../../src/sim/notifications', async () => (await import('./fakes')).fakeNotifications());

import { executeCommand } from '../../../src/sim/commands';
import { PathItem, tileIndex } from '../../../src/sim/map';
import { STAFF } from '../../../src/data/catalog/people';
import {
  BIN_EMPTY_AT,
  BIN_EMPTY_TICKS,
  MESS_CLEAN_TICKS,
  PERFORMER_SHOW_TICKS,
  SECURITY_ROAM_RADIUS,
  STAFF_SEARCH_RADIUS,
  SWEEP_TICKS_PER_LITTER,
} from '../../../src/data/tuning/staff';
import { isPatrolConnected } from '../../../src/sim/staff/tasks';
import { patrolHas } from '../../../src/sim/staff/patrol';
import { addGuestDirect, makeTestWorld } from '../../helpers/world';
import { pathLine } from './fakes';
import { stepStaffSystems } from './steps';
import type { World } from '../../../src/sim/types';
import type { Staff } from '../../../src/sim/staff/types';
import type { StaffType } from '../../../src/data/catalog/types';

const speed = (t: StaffType) => (STAFF.find((s) => s.id === t) as { ticksPerTile: number }).ticksPerTile;

function corridor(x0 = 10, x1 = 40, y = 20) {
  const world = makeTestWorld();
  pathLine(world, x0, y, x1, y);
  const map = world.state.map;
  return { world, map, at: (x: number, yy = y) => tileIndex(map, x, yy) };
}

function hireAt(world: World, type: StaffType, tile: number): Staff {
  const r = executeCommand(world, { type: 'hireStaff', staffType: type }, { setup: true });
  if (!r.ok || r.id === undefined) throw new Error('hire failed');
  const s = world.state.staff.members.find((m) => m.id === r.id) as Staff;
  s.tile = tile;
  return s;
}

/** Run until `pred` holds; returns the ticks taken. */
function runUntil(world: World, pred: () => boolean, max = 5000): number {
  for (let k = 0; k < max; k++) {
    if (pred()) return k;
    stepStaffSystems(world, 1);
  }
  throw new Error('condition never held');
}

describe('Groundskeeper', () => {
  it('walks to litter, sweeps for SWEEP_TICKS_PER_LITTER × count, and clears it', () => {
    const { world, map, at } = corridor();
    map.litter[at(25)] = 3;
    const g = hireAt(world, 'groundskeeper', at(20));
    stepStaffSystems(world, 1);
    expect(g.task).toBe('sweep');
    expect(g.targetTile).toBe(at(25));
    const walked = runUntil(world, () => g.state === 'sweeping');
    expect(walked).toBe(5 * speed('groundskeeper'));
    expect(g.stateTicks).toBe(3 * SWEEP_TICKS_PER_LITTER);
    runUntil(world, () => g.state === 'walking');
    expect(map.litter[at(25)]).toBe(0);
  });

  it('priority: mess, then a bin with fill ≥ BIN_EMPTY_AT, then litter', () => {
    const { world, map, at } = corridor();
    map.litter[at(21)] = 8;
    map.pathItem[at(22)] = PathItem.Bin;
    map.binFill[at(22)] = BIN_EMPTY_AT;
    map.mess[at(28)] = 1;
    const g = hireAt(world, 'groundskeeper', at(20));
    stepStaffSystems(world, 1);
    expect(g.task).toBe('mess');
    runUntil(world, () => g.state === 'cleaning');
    expect(g.stateTicks).toBe(MESS_CLEAN_TICKS);
    runUntil(world, () => map.mess[at(28)] === 0);
    runUntil(world, () => g.task === 'bin');
    runUntil(world, () => g.state === 'emptying');
    expect(g.stateTicks).toBe(BIN_EMPTY_TICKS);
    runUntil(world, () => map.binFill[at(22)] === 0);
    runUntil(world, () => g.task === 'sweep');
    runUntil(world, () => map.litter[at(21)] === 0);
  });

  it('ignores a bin below BIN_EMPTY_AT', () => {
    const { world, map, at } = corridor();
    map.pathItem[at(22)] = PathItem.Bin;
    map.binFill[at(22)] = BIN_EMPTY_AT - 1;
    const g = hireAt(world, 'groundskeeper', at(20));
    stepStaffSystems(world, 1);
    expect(g.task).toBe('wander');
  });

  it('picks the tile with the most litter; ties go to the nearest', () => {
    const { world, map, at } = corridor();
    map.litter[at(22)] = 2;
    map.litter[at(26)] = 5;
    map.litter[at(16)] = 5;
    const g = hireAt(world, 'groundskeeper', at(20));
    stepStaffSystems(world, 1);
    expect(g.targetTile).toBe(at(16)); // 4 steps vs 6 steps
  });

  it('searches STAFF_SEARCH_RADIUS steps and no further', () => {
    const a = corridor();
    a.map.litter[a.at(20 + STAFF_SEARCH_RADIUS + 1)] = 4;
    const g = hireAt(a.world, 'groundskeeper', a.at(20));
    stepStaffSystems(a.world, 1);
    expect(g.task).toBe('wander');
    const b = corridor();
    b.map.litter[b.at(20 + STAFF_SEARCH_RADIUS)] = 4;
    const h = hireAt(b.world, 'groundskeeper', b.at(20));
    stepStaffSystems(b.world, 1);
    expect(h.task).toBe('sweep');
  });

  it('re-check every 40 ticks drops a litter target for a mess target', () => {
    const { world, map, at } = corridor();
    map.litter[at(30)] = 1;
    const g = hireAt(world, 'groundskeeper', at(20));
    stepStaffSystems(world, 1);
    expect(g.task).toBe('sweep');
    map.mess[at(18)] = 1;
    stepStaffSystems(world, 30);
    expect(g.task).toBe('sweep'); // no re-check before 40 ticks
    stepStaffSystems(world, 30);
    expect(g.task).toBe('mess');
    expect(g.targetTile).toBe(at(18));
  });

  it('two Groundskeepers do not chase the same tile', () => {
    const { world, map, at } = corridor();
    map.litter[at(25)] = 2;
    map.litter[at(15)] = 1;
    const a = hireAt(world, 'groundskeeper', at(20));
    const b = hireAt(world, 'groundskeeper', at(20));
    stepStaffSystems(world, 1);
    expect(a.targetTile).toBe(at(25));
    expect(b.targetTile).toBe(at(15));
  });
});

describe('patrol areas', () => {
  function patrol(world: World, s: Staff, tiles: number[]) {
    expect(executeCommand(world, { type: 'editPatrol', staffId: s.id, add: tiles, remove: [] }).ok).toBe(true);
  }

  it('never targets work outside the patrol', () => {
    const { world, map, at } = corridor();
    map.litter[at(22)] = 8;
    const g = hireAt(world, 'groundskeeper', at(20));
    patrol(world, g, [at(17), at(18), at(19), at(20)]);
    stepStaffSystems(world, 1);
    expect(g.task).toBe('wander');
  });

  it('wandering stays inside the patrol', () => {
    const { world, at } = corridor();
    const tiles = [at(18), at(19), at(20), at(21), at(22)];
    const g = hireAt(world, 'security', at(20));
    patrol(world, g, tiles);
    const p = g.patrol as Uint8Array;
    for (let k = 0; k < 2000; k++) {
      stepStaffSystems(world, 1);
      expect(patrolHas(p, g.tile)).toBe(true);
      if (g.nextTile !== -1) expect(patrolHas(p, g.nextTile)).toBe(true);
    }
  });

  it('a staff member outside the patrol walks into it first', () => {
    const { world, at } = corridor();
    const g = hireAt(world, 'groundskeeper', at(10));
    patrol(world, g, [at(30), at(31)]);
    stepStaffSystems(world, 1);
    expect(g.task).toBe('toPatrol');
    runUntil(world, () => g.tile === at(30));
    expect(isPatrolConnected(world, g)).toBe(true);
  });

  it('an unreachable patrol works as if empty and reports "not connected"', () => {
    const { world, map, at } = corridor();
    pathLine(world, 50, 50, 52, 50); // an island
    map.litter[at(23)] = 2;
    const g = hireAt(world, 'groundskeeper', at(20));
    patrol(world, g, [tileIndex(map, 51, 50)]);
    expect(isPatrolConnected(world, g)).toBe(false);
    stepStaffSystems(world, 1);
    expect(g.task).toBe('sweep');
    expect(g.targetTile).toBe(at(23));
  });
});

describe('Security Guard', () => {
  it('roams to random reachable patrol tiles within SECURITY_ROAM_RADIUS', () => {
    const { world, map, at } = corridor(0, 63);
    const s = hireAt(world, 'security', at(30));
    const seen = new Set<number>();
    let last = -1;
    for (let k = 0; k < 400; k++) {
      const from = s.tile;
      stepStaffSystems(world, 1);
      if (s.task === 'roam' && s.targetTile !== last) {
        // A new target is chosen at a tile boundary, from the tile the guard stands on.
        expect(Math.abs((s.targetTile % map.width) - (from % map.width))).toBeLessThanOrEqual(SECURITY_ROAM_RADIUS);
        seen.add(s.targetTile);
        last = s.targetTile;
      }
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('the first roam target is within the radius of the start', () => {
    const { world, map, at } = corridor(0, 63);
    const s = hireAt(world, 'security', at(30));
    stepStaffSystems(world, 1);
    expect(s.task).toBe('roam');
    expect(Math.abs((s.targetTile % map.width) - 30)).toBeLessThanOrEqual(SECURITY_ROAM_RADIUS);
    expect(s.targetTile).not.toBe(at(30));
  });
});

describe('Performer', () => {
  it('performs at the busiest sampled spot for PERFORMER_SHOW_TICKS, then walks', () => {
    const { world, at } = corridor(15, 30);
    for (let k = 0; k < 12; k++) addGuestDirect(world, at(27));
    const p = hireAt(world, 'performer', at(20));
    stepStaffSystems(world, 1);
    expect(p.task).toBe('perform');
    runUntil(world, () => p.state === 'performing');
    expect(p.stateTicks).toBe(PERFORMER_SHOW_TICKS);
    expect(Math.abs((p.tile % 64) - 27)).toBeLessThanOrEqual(4);
    runUntil(world, () => p.state === 'walking');
    expect(p.walkTicksLeft).toBeGreaterThanOrEqual(99);
    expect(p.walkTicksLeft).toBeLessThanOrEqual(300);
    expect(p.task).toBe('none');
    stepStaffSystems(world, 1);
    expect(p.task).toBe('wander');
  });
});
