/**
 * Scenery heights for the occupancy list (Phase 4 §4.5). Owner: W3-D. Consumed by `occupancy/index.ts` (W3-B).
 *
 * Contract: calls `visit(tile, zMin, zMax, sceneryId)` once per footprint tile of every centre item, in ascending
 * id order: `[ground, ground + height)`, or `[ground + 3, ground + height)` for `overPath` arches. Edge items do not
 * occupy the centre column. Stub: visits nothing.
 */
import type { World } from '../types';

export type OccupantVisitor = (tile: number, zMin: number, zMax: number, id: number) => void;

export function forEachSceneryOccupant(_world: World, _visit: OccupantVisitor): void {}
