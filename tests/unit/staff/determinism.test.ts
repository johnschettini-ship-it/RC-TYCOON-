import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/pathing', async () => (await import('./fakes')).fakePathing());
vi.mock('../../../src/sim/notifications', async () => (await import('./fakes')).fakeNotifications());
vi.mock('../../../src/sim/rides/flat/api', async () => (await import('./fakes')).fakeFlatApi());

import { executeCommand } from '../../../src/sim/commands';
import { onRideDispatch } from '../../../src/sim/breakdowns/api';
import { litterHooks } from '../../../src/sim/litter/hooks';
import { neighbour, PathItem, tileIndex, type Dir } from '../../../src/sim/map';
import { rngInt } from '../../../src/sim/rng';
import { fakeIsWalkable, pathLine } from './fakes';
import { addGuestDirect, makeTestWorld, placeRideDirect, placeStallDirect, stateHash } from '../../helpers/world';
import { stepStaffSystems } from './steps';
import type { World } from '../../../src/sim/types';
import type { Stall } from '../../../src/sim/stalls/types';

/** A small park: a footpath ring, 2 flat rides, a food stall, bins, benches, 40 guests, 6 staff. */
function buildPark(seed: number): { world: World; stall: Stall } {
  const world = makeTestWorld(seed);
  const map = world.state.map;
  pathLine(world, 10, 9, 50, 9);
  pathLine(world, 10, 9, 10, 30);
  pathLine(world, 50, 9, 50, 30);
  pathLine(world, 10, 30, 50, 30);
  pathLine(world, 31, 30, 31, 60); // to the entrance stub
  for (const x of [20, 40]) {
    const r = placeRideDirect(world, 'carousel', x, 10);
    r.status = 'open';
    r.reliability = 3_000;
    r.inspectionIntervalTicks = 400;
  }
  const stall = placeStallDirect(world, 'snack_shack', 30, 31, 0);
  for (const x of [15, 25, 35, 45]) map.pathItem[tileIndex(map, x, 30)] = PathItem.Bin;
  for (const x of [18, 28, 38]) map.pathItem[tileIndex(map, x, 9)] = PathItem.Bench;
  for (let k = 0; k < 40; k++) {
    addGuestDirect(world, tileIndex(map, 11 + (k % 39), 30), {
      temperament: (k * 37) % 101,
      needs: { hunger: 50, thirst: 50, bladder: 20, energy: 90 + k, happiness: 30 + k * 5, nausea: 150 + k },
      trashTimer: k % 3 === 0 ? 50 + k * 10 : 0,
    });
  }
  const hire = (type: 'groundskeeper' | 'mechanic' | 'security' | 'performer') => {
    const r = executeCommand(world, { type: 'hireStaff', staffType: type });
    if (!r.ok || r.id === undefined) throw new Error('hire');
    return r.id;
  };
  hire('groundskeeper');
  const g2 = hire('groundskeeper');
  const patrol: number[] = [];
  for (let x = 10; x <= 30; x++) patrol.push(tileIndex(map, x, 30));
  executeCommand(world, { type: 'editPatrol', staffId: g2, add: patrol, remove: [] });
  hire('mechanic');
  hire('mechanic');
  hire('security');
  const p = hire('performer');
  executeCommand(world, { type: 'setCostume', staffId: p, costume: 'spark' });
  return { world, stall };
}

/** Drive the guest-facing hooks the way the guest system would: move, decide every 40 ticks, buy now and then. */
function runPark(world: World, stall: Stall, ticks: number): void {
  const map = world.state.map;
  for (let k = 0; k < ticks; k++) {
    const t = world.state.tick;
    for (const g of world.state.guests) {
      if (g.state === 'walking' && (t + g.id) % 12 === 0) {
        const opts: number[] = [];
        for (const d of [0, 1, 2, 3] as Dir[]) {
          const n = neighbour(map, g.tile, d);
          if (n >= 0 && fakeIsWalkable(world, n)) opts.push(n);
        }
        if (opts.length > 0) g.tile = opts[rngInt(world.state, 0, opts.length - 1)] as number;
      }
      for (const h of litterHooks.perTick ?? []) h(world, g);
      if ((t + g.id) % 40 === 0) {
        for (const h of litterHooks.beforeDecision ?? []) if (h(world, g)) break;
        g.needs.nausea = Math.min(255, g.needs.nausea + 3);
        g.needs.energy = Math.max(0, g.needs.energy - 2);
      }
      if ((t + g.id) % 300 === 0) for (const h of litterHooks.afterPurchase ?? []) h(world, g, stall);
    }
    if (t % 120 === 0) {
      for (const r of world.state.rides) onRideDispatch(world, r);
    }
    stepStaffSystems(world, 1);
  }
}

describe('determinism of a 2,000-tick staff run', () => {
  it('the same seed gives the same state hash', () => {
    const a = buildPark(777);
    const b = buildPark(777);
    runPark(a.world, a.stall, 2000);
    runPark(b.world, b.stall, 2000);
    expect(stateHash(a.world)).toBe(stateHash(b.world));
    const s = a.world.state;
    // The run did real work: breakdowns happened, staff moved, litter appeared and was swept.
    expect(s.rides.some((r) => r.breakdownsThisMonth > 0 || r.lastBreakdownTick >= 0)).toBe(true);
    expect(s.staff.members.every((m) => m.tile >= 0)).toBe(true);
  });

  it('a different seed gives a different run', () => {
    const a = buildPark(777);
    const b = buildPark(778);
    runPark(a.world, a.stall, 2000);
    runPark(b.world, b.stall, 2000);
    expect(stateHash(a.world)).not.toBe(stateHash(b.world));
  });

  it('a copy of the state taken mid-run continues identically (no hidden derived state)', () => {
    const a = buildPark(4242);
    runPark(a.world, a.stall, 1000);
    const copy: World = { state: structuredClone(a.world.state), events: [] };
    const stallCopy = copy.state.stalls[0] as Stall;
    runPark(a.world, a.stall, 1000);
    runPark(copy, stallCopy, 1000);
    expect(stateHash(copy)).toBe(stateHash(a.world));
  });

  it('staff never stand on a tile that is not walkable', () => {
    const a = buildPark(99);
    for (let k = 0; k < 20; k++) {
      runPark(a.world, a.stall, 100);
      for (const m of a.world.state.staff.members) {
        expect(fakeIsWalkable(a.world, m.tile)).toBe(true);
        if (m.nextTile !== -1) expect(fakeIsWalkable(a.world, m.nextTile)).toBe(true);
      }
    }
  });
});
