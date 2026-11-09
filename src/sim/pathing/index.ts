/**
 * Pathing API (Phase 1 §4.2). Owner: W1-C. Signatures are a contract; replace the stub bodies.
 * Derived data (distance fields) must live in a module-level WeakMap<World, …>, never in GameState.
 */
import type { DestKey } from '../guests/types';
import type { World } from '../types';
import type { EntityId } from '../units';

export type WalkMode = 'guest' | 'staff';

/** Next tile toward `dest`, or null when unreachable or already there. Guests may use only the queue of `dest`. */
export function nextStep(_world: World, _fromTile: number, _dest: DestKey): number | null {
  return null;
}

/** Path distance in tiles, or null when unreachable. */
export function distanceTo(_world: World, _fromTile: number, _dest: DestKey): number | null {
  return null;
}

/** Ride id that owns the queue on this tile, or null. */
export function queueOwner(_world: World, _tile: number): EntityId | null {
  return null;
}

export function isWalkable(_world: World, _tile: number, _mode: WalkMode): boolean {
  return false;
}

/** Call after any change to paths, queues, gates, or buildings. */
export function markNetworkDirty(_world: World): void {}
