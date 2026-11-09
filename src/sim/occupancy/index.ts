/**
 * Per-tile occupancy list (master 6.3, Phase 4 §4.1, §4.2, §4.5). Owner: W3-B. Derived; never saved.
 *
 * Height ranges are absolute metres, half-open `[zMin, zMax)`:
 * - ground path: `[ground, ground + 3)`; elevated path: `[z, z + 3)` (PATH_HEADROOM), its supports do not block;
 * - track: the Phase 2 envelopes from `buildOccupancy` (`rides/track/placement.ts`, W3-C);
 * - scenery: `[ground, ground + height)`; an `overPath` arch `[ground + 3, ground + height)`
 *   (from `forEachSceneryOccupant`, `scenery/occupancy.ts`, W3-D).
 * Every check that needs clearance (terrain edits, water, elevated paths, track, scenery) goes through this module,
 * so all of them agree. Results are cached per world and rebuilt after `markOccupancyDirty`.
 */
import { TERRAIN_ERR } from '../../data/strings/terrain';
import type { World } from '../types';
import type { EntityId } from '../units';

export type OccupantKind = 'groundPath' | 'elevatedPath' | 'track' | 'scenery';

export interface Occupant {
  kind: OccupantKind;
  /** Elevated path, ride, or scenery id; −1 for a ground path. */
  id: EntityId;
  zMin: number;
  zMax: number;
}

/** Occupants of `tile`, lowest first. Stub: none. */
export function occupantsAt(_world: World, _tile: number): readonly Occupant[] {
  return [];
}

/**
 * The first occupant of `tile` whose range overlaps `[zMin, zMax)`, ignoring the object `ignoreId` (an object
 * being moved or rebuilt), or null when the range is free. Stub: always free.
 */
export function clearanceBlock(_world: World, _tile: number, _zMin: number, _zMax: number, _ignoreId: EntityId = -1): Occupant | null {
  return null;
}

/** `zMin` of the lowest occupant of `tile` that starts at or above `z` (terrain "clearance under an object"), or null. Stub: null. */
export function lowestAbove(_world: World, _tile: number, _z: number): number | null {
  return null;
}

/** Call after any change to paths, elevated paths, track, or scenery. Stub: no-op. */
export function markOccupancyDirty(_world: World): void {}

/** The §4.1 reason string for an object in the way. Real body. */
export function occupantReason(o: Occupant): string {
  switch (o.kind) {
    case 'groundPath':
      return TERRAIN_ERR.pathInWay;
    case 'track':
      return TERRAIN_ERR.trackInWay;
    case 'scenery':
      return TERRAIN_ERR.sceneryInWay;
    default:
      return TERRAIN_ERR.noClearance;
  }
}
