/**
 * Elevated paths and path nodes (Phase 4 §4.2, §5). Owner: W3-B. Slice: `GameState.elevatedPaths`, sorted by id.
 * Ground paths keep their Build 1 storage (`map.content` = Footpath / Queue at the tile base height).
 */
import type { Dir } from '../map';
import type { EntityId } from '../units';

export type PathKind = 'footpath' | 'queue';

/** −1 = flat; else the map `Dir` the walking surface rises toward (1 step over the tile). */
export type RampDir = -1 | Dir;

/** An elevated path tile `{ id, x, y, z, kind, rampDir }`. `z` is the base height of its walking surface. */
export interface ElevatedPath {
  id: EntityId;
  x: number;
  y: number;
  /** Absolute height steps. Rule: z ≥ maxCorner + 1 and z ≤ ground + 20. */
  z: number;
  kind: PathKind;
  rampDir: RampDir;
}

/**
 * A walkable node (Phase 4 §4.2): a tile and the height of its walking surface. Ground paths are nodes at the
 * tile base height; each elevated path is a node at its `z`. A ramp node runs from `z` (low edge) to `z + 1`.
 */
export interface PathNode {
  tile: number;
  z: number;
}

/** Path item level (`map.pathItemLevel`): 0 = the ground path, else the id of the elevated path that holds it. */
export const GROUND_LEVEL_ITEM = 0;
