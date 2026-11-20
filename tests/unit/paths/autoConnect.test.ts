/**
 * Auto-connect (owner 2026-11-19, review fixes 2026-11-20): a bounded shortest route, the whole plan and its cost before
 * anything is built, the cash check, rollback and Undo with the step builder refund, the guest pathing's own heights
 * (a cliff is no route), the main footpath never cut, the queue and exit routes disjoint, and the gate snap only near
 * a gate.
 */
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from '../../../src/sim/commands';
import { markNetworkDirty } from '../../../src/sim/pathing';
import { rideReach } from '../../../src/sim/pathing/reach';
import { Content, tileIndex } from '../../../src/sim/map';
import { QUEUE_COST, PATH_COST } from '../../../src/data/tuning/world';
import {
  AUTO_CONNECT_MAX_TILES,
  applyAutoConnect,
  canPayPlan,
  entranceNeedsQueue,
  exitNeedsFootpath,
  planAutoConnect,
  snapPathGate,
  undoAutoConnect,
  type ConnectPlan,
} from '../../../src/sim/paths/autoConnect';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, placeFootpath, placeQueue, placeRideDirect } from '../../helpers/world';
import { setLandRect } from './helpers';

/** Footpath from the park entrance's stub north to row `y`, then west to column `x` (inclusive). */
function road(world: World, x: number, y: number): void {
  const map = world.state.map;
  const ex = map.entranceTile % map.width;
  const ey = Math.floor(map.entranceTile / map.width);
  for (let yy = y; yy < ey; yy++) if (map.content[tileIndex(map, ex, yy)] === 0) placeFootpath(world, ex, yy);
  for (let xx = Math.min(x, ex); xx <= Math.max(x, ex); xx++) placeFootpath(world, xx, y);
  markNetworkDirty(world);
}

/** A carousel at (10, 10): entrance gate (11, 12), outside (11, 13); exit gate (11, 10), outside (11, 9). */
function carousel(world: World) {
  return placeRideDirect(world, 'carousel', 10, 10, 0);
}

const T = (w: World, x: number, y: number): number => tileIndex(w.state.map, x, y);
const run = (w: World) => (cmd: Command) => executeCommand(w, cmd);

function mustPlan(w: World, rideId: number): ConnectPlan {
  const p = planAutoConnect(w, rideId);
  if (!p.ok) throw new Error(`plan failed: ${p.code}`);
  return p.plan;
}

describe('auto-connect plan', () => {
  it('plans the shortest queue and exit footpath with the whole cost, and builds nothing', () => {
    const w = makeTestWorld();
    const ride = carousel(w);
    road(w, 11, 16);
    const before = w.state.map.content.slice();
    const plan = mustPlan(w, ride.id);
    // Queue (11,13)–(11,15) meets the road at (11,16); exit (11,9) round the ride to (13,15) or (9,15): 9 tiles.
    expect(plan.queue).toEqual([T(w, 11, 13), T(w, 11, 14), T(w, 11, 15)]);
    expect(plan.exit).toHaveLength(9);
    expect(plan.exit[0]).toBe(ride.exit!.outside);
    expect(plan.cost).toBe(3 * QUEUE_COST + 9 * PATH_COST);
    expect(w.state.map.content).toEqual(before);
  });

  it('is bounded: a footpath farther than the limit is no route; nearer, a route', () => {
    const w = makeTestWorld();
    const ride = carousel(w);
    // Only the park entrance's stub (31, 60–62): more than AUTO_CONNECT_MAX_TILES away.
    expect(AUTO_CONNECT_MAX_TILES).toBeLessThan(60);
    expect(planAutoConnect(w, ride.id)).toEqual({ ok: false, code: 'noRoute' });
    road(w, 25, 30);
    // The road (25–31, 30) is about 30 steps from the entrance and 34 from the exit: within the limit.
    const p = planAutoConnect(w, ride.id);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.plan.queue.length).toBeLessThanOrEqual(AUTO_CONNECT_MAX_TILES);
  });

  it('nothing missing: an empty plan', () => {
    const w = makeTestWorld();
    const ride = carousel(w);
    road(w, 11, 16);
    const res = applyAutoConnect(w, mustPlan(w, ride.id), run(w));
    expect(res.ok).toBe(true);
    const again = mustPlan(w, ride.id);
    expect(again.steps).toEqual([]);
    expect(again.cost).toBe(0);
  });

  it('a cliff is not a route: the guest pathing\'s heights decide, and the reach status agrees', () => {
    const w = makeTestWorld();
    const ride = carousel(w);
    const base = w.state.map.heights[ride.entrance!.gate] as number;
    // Everything from row 15 south (the park entrance and the road included) is 2 steps higher: a cliff at 14 | 15.
    setLandRect(w, 0, 15, 63, 63, base + 2);
    road(w, 11, 16);
    expect(planAutoConnect(w, ride.id)).toEqual({ ok: false, code: 'noRoute' });
    expect(rideReach(w, ride.id)?.status).toBe('noQueue');
  });

  it('never turns a footpath of the park\'s network into queue: the entrance on the main path is refused', () => {
    const w = makeTestWorld();
    const ride = carousel(w);
    road(w, 0, 13); // the main path runs past the entrance, through (11, 13)
    const before = w.state.map.content.slice();
    expect(planAutoConnect(w, ride.id)).toEqual({ ok: false, code: 'entranceOnPath' });
    expect(w.state.map.content).toEqual(before);
  });

  it('a queue no footpath reaches is joined from its side: its tiles stay queue, the main path is not cut', () => {
    const w = makeTestWorld();
    const ride = carousel(w);
    placeQueue(w, 11, 13);
    placeQueue(w, 11, 14);
    road(w, 0, 17);
    markNetworkDirty(w);
    expect(rideReach(w, ride.id)?.status).toBe('noFootpath');
    const plan = mustPlan(w, ride.id);
    expect(plan.queue).toEqual([]);
    expect(plan.join).toEqual([T(w, 11, 15), T(w, 11, 16)]);
    const res = applyAutoConnect(w, plan, run(w));
    expect(res.ok).toBe(true);
    expect(rideReach(w, ride.id)?.status).toBe('closed');
    expect(w.state.map.content[T(w, 11, 13)]).toBe(Content.Queue);
    for (let x = 0; x <= 31; x++) expect(w.state.map.content[T(w, x, 17)]).toBe(Content.Footpath);
  });

  it('the queue never runs through the exit\'s outside tile; the routes share no tile', () => {
    const w = makeTestWorld();
    const ride = carousel(w);
    road(w, 11, 7);
    // Wall off x 8–14, y 7–14 except the ride, the road and a corridor west round the ride through the exit outside.
    const open = new Set([
      T(w, 11, 13), T(w, 10, 13), T(w, 9, 13), T(w, 9, 12), T(w, 9, 11), T(w, 9, 10), T(w, 9, 9), T(w, 10, 9),
      T(w, 11, 9), T(w, 11, 8),
    ]);
    const map = w.state.map;
    for (let y = 7; y <= 14; y++) {
      for (let x = 8; x <= 14; x++) {
        const t = T(w, x, y);
        if (open.has(t) || map.content[t] !== Content.Empty) continue;
        map.content[t] = Content.Building;
        map.contentRef[t] = -1;
      }
    }
    markNetworkDirty(w);
    // The only way round goes through (11, 9): the queue may not take it.
    expect(planAutoConnect(w, ride.id)).toEqual({ ok: false, code: 'noRoute' });
    // Open the east side: the queue goes that way; the exit takes (11, 9)–(11, 8).
    for (const [x, y] of [[12, 13], [13, 13], [13, 12], [13, 11], [13, 10], [13, 9], [13, 8]] as const) {
      map.content[T(w, x, y)] = Content.Empty;
    }
    markNetworkDirty(w);
    const plan = mustPlan(w, ride.id);
    expect(plan.queue).not.toContain(ride.exit!.outside);
    expect(plan.exit).not.toContain(ride.entrance!.outside);
    expect(plan.exit).toEqual([T(w, 11, 9), T(w, 11, 8)]);
    for (const t of plan.queue) expect(plan.exit).not.toContain(t);
  });
});

describe('auto-connect build', () => {
  it('builds the plan, the ride is reached, and the exit leads to the park', () => {
    const w = makeTestWorld();
    const ride = carousel(w);
    road(w, 11, 16);
    const cash = w.state.park.cash;
    const plan = mustPlan(w, ride.id);
    const res = applyAutoConnect(w, plan, run(w));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.built.tiles).toHaveLength(plan.steps.length);
    expect(w.state.park.cash).toBe(cash - plan.cost);
    expect(rideReach(w, ride.id)?.status).toBe('closed');
    expect(entranceNeedsQueue(w, ride)).toBe(false);
    expect(exitNeedsFootpath(w, ride)).toBe(false);
  });

  it('refuses a plan the park cannot pay, building nothing', () => {
    const w = makeTestWorld();
    const ride = carousel(w);
    road(w, 11, 16);
    const plan = mustPlan(w, ride.id);
    w.state.park.cash = plan.cost - 1;
    const before = w.state.map.content.slice();
    expect(canPayPlan(w, plan)).toBe(false);
    expect(applyAutoConnect(w, plan, run(w))).toEqual({ ok: false, code: 'noCash' });
    expect(w.state.map.content).toEqual(before);
    expect(w.state.park.cash).toBe(plan.cost - 1);
  });

  it('a failure part way takes back every tile this action built, with a full refund', () => {
    const w = makeTestWorld();
    const ride = carousel(w);
    road(w, 11, 16);
    const plan = mustPlan(w, ride.id);
    const before = w.state.map.content.slice();
    const cash = w.state.park.cash;
    let builds = 0;
    const flaky = (cmd: Command) => {
      if (cmd.type === 'buildPath' && ++builds === 5) return { ok: false as const, reason: 'build.err.inTheWay' };
      return executeCommand(w, cmd);
    };
    const res = applyAutoConnect(w, plan, flaky);
    expect(res).toMatchObject({ ok: false, code: 'failed' });
    expect(w.state.map.content).toEqual(before);
    expect(w.state.park.cash).toBe(cash);
  });

  it('a plan that no longer matches the park is refused', () => {
    const w = makeTestWorld();
    const ride = carousel(w);
    road(w, 11, 16);
    const plan = mustPlan(w, ride.id);
    placeFootpath(w, 11, 15); // the park changed under the confirm panel
    markNetworkDirty(w);
    expect(applyAutoConnect(w, plan, run(w)).ok).toBe(false);
  });

  it('Undo takes the whole connection back with a full refund (the step builder rule)', () => {
    const w = makeTestWorld();
    const ride = carousel(w);
    road(w, 11, 16);
    const before = w.state.map.content.slice();
    const cash = w.state.park.cash;
    const res = applyAutoConnect(w, mustPlan(w, ride.id), run(w));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(undoAutoConnect(w, res.built, run(w))).toBe(true);
    expect(w.state.map.content).toEqual(before);
    expect(w.state.park.cash).toBe(cash);
    expect(rideReach(w, ride.id)?.status).toBe('noQueue');
  });
});

describe('gate snap', () => {
  it('snaps a tap on the ride next to its gate to the tile outside it; a far ride tile stays', () => {
    const w = makeTestWorld();
    const ride = carousel(w);
    expect(snapPathGate(w, 'queue', ride.entrance!.gate)).toBe(ride.entrance!.outside);
    expect(snapPathGate(w, 'queue', T(w, 12, 11))).toBe(ride.entrance!.outside);
    expect(snapPathGate(w, 'footpath', ride.exit!.gate)).toBe(ride.exit!.outside);
    // (10, 12) is next to the entrance gate (11, 12) but two rows from the exit gate (11, 10).
    expect(snapPathGate(w, 'footpath', T(w, 10, 12))).toBe(T(w, 10, 12));
    expect(snapPathGate(w, 'queue', T(w, 10, 10))).toBe(T(w, 10, 10));
    // Not a ride tile: unchanged.
    expect(snapPathGate(w, 'queue', T(w, 20, 20))).toBe(T(w, 20, 20));
  });
});
