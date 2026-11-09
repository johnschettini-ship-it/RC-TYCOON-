/**
 * Gardens and watering (Phase 4 §4.5). Owner: W3-D. The Groundskeeper plumbing in `staff/tasks.ts` and
 * `staff/update.ts` calls these (task `water`, state `watering`, after mess, bins, and litter).
 *
 * A Groundskeeper on a path tile serves every garden that covers a tile within GARDEN_REACH (Chebyshev 1) of it:
 * the tile itself or any of its 8 neighbours. Called for every tile of a Groundskeeper's search, so no allocation.
 */
import { getSceneryDef, type SceneryDef } from '../../data/catalog';
import { GARDEN_REACH, GARDEN_WATER_BELOW, GARDEN_WATER_MAX, GARDEN_WILT_BELOW } from '../../data/tuning/scenery';
import { markFieldsDirty } from '../fields/api';
import type { World } from '../types';
import { itemTiles, sceneryIndex } from './index';
import type { Scenery } from './types';

function gardenAt(world: World, tile: number): { item: Scenery; def: SceneryDef } | null {
  const idx = sceneryIndex(world);
  const id = idx.centre[tile] as number;
  if (id < 0) return null;
  const item = idx.byId.get(id);
  if (!item) return null;
  const def = getSceneryDef(item.defId);
  return def && def.needsWater ? { item, def } : null;
}

/**
 * True when a garden with `waterLevel < 128` can be watered from the path tile `pathTile` (on it, or on a
 * neighbouring tile). The Groundskeeper's BFS only visits tiles in its patrol area.
 */
export function gardenNeedsWaterNear(world: World, pathTile: number): boolean {
  if (world.state.scenery.length === 0) return false;
  const map = world.state.map;
  if (!Number.isInteger(pathTile) || pathTile < 0 || pathTile >= map.width * map.height) return false;
  const cx = pathTile % map.width;
  const cy = (pathTile - cx) / map.width;
  for (let y = Math.max(0, cy - GARDEN_REACH); y <= Math.min(map.height - 1, cy + GARDEN_REACH); y++) {
    for (let x = Math.max(0, cx - GARDEN_REACH); x <= Math.min(map.width - 1, cx + GARDEN_REACH); x++) {
      const g = gardenAt(world, y * map.width + x);
      if (g && g.item.waterLevel < GARDEN_WATER_BELOW) return true;
    }
  }
  return false;
}

/** Watering done at `pathTile` (after WATERING_TICKS): every garden it serves gets `waterLevel = 255`. */
export function waterGardensNear(world: World, pathTile: number): void {
  if (world.state.scenery.length === 0) return;
  const map = world.state.map;
  if (!Number.isInteger(pathTile) || pathTile < 0 || pathTile >= map.width * map.height) return;
  const cx = pathTile % map.width;
  const cy = (pathTile - cx) / map.width;
  for (let y = Math.max(0, cy - GARDEN_REACH); y <= Math.min(map.height - 1, cy + GARDEN_REACH); y++) {
    for (let x = Math.max(0, cx - GARDEN_REACH); x <= Math.min(map.width - 1, cx + GARDEN_REACH); x++) {
      const g = gardenAt(world, y * map.width + x);
      if (!g || g.item.waterLevel === GARDEN_WATER_MAX) continue;
      setWaterLevel(world, g.item, g.def, GARDEN_WATER_MAX);
    }
  }
}

/** Set a garden's level; crossing the wilt line (either way) marks its Calm source dirty (W3-E). */
export function setWaterLevel(world: World, item: Scenery, def: SceneryDef, level: number): void {
  const before = item.waterLevel < GARDEN_WILT_BELOW;
  item.waterLevel = level;
  if (before === level < GARDEN_WILT_BELOW) return;
  for (const t of itemTiles(world.state.map, item, def)) markFieldsDirty(world, t);
}
