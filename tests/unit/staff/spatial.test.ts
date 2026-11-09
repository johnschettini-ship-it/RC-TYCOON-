import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/pathing', async () => (await import('./fakes')).fakePathing());
vi.mock('../../../src/sim/notifications', async () => (await import('./fakes')).fakeNotifications());
vi.mock('../../../src/sim/rides/flat/api', async () => (await import('./fakes')).fakeFlatApi());

import { countGuestsWithin, guestCountOnTile, guestIdsOnTile, invalidateGuestIndex } from '../../../src/sim/spatial';
import { decisionHooks } from '../../../src/sim/litter/hooks';
import { breakDown, initRideReliability } from '../../../src/sim/breakdowns/api';
import { hourlyStaff } from '../../../src/sim/staff/update';
import { Content, PathItem, tileIndex } from '../../../src/sim/map';
import { STAFF_THOUGHTS } from '../../../src/data/strings/staff';
import { executeCommand } from '../../../src/sim/commands';
import { addGuestDirect, makeTestWorld, placeRideDirect } from '../../helpers/world';
import { pathLine } from './fakes';
import { stepStaffSystems } from './steps';
import type { Staff } from '../../../src/sim/staff/types';

describe('guest-per-tile spatial index (§4.1)', () => {
  it('counts guests per tile and within a Chebyshev radius', () => {
    const world = makeTestWorld();
    const map = world.state.map;
    const c = tileIndex(map, 20, 20);
    const a = addGuestDirect(world, c);
    const b = addGuestDirect(world, c);
    addGuestDirect(world, tileIndex(map, 24, 16)); // dx 4, dy 4
    addGuestDirect(world, tileIndex(map, 25, 20)); // dx 5
    addGuestDirect(world, tileIndex(map, 0, 0));
    expect(guestCountOnTile(world, c)).toBe(2);
    expect(guestIdsOnTile(world, c)).toEqual([a.id, b.id]);
    expect(countGuestsWithin(world, c, 0)).toBe(2);
    expect(countGuestsWithin(world, c, 4)).toBe(3);
    expect(countGuestsWithin(world, c, 5)).toBe(4);
    expect(countGuestsWithin(world, tileIndex(map, 1, 1), 3)).toBe(1); // clipped at the map edge
  });

  it('follows guests that change tile once invalidated (or on the next tick)', () => {
    const world = makeTestWorld();
    const map = world.state.map;
    const g = addGuestDirect(world, tileIndex(map, 10, 10));
    expect(countGuestsWithin(world, tileIndex(map, 30, 30), 2)).toBe(0);
    g.tile = tileIndex(map, 30, 31);
    invalidateGuestIndex(world);
    expect(countGuestsWithin(world, tileIndex(map, 30, 30), 2)).toBe(1);
    g.tile = tileIndex(map, 10, 10);
    world.state.tick++;
    expect(countGuestsWithin(world, tileIndex(map, 30, 30), 2)).toBe(0);
  });
});

describe('"Nice clean park!"', () => {
  it('a guest in a spotless area of a clean park thinks it', () => {
    const world = makeTestWorld();
    pathLine(world, 10, 20, 40, 20);
    const map = world.state.map;
    const g = addGuestDirect(world, tileIndex(map, 20, 20));
    decisionHooks.dirt(world, g);
    expect(g.thoughts.map((t) => t.id)).toEqual([STAFF_THOUGHTS.cleanPark]);
    // Once per game day.
    world.state.tick += 10;
    decisionHooks.dirt(world, g);
    expect(g.thoughts).toHaveLength(1);
  });

  it('not in a dirty park', () => {
    const world = makeTestWorld();
    pathLine(world, 10, 20, 40, 20);
    const map = world.state.map;
    map.litter[tileIndex(map, 35, 20)] = 8;
    const g = addGuestDirect(world, tileIndex(map, 20, 20));
    decisionHooks.dirt(world, g);
    expect(g.thoughts).toHaveLength(0);
  });
});

describe('status restore after a fix, for each breakdown type', () => {
  it.each([
    ['flat', 'stopped'],
    ['flat', 'gate_stuck'],
    ['flat', 'slow_running'],
    ['track', 'train_stalled'],
    ['track', 'gate_stuck'],
    ['track', 'slow_running'],
  ] as const)('%s %s → open again', (kind, type) => {
    const world = makeTestWorld();
    pathLine(world, 2, 9, 60, 9);
    const ride = placeRideDirect(world, 'carousel', 20, 10);
    initRideReliability(world, ride);
    ride.kind = kind;
    ride.status = 'open';
    ride.inspectionIntervalTicks = 0;
    const r = executeCommand(world, { type: 'hireStaff', staffType: 'mechanic' }, { setup: true });
    if (!r.ok) throw new Error('hire');
    (world.state.staff.members[0] as Staff).tile = tileIndex(world.state.map, 30, 9);
    breakDown(world, ride, type);
    expect(ride.status).toBe('broken');
    expect(ride.breakdownType).toBe(type);
    for (let k = 0; k < 3000 && (ride.status as string) === 'broken'; k++) stepStaffSystems(world, 1);
    expect(ride.status).toBe('open');
    expect(ride.breakdownType).toBeNull();
    expect(ride.statusBeforeBreakdown).toBeNull();
  });
});

describe('hourly cleanup', () => {
  it('path items, litter, and mess on tiles that are no longer footpaths are cleared', () => {
    const world = makeTestWorld();
    pathLine(world, 10, 20, 12, 20);
    const map = world.state.map;
    const t = tileIndex(map, 11, 20);
    map.pathItem[t] = PathItem.Bin;
    map.binFill[t] = 5;
    map.litter[t] = 3;
    map.mess[t] = 1;
    const q = tileIndex(map, 12, 20);
    map.litter[q] = 2;
    map.content[q] = Content.Queue; // litter stays on queues; items do not
    map.pathItem[q] = PathItem.Bench;
    world.state.tick = 600;
    hourlyStaff(world);
    expect(map.pathItem[t]).toBe(PathItem.Bin);
    map.content[t] = Content.Empty; // the path was demolished
    hourlyStaff(world);
    expect([map.pathItem[t], map.binFill[t], map.litter[t], map.mess[t]]).toEqual([0, 0, 0, 0]);
    expect(map.pathItem[q]).toBe(PathItem.None);
    expect(map.litter[q]).toBe(2);
  });
});
