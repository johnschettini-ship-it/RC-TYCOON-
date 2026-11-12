import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/pathing', async () => (await import('./fakes')).fakePathing());
vi.mock('../../../src/sim/notifications', async () => (await import('./fakes')).fakeNotifications());

import { executeCommand } from '../../../src/sim/commands';
import { currentLedger } from '../../../src/sim/economy/ledger';
import { PathItem, tileIndex } from '../../../src/sim/map';
import { STAFF, PATH_ITEMS } from '../../../src/data/catalog/people';
import { STAFF_FIRST_NAMES } from '../../../src/data/names';
import { STAFF_ERRORS } from '../../../src/data/strings/staff';
import { STAFF_MAX } from '../../../src/data/tuning/staff';
import { patrolByteLength, patrolHas } from '../../../src/sim/staff/patrol';
import { isBroken, setBroken } from '../../../src/sim/litter/pathItems';
import { makeTestWorld, placeQueue, placeRideDirect, stateHash } from '../../helpers/world';
import type { World } from '../../../src/sim/types';

function hire(world: World, staffType: 'groundskeeper' | 'mechanic' | 'security' | 'performer') {
  const r = executeCommand(world, { type: 'hireStaff', staffType });
  if (!r.ok || r.id === undefined) throw new Error('hire failed');
  return r.id;
}

const cost = (id: string) => (STAFF.find((s) => s.id === id) as { hireCost: number }).hireCost;
const itemCost = (id: string) => (PATH_ITEMS.find((s) => s.id === id) as { buildCost: number }).buildCost;

describe('hireStaff / fireStaff', () => {
  let world: World;
  beforeEach(() => {
    world = makeTestWorld();
  });

  it('charges the catalog hire cost to staffHiring and spawns next to the entrance', () => {
    const cash = world.state.park.cash;
    const r = executeCommand(world, { type: 'hireStaff', staffType: 'mechanic' });
    expect(r).toMatchObject({ ok: true, cost: cost('mechanic') });
    expect(world.state.park.cash).toBe(cash - cost('mechanic'));
    expect(currentLedger(world).lines.staffHiring).toBe(-cost('mechanic'));
    const m = world.state.staff.members[0];
    const map = world.state.map;
    expect(m?.tile).toBe(world.state.map.entranceTile - map.width); // the stub tile north of the entrance
    expect(m?.type).toBe('mechanic');
    expect(m?.state).toBe('walking');
    expect(m?.patrol).toBeNull();
    expect(m?.hiredTick).toBe(world.state.tick);
  });

  it('gives an original name from the names list through the seeded RNG', () => {
    hire(world, 'groundskeeper');
    const name = world.state.staff.members[0]?.name ?? '';
    expect(STAFF_FIRST_NAMES).toContain(name.split(' ')[0]);
    expect(name).toMatch(/^[A-Z][a-z]+ [A-Z]\.$/);
    const other = makeTestWorld();
    hire(other, 'groundskeeper');
    expect(other.state.staff.members[0]?.name).toBe(name);
  });

  it('hire is allowed at exact cash and fails below it', () => {
    world.state.park.cash = cost('security');
    expect(executeCommand(world, { type: 'hireStaff', staffType: 'security' }).ok).toBe(true);
    expect(world.state.park.cash).toBe(0);
    world.state.park.cash = cost('security') - 1;
    const before = stateHash(world);
    expect(executeCommand(world, { type: 'hireStaff', staffType: 'security' })).toEqual({
      ok: false,
      reason: STAFF_ERRORS.notEnoughCash,
    });
    expect(stateHash(world)).toBe(before);
  });

  it('fails with "Staff limit reached" at STAFF_MAX', () => {
    world.state.park.cash = 100_000_000;
    for (let k = 0; k < STAFF_MAX; k++) hire(world, 'security');
    expect(world.state.staff.members).toHaveLength(STAFF_MAX);
    expect(executeCommand(world, { type: 'hireStaff', staffType: 'security' })).toEqual({
      ok: false,
      reason: 'Staff limit reached',
    });
  });

  it('setup mode skips cash and ledger', () => {
    world.state.park.cash = 0;
    const r = executeCommand(world, { type: 'hireStaff', staffType: 'performer' }, { setup: true });
    expect(r.ok).toBe(true);
    expect(world.state.park.cash).toBe(0);
    expect(currentLedger(world).lines.staffHiring).toBe(0);
  });

  it('members stay sorted by id', () => {
    const a = hire(world, 'groundskeeper');
    const b = hire(world, 'mechanic');
    expect(world.state.staff.members.map((m) => m.id)).toEqual([a, b]);
    expect(b).toBeGreaterThan(a);
  });

  it('fire removes at once with no refund', () => {
    const id = hire(world, 'groundskeeper');
    const cash = world.state.park.cash;
    expect(executeCommand(world, { type: 'fireStaff', staffId: id })).toMatchObject({ ok: true, cost: 0 });
    expect(world.state.staff.members).toHaveLength(0);
    expect(world.state.park.cash).toBe(cash);
    expect(executeCommand(world, { type: 'fireStaff', staffId: id })).toEqual({ ok: false, reason: 'Staff member not found' });
  });
});

describe('patrol commands', () => {
  it('editPatrol adds and removes tiles; an empty patrol becomes null (whole park)', () => {
    const world = makeTestWorld();
    const id = hire(world, 'groundskeeper');
    const map = world.state.map;
    const a = tileIndex(map, 10, 10);
    const b = tileIndex(map, 11, 10);
    expect(executeCommand(world, { type: 'editPatrol', staffId: id, add: [a, b], remove: [] }).ok).toBe(true);
    const p = world.state.staff.members[0]?.patrol as Uint8Array;
    expect(p.length).toBe(patrolByteLength(map));
    expect(p.length).toBe(Math.ceil((64 * 64) / 8));
    expect(patrolHas(p, a)).toBe(true);
    expect(patrolHas(p, b)).toBe(true);
    expect(patrolHas(p, a + 2)).toBe(false);
    executeCommand(world, { type: 'editPatrol', staffId: id, add: [], remove: [a] });
    expect(patrolHas(world.state.staff.members[0]?.patrol as Uint8Array, a)).toBe(false);
    executeCommand(world, { type: 'editPatrol', staffId: id, add: [], remove: [b] });
    expect(world.state.staff.members[0]?.patrol).toBeNull();
  });

  it('editPatrol rejects tiles outside the park and changes nothing', () => {
    const world = makeTestWorld();
    const id = hire(world, 'groundskeeper');
    const before = stateHash(world);
    expect(executeCommand(world, { type: 'editPatrol', staffId: id, add: [tileIndex(world.state.map, 5, 5), 0], remove: [] })).toEqual({
      ok: false,
      reason: 'Tile is outside the park',
    });
    expect(executeCommand(world, { type: 'editPatrol', staffId: id, add: [64 * 64], remove: [] })).toEqual({
      ok: false,
      reason: 'Tile is outside the park',
    });
    expect(stateHash(world)).toBe(before);
    expect(executeCommand(world, { type: 'editPatrol', staffId: 999, add: [], remove: [] })).toEqual({
      ok: false,
      reason: 'Staff member not found',
    });
  });

  it('clearPatrol resets to the whole park', () => {
    const world = makeTestWorld();
    const id = hire(world, 'security');
    executeCommand(world, { type: 'editPatrol', staffId: id, add: [tileIndex(world.state.map, 9, 9)], remove: [] });
    expect(executeCommand(world, { type: 'clearPatrol', staffId: id }).ok).toBe(true);
    expect(world.state.staff.members[0]?.patrol).toBeNull();
    expect(executeCommand(world, { type: 'clearPatrol', staffId: 777 })).toEqual({ ok: false, reason: 'Staff member not found' });
  });
});

describe('setCostume / setInspectionInterval', () => {
  it('only Performers wear costumes', () => {
    const world = makeTestWorld();
    const p = hire(world, 'performer');
    const g = hire(world, 'groundskeeper');
    expect(executeCommand(world, { type: 'setCostume', staffId: p, costume: 'boo' }).ok).toBe(true);
    expect(world.state.staff.members[0]?.costume).toBe('boo');
    expect(executeCommand(world, { type: 'setCostume', staffId: g, costume: 'boo' })).toEqual({
      ok: false,
      reason: 'Only Performers wear costumes',
    });
  });

  it('sets a ride inspection interval or fails with "Ride not found"', () => {
    const world = makeTestWorld();
    const ride = placeRideDirect(world, 'carousel', 20, 20);
    expect(executeCommand(world, { type: 'setInspectionInterval', rideId: ride.id, intervalTicks: 600 }).ok).toBe(true);
    expect(ride.inspectionIntervalTicks).toBe(600);
    expect(executeCommand(world, { type: 'setInspectionInterval', rideId: 999, intervalTicks: 600 })).toEqual({
      ok: false,
      reason: 'Ride not found',
    });
  });
});

describe('path item commands', () => {
  function setup() {
    const world = makeTestWorld();
    const map = world.state.map;
    const tile = map.entranceTile - map.width; // footpath stub
    return { world, map, tile, x: tile % map.width, y: Math.floor(tile / map.width) };
  }

  it('builds a bench or bin on a footpath and charges construction', () => {
    const { world, map, tile, x, y } = setup();
    const cash = world.state.park.cash;
    expect(executeCommand(world, { type: 'buildPathItem', x, y, itemType: 'bench' })).toMatchObject({ ok: true, cost: itemCost('bench') });
    expect(map.pathItem[tile]).toBe(PathItem.Bench);
    expect(world.state.park.cash).toBe(cash - itemCost('bench'));
    expect(currentLedger(world).lines.construction).toBe(-itemCost('bench'));
    expect(executeCommand(world, { type: 'buildPathItem', x, y, itemType: 'bin' })).toEqual({
      ok: false,
      reason: 'Tile already has an item',
    });
  });

  it('needs a footpath: not on grass, queue, or the park entrance', () => {
    const { world, map } = setup();
    expect(executeCommand(world, { type: 'buildPathItem', x: 10, y: 10, itemType: 'bin' })).toEqual({ ok: false, reason: 'Needs a footpath' });
    placeQueue(world, 12, 12);
    expect(executeCommand(world, { type: 'buildPathItem', x: 12, y: 12, itemType: 'bin' })).toEqual({ ok: false, reason: 'Needs a footpath' });
    const ex = map.entranceTile % map.width;
    expect(executeCommand(world, { type: 'buildPathItem', x: ex, y: map.height - 1, itemType: 'bin' })).toEqual({
      ok: false,
      reason: 'Needs a footpath',
    });
    expect(executeCommand(world, { type: 'buildPathItem', x: -1, y: 3, itemType: 'bin' })).toEqual({ ok: false, reason: 'Needs a footpath' });
  });

  it('lamps are unlocked from the start once Build 2 opens Phase 4 (master R23)', () => {
    const { world, x, y } = setup();
    expect(executeCommand(world, { type: 'buildPathItem', x, y, itemType: 'lamp' }).ok).toBe(true);
  });

  it('fails with "Not enough cash" below the build cost', () => {
    const { world, x, y } = setup();
    world.state.park.cash = itemCost('bin') - 1;
    expect(executeCommand(world, { type: 'buildPathItem', x, y, itemType: 'bin' })).toEqual({ ok: false, reason: 'Not enough cash' });
  });

  it('removePathItem clears the tile or fails with "No item here"', () => {
    const { world, map, tile, x, y } = setup();
    expect(executeCommand(world, { type: 'removePathItem', x, y })).toEqual({ ok: false, reason: 'No item here' });
    executeCommand(world, { type: 'buildPathItem', x, y, itemType: 'bin' });
    map.binFill[tile] = 7;
    setBroken(map, tile, true);
    expect(executeCommand(world, { type: 'removePathItem', x, y }).ok).toBe(true);
    expect(map.pathItem[tile]).toBe(PathItem.None);
    expect(map.binFill[tile]).toBe(0);
    expect(map.pathItemFlags[tile]).toBe(0);
  });

  it('repairPathItem costs 50% of build cost to repairs', () => {
    const { world, map, tile, x, y } = setup();
    executeCommand(world, { type: 'buildPathItem', x, y, itemType: 'bench' });
    expect(executeCommand(world, { type: 'repairPathItem', x, y })).toEqual({ ok: false, reason: 'Item is not broken' });
    setBroken(map, tile, true);
    const cash = world.state.park.cash;
    expect(executeCommand(world, { type: 'repairPathItem', x, y })).toMatchObject({ ok: true, cost: itemCost('bench') / 2 });
    expect(isBroken(map, tile)).toBe(false);
    expect(world.state.park.cash).toBe(cash - itemCost('bench') / 2);
    expect(currentLedger(world).lines.repairs).toBe(-itemCost('bench') / 2);
  });

  it('repairPathItem fails with "Not enough cash"', () => {
    const { world, map, tile, x, y } = setup();
    executeCommand(world, { type: 'buildPathItem', x, y, itemType: 'bin' });
    setBroken(map, tile, true);
    world.state.park.cash = itemCost('bin') / 2 - 1;
    expect(executeCommand(world, { type: 'repairPathItem', x, y })).toEqual({ ok: false, reason: 'Not enough cash' });
    expect(isBroken(map, tile)).toBe(true);
  });

  it('repairAllPathItems repairs every broken item or nothing', () => {
    const { world, map, tile, x, y } = setup();
    expect(executeCommand(world, { type: 'repairAllPathItems' })).toEqual({ ok: false, reason: 'Nothing to repair' });
    executeCommand(world, { type: 'buildPathItem', x, y, itemType: 'bench' });
    executeCommand(world, { type: 'buildPathItem', x, y: y - 1, itemType: 'bin' });
    const t2 = tile - map.width;
    setBroken(map, tile, true);
    setBroken(map, t2, true);
    const total = itemCost('bench') / 2 + itemCost('bin') / 2;
    world.state.park.cash = total - 1;
    expect(executeCommand(world, { type: 'repairAllPathItems' })).toEqual({ ok: false, reason: 'Not enough cash' });
    expect(isBroken(map, tile) && isBroken(map, t2)).toBe(true);
    world.state.park.cash = total;
    expect(executeCommand(world, { type: 'repairAllPathItems' })).toMatchObject({ ok: true, cost: total });
    expect(isBroken(map, tile) || isBroken(map, t2)).toBe(false);
    expect(world.state.park.cash).toBe(0);
  });

  it('setAutoRepair toggles the park setting (default on)', () => {
    const { world } = setup();
    expect(world.state.staff.autoRepair).toBe(true);
    expect(executeCommand(world, { type: 'setAutoRepair', on: false }).ok).toBe(true);
    expect(world.state.staff.autoRepair).toBe(false);
  });
});
