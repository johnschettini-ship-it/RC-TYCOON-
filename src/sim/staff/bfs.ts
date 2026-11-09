/**
 * Owners: W1-H, W3-B (path nodes). Staff breadth-first search (Phase 3 §4.1, Phase 4 §4.2).
 * The search runs over path nodes `(tile, z)`: a step needs a staff-walkable tile (`isWalkable(…, 'staff')`) and a
 * node link (`linkedNode`: matching edge heights, no cliff, no edge scenery). Links expand in the fixed order
 * N, E, S, W, so ties always break the same way. Results are reported per tile (the first node that reaches it).
 * Scratch arrays are derived data, cached per map in a WeakMap (never in GameState).
 * A `BfsRun` reads the scratch: use it before the next search starts.
 *
 * The start: the node at `opts.startZ` on the start tile; else the node of the walker set by `setBfsOrigin` when
 * it stands on the start tile (the staff update sets it while it plans); else every node on the start tile.
 */
import { neighbour, type Dir, type MapState } from '../map';
import { isWalkable } from '../pathing';
import { linkedNode, lowestNodeOn, nodeIdAt, nodeIdsOn, nodeTileOf } from '../paths/nodes';
import type { World } from '../types';
import { inPatrol } from './patrol';

interface Scratch {
  gen: number;
  /** Per node. */
  stamp: Uint32Array;
  dist: Int32Array;
  parent: Int32Array;
  /** Per tile: the first node that reached it (valid when `tileStamp` is the current gen). */
  tileStamp: Uint32Array;
  tileNode: Int32Array;
}

const scratchByMap = new WeakMap<MapState, Scratch>();

function scratchFor(map: MapState, nodes: number): Scratch {
  let s = scratchByMap.get(map);
  const n = map.width * map.height;
  if (!s || s.tileStamp.length !== n || s.stamp.length < nodes) {
    const cap = Math.max(nodes, n);
    s = {
      gen: 0,
      stamp: new Uint32Array(cap),
      dist: new Int32Array(cap),
      parent: new Int32Array(cap),
      tileStamp: new Uint32Array(n),
      tileNode: new Int32Array(n),
    };
    scratchByMap.set(map, s);
  }
  s.gen = (s.gen + 1) >>> 0;
  if (s.gen === 0) {
    s.stamp.fill(0);
    s.tileStamp.fill(0);
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
  /** Height of the start node (Phase 4); default: see the module comment. */
  startZ?: number;
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

let origin: { tile: number; z: number } | null = null;

/** The walker whose plan is being made (its tile and node height), or null to clear it. */
export function setBfsOrigin(tile: number, z: number): void {
  origin = { tile, z };
}

export function clearBfsOrigin(): void {
  origin = null;
}

/** Start nodes on `start` (a pseudo-node `start` when the tile has no node: the Build 1 rule visits it anyway). */
function startNodes(world: World, start: number, startZ: number | undefined): number[] {
  const z = startZ ?? (origin && origin.tile === start ? origin.z : undefined);
  if (z !== undefined) {
    const node = nodeIdAt(world, start, z);
    if (node >= 0) return [node];
  }
  const all = nodeIdsOn(world, start);
  return all.length > 0 ? all : [start];
}

export function staffBfs(world: World, start: number, opts: BfsOptions = {}): BfsRun {
  const map = world.state.map;
  const n = map.width * map.height;
  const s = scratchFor(map, n + world.state.elevatedPaths.length);
  const gen = s.gen;
  const maxSteps = opts.maxSteps ?? Number.MAX_SAFE_INTEGER;
  const patrol = opts.patrol ?? null;
  const box = opts.box;
  const goal = opts.goal ?? -1;
  const sx = start % map.width;
  const sy = Math.floor(start / map.width);
  const order: number[] = [];
  const queue: number[] = [];
  /** The start tile has no node: `start` is a pseudo-node that steps to the neighbours' lowest nodes. */
  let pseudoStart = false;
  if (start >= 0 && start < n) {
    const nodes = startNodes(world, start, opts.startZ);
    pseudoStart = nodes.length === 1 && nodes[0] === start && lowestNodeOn(world, start) !== start;
    for (const node of nodes) {
      s.stamp[node] = gen;
      s.dist[node] = 0;
      s.parent[node] = -1;
      queue.push(node);
    }
    s.tileStamp[start] = gen;
    s.tileNode[start] = queue[0] as number;
    order.push(start);
  }
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head] as number;
    const t = node < n ? node : nodeTileOf(world, node);
    if (t === goal) break;
    const d = s.dist[node] as number;
    if (d >= maxSteps) continue;
    const offNetwork = pseudoStart && node === start;
    for (const dir of DIRS) {
      let next: number;
      if (offNetwork) {
        const u = neighbour(map, t, dir);
        next = u < 0 ? -1 : lowestNodeOn(world, u);
      } else {
        next = linkedNode(world, node, dir);
      }
      if (next < 0 || s.stamp[next] === gen) continue;
      const nt = next < n ? next : nodeTileOf(world, next);
      if (box !== undefined) {
        const nx = nt % map.width;
        const ny = Math.floor(nt / map.width);
        if (Math.max(Math.abs(nx - sx), Math.abs(ny - sy)) > box) continue;
      }
      if (!inPatrol(patrol, nt) || !isWalkable(world, nt, 'staff')) continue;
      s.stamp[next] = gen;
      s.dist[next] = d + 1;
      s.parent[next] = node;
      queue.push(next);
      if (s.tileStamp[nt] !== gen) {
        s.tileStamp[nt] = gen;
        s.tileNode[nt] = next;
        order.push(nt);
      }
    }
  }
  const reached = (tile: number): boolean => tile >= 0 && tile < n && s.tileStamp[tile] === gen && s.gen === gen;
  return {
    order,
    dist: (tile) => (reached(tile) ? (s.dist[s.tileNode[tile] as number] as number) : -1),
    route: (tile) => {
      if (!reached(tile)) return null;
      const out: number[] = [];
      for (let node = s.tileNode[tile] as number; node !== -1 && (s.parent[node] as number) !== -1; node = s.parent[node] as number) {
        out.push(node < n ? node : nodeTileOf(world, node));
      }
      return out.reverse();
    },
  };
}

/** Shortest staff route from `from` to `to` (to included), or null when unreachable. */
export function staffRoute(world: World, from: number, to: number, patrol: Uint8Array | null = null): number[] | null {
  if (from === to) return [];
  return staffBfs(world, from, { goal: to, patrol }).route(to);
}
