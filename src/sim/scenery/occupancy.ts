/**
 * Scenery heights for the occupancy list (Phase 4 §4.5). Owner: W3-D. Consumed by `occupancy/index.ts` (W3-B).
 *
 * Contract: calls `visit(tile, zMin, zMax, sceneryId)` once per footprint tile of every centre item, in ascending
 * id order: `[ground, ground + height)`, or `[ground + 3, ground + height)` for `overPath` arches. Edge items do not
 * occupy the centre column. `ground` is the item's base height `z` (every footprint tile stands at it).
 */
import { getSceneryDef } from '../../data/catalog';
import { PATH_HEADROOM } from '../../data/tuning/paths';
import type { World } from '../types';
import { sceneryExtent } from './extent';

export type OccupantVisitor = (tile: number, zMin: number, zMax: number, id: number) => void;

export function forEachSceneryOccupant(world: World, visit: OccupantVisitor): void {
  const map = world.state.map;
  for (const item of world.state.scenery) {
    const def = getSceneryDef(item.defId);
    if (!def || def.edge) continue;
    const zMin = def.overPath ? item.z + PATH_HEADROOM : item.z;
    const zMax = item.z + def.heightM;
    const { w, d } = sceneryExtent(def, item.rotation);
    for (let dy = 0; dy < d; dy++) {
      const y = item.y + dy;
      if (y < 0 || y >= map.height) continue;
      for (let dx = 0; dx < w; dx++) {
        const x = item.x + dx;
        if (x < 0 || x >= map.width) continue;
        visit(y * map.width + x, zMin, zMax, item.id);
      }
    }
  }
}
