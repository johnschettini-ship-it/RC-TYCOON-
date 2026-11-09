/**
 * Show site queries for other systems (Phase 6 §4.4). Owner: W4-C. Signatures are a contract; bodies marked
 * "neutral" are stubs until W4-C fills them, and must keep these meanings:
 * - with no show sites (every Build 1 and Build 2 park) each query returns its neutral value;
 * - nothing here writes the state.
 */
import { getShowSiteDef } from '../../data/catalog';
import { footprintTiles } from '../footprint';
import type { World } from '../types';
import type { Cents, EntityId } from '../units';
import type { ShowSite } from './types';

/** The site with this id, or undefined (real; binary search, the slice is sorted by id). */
export function findShowSite(world: World, id: EntityId): ShowSite | undefined {
  const list = world.state.shows;
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const site = list[mid] as ShowSite;
    if (site.id === id) return site;
    if (site.id < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

/** Footprint tile indices of a site, or [] for an unknown type or a site outside the map (real). */
export function showSiteTiles(world: World, site: ShowSite): number[] {
  const def = getShowSiteDef(site.defId);
  if (!def) return [];
  return footprintTiles(world.state.map, site.x, site.y, def.w, def.d, site.rotation) ?? [];
}

/**
 * Viewing tiles of site `id` (Phase 6 §4.4: footpaths within the show radius), ascending. The pathing field for
 * `show:N` starts from every guest-walkable node on these tiles (`pathing/network.ts`). Neutral: [].
 * Must only change when paths, the site, or the map change (it is cached with the network; call
 * `markNetworkDirty` after placing or removing a site).
 */
export function viewingTiles(world: World, id: EntityId): readonly number[] {
  void world;
  void id;
  return [];
}

/**
 * True while a guest heading for `show:N` should keep going (the site exists, is announced or running).
 * The guest code re-plans when it turns false (`guests/state.ts` `targetValid`). Neutral: false.
 */
export function showTargetValid(world: World, id: EntityId): boolean {
  void world;
  void id;
  return false;
}

/** Phase 6 §4.4 Arrivals: ×1.05 from 20:00 to 24:00 when the park has ≥ 1 show per night (`park/arrivals.ts`). Neutral: 1. */
export function showArrivalFactor(world: World): number {
  void world;
  return 1;
}

/** Asset value of every show site for the park value (master R14, `finance/value.ts`). Neutral: 0. */
export function showSitesAssetValue(world: World): Cents {
  void world;
  return 0;
}
