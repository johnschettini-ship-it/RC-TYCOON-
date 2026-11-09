/**
 * Owner: W1-H. Staff breadth-first search over `isWalkable(…, 'staff')` tiles (Phase 3 §4.1).
 * Neighbours expand in the fixed order N, E, S, W, so ties always break the same way.
 * Scratch arrays are derived data, cached per map in a WeakMap (never in GameState).
 * A `BfsRun` reads the scratch: use it before the next search starts.
 */
import { neighbour, type Dir, type MapState } from '../map';
import { isWalkable } from '../pathing';
import type { World } from '../types';
import { inPatrol } from './patrol';

interface Scratch {
  gen: number;
  stamp: Uint32Array;
  dist: Int32Array;
  parent: Int32Array;
}

const scratchByMap = new WeakMap<MapState, Scratch>();

function scratchFor(map: MapState): Scratch {
  let s = scratchByMap.get(map);
  const n = map.width * map.height;
  if (!s || s.stamp.length !== n) {
    s = { gen: 0, stamp: new Uint32Array(n), dist: new Int32Array(n), parent: new Int32Array(n) };
    scratchByMap.set(map, s);
  }
  s.gen = (s.gen + 1) >>> 0;
  if (s.gen === 0) {
    s.stamp.fill(0);
    s.gen = 1;
  }
  return s;
}

export interface BfsOptions {
  /** Do not expand beyond this many steps (default: unbounded). */
  maxSteps?: number;
  /** Enter only tiles inside this patrol; null or undefined = everywhere. The start tile is always visited. */
  patrol?: Uint8Array | null;
  /** Enter only tiles within this Chebyshev radius of the start. */
  box?: number;
  /** Stop as soon as this tile is reached. */
  goal?: number;
}

export interface BfsRun {
  /** Visited tiles in discovery order (start first). Nearest first; ties in N, E, S, W order. */
  order: number[];
  /** Steps from the start, or −1 when not reached. */
  dist(tile: number): number;
  /** Tiles to walk from the start to `tile` (start excluded, `tile` included), or null when not reached. */
  route(tile: number): number[] | null;
}

const DIRS: readonly Dir[] = [0, 1, 2, 3];

export function staffBfs(world: World, start: number, opts: BfsOptions = {}): BfsRun {
  const map = world.state.map;
  const s = scratchFor(map);
  const gen = s.gen;
  const maxSteps = opts.maxSteps ?? Number.MAX_SAFE_INTEGER;
  const patrol = opts.patrol ?? null;
  const box = opts.box;
  const goal = opts.goal ?? -1;
  const sx = start % map.width;
  const sy = Math.floor(start / map.width);
  const order: number[] = [];
  if (start >= 0 && start < map.width * map.height) {
    s.stamp[start] = gen;
    s.dist[start] = 0;
    s.parent[start] = -1;
    order.push(start);
  }
  for (let head = 0; head < order.length; head++) {
    const t = order[head] as number;
    if (t === goal) break;
    const d = s.dist[t] as number;
    if (d >= maxSteps) continue;
    for (const dir of DIRS) {
      const n = neighbour(map, t, dir);
      if (n < 0 || s.stamp[n] === gen) continue;
      if (box !== undefined) {
        const nx = n % map.width;
        const ny = Math.floor(n / map.width);
        if (Math.max(Math.abs(nx - sx), Math.abs(ny - sy)) > box) continue;
      }
      if (!inPatrol(patrol, n) || !isWalkable(world, n, 'staff')) continue;
      s.stamp[n] = gen;
      s.dist[n] = d + 1;
      s.parent[n] = t;
      order.push(n);
    }
  }
  const reached = (tile: number): boolean => tile >= 0 && tile < s.stamp.length && s.stamp[tile] === gen && s.gen === gen;
  return {
    order,
    dist: (tile) => (reached(tile) ? (s.dist[tile] as number) : -1),
    route: (tile) => {
      if (!reached(tile)) return null;
      const out: number[] = [];
      for (let t = tile; t !== start && t !== -1; t = s.parent[t] as number) out.push(t);
      return out.reverse();
    },
  };
}

/** Shortest staff route from `from` to `to` (to included), or null when unreachable. */
export function staffRoute(world: World, from: number, to: number, patrol: Uint8Array | null = null): number[] | null {
  if (from === to) return [];
  return staffBfs(world, from, { goal: to, patrol }).route(to);
}
