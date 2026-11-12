import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/pathing', async () => (await import('./fakes')).fakePathing());
vi.mock('../../../src/sim/notifications', async () => (await import('./fakes')).fakeNotifications());

import { decisionHooks, litterHooks } from '../../../src/sim/litter/hooks';
import { PathItem, tileIndex } from '../../../src/sim/map';
import { BENCH_ENERGY, COSTUMES } from '../../../src/data/catalog/people';
import { THOUGHT } from '../../../src/sim/guests/thoughts';
import {
  ANGRY_HAPPY,
  BENCH_SIT_TICKS,
  BENCH_TIRED,
  BENCH_TIRED_CHILL,
  PERFORMER_HAPPY,
  PERFORMER_HAPPY_MATCH,
  PERFORMER_RADIUS,
  SECURITY_RADIUS,
  VANDAL_CHANCE,
} from '../../../src/data/tuning/staff';
import { isBroken, setBroken } from '../../../src/sim/litter/pathItems';
import { executeCommand } from '../../../src/sim/commands';
import { addGuestDirect, makeTestWorld } from '../../helpers/world';
import { pathLine } from './fakes';
import { forceNextAtLeast, forceNextBelow } from './rngForce';
import type { World } from '../../../src/sim/types';
import type { Guest } from '../../../src/sim/guests/types';
import type { Costume } from '../../../src/data/catalog/types';

function corridor() {
  const world = makeTestWorld();
  pathLine(world, 10, 20, 40, 20);
  const map = world.state.map;
  return { world, map, at: (x: number, y = 20) => tileIndex(map, x, y) };
}

function needs(patch: Partial<Guest['needs']>): Guest['needs'] {
  return { hunger: 0, thirst: 0, bladder: 0, energy: 200, happiness: 180, nausea: 0, ...patch };
}

function decide(world: World, g: Guest): boolean {
  for (const h of litterHooks.beforeDecision ?? []) if (h(world, g)) return true;
  return false;
}

function hireAt(world: World, type: 'security' | 'performer', tile: number) {
  const r = executeCommand(world, { type: 'hireStaff', staffType: type });
  if (!r.ok || r.id === undefined) throw new Error('hire failed');
  const s = world.state.staff.members.find((m) => m.id === r.id);
  if (!s) throw new Error('missing');
  s.tile = tile;
  return s;
}

describe('benches (Phase 3 §4.3)', () => {
  it('a tired guest sits on a bench on a 4-neighbour; energy +60 after 60 ticks', () => {
    const { world, map, at } = corridor();
    map.pathItem[at(21)] = PathItem.Bench;
    const g = addGuestDirect(world, at(20), { needs: needs({ energy: BENCH_TIRED - 1 }) });
    expect(decide(world, g)).toBe(true);
    expect(g.state).toBe('sitting');
    expect(g.tile).toBe(at(21));
    for (let k = 0; k < BENCH_SIT_TICKS - 1; k++) {
      world.state.tick++;
      for (const h of litterHooks.perTick ?? []) h(world, g);
    }
    expect(g.state).toBe('sitting');
    world.state.tick++;
    for (const h of litterHooks.perTick ?? []) h(world, g);
    expect(g.state).toBe('walking');
    expect(g.needs.energy).toBe(BENCH_TIRED - 1 + BENCH_ENERGY);
    expect(world.state.staff.benchSitters).toHaveLength(0);
  });

  it('a guest who is not tired does not sit', () => {
    const { world, map, at } = corridor();
    map.pathItem[at(20)] = PathItem.Bench;
    const g = addGuestDirect(world, at(20), { needs: needs({ energy: BENCH_TIRED }) });
    expect(decide(world, g)).toBe(false);
    expect(g.state).toBe('walking');
  });

  it('Chill guests (T ≤ 35) use BENCH_TIRED_CHILL', () => {
    const { world, map, at } = corridor();
    map.pathItem[at(20)] = PathItem.Bench;
    const chill = addGuestDirect(world, at(20), { temperament: 35, needs: needs({ energy: BENCH_TIRED_CHILL - 1 }) });
    const family = addGuestDirect(world, at(20), { temperament: 36, needs: needs({ energy: BENCH_TIRED_CHILL - 1 }) });
    expect(decide(world, chill)).toBe(true);
    expect(decide(world, family)).toBe(false);
  });

  it('each bench has 2 seats; a broken bench seats nobody', () => {
    const { world, map, at } = corridor();
    map.pathItem[at(20)] = PathItem.Bench;
    const gs = [0, 1, 2].map(() => addGuestDirect(world, at(20), { needs: needs({ energy: 10 }) }));
    expect(gs.map((g) => decide(world, g))).toEqual([true, true, false]);
    map.pathItem[at(30)] = PathItem.Bench;
    setBroken(map, at(30), true);
    const g = addGuestDirect(world, at(30), { needs: needs({ energy: 10 }) });
    expect(decide(world, g)).toBe(false);
  });

  it('a sitting guest keeps sitting at a decision', () => {
    const { world, map, at } = corridor();
    map.pathItem[at(20)] = PathItem.Bench;
    const g = addGuestDirect(world, at(20), { needs: needs({ energy: 10 }) });
    decide(world, g);
    expect(decide(world, g)).toBe(true);
    expect(world.state.staff.benchSitters).toHaveLength(1);
  });

  it('removing the bench stands sitters up', () => {
    const { world, map, at } = corridor();
    map.pathItem[at(20)] = PathItem.Bench;
    const g = addGuestDirect(world, at(20), { needs: needs({ energy: 10 }) });
    decide(world, g);
    expect(executeCommand(world, { type: 'removePathItem', x: 20, y: 20 }).ok).toBe(true);
    expect(g.state).toBe('walking');
    expect(world.state.staff.benchSitters).toHaveLength(0);
  });
});

describe('vandalism (Phase 3 §4.4)', () => {
  function angry(world: World, tile: number, happiness = ANGRY_HAPPY - 1): Guest {
    return addGuestDirect(world, tile, { needs: needs({ happiness }) });
  }

  it('an angry walking guest may break an item on the tile or a 4-neighbour', () => {
    const { world, map, at } = corridor();
    map.pathItem[at(21)] = PathItem.Bin;
    const g = angry(world, at(20));
    forceNextBelow(world, VANDAL_CHANCE);
    decisionHooks.vandalism(world, g);
    expect(isBroken(map, at(21))).toBe(true);
  });

  it('no vandalism at happiness ≥ ANGRY_HAPPY or on a failed roll', () => {
    const { world, map, at } = corridor();
    map.pathItem[at(20)] = PathItem.Bench;
    const calm = angry(world, at(20), ANGRY_HAPPY);
    forceNextBelow(world, VANDAL_CHANCE);
    decisionHooks.vandalism(world, calm);
    expect(isBroken(map, at(20))).toBe(false);
    const g = angry(world, at(20));
    forceNextAtLeast(world, VANDAL_CHANCE);
    decisionHooks.vandalism(world, g);
    expect(isBroken(map, at(20))).toBe(false);
  });

  it('only walking guests vandalize', () => {
    const { world, map, at } = corridor();
    map.pathItem[at(20)] = PathItem.Bench;
    const g = angry(world, at(20));
    g.state = 'queueing';
    forceNextBelow(world, VANDAL_CHANCE);
    decisionHooks.vandalism(world, g);
    expect(isBroken(map, at(20))).toBe(false);
  });

  it('a Security Guard within SECURITY_RADIUS blocks vandalism; one tile further does not', () => {
    const { world, map, at } = corridor();
    map.pathItem[at(20)] = PathItem.Bench;
    const guard = hireAt(world, 'security', at(20 + SECURITY_RADIUS));
    world.state.tick++;
    const g = angry(world, at(20));
    forceNextBelow(world, VANDAL_CHANCE);
    decisionHooks.vandalism(world, g);
    expect(isBroken(map, at(20))).toBe(false);
    guard.tile = at(20 + SECURITY_RADIUS + 1);
    world.state.tick++;
    forceNextBelow(world, VANDAL_CHANCE);
    decisionHooks.vandalism(world, g);
    expect(isBroken(map, at(20))).toBe(true);
  });

  it('chance per decision is about VANDAL_CHANCE', () => {
    const { world, map, at } = corridor();
    map.pathItem[at(20)] = PathItem.Bench;
    const g = angry(world, at(20));
    let broken = 0;
    const n = 20_000;
    for (let k = 0; k < n; k++) {
      setBroken(map, at(20), false);
      decisionHooks.vandalism(world, g);
      if (isBroken(map, at(20))) broken++;
    }
    expect(broken / n).toBeGreaterThan(VANDAL_CHANCE - 0.006);
    expect(broken / n).toBeLessThan(VANDAL_CHANCE + 0.006);
  });

  it('guests next to a broken item lose 1 happiness and think about it', () => {
    const { world, map, at } = corridor();
    map.pathItem[at(21)] = PathItem.Bench;
    setBroken(map, at(21), true);
    const g = addGuestDirect(world, at(20));
    decisionHooks.brokenItems(world, g);
    expect(g.needs.happiness).toBe(179);
    expect(g.thoughts.map((t) => t.id)).toEqual([THOUGHT.brokeBench]);
    map.pathItem[at(30)] = PathItem.Bin;
    setBroken(map, at(30), true);
    const h = addGuestDirect(world, at(30));
    decisionHooks.brokenItems(world, h);
    expect(h.thoughts.map((t) => t.id)).toEqual([THOUGHT.brokeBin]);
  });

  it('auto-repair fixes broken items at the hour start when cash allows', async () => {
    const { hourlyStaff } = await import('../../../src/sim/staff/update');
    const { world, map, at } = corridor();
    map.pathItem[at(20)] = PathItem.Bench;
    setBroken(map, at(20), true);
    const cash = world.state.park.cash;
    world.state.tick = 600;
    hourlyStaff(world);
    expect(isBroken(map, at(20))).toBe(false);
    expect(world.state.park.cash).toBe(cash - 2000);
  });

  it('auto-repair without cash leaves the item broken and says so once per game day', async () => {
    const { hourlyStaff } = await import('../../../src/sim/staff/update');
    const { notifyLog } = await import('./fakes');
    notifyLog.length = 0;
    const { world, map, at } = corridor();
    map.pathItem[at(20)] = PathItem.Bench;
    setBroken(map, at(20), true);
    world.state.park.cash = 1999;
    world.state.tick = 1200;
    hourlyStaff(world);
    world.state.tick = 1250;
    hourlyStaff(world);
    expect(isBroken(map, at(20))).toBe(true);
    expect(world.state.park.cash).toBe(1999);
    expect(notifyLog.filter((n) => n.textId === 'msg.repairNoCash')).toHaveLength(1);
    world.state.tick = 2400;
    hourlyStaff(world);
    expect(notifyLog.filter((n) => n.textId === 'msg.repairNoCash')).toHaveLength(2);
  });

  it('auto-repair off: nothing is repaired', async () => {
    const { hourlyStaff } = await import('../../../src/sim/staff/update');
    const { world, map, at } = corridor();
    map.pathItem[at(20)] = PathItem.Bin;
    setBroken(map, at(20), true);
    world.state.staff.autoRepair = false;
    world.state.tick = 600;
    hourlyStaff(world);
    expect(isBroken(map, at(20))).toBe(true);
  });
});

describe('performers and costumes (R6)', () => {
  function show(costume: Costume | null) {
    const { world, at } = corridor();
    const p = hireAt(world, 'performer', at(20));
    p.costume = costume;
    p.state = 'performing';
    p.stateTicks = 100;
    world.state.tick++;
    return { world, at, p };
  }

  function bonus(world: World, tile: number, temperament: number): number {
    const g = addGuestDirect(world, tile, { temperament, needs: needs({ happiness: 100 }) });
    decisionHooks.performers(world, g);
    return g.needs.happiness - 100;
  }

  it('guests within PERFORMER_RADIUS gain PERFORMER_HAPPY; outside gain nothing', () => {
    const { world, at } = show(null);
    expect(bonus(world, at(20 + PERFORMER_RADIUS), 50)).toBe(PERFORMER_HAPPY);
    expect(bonus(world, at(20 + PERFORMER_RADIUS + 1), 50)).toBe(0);
  });

  it('no costume matches a temperament range (Task 24: the Frost and Spark costumes were removed)', () => {
    expect(COSTUMES.map((c) => c.temperament)).toEqual([null]);
    const { world, at } = show('boo');
    for (const t of [0, 35, 36, 64, 65, 100]) expect(bonus(world, at(21), t)).toBe(PERFORMER_HAPPY);
  });

  it('Boo has no match in Phase 3', () => {
    const { world, at } = show('boo');
    for (const t of [0, 50, 100]) expect(bonus(world, at(21), t)).toBe(PERFORMER_HAPPY);
  });

  it('every performer gives "That performer is fun!" (Task 24: the Frost and Spark thoughts were removed)', () => {
    for (const costume of ['boo', null] as const) {
      const c = show(costume);
      for (const temperament of [20, 50, 80]) {
        const k = addGuestDirect(c.world, c.at(21), { temperament });
        decisionHooks.performers(c.world, k);
        expect(k.thoughts.map((t) => t.id)).toEqual([THOUGHT.performerFun]);
      }
    }
  });

  it('at most one performer bonus per decision; a performer who is not performing gives nothing', () => {
    const { world, at, p } = show('boo');
    const q = hireAt(world, 'performer', at(22));
    q.state = 'performing';
    q.costume = 'boo';
    world.state.tick++;
    expect(bonus(world, at(21), 80)).toBe(PERFORMER_HAPPY);
    p.state = 'walking';
    q.state = 'walking';
    world.state.tick++;
    expect(bonus(world, at(21), 80)).toBe(0);
  });
});
