/**
 * Scenery entities (Phase 4 §4.5, §5). Owner: W3-D. Slice: `GameState.scenery`, sorted by id.
 * Each tile has 1 centre slot and 4 edge slots. A centre item (not `overPath`) marks its footprint tiles
 * `Content.Scenery` with `contentRef` = its id. Edge items and arches over paths leave `map.content` unchanged.
 */
import type { Dir } from '../map';
import type { EntityId } from '../units';

/** −1 = centre slot; 0–3 = the tile edge in map `Dir` order (N, E, S, W). */
export type SceneryEdge = -1 | Dir;

export interface Scenery {
  id: EntityId;
  /** Catalog id (`src/data/catalog/scenery.ts`). */
  defId: string;
  /** Footprint origin (minimum x and y). */
  x: number;
  y: number;
  /** Absolute base height in steps (the ground under the item). */
  z: number;
  rotation: Dir;
  edge: SceneryEdge;
  /** Gardens (`needsWater`): 0–255, start 255; wilted below 64. Other items keep 255. */
  waterLevel: number;
}
