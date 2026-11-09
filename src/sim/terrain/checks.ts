/**
 * Per-tile checks of the terrain and water tools (Phase 4 §4.1 table, §4.3). Owner: W3-A. Read-only.
 *
 * Order (first failure wins): ownership → park entrance or its outside spawn tile → ground path → ride or stall →
 * track → scenery (centre or edge) → clearance under an object above → height limits.
 * Guests and staff do not block terrain edits: they are never on a tile without a path.
 */
import { TERRAIN_ERR } from '../../data/strings/terrain';
import { MAX_CORNER_HEIGHT } from '../../data/tuning/terrain';
import { groundOwnershipBlock } from '../land/api';
import { Content, DIR_DX, DIR_DY, type MapState } from '../map';
import { clearanceBlock, lowestAbove, occupantReason } from '../occupancy';
import { sceneryOnTile } from '../scenery/api';
import type { World } from '../types';
import { isWet, maxCorner, minCorner } from './corners';
import type { CornerHeights, NormalizedTile } from './types';

/**
 * The tile where guests appear outside the park entrance, or −1 when it is off the map. The outside is the
 * direction of a map edge next to the entrance, else the side opposite the path that leads in (as the fence draws it).
 */
export function entranceOutsideTile(map: MapState): number {
  const e = map.entranceTile;
  if (e < 0) return -1;
  const w = map.width;
  const x = e % w;
  const y = (e - x) / w;
  for (let d = 0; d < 4; d++) {
    const nx = x + (DIR_DX[d] as number);
    const ny = y + (DIR_DY[d] as number);
    if (nx < 0 || ny < 0 || nx >= w || ny >= map.height) return -1;
  }
  for (let d = 0; d < 4; d++) {
    const c = map.content[(y + (DIR_DY[d] as number)) * w + x + (DIR_DX[d] as number)];
    if (c === Content.Footpath || c === Content.Queue) {
      const o = (d + 2) % 4;
      return (y + (DIR_DY[o] as number)) * w + x + (DIR_DX[o] as number);
    }
  }
  return -1;
}

/** Rows 1–6 of the §4.1 table: everything on the ground of tile `i` that blocks an edit, or null. */
export function groundBlock(world: World, i: number): string | null {
  const map = world.state.map;
  const own = groundOwnershipBlock(map, i);
  if (own) return own;
  const c = map.content[i];
  if (c === Content.ParkEntrance || i === map.entranceTile || i === entranceOutsideTile(map)) return TERRAIN_ERR.entranceInWay;
  if (c === Content.Footpath || c === Content.Queue) return TERRAIN_ERR.pathInWay;
  if (c === Content.Building) return TERRAIN_ERR.rideOrStallInWay;
  if (c === Content.Track) return TERRAIN_ERR.trackInWay;
  if (c === Content.Scenery || sceneryOnTile(world, i).length > 0) return TERRAIN_ERR.sceneryInWay;
  return null;
}

/**
 * The whole §4.1 table for a land edit of tile `i` to the requested corners `raw` (normalized to `next`).
 * Clearance: only a rise can reach an object above (`lowestAbove` from the tile's ground); the height limits test
 * the requested corners, so a corner pushed past 63 or below 0 fails even when normalizing would hide it.
 */
export function landEditBlock(world: World, i: number, raw: CornerHeights, next: NormalizedTile): string | null {
  const ground = groundBlock(world, i);
  if (ground) return ground;
  const map = world.state.map;
  // The requested top corner (normalizing only ever lowers a corner, and clamps one pushed past 63).
  const newMax = Math.max(next.height + (next.slope !== 0 ? 1 : 0), raw[0], raw[1], raw[2], raw[3]);
  if (newMax > maxCorner(map, i)) {
    const zMin = lowestAbove(world, i, minCorner(map, i));
    if (zMin !== null && newMax >= zMin) return TERRAIN_ERR.noClearance;
  }
  for (const v of raw) if (v > MAX_CORNER_HEIGHT) return TERRAIN_ERR.tooHigh;
  for (const v of raw) if (v < 0) return TERRAIN_ERR.tooLow;
  return null;
}

/** New water surface of a raise: `maxCorner + 1` on a dry tile, else `water + 1` (Phase 4 §4.3). */
export function raisedSurface(map: MapState, i: number): number {
  return isWet(map, i) ? (map.water[i] as number) + 1 : maxCorner(map, i) + 1;
}

/**
 * Raise water on tile `i` to `surface`: the ground rows of the §4.1 table, then any object whose range starts below
 * the new surface (its §4.1 string by type; an elevated path at the surface is a bridge and may stay), then 63.
 */
export function raiseWaterBlock(world: World, i: number, surface: number): string | null {
  const ground = groundBlock(world, i);
  if (ground) return ground;
  const o = clearanceBlock(world, i, minCorner(world.state.map, i), surface);
  if (o) return occupantReason(o);
  if (surface > MAX_CORNER_HEIGHT) return TERRAIN_ERR.waterTooHigh;
  return null;
}

/** Lower water on tile `i`: ownership, then `"There is no water here"` on a dry tile. */
export function lowerWaterBlock(world: World, i: number): string | null {
  const map = world.state.map;
  return groundOwnershipBlock(map, i) ?? (isWet(map, i) ? null : TERRAIN_ERR.noWater);
}
