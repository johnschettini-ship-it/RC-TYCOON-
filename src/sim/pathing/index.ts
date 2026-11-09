/**
 * Pathing API (Phase 1 §4.2). Owner: W1-C. Signatures are a contract.
 * Derived data (queue ownership, distance fields) lives in a module-level WeakMap<World, …> (see ./network),
 * never in GameState. Fields rebuild lazily on the first query after `markNetworkDirty`.
 *
 * Walkable tiles: footpath, queue, park entrance. Moves use the 4 neighbours only.
 * - `ride:N` field: BFS from `ride.entrance.outside` over footpaths, the park entrance, and ride N's own queue.
 *   A ride whose entrance outside tile is not one of its queue tiles has no field (unreachable).
 * - `stall:N` field: BFS from `stall.serviceTile` (must be a footpath) over footpaths and the park entrance.
 * - `exit` field: BFS from `map.entranceTile` over footpaths and the park entrance.
 * Queue tiles never appear in stall or exit fields, and a ride's queue never appears in another ride's field.
 */
import type { DestKey } from '../guests/types';
import type { World } from '../types';
import type { EntityId } from '../units';
import {
  guestField,
  isGuestWalkableContent,
  isStaffWalkableContent,
  markDirty,
  network,
  route,
  staffField,
} from './network';

export { UNREACHABLE } from './network';

export type WalkMode = 'guest' | 'staff';

/** Next tile toward `dest`, or null when unreachable or already there. Guests may use only the queue of `dest`. */
export function nextStep(world: World, fromTile: number, dest: DestKey): number | null {
  const c = network(world);
  const field = guestField(c, dest);
  if (!field) return null;
  const r = route(c.map, field, fromTile);
  return r && r.next >= 0 ? r.next : null;
}

/** Path distance in tiles, or null when unreachable. 0 at the destination tile. */
export function distanceTo(world: World, fromTile: number, dest: DestKey): number | null {
  const c = network(world);
  const field = guestField(c, dest);
  if (!field) return null;
  const r = route(c.map, field, fromTile);
  return r ? r.dist : null;
}

/** Ride id that owns the queue on this tile, or null (not a queue tile, or a queue that touches no entrance). */
export function queueOwner(world: World, tile: number): EntityId | null {
  const c = network(world);
  if (!Number.isInteger(tile) || tile < 0 || tile >= c.owner.length) return null;
  const id = c.owner[tile] as number;
  return id >= 0 ? id : null;
}

/**
 * Guests: footpath or park entrance. Queue tiles are not free to walk for guests: a guest enters a queue
 * only on the route of that queue's ride (`nextStep`). Staff: footpath, queue (any owner), park entrance.
 */
export function isWalkable(world: World, tile: number, mode: WalkMode): boolean {
  const map = world.state.map;
  if (!Number.isInteger(tile) || tile < 0 || tile >= map.content.length) return false;
  const t = map.content[tile];
  return mode === 'staff' ? isStaffWalkableContent(t) : isGuestWalkableContent(t);
}

/** Call after any change to paths, queues, gates, or buildings. */
export function markNetworkDirty(world: World): void {
  markDirty(world);
}

/**
 * Read-only view of the guest distance field for `dest` (UNREACHABLE = no route), or null. For overlays and tests.
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
export function staffNextStep(world: World, fromTile: number, targetTile: number): number | null {
  const c = network(world);
  const field = staffField(c, targetTile);
  if (!field) return null;
  const r = route(c.map, field, fromTile);
  return r && r.next >= 0 ? r.next : null;
}

/** Staff path distance in tiles to `targetTile`, or null when unreachable. */
export function staffDistanceTo(world: World, fromTile: number, targetTile: number): number | null {
  const c = network(world);
  const field = staffField(c, targetTile);
  if (!field) return null;
  const r = route(c.map, field, fromTile);
  return r ? r.dist : null;
}
