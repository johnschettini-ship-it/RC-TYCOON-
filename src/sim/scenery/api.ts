/**
 * Scenery queries (Phase 4 §4.5). Owner: W3-D. Signatures are a contract for fields (W3-E), lighting (W3-F),
 * terrain (W3-A), paths (W3-B), and scenario generation (W3-H).
 * Per-tile lookups go through the derived index (`./index.ts`, never saved, rebuilt after a load).
 */
import { getSceneryDef } from '../../data/catalog';
import { GARDEN_WILT_BELOW } from '../../data/tuning/scenery';
import type { Dir } from '../map';
import type { World } from '../types';
import type { EntityId } from '../units';
import { sceneryIndex } from './index';
import type { Scenery } from './types';

export { sceneryExtent } from './extent';

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

/** Wilted: a garden with `waterLevel < 64` (art, Calm halved, thought). Real body. */
export function isWilted(item: Scenery): boolean {
  return getSceneryDef(item.defId)?.needsWater === true && item.waterLevel < GARDEN_WILT_BELOW;
}

/** Items whose footprint covers `tile` (centre items, arches included) or that stand on one of its edges, in id order. */
export function sceneryOnTile(world: World, tile: number): Scenery[] {
  const idx = sceneryIndex(world);
  if (!Number.isInteger(tile) || tile < 0 || tile >= idx.centre.length) return [];
  const out: Scenery[] = [];
  const centre = idx.centre[tile] as number;
  if (centre >= 0) {
    const item = idx.byId.get(centre);
    if (item) out.push(item);
  }
  for (let d = 0; d < 4; d++) {
    const id = idx.edge[tile * 4 + d] as number;
    if (id < 0) continue;
    const item = idx.byId.get(id);
    if (item) out.push(item);
  }
  if (out.length > 1) out.sort((a, b) => a.id - b.id);
  return out;
}

/** The centre item (arches included) covering `tile`, or undefined. No allocation. */
export function centreSceneryAt(world: World, tile: number): Scenery | undefined {
  const idx = sceneryIndex(world);
  if (!Number.isInteger(tile) || tile < 0 || tile >= idx.centre.length) return undefined;
  const id = idx.centre[tile] as number;
  return id < 0 ? undefined : idx.byId.get(id);
}

/**
 * True when an edge item blocks guest movement across edge `dir` of `tile` (Phase 4 §4.5; the shared edge of the
 * two tiles, from either side). Path connectivity (W3-B) calls it. O(1).
 */
export function edgeBlocked(world: World, tile: number, dir: Dir): boolean {
  const idx = sceneryIndex(world);
  if (tile < 0 || tile >= idx.edgeMask.length) return false;
  return (((idx.edgeMask[tile] as number) >> dir) & 1) === 1;
}

/** Spooky scenery items (flag K) within Chebyshev distance `radius` of `tile` (After Dark, W3-F). */
export function spookyItemsNear(world: World, tile: number, radius: number): number {
  const idx = sceneryIndex(world);
  const map = world.state.map;
  if (tile < 0 || tile >= idx.spooky.length || radius < 0) return 0;
  const w = map.width;
  const cx = tile % w;
  const cy = (tile - cx) / w;
  const x0 = Math.max(0, cx - radius);
  const x1 = Math.min(w - 1, cx + radius);
  const y0 = Math.max(0, cy - radius);
  const y1 = Math.min(map.height - 1, cy + radius);
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    const row = y * w;
    for (let x = x0; x <= x1; x++) n += idx.spooky[row + x] as number;
  }
  return n;
}
