/**
 * Pathing API (Phase 1 §4.2, Phase 4 §4.2). Owners: W1-C (Build 1), W3-B (path nodes). Signatures are a contract.
 * Derived data (node links, queue ownership, distance fields) lives in a module-level WeakMap<World, …> (see
 * ./network), never in GameState. Fields rebuild lazily on the first query after `markNetworkDirty`.
 *
 * The network is made of path nodes `(tile, z)`: ground paths at the tile base height (flat or on one of the 4
 * ramp masks) and elevated paths at their `z`. Two nodes on neighbour tiles link when their facing edges connect
 * at the same height and no edge scenery blocks the shared edge. A wet tile has no ground node.
 * Walkable nodes: footpath, queue, park entrance. Moves use the 4 links only.
 * - `ride:N` field: BFS from the node outside the entrance gate (at the ride height) over footpaths, the park
 *   entrance, and ride N's own queue. A ride whose entrance node is not one of its queue nodes has no field.
 * - `stall:N` field: BFS from the footpath node at the service side (at the stall height) over footpaths and the
 *   park entrance.
 * - `exit` field: BFS from the park entrance node over footpaths and the park entrance.
 * - `show:N` field (Phase 6 §4.4): BFS from every guest-walkable node on the viewing tiles of show site N
 *   (`shows/api.ts` `viewingTiles`, W4-C) over footpaths and the park entrance. No viewing node → no field.
 * Queue nodes never appear in stall, show, or exit fields, and a ride's queue never appears in another ride's field.
 *
 * Every query takes the walker's tile and, from Build 2, an optional `z` (the walker's node height). Without `z`
 * the tile's best node is used (its only node on Build 1 maps). Field arrays are indexed by node id: a ground
 * node's id is its tile index, so Build 1 code may index them by tile.
 */
import type { DestKey } from '../guests/types';
import type { World } from '../types';
import type { EntityId } from '../units';
import { Content } from '../map';
import { firstElevatedOnTile, nextElevatedOnTile, nodeIdAt, nodeKindOf } from '../paths/nodes';
import type { ElevatedPath } from '../paths/types';
import {
  UNREACHABLE,
  destinationSeed,
  guestField,
  isQueueNode,
  markDirty,
  network,
  nodesOnTile,
  route,
  staffField,
  type NetworkCache,
  type Route,
} from './network';

export { UNREACHABLE } from './network';

export type WalkMode = 'guest' | 'staff';

const FOOTPATH = Content.Footpath;
const QUEUE = Content.Queue;
const ENTRANCE = Content.ParkEntrance;

const scratch: number[] = [];

/** Node of the walker: `(tile, z)` when `z` is given, else −2 = "pick the best node on the tile". −1 = off the network. */
function fromNode(world: World, tile: number, z: number | undefined): number {
  if (z === undefined) return -2;
  return nodeIdAt(world, tile, z);
}

/** Route from `(tile, z)`; without `z`, the node of the tile with the shortest route (ties: lowest node). */
function bestRoute(world: World, c: NetworkCache, field: Uint16Array, tile: number, z: number | undefined): Route | null {
  const node = fromNode(world, tile, z);
  if (node !== -2) return route(c, field, node, tile);
  const count = nodesOnTile(c, tile, scratch);
  if (count === 0) return route(c, field, -1, tile);
  if (count === 1) return route(c, field, scratch[0] as number, tile);
  let best: Route | null = null;
  const nodes = scratch.slice(0, count);
  for (const n of nodes) {
    const r = route(c, field, n, tile);
    if (r && (!best || r.dist < best.dist)) best = r;
  }
  return best;
}

/** Tile of a route's next node. */
function nextTileOf(c: NetworkCache, r: Route | null): number | null {
  return r && r.next >= 0 ? (c.nodeTile[r.next] as number) : null;
}

/** Next tile toward `dest`, or null when unreachable or already there. Guests may use only the queue of `dest`. */
export function nextStep(world: World, fromTile: number, dest: DestKey, fromZ?: number): number | null {
  const c = network(world);
  const field = guestField(c, dest);
  if (!field) return null;
  return nextTileOf(c, bestRoute(world, c, field, fromTile, fromZ));
}

/** Path distance in steps, or null when unreachable. 0 at the destination node. */
export function distanceTo(world: World, fromTile: number, dest: DestKey, fromZ?: number): number | null {
  const c = network(world);
  const field = guestField(c, dest);
  if (!field) return null;
  const r = bestRoute(world, c, field, fromTile, fromZ);
  return r ? r.dist : null;
}

/**
 * True when the walker at `(tile, z)` stands where `dest` is served: the park entrance, the footpath node at a
 * stall's service side, (rides) the entrance node or any node of the ride's own queue, or (shows) any viewing node.
 */
export function atDestination(world: World, tile: number, z: number, dest: DestKey): boolean {
  const c = network(world);
  const node = nodeIdAt(world, tile, z);
  if (node < 0) return false;
  if (dest.startsWith('show:')) {
    const field = guestField(c, dest);
    return field !== null && field[node] === 0;
  }
  const { seed, queue } = destinationSeed(c, dest);
  if (node === seed) return true;
  return queue >= 0 && isQueueNode(c, node) && c.owner[node] === queue;
}

/**
 * Ride id that owns the queue on this tile, or null (not a queue, or a queue that touches no entrance). With `z`,
 * the queue node at that height; without, the ground node, else the lowest elevated queue node.
 */
export function queueOwner(world: World, tile: number, z?: number): EntityId | null {
  const c = network(world);
  if (!Number.isInteger(tile) || tile < 0 || tile >= c.tiles) return null;
  if (z !== undefined) {
    const node = nodeIdAt(world, tile, z);
    const id = node >= 0 ? (c.owner[node] as number) : -1;
    return id >= 0 ? id : null;
  }
  const count = nodesOnTile(c, tile, scratch);
  for (let k = 0; k < count; k++) {
    const id = c.owner[scratch[k] as number] as number;
    if (id >= 0) return id;
  }
  return null;
}

function walkableKind(kind: string, mode: WalkMode): boolean {
  return mode === 'staff' || kind !== 'queue';
}

/**
 * Guests: footpath or park entrance. Queue nodes are not free to walk for guests: a guest enters a queue
 * only on the route of that queue's ride (`nextStep`). Staff: footpath, queue (any owner), park entrance.
 * With `z`, the node at that height; without, any node on the tile. A wet tile has no ground node.
 */
export function isWalkable(world: World, tile: number, mode: WalkMode, z?: number): boolean {
  const map = world.state.map;
  if (!Number.isInteger(tile) || tile < 0 || tile >= map.content.length) return false;
  if (z !== undefined) {
    const node = nodeIdAt(world, tile, z);
    return node >= 0 && walkableKind(nodeKindOf(world, node), mode);
  }
  const t = map.content[tile];
  const ground = t === FOOTPATH || t === ENTRANCE || (t === QUEUE && mode === 'staff');
  // A wet tile has no ground node (inline: this runs for every walker every tick).
  if (ground && (map.water[tile] as number) <= (map.heights[tile] as number)) return true;
  const list = world.state.elevatedPaths;
  if (list.length === 0) return false;
  for (let k = firstElevatedOnTile(world, tile); k >= 0; k = nextElevatedOnTile(world, k)) {
    if (mode === 'staff' || (list[k] as ElevatedPath).kind === 'footpath') return true;
  }
  return false;
}

/**
 * Call after any change to paths, elevated paths, queues, gates, buildings, terrain, water, or edge scenery.
 * (Clearance has its own mark: `markOccupancyDirty` in `../occupancy`.)
 */
export function markNetworkDirty(world: World): void {
  markDirty(world);
}

/**
 * Read-only view of the guest distance field for `dest` (UNREACHABLE = no route), or null. Indexed by node id
 * (a ground node's id is its tile). For overlays and tests.
 * The buffer is reused after the next network change: read it now, do not keep it.
 */
export function distanceField(world: World, dest: DestKey): Readonly<Uint16Array> | null {
  return guestField(network(world), dest);
}

/** Build queue ownership and every guest field now (exit, each ride, each stall). Returns the field count. */
export function rebuildAllFields(world: World): number {
  const c = network(world);
  let count = 0;
  const keys: DestKey[] = ['exit'];
  for (const r of world.state.rides) keys.push(`ride:${r.id}`);
  for (const s of world.state.stalls) keys.push(`stall:${s.id}`);
  for (const k of keys) if (guestField(c, k)) count++;
  return count;
}

/** Staff route (Phase 3 §4.1): next tile toward `targetTile` over footpaths, all queues, and the park entrance. */
export function staffNextStep(world: World, fromTile: number, targetTile: number, fromZ?: number): number | null {
  const c = network(world);
  const field = staffField(c, targetTile);
  if (!field) return null;
  return nextTileOf(c, bestRoute(world, c, field, fromTile, fromZ));
}

/** Staff path distance in steps to `targetTile`, or null when unreachable. */
export function staffDistanceTo(world: World, fromTile: number, targetTile: number, fromZ?: number): number | null {
  const c = network(world);
  const field = staffField(c, targetTile);
  if (!field) return null;
  const r = bestRoute(world, c, field, fromTile, fromZ);
  return r ? r.dist : null;
}
