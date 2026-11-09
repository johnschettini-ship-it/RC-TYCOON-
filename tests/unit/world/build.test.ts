import { describe, expect, it } from 'vitest';
import { executeCommand } from '../../../src/sim/commands';
import { rideWarnings, stallWarnings } from '../../../src/sim/commands/build';
import { Content, PathItem, tileIndex, type Dir } from '../../../src/sim/map';
import { currentLedger } from '../../../src/sim/economy/ledger';
import { distanceTo, queueOwner } from '../../../src/sim/pathing';
import { getFlatRideDef, getStallDef } from '../../../src/data/catalog';
import { PATH_COST, QUEUE_COST } from '../../../src/data/tuning/world';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, placeFootpath, placeQueue, placeRideDirect, stateHash } from '../../helpers/world';

const T = (w: World, x: number, y: number): number => tileIndex(w.state.map, x, y);
const content = (w: World, x: number, y: number): number => w.state.map.content[T(w, x, y)] as number;

const NOT_ENOUGH_CASH = 'Not enough cash';
const IN_THE_WAY = 'Something is in the way';
const NOT_OWNED = 'You do not own this land';
const ENTRANCE_NEEDS_QUEUE = 'The entrance needs a queue path';
const EXIT_NEEDS_FOOTPATH = 'The exit needs a footpath';
const STALL_NEEDS_FOOTPATH = 'This stall must face a footpath';

/** Run a command that must fail and check that it changed nothing. */
function expectBlocked(w: World, cmd: Parameters<typeof executeCommand>[1], reason: string): void {
  const before = stateHash(w);
  const r = executeCommand(w, cmd);
  expect(r).toEqual({ ok: false, reason });
  expect(stateHash(w)).toBe(before);
}

describe('determinism (master 5.4)', () => {
  it('the same build commands give the same state hash', () => {
    const run = (): string => {
      const w = makeTestWorld(7);
      executeCommand(w, { type: 'buildPathLine', x0: 31, y0: 59, x1: 31, y1: 50, kind: 'footpath' });
      executeCommand(w, { type: 'buildPathLine', x0: 30, y0: 55, x1: 25, y1: 55, kind: 'queue' });
      executeCommand(w, { type: 'placeRide', defId: 'carousel', x: 23, y: 52, rotation: 3 });
      executeCommand(w, { type: 'placeStall', defId: 'snack_shack', x: 32, y: 52, rotation: 3 });
      executeCommand(w, { type: 'demolish', x: 31, y: 50 });
      executeCommand(w, { type: 'demolish', x: 32, y: 52 });
      return stateHash(w);
    };
    expect(run()).toBe(run());
  });
});

describe('strings (master R4)', () => {
  it('have no final period', () => {
    for (const s of [NOT_ENOUGH_CASH, IN_THE_WAY, NOT_OWNED, ENTRANCE_NEEDS_QUEUE, EXIT_NEEDS_FOOTPATH, STALL_NEEDS_FOOTPATH]) {
      expect(s.endsWith('.')).toBe(false);
    }
  });
});

describe('buildPath (Phase 1 §4.1)', () => {
  it('builds a footpath for $10 and a queue for $12', () => {
    const w = makeTestWorld();
    const cash = w.state.park.cash;
    expect(PATH_COST).toBe(1_000);
    expect(QUEUE_COST).toBe(1_200);
    expect(executeCommand(w, { type: 'buildPath', x: 10, y: 10, kind: 'footpath' })).toEqual({ ok: true, cost: PATH_COST, warnings: [] });
    expect(executeCommand(w, { type: 'buildPath', x: 11, y: 10, kind: 'queue' })).toEqual({ ok: true, cost: QUEUE_COST, warnings: [] });
    expect(content(w, 10, 10)).toBe(Content.Footpath);
    expect(content(w, 11, 10)).toBe(Content.Queue);
    expect(w.state.park.cash).toBe(cash - PATH_COST - QUEUE_COST);
    expect(currentLedger(w).lines.construction).toBe(-(PATH_COST + QUEUE_COST));
  });

  it('is allowed at exact cash and blocked 1 cent below (Review Focus 5)', () => {
    const w = makeTestWorld();
    w.state.park.cash = PATH_COST - 1;
    expectBlocked(w, { type: 'buildPath', x: 10, y: 10, kind: 'footpath' }, NOT_ENOUGH_CASH);
    w.state.park.cash = PATH_COST;
    expect(executeCommand(w, { type: 'buildPath', x: 10, y: 10, kind: 'footpath' }).ok).toBe(true);
    expect(w.state.park.cash).toBe(0);
    w.state.park.cash = QUEUE_COST - 1;
    expectBlocked(w, { type: 'buildPath', x: 11, y: 10, kind: 'queue' }, NOT_ENOUGH_CASH);
    w.state.park.cash = QUEUE_COST;
    expect(executeCommand(w, { type: 'buildPath', x: 11, y: 10, kind: 'queue' }).ok).toBe(true);
    expect(w.state.park.cash).toBe(0);
  });

  it('is blocked while cash is negative', () => {
    const w = makeTestWorld();
    w.state.park.cash = -500;
    expectBlocked(w, { type: 'buildPath', x: 10, y: 10, kind: 'footpath' }, NOT_ENOUGH_CASH);
  });

  it('is blocked on land the park does not own, inside or outside the map', () => {
    const w = makeTestWorld();
    expectBlocked(w, { type: 'buildPath', x: 0, y: 10, kind: 'footpath' }, NOT_OWNED);
    expectBlocked(w, { type: 'buildPath', x: 63, y: 10, kind: 'queue' }, NOT_OWNED);
    expectBlocked(w, { type: 'buildPath', x: -1, y: 10, kind: 'footpath' }, NOT_OWNED);
    expectBlocked(w, { type: 'buildPath', x: 10, y: 64, kind: 'footpath' }, NOT_OWNED);
    expectBlocked(w, { type: 'buildPath', x: 10.5, y: 10, kind: 'footpath' }, NOT_OWNED);
  });

  it('is blocked on a building and on the park entrance', () => {
    const w = makeTestWorld();
    placeRideDirect(w, 'carousel', 20, 20, 0);
    expectBlocked(w, { type: 'buildPath', x: 21, y: 21, kind: 'footpath' }, IN_THE_WAY);
    expectBlocked(w, { type: 'buildPath', x: 31, y: 63, kind: 'footpath' }, IN_THE_WAY);
  });

  it('checks land, then obstacles, then cash', () => {
    const w = makeTestWorld();
    placeRideDirect(w, 'carousel', 20, 20, 0);
    w.state.park.cash = 0;
    expectBlocked(w, { type: 'buildPath', x: 0, y: 0, kind: 'footpath' }, NOT_OWNED);
    expectBlocked(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath' }, IN_THE_WAY);
    expectBlocked(w, { type: 'buildPath', x: 10, y: 10, kind: 'footpath' }, NOT_ENOUGH_CASH);
  });

  it('converts footpath ↔ queue for the cost of the new kind', () => {
    const w = makeTestWorld();
    placeFootpath(w, 10, 10);
    placeQueue(w, 11, 10);
    const cash = w.state.park.cash;
    expect(executeCommand(w, { type: 'buildPath', x: 10, y: 10, kind: 'queue' })).toEqual({ ok: true, cost: QUEUE_COST, warnings: [] });
    expect(executeCommand(w, { type: 'buildPath', x: 11, y: 10, kind: 'footpath' })).toEqual({ ok: true, cost: PATH_COST, warnings: [] });
    expect(content(w, 10, 10)).toBe(Content.Queue);
    expect(content(w, 11, 10)).toBe(Content.Footpath);
    expect(w.state.park.cash).toBe(cash - QUEUE_COST - PATH_COST);
  });

  it('a conversion to queue removes the path item (queues hold no items)', () => {
    const w = makeTestWorld();
    const i = placeFootpath(w, 10, 10);
    w.state.map.pathItem[i] = PathItem.Bin;
    w.state.map.binFill[i] = 7;
    w.state.map.pathItemFlags[i] = 1;
    expect(executeCommand(w, { type: 'buildPath', x: 10, y: 10, kind: 'queue' }).ok).toBe(true);
    expect([w.state.map.pathItem[i], w.state.map.binFill[i], w.state.map.pathItemFlags[i]]).toEqual([0, 0, 0]);
  });

  it('the same kind on an existing path costs nothing and changes nothing', () => {
    const w = makeTestWorld();
    placeFootpath(w, 10, 10);
    w.state.park.cash = 0;
    const before = stateHash(w);
    expect(executeCommand(w, { type: 'buildPath', x: 10, y: 10, kind: 'footpath' })).toEqual({ ok: true, cost: 0, warnings: [] });
    expect(stateHash(w)).toBe(before);
  });

  it('setup mode skips the cash check and the ledger', () => {
    const w = makeTestWorld();
    w.state.park.cash = 0;
    const ledger = JSON.stringify(w.state.economy);
    expect(executeCommand(w, { type: 'buildPath', x: 10, y: 10, kind: 'footpath' }, { setup: true }).ok).toBe(true);
    expect(w.state.park.cash).toBe(0);
    expect(JSON.stringify(w.state.economy)).toBe(ledger);
    expect(content(w, 10, 10)).toBe(Content.Footpath);
  });

  it('updates the walkable network', () => {
    const w = makeTestWorld();
    expect(distanceTo(w, T(w, 31, 59), 'exit')).toBe(4); // off the field: next to the stub
    expect(distanceTo(w, T(w, 31, 58), 'exit')).toBeNull();
    executeCommand(w, { type: 'buildPath', x: 31, y: 59, kind: 'footpath' });
    expect(distanceTo(w, T(w, 31, 58), 'exit')).toBe(5);
  });
});

describe('buildPathLine (Phase 1 §4.1)', () => {
  it('charges once for all new tiles and skips tiles of the same kind', () => {
    const w = makeTestWorld();
    placeFootpath(w, 12, 10);
    placeQueue(w, 13, 10); // converted to footpath: charged
    const cash = w.state.park.cash;
    const r = executeCommand(w, { type: 'buildPathLine', x0: 10, y0: 10, x1: 14, y1: 10, kind: 'footpath' });
    expect(r).toEqual({ ok: true, cost: 4 * PATH_COST, warnings: [] });
    for (let x = 10; x <= 14; x++) expect(content(w, x, 10)).toBe(Content.Footpath);
    expect(w.state.park.cash).toBe(cash - 4 * PATH_COST);
    expect(currentLedger(w).lines.construction).toBe(-4 * PATH_COST);
  });

  it('builds in either direction and a single tile', () => {
    const w = makeTestWorld();
    expect(executeCommand(w, { type: 'buildPathLine', x0: 14, y0: 10, x1: 10, y1: 10, kind: 'queue' })).toEqual({ ok: true, cost: 5 * QUEUE_COST, warnings: [] });
    expect(executeCommand(w, { type: 'buildPathLine', x0: 20, y0: 20, x1: 20, y1: 20, kind: 'footpath' })).toEqual({ ok: true, cost: PATH_COST, warnings: [] });
    for (let x = 10; x <= 14; x++) expect(content(w, x, 10)).toBe(Content.Queue);
  });

  it('follows the axis with the larger distance from the start tile', () => {
    const w = makeTestWorld();
    executeCommand(w, { type: 'buildPathLine', x0: 10, y0: 10, x1: 14, y1: 12, kind: 'footpath' });
    for (let x = 10; x <= 14; x++) expect(content(w, x, 10)).toBe(Content.Footpath);
    expect(content(w, 14, 12)).toBe(Content.Empty);
    executeCommand(w, { type: 'buildPathLine', x0: 20, y0: 20, x1: 21, y1: 25, kind: 'footpath' });
    for (let y = 20; y <= 25; y++) expect(content(w, 20, y)).toBe(Content.Footpath);
    expect(content(w, 21, 25)).toBe(Content.Empty);
  });

  it('fails atomically on an obstacle or unowned tile', () => {
    const w = makeTestWorld();
    placeRideDirect(w, 'carousel', 20, 20, 0);
    expectBlocked(w, { type: 'buildPathLine', x0: 15, y0: 21, x1: 25, y1: 21, kind: 'footpath' }, IN_THE_WAY);
    expectBlocked(w, { type: 'buildPathLine', x0: 5, y0: 5, x1: 0, y1: 5, kind: 'queue' }, NOT_OWNED);
    expectBlocked(w, { type: 'buildPathLine', x0: 31, y0: 58, x1: 31, y1: 63, kind: 'footpath' }, IN_THE_WAY);
    expect(content(w, 15, 21)).toBe(Content.Empty);
  });

  it('is allowed at exact cash for the whole line and blocked 1 cent below', () => {
    const w = makeTestWorld();
    placeFootpath(w, 11, 10);
    w.state.park.cash = 4 * PATH_COST - 1;
    expectBlocked(w, { type: 'buildPathLine', x0: 10, y0: 10, x1: 14, y1: 10, kind: 'footpath' }, NOT_ENOUGH_CASH);
    w.state.park.cash = 4 * PATH_COST;
    expect(executeCommand(w, { type: 'buildPathLine', x0: 10, y0: 10, x1: 14, y1: 10, kind: 'footpath' })).toEqual({ ok: true, cost: 4 * PATH_COST, warnings: [] });
    expect(w.state.park.cash).toBe(0);
  });

  it('a line over existing tiles of the same kind is free', () => {
    const w = makeTestWorld();
    w.state.park.cash = 0;
    expect(executeCommand(w, { type: 'buildPathLine', x0: 31, y0: 60, x1: 31, y1: 62, kind: 'footpath' })).toEqual({ ok: true, cost: 0, warnings: [] });
  });
});

describe('placeRide (Phase 1 §4.1)', () => {
  it('creates a closed ride with catalog values and charges the build cost', () => {
    const w = makeTestWorld();
    const def = getFlatRideDef('carousel')!;
    const cash = w.state.park.cash;
    const tick = w.state.tick;
    const r = executeCommand(w, { type: 'placeRide', defId: 'carousel', x: 20, y: 20, rotation: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cost).toBe(def.buildCost);
    expect(r.id).toBeTypeOf('number');
    const ride = w.state.rides.find((x) => x.id === r.id)!;
    expect(ride).toEqual({
      id: r.id,
      kind: 'flat',
      defId: 'carousel',
      name: 'Carousel',
      x: 20,
      y: 20,
      rotation: 0,
      status: 'closed',
      price: def.defaultPrice,
      entrance: { gate: T(w, 21, 22), outside: T(w, 21, 23) },
      exit: { gate: T(w, 21, 20), outside: T(w, 21, 19) },
      stats: { excitement: def.excitement, intensity: def.intensity, nausea: def.nausea },
      queue: [],
      riders: [],
      cycle: { phase: 'waiting', ticks: 0 },
      totals: { riders: 0, income: 0, ridersThisMonth: 0, incomeThisMonth: 0 },
      builtTick: tick,
      hoursThisMonth: 0,
      reliability: 100,
      lastInspectionTick: tick,
      inspectionIntervalTicks: 0,
      breakdownType: null,
      statusBeforeBreakdown: null,
      breakdownsThisMonth: 0,
      lastBreakdownTick: -1,
      assignedMechanicId: null,
      totalBuildCost: def.buildCost,
    });
    for (let y = 20; y <= 22; y++) {
      for (let x = 20; x <= 22; x++) {
        expect(content(w, x, y)).toBe(Content.Building);
        expect(w.state.map.contentRef[T(w, x, y)]).toBe(r.id);
      }
    }
    expect(w.state.park.cash).toBe(cash - def.buildCost);
    expect(currentLedger(w).lines.construction).toBe(-def.buildCost);
    expect(w.state.nextId).toBe((r.id as number) + 1);
  });

  it('warns when the entrance has no queue path or the exit has no footpath', () => {
    const w = makeTestWorld();
    const r1 = executeCommand(w, { type: 'placeRide', defId: 'carousel', x: 10, y: 10, rotation: 0 });
    expect(r1.ok && r1.warnings).toEqual([ENTRANCE_NEEDS_QUEUE, EXIT_NEEDS_FOOTPATH]);
    // Entrance outside (21, 23); exit outside (21, 19).
    placeQueue(w, 21, 23);
    const r2 = executeCommand(w, { type: 'placeRide', defId: 'carousel', x: 20, y: 20, rotation: 0 });
    expect(r2.ok && r2.warnings).toEqual([EXIT_NEEDS_FOOTPATH]);
    // A footpath at the entrance is not a queue; a queue at the exit is not a footpath.
    placeFootpath(w, 31, 33);
    placeQueue(w, 31, 29);
    const r3 = executeCommand(w, { type: 'placeRide', defId: 'carousel', x: 30, y: 30, rotation: 0 });
    expect(r3.ok && r3.warnings).toEqual([ENTRANCE_NEEDS_QUEUE, EXIT_NEEDS_FOOTPATH]);
    placeQueue(w, 41, 43);
    placeFootpath(w, 41, 39);
    const r4 = executeCommand(w, { type: 'placeRide', defId: 'carousel', x: 40, y: 40, rotation: 0 });
    expect(r4.ok && r4.warnings).toEqual([]);
    // Gates that face unowned land.
    const r5 = executeCommand(w, { type: 'placeRide', defId: 'carousel', x: 1, y: 50, rotation: 1 }, { setup: true });
    expect(r5.ok && r5.warnings).toEqual([ENTRANCE_NEEDS_QUEUE, EXIT_NEEDS_FOOTPATH]);
  });

  it('places gates by rotation 0–3 (catalog legend rule)', () => {
    // 3×3 at (20, 20): entrance gate on the front edge, exit gate on the back edge.
    const expected: Record<Dir, { entrance: [number, number, number, number]; exit: [number, number, number, number] }> = {
      0: { entrance: [21, 22, 21, 23], exit: [21, 20, 21, 19] }, // front faces S
      1: { entrance: [20, 21, 19, 21], exit: [22, 21, 23, 21] }, // front faces W
      2: { entrance: [21, 20, 21, 19], exit: [21, 22, 21, 23] }, // front faces N
      3: { entrance: [22, 21, 23, 21], exit: [20, 21, 19, 21] }, // front faces E
    };
    for (const rot of [0, 1, 2, 3] as Dir[]) {
      const w = makeTestWorld();
      const r = executeCommand(w, { type: 'placeRide', defId: 'swing_tower', x: 20, y: 20, rotation: rot });
      expect(r.ok).toBe(true);
      const ride = w.state.rides[0]!;
      const e = expected[rot];
      expect(ride.rotation).toBe(rot);
      expect(ride.entrance).toEqual({ gate: T(w, e.entrance[0], e.entrance[1]), outside: T(w, e.entrance[2], e.entrance[3]) });
      expect(ride.exit).toEqual({ gate: T(w, e.exit[0], e.exit[1]), outside: T(w, e.exit[2], e.exit[3]) });
    }
  });

  it('a 3×5 ride covers 5 × 3 tiles at rotations 1 and 3', () => {
    for (const [rot, ex, ey] of [[0, 3, 5], [1, 5, 3], [2, 3, 5], [3, 5, 3]] as [Dir, number, number][]) {
      const w = makeTestWorld();
      // Pendulum Ship is a Phase 3 research item: unlock it as research would.
      w.state.management.research.unlocked.push('pendulum_ship');
      expect(executeCommand(w, { type: 'placeRide', defId: 'pendulum_ship', x: 20, y: 20, rotation: rot }).ok).toBe(true);
      let count = 0;
      for (let y = 18; y <= 28; y++) for (let x = 18; x <= 28; x++) if (content(w, x, y) === Content.Building) count++;
      expect(count).toBe(15);
      expect(content(w, 20 + ex - 1, 20 + ey - 1)).toBe(Content.Building);
      expect(content(w, 20 + ex, 20)).toBe(Content.Empty);
      expect(content(w, 20, 20 + ey)).toBe(Content.Empty);
    }
  });

  it('is allowed at exact cash and blocked 1 cent below (Review Focus 5)', () => {
    const w = makeTestWorld();
    const cost = getFlatRideDef('big_wheel')!.buildCost;
    w.state.park.cash = cost - 1;
    expectBlocked(w, { type: 'placeRide', defId: 'big_wheel', x: 20, y: 20, rotation: 0 }, NOT_ENOUGH_CASH);
    w.state.park.cash = cost;
    expect(executeCommand(w, { type: 'placeRide', defId: 'big_wheel', x: 20, y: 20, rotation: 0 }).ok).toBe(true);
    expect(w.state.park.cash).toBe(0);
  });

  it('is blocked on unowned land, off the map, and on anything in the way', () => {
    const w = makeTestWorld();
    expectBlocked(w, { type: 'placeRide', defId: 'carousel', x: 0, y: 20, rotation: 0 }, NOT_OWNED);
    expectBlocked(w, { type: 'placeRide', defId: 'carousel', x: 62, y: 20, rotation: 0 }, NOT_OWNED);
    expectBlocked(w, { type: 'placeRide', defId: 'carousel', x: -2, y: 20, rotation: 0 }, NOT_OWNED);
    placeFootpath(w, 22, 22);
    expectBlocked(w, { type: 'placeRide', defId: 'carousel', x: 20, y: 20, rotation: 0 }, IN_THE_WAY);
    placeRideDirect(w, 'carousel', 30, 30, 0);
    expectBlocked(w, { type: 'placeRide', defId: 'carousel', x: 32, y: 32, rotation: 0 }, IN_THE_WAY);
    expectBlocked(w, { type: 'placeRide', defId: 'carousel', x: 30, y: 60, rotation: 0 }, IN_THE_WAY);
  });

  it('rejects an unknown ride type or rotation and changes nothing', () => {
    const w = makeTestWorld();
    const before = stateHash(w);
    expect(executeCommand(w, { type: 'placeRide', defId: 'nope', x: 20, y: 20, rotation: 0 }).ok).toBe(false);
    expect(executeCommand(w, { type: 'placeRide', defId: 'carousel', x: 20, y: 20, rotation: 4 as Dir }).ok).toBe(false);
    expect(stateHash(w)).toBe(before);
  });

  it('claims the queue at its entrance (network marked dirty)', () => {
    const w = makeTestWorld();
    placeQueue(w, 21, 23);
    placeQueue(w, 21, 24);
    expect(queueOwner(w, T(w, 21, 24))).toBeNull();
    const r = executeCommand(w, { type: 'placeRide', defId: 'carousel', x: 20, y: 20, rotation: 0 });
    expect(r.ok && queueOwner(w, T(w, 21, 24))).toBe(r.ok && r.id);
  });

  it('keeps rides sorted by id', () => {
    const w = makeTestWorld();
    executeCommand(w, { type: 'placeRide', defId: 'carousel', x: 20, y: 20, rotation: 0 });
    executeCommand(w, { type: 'placeStall', defId: 'snack_shack', x: 10, y: 10, rotation: 0 });
    executeCommand(w, { type: 'placeRide', defId: 'big_wheel', x: 30, y: 20, rotation: 0 });
    const ids = w.state.rides.map((r) => r.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(ids).toHaveLength(2);
  });
});

describe('placeStall (Phase 1 §4.1)', () => {
  it('creates an open stall with catalog values and charges the build cost', () => {
    const w = makeTestWorld();
    const def = getStallDef('snack_shack')!;
    placeFootpath(w, 20, 19);
    const cash = w.state.park.cash;
    const r = executeCommand(w, { type: 'placeStall', defId: 'snack_shack', x: 20, y: 20, rotation: 0 });
    expect(r).toMatchObject({ ok: true, cost: def.buildCost, warnings: [] });
    if (!r.ok) return;
    expect(w.state.stalls).toEqual([
      {
        id: r.id,
        defId: 'snack_shack',
        name: 'Snack Shack',
        x: 20,
        y: 20,
        rotation: 0,
        serviceTile: T(w, 20, 19),
        price: def.defaultPrice,
        open: true,
        servingGuest: -1,
        totals: { sales: 0, income: 0, salesThisMonth: 0, incomeThisMonth: 0 },
        builtTick: w.state.tick,
        hoursThisMonth: 0,
        totalBuildCost: def.buildCost,
      },
    ]);
    expect(content(w, 20, 20)).toBe(Content.Building);
    expect(w.state.map.contentRef[T(w, 20, 20)]).toBe(r.id);
    expect(w.state.park.cash).toBe(cash - def.buildCost);
    expect(currentLedger(w).lines.construction).toBe(-def.buildCost);
  });

  it('the service side faces N, E, S, W for rotations 0–3', () => {
    const want: [number, number][] = [[20, 19], [21, 20], [20, 21], [19, 20]];
    for (const rot of [0, 1, 2, 3] as Dir[]) {
      const w = makeTestWorld();
      executeCommand(w, { type: 'placeStall', defId: 'fizz_stand', x: 20, y: 20, rotation: rot });
      const [sx, sy] = want[rot]!;
      expect(w.state.stalls[0]?.serviceTile).toBe(T(w, sx, sy));
    }
  });

  it('warns when the stall does not face a footpath', () => {
    const w = makeTestWorld();
    const r1 = executeCommand(w, { type: 'placeStall', defId: 'restrooms', x: 20, y: 20, rotation: 0 });
    expect(r1.ok && r1.warnings).toEqual([STALL_NEEDS_FOOTPATH]);
    placeQueue(w, 30, 19);
    const r2 = executeCommand(w, { type: 'placeStall', defId: 'restrooms', x: 30, y: 20, rotation: 0 });
    expect(r2.ok && r2.warnings).toEqual([STALL_NEEDS_FOOTPATH]);
    const r3 = executeCommand(w, { type: 'placeStall', defId: 'restrooms', x: 1, y: 1, rotation: 0 });
    expect(r3.ok && r3.warnings).toEqual([STALL_NEEDS_FOOTPATH]);
  });

  it('is allowed at exact cash and blocked 1 cent below (Review Focus 5)', () => {
    const w = makeTestWorld();
    const cost = getStallDef('fizz_stand')!.buildCost;
    w.state.park.cash = cost - 1;
    expectBlocked(w, { type: 'placeStall', defId: 'fizz_stand', x: 20, y: 20, rotation: 0 }, NOT_ENOUGH_CASH);
    w.state.park.cash = cost;
    expect(executeCommand(w, { type: 'placeStall', defId: 'fizz_stand', x: 20, y: 20, rotation: 0 }).ok).toBe(true);
    expect(w.state.park.cash).toBe(0);
  });

  it('is blocked on unowned land and on anything in the way', () => {
    const w = makeTestWorld();
    expectBlocked(w, { type: 'placeStall', defId: 'snack_shack', x: 0, y: 0, rotation: 0 }, NOT_OWNED);
    expectBlocked(w, { type: 'placeStall', defId: 'snack_shack', x: 64, y: 5, rotation: 0 }, NOT_OWNED);
    expectBlocked(w, { type: 'placeStall', defId: 'snack_shack', x: 31, y: 61, rotation: 0 }, IN_THE_WAY);
    expectBlocked(w, { type: 'placeStall', defId: 'snack_shack', x: 31, y: 63, rotation: 0 }, IN_THE_WAY);
    expectBlocked(w, { type: 'placeStall', defId: 'nope', x: 10, y: 10, rotation: 0 }, 'Unknown stall');
  });

  it('setup mode skips the cash check and the ledger', () => {
    const w = makeTestWorld();
    w.state.park.cash = 0;
    const r = executeCommand(w, { type: 'placeStall', defId: 'snack_shack', x: 20, y: 20, rotation: 0 }, { setup: true });
    expect(r.ok).toBe(true);
    expect(w.state.park.cash).toBe(0);
    expect(currentLedger(w).lines.construction).toBe(0);
  });
});

describe('warnings stay until fixed (Phase 1 §4.1)', () => {
  it('rideWarnings and stallWarnings follow the current paths', () => {
    const w = makeTestWorld();
    const r = executeCommand(w, { type: 'placeRide', defId: 'carousel', x: 20, y: 20, rotation: 0 });
    const s = executeCommand(w, { type: 'placeStall', defId: 'snack_shack', x: 30, y: 30, rotation: 0 });
    const ride = w.state.rides.find((x) => r.ok && x.id === r.id)!;
    const stall = w.state.stalls.find((x) => s.ok && x.id === s.id)!;
    expect(rideWarnings(w, ride)).toEqual([ENTRANCE_NEEDS_QUEUE, EXIT_NEEDS_FOOTPATH]);
    expect(stallWarnings(w, stall)).toEqual([STALL_NEEDS_FOOTPATH]);
    executeCommand(w, { type: 'buildPath', x: 21, y: 23, kind: 'queue' });
    executeCommand(w, { type: 'buildPath', x: 21, y: 19, kind: 'footpath' });
    executeCommand(w, { type: 'buildPath', x: 30, y: 29, kind: 'footpath' });
    expect(rideWarnings(w, ride)).toEqual([]);
    expect(stallWarnings(w, stall)).toEqual([]);
    executeCommand(w, { type: 'demolish', x: 30, y: 29 });
    expect(stallWarnings(w, stall)).toEqual([STALL_NEEDS_FOOTPATH]);
  });

  it('a ride whose entrance queue belongs to another ride keeps the entrance warning', () => {
    const w = makeTestWorld();
    const a = placeRideDirect(w, 'carousel', 10, 10, 0); // entrance outside (11, 13)
    placeQueue(w, 11, 13);
    placeQueue(w, 11, 14);
    placeQueue(w, 11, 15);
    placeQueue(w, 12, 15);
    // Rotation 1: front faces W, entrance outside (12, 15) is on ride A's queue.
    const r = executeCommand(w, { type: 'placeRide', defId: 'carousel', x: 13, y: 14, rotation: 1 });
    expect(r.ok && r.warnings).toEqual([ENTRANCE_NEEDS_QUEUE, EXIT_NEEDS_FOOTPATH]);
    expect(rideWarnings(w, a)).toEqual([EXIT_NEEDS_FOOTPATH]);
  });
});
