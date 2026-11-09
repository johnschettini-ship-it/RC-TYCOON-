import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/pathing', async () => (await import('./fakes')).fakePathing());
vi.mock('../../../src/sim/notifications', async () => (await import('./fakes')).fakeNotifications());

import { litterHooks, decisionHooks } from '../../../src/sim/litter/hooks';
import { cleanliness } from '../../../src/sim/litter/metrics';
import { Content, PathItem, tileIndex } from '../../../src/sim/map';
import { BIN_CAPACITY } from '../../../src/data/catalog/people';
import { STAFF_THOUGHTS } from '../../../src/data/strings/staff';
import {
  DIRT_BAD,
  DIRT_MILD,
  LITTER_TILE_MAX,
  MESS_TILE_MAX,
  SICK_CHANCE,
  SICK_HAPPY_DROP,
  SICK_NAUSEA,
  SICK_NAUSEA_DROP,
  TRASH_TIMER_MAX,
  TRASH_TIMER_MIN,
} from '../../../src/data/tuning/staff';
import { setBroken } from '../../../src/sim/litter/pathItems';
import { addGuestDirect, makeTestWorld, placeStallDirect } from '../../helpers/world';
import { pathLine } from './fakes';
import { forceNextAtLeast, forceNextBelow } from './rngForce';
import type { World } from '../../../src/sim/types';
import type { Guest } from '../../../src/sim/guests/types';

const perTick = (world: World, g: Guest) => {
  for (const h of litterHooks.perTick ?? []) h(world, g);
};
const afterPurchase = litterHooks.afterPurchase ?? [];

/** A straight footpath along y = 20 from x = 10 to x = 30. */
function corridor() {
  const world = makeTestWorld();
  const tiles = pathLine(world, 10, 20, 30, 20);
  const map = world.state.map;
  return { world, map, tiles, at: (x: number, y = 20) => tileIndex(map, x, y) };
}

describe('trash and litter (Phase 3 §4.3)', () => {
  it('food and drink purchases give trash with a timer in [MIN, MAX]; toilets do not', () => {
    const { world, at } = corridor();
    const food = placeStallDirect(world, 'snack_shack', 12, 21, 0);
    const drink = placeStallDirect(world, 'fizz_stand', 13, 21, 0);
    const toilet = placeStallDirect(world, 'restrooms', 14, 21, 0);
    const timers: number[] = [];
    for (let k = 0; k < 200; k++) {
      const g = addGuestDirect(world, at(12));
      for (const h of afterPurchase) h(world, g, k % 2 === 0 ? food : drink);
      timers.push(g.trashTimer);
    }
    expect(Math.min(...timers)).toBeGreaterThanOrEqual(TRASH_TIMER_MIN);
    expect(Math.max(...timers)).toBeLessThanOrEqual(TRASH_TIMER_MAX);
    const g = addGuestDirect(world, at(14));
    for (const h of afterPurchase) h(world, g, toilet);
    expect(g.trashTimer).toBe(0);
  });

  it('drops litter on the current footpath tile when the timer ends', () => {
    const { world, map, at } = corridor();
    const g = addGuestDirect(world, at(20), { trashTimer: 3 });
    perTick(world, g);
    perTick(world, g);
    expect(map.litter[at(20)]).toBe(0);
    perTick(world, g);
    expect(map.litter[at(20)]).toBe(1);
    expect(g.trashTimer).toBe(0);
  });

  it('puts trash in a usable bin on the tile or a 4-neighbour before the timer ends', () => {
    const { world, map, at } = corridor();
    map.pathItem[at(21)] = PathItem.Bin;
    const g = addGuestDirect(world, at(20), { trashTimer: 500 });
    perTick(world, g);
    expect(g.trashTimer).toBe(0);
    expect(map.binFill[at(21)]).toBe(1);
    expect(map.litter[at(20)]).toBe(0);
  });

  it('a full bin or a broken bin accepts nothing', () => {
    const { world, map, at } = corridor();
    map.pathItem[at(21)] = PathItem.Bin;
    map.binFill[at(21)] = BIN_CAPACITY;
    map.pathItem[at(19)] = PathItem.Bin;
    setBroken(map, at(19), true);
    const g = addGuestDirect(world, at(20), { trashTimer: 1 });
    perTick(world, g);
    expect(map.binFill[at(21)]).toBe(BIN_CAPACITY);
    expect(map.binFill[at(19)]).toBe(0);
    expect(map.litter[at(20)]).toBe(1);
  });

  it('a full tile keeps the trash until the next tile', () => {
    const { world, map, at } = corridor();
    map.litter[at(20)] = LITTER_TILE_MAX;
    const g = addGuestDirect(world, at(20), { trashTimer: 1 });
    perTick(world, g);
    expect(map.litter[at(20)]).toBe(LITTER_TILE_MAX);
    expect(g.trashTimer).toBeGreaterThan(0);
    g.tile = at(21);
    perTick(world, g);
    expect(map.litter[at(21)]).toBe(1);
    expect(g.trashTimer).toBe(0);
  });

  it('never drops litter on a tile that is not a path', () => {
    const { world, map } = corridor();
    const grass = tileIndex(map, 5, 5);
    expect(map.content[grass]).toBe(Content.Empty);
    const g = addGuestDirect(world, grass, { trashTimer: 1 });
    perTick(world, g);
    expect(map.litter[grass]).toBe(0);
    expect(g.trashTimer).toBe(1);
  });
});

describe('mess (sick guests)', () => {
  it('no mess below SICK_NAUSEA', () => {
    const { world, map, at } = corridor();
    const g = addGuestDirect(world, at(20), { needs: { hunger: 0, thirst: 0, bladder: 0, energy: 200, happiness: 150, nausea: SICK_NAUSEA - 1 } });
    forceNextBelow(world, SICK_CHANCE);
    decisionHooks.sick(world, g);
    expect(map.mess[at(20)]).toBe(0);
  });

  it('at SICK_NAUSEA a sick roll makes 1 mess and drops nausea and happiness', () => {
    const { world, map, at } = corridor();
    const g = addGuestDirect(world, at(20), { needs: { hunger: 0, thirst: 0, bladder: 0, energy: 200, happiness: 150, nausea: SICK_NAUSEA } });
    forceNextBelow(world, SICK_CHANCE);
    decisionHooks.sick(world, g);
    expect(map.mess[at(20)]).toBe(1);
    expect(g.needs.nausea).toBe(SICK_NAUSEA - SICK_NAUSEA_DROP);
    expect(g.needs.happiness).toBe(150 - SICK_HAPPY_DROP);
    expect(g.thoughts.map((t) => t.id)).toContain(STAFF_THOUGHTS.feelAwful);
  });

  it('a failed roll does nothing; mess is capped at MESS_TILE_MAX', () => {
    const { world, map, at } = corridor();
    const g = addGuestDirect(world, at(20), { needs: { hunger: 0, thirst: 0, bladder: 0, energy: 200, happiness: 150, nausea: 250 } });
    forceNextAtLeast(world, SICK_CHANCE);
    decisionHooks.sick(world, g);
    expect(map.mess[at(20)]).toBe(0);
    map.mess[at(20)] = MESS_TILE_MAX;
    forceNextBelow(world, SICK_CHANCE);
    decisionHooks.sick(world, g);
    expect(map.mess[at(20)]).toBe(MESS_TILE_MAX);
    expect(g.needs.nausea).toBe(250 - SICK_NAUSEA_DROP);
  });

  it('sick chance is about SICK_CHANCE per decision', () => {
    const { world, map, at } = corridor();
    let sick = 0;
    const n = 20_000;
    for (let k = 0; k < n; k++) {
      const g = { ...addGuestDirect(world, at(20)), needs: { hunger: 0, thirst: 0, bladder: 0, energy: 200, happiness: 150, nausea: 200 } };
      map.mess[at(20)] = 0;
      decisionHooks.sick(world, g);
      if (map.mess[at(20)] === 1) sick++;
      world.state.guests.length = 0;
    }
    expect(sick / n).toBeGreaterThan(SICK_CHANCE - 0.01);
    expect(sick / n).toBeLessThan(SICK_CHANCE + 0.01);
  });
});

describe('dirt effect and cleanliness', () => {
  let world: World;
  let at: (x: number) => number;
  let map: World['state']['map'];
  beforeEach(() => {
    ({ world, at, map } = corridor());
  });

  function dirtCase(litterHere: number, messNear: number) {
    map.litter[at(20)] = litterHere;
    map.mess[at(21)] = messNear;
    const g = addGuestDirect(world, at(20));
    decisionHooks.dirt(world, g);
    return g;
  }

  it('d below DIRT_MILD: no change', () => {
    const g = dirtCase(DIRT_MILD - 1, 0);
    expect(g.needs.happiness).toBe(180);
  });

  it('d ≥ DIRT_MILD: happiness −1', () => {
    expect(dirtCase(DIRT_MILD, 0).needs.happiness).toBe(179);
    expect(DIRT_BAD - 1).toBe(9);
    const g = dirtCase(5, 1); // 5 + 4 = 9
    expect(g.needs.happiness).toBe(179);
  });

  it('d ≥ DIRT_BAD: happiness −3 and "This path is filthy"; neighbours and mess × 4 count', () => {
    map.litter[at(19)] = 2;
    const g = dirtCase(0, 2); // 2 + 4 × 2 = 10
    expect(g.needs.happiness).toBe(177);
    expect(g.thoughts.map((t) => t.id)).toEqual([STAFF_THOUGHTS.pathFilthy]);
  });

  it('diagonal tiles do not count', () => {
    map.content[tileIndex(map, 21, 21)] = Content.Footpath;
    map.litter[tileIndex(map, 21, 21)] = 8;
    const g = addGuestDirect(world, at(20));
    decisionHooks.dirt(world, g);
    expect(g.needs.happiness).toBe(180);
  });

  it('cleanliness C = 1 − min(1, (litter + 4 × mess) / (walkable × DIRT_PER_TILE_ZERO))', () => {
    const fresh = makeTestWorld();
    expect(cleanliness(fresh)).toBe(1);
    // corridor: 21 tiles + 3 entrance-stub footpaths = 24 walkable tiles → zero at 12 dirt.
    expect(cleanliness(world)).toBe(1);
    map.litter[at(10)] = 3;
    map.mess[at(11)] = 1; // 3 + 4 = 7
    expect(cleanliness(world)).toBeCloseTo(1 - 7 / 12, 12);
    map.litter[at(12)] = 8;
    expect(cleanliness(world)).toBe(0);
  });

  it('cleanliness is 1 with no walkable tiles', () => {
    const w = makeTestWorld();
    w.state.map.content.fill(Content.Empty);
    expect(cleanliness(w)).toBe(1);
  });
});
