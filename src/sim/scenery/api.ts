/**
 * Scenery queries (Phase 4 §4.5). Owner: W3-D. Signatures are a contract for fields (W3-E), lighting (W3-F),
 * terrain (W3-A), paths (W3-B), and scenario generation (W3-H).
 */
import { getSceneryDef, type SceneryDef } from '../../data/catalog';
import { GARDEN_WILT_BELOW } from '../../data/tuning/scenery';
import type { Dir } from '../map';
import type { World } from '../types';
import type { EntityId } from '../units';
import type { Scenery } from './types';

/** Scenery by id (the list is sorted by id). Real body. */
export function findScenery(world: World, id: EntityId): Scenery | undefined {
  const list = world.state.scenery;
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = list[mid] as Scenery;
    if (s.id === id) return s;
    if (s.id < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

/** Footprint size of an item at its rotation: 2 × 1 items swap sides at rotation 1 and 3. Real body. */
export function sceneryExtent(def: SceneryDef, rotation: Dir): { w: number; d: number } {
  return rotation % 2 === 1 ? { w: def.d, d: def.w } : { w: def.w, d: def.d };
}

/** Wilted: a garden with `waterLevel < 64` (art, Calm halved, thought). Real body. */
export function isWilted(item: Scenery): boolean {
  return getSceneryDef(item.defId)?.needsWater === true && item.waterLevel < GARDEN_WILT_BELOW;
}

/** Items whose footprint covers `tile` (centre items) or that stand on one of its edges, in id order. Stub: none. */
export function sceneryOnTile(_world: World, _tile: number): Scenery[] {
  return [];
}

/**
 * True when an edge item blocks guest movement across edge `dir` of `tile` (Phase 4 §4.5; the shared edge of the
 * two tiles, from either side). Path connectivity (W3-B) calls it. Stub: never blocked.
 */
export function edgeBlocked(_world: World, _tile: number, _dir: Dir): boolean {
  return false;
}

/** Spooky scenery items (flag K) within Chebyshev distance `radius` of `tile` (After Dark, W3-F). Stub: 0. */
export function spookyItemsNear(_world: World, _tile: number, _radius: number): number {
  return 0;
}
