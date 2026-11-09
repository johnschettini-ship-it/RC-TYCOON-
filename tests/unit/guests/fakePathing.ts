/**
 * Test fake of `src/sim/pathing/index.ts` (W1-C) following its merged behaviour:
 * BFS distance fields from each destination, queue tiles only for their own ride,
 * stall and exit fields exclude queue tiles, ties break N, E, S, W.
 * `isWalkable(…, 'guest')` is true only for footpaths and the park entrance.
 * A tile outside the field routes through its best neighbour; a queue tile routes out along its queue.
 * `nextStep` is null at the destination and when unreachable; `distanceTo` is 0 at the destination.
 * Fields are computed on demand (no caching), which is fine for small test worlds.
 */
import { Content, neighbour, type Dir } from '../../../src/sim/map';
import type { DestKey } from '../../../src/sim/guests/types';
import type { World } from '../../../src/sim/types';
import type { EntityId } from '../../../src/sim/units';

export type WalkMode = 'guest' | 'staff';

/** Test controls. */
export const fake = {
  /** Destinations reported unreachable from everywhere. */
  unreachable: new Set<string>(),
  calls: { nextStep: 0, distanceTo: 0 },
};

export function resetFake(): void {
  fake.unreachable.clear();
  fake.calls.nextStep = 0;
  fake.calls.distanceTo = 0;
}

const DIRS: readonly Dir[] = [0, 1, 2, 3];

export function isWalkable(world: World, tile: number, mode: WalkMode): boolean {
  if (tile < 0) return false;
  const c = world.state.map.content[tile];
  if (mode === 'staff' && c === Content.Queue) return true;
  return c === Content.Footpath || c === Content.ParkEntrance;
}

function queueOwners(world: World): Map<number, EntityId> {
  const map = world.state.map;
  const owners = new Map<number, EntityId>();
  for (const ride of world.state.rides) {
    const start = ride.entrance?.outside ?? -1;
    if (start < 0 || map.content[start] !== Content.Queue || owners.has(start)) continue;
    const stack = [start];
    owners.set(start, ride.id);
    while (stack.length) {
      const t = stack.pop() as number;
      for (const d of DIRS) {
        const n = neighbour(map, t, d);
        if (n >= 0 && map.content[n] === Content.Queue && !owners.has(n)) {
          owners.set(n, ride.id);
          stack.push(n);
        }
      }
    }
  }
  return owners;
}

export function queueOwner(world: World, tile: number): EntityId | null {
  return queueOwners(world).get(tile) ?? null;
}

function field(world: World, dest: DestKey): Int32Array {
  const s = world.state;
  const map = s.map;
  const f = new Int32Array(map.width * map.height).fill(-1);
  if (fake.unreachable.has(dest)) return f;
  let origin = -1;
  let rideId: number | null = null;
  if (dest === 'exit') origin = map.entranceTile;
  else if (dest.startsWith('stall:')) origin = s.stalls.find((x) => x.id === Number(dest.slice(6)))?.serviceTile ?? -1;
  else {
    rideId = Number(dest.slice(5));
    origin = s.rides.find((x) => x.id === rideId)?.entrance?.outside ?? -1;
  }
  if (origin < 0) return f;
  const owners = queueOwners(world);
  const passable = (t: number): boolean => {
    const c = map.content[t];
    if (c === Content.Footpath || c === Content.ParkEntrance) return true;
    return c === Content.Queue && rideId !== null && owners.get(t) === rideId;
  };
  if (!passable(origin)) return f;
  f[origin] = 0;
  const queue = [origin];
  for (let qi = 0; qi < queue.length; qi++) {
    const t = queue[qi] as number;
    for (const d of DIRS) {
      const n = neighbour(map, t, d);
      if (n >= 0 && f[n] === -1 && passable(n)) {
        f[n] = (f[t] as number) + 1;
        queue.push(n);
      }
    }
  }
  return f;
}

function bestNeighbour(world: World, f: Int32Array, from: number): number {
  let best = -1;
  let bestD = Infinity;
  for (const d of DIRS) {
    const n = neighbour(world.state.map, from, d);
    if (n >= 0 && (f[n] as number) >= 0 && (f[n] as number) < bestD) {
      best = n;
      bestD = f[n] as number;
    }
  }
  return best;
}

function route(world: World, f: Int32Array, from: number): { next: number; dist: number } | null {
  if (from < 0) return null;
  const here = f[from] as number;
  if (here === 0) return { next: -1, dist: 0 };
  if (here > 0) return { next: bestNeighbour(world, f, from), dist: here };
  const map = world.state.map;
  if (map.content[from] !== Content.Queue) {
    const b = bestNeighbour(world, f, from);
    return b < 0 ? null : { next: b, dist: (f[b] as number) + 1 };
  }
  // Out of a queue: BFS over its queue component for the shortest total route.
  const parent = new Map<number, number>([[from, -1]]);
  const depth = new Map<number, number>([[from, 0]]);
  const order = [from];
  let bestTile = -1;
  let bestTotal = Infinity;
  for (let h = 0; h < order.length; h++) {
    const t = order[h] as number;
    const b = bestNeighbour(world, f, t);
    if (b >= 0) {
      const total = (depth.get(t) as number) + 1 + (f[b] as number);
      if (total < bestTotal) {
        bestTotal = total;
        bestTile = t;
      }
    }
    for (const d of DIRS) {
      const n = neighbour(map, t, d);
      if (n < 0 || parent.has(n) || map.content[n] !== Content.Queue) continue;
      parent.set(n, t);
      depth.set(n, (depth.get(t) as number) + 1);
      order.push(n);
    }
  }
  if (bestTile < 0) return null;
  if (bestTile === from) return { next: bestNeighbour(world, f, from), dist: bestTotal };
  let step = bestTile;
  while (parent.get(step) !== from) step = parent.get(step) as number;
  return { next: step, dist: bestTotal };
}

export function distanceTo(world: World, fromTile: number, dest: DestKey): number | null {
  fake.calls.distanceTo++;
  const r = route(world, field(world, dest), fromTile);
  return r ? r.dist : null;
}

export function nextStep(world: World, fromTile: number, dest: DestKey): number | null {
  fake.calls.nextStep++;
  const r = route(world, field(world, dest), fromTile);
  return r && r.next >= 0 ? r.next : null;
}

export function markNetworkDirty(_world: World): void {}
