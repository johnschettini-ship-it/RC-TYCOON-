/**
 * Scenery placement rules (Phase 4 §4.5 table). Owner: W3-D. Pure checks shared by `placeScenery` and the ghost of
 * the scenery tool, so the ghost and the command always agree. Nothing here changes the world.
 *
 * Order (first failure wins; each rule runs over every footprint tile before the next rule):
 * item and command data → owned → dry → slot free → flat (one base height) → clearance → unlocked (not in setup) → cash.
 * - Centre items: the slot is free when the tile is empty (no path, ride, stall, track base, entrance, centre item).
 * - Arches (`overPath`): a flat ground footpath with no other centre item; clearance `[ground + 3, ground + height)`.
 * - Edge items: an owned tile that is empty, a path, or holds a centre item; one item per shared edge (either side);
 *   clearance only against elevated paths and track (a fence on a path tile is the point of edge items).
 */
import { getSceneryDef, type SceneryDef } from '../../data/catalog';
import { SCENERY_ERR } from '../../data/strings/scenery';
import { PATH_HEADROOM } from '../../data/tuning/paths';
import { canAfford, type CommandContext } from '../economy/ledger';
import { groundOwnershipBlock } from '../land/api';
import { Content, neighbour, type Dir, type MapState } from '../map';
import { clearanceBlock, occupantsAt } from '../occupancy';
import { isUnlocked } from '../research/api';
import { isFlat, isWet } from '../terrain/corners';
import type { World } from '../types';
import type { Cents } from '../units';
import { footprintOf, oppositeDir, sceneryIndex } from './index';
import type { SceneryEdge } from './types';

export interface PlacementRequest {
  defId: string;
  x: number;
  y: number;
  rotation: Dir;
  edge: SceneryEdge;
}

export type PlacementCheck =
  | { ok: true; def: SceneryDef; tiles: number[]; z: number; cost: Cents }
  | { ok: false; reason: string; def: SceneryDef | null; tiles: number[] | null };

function isDir(v: unknown): v is Dir {
  return v === 0 || v === 1 || v === 2 || v === 3;
}

/** The §4.1 string of a blocking object on a tile, or null when the content does not block. */
function contentBlock(c: number): string | null {
  switch (c) {
    case Content.Footpath:
    case Content.Queue:
      return SCENERY_ERR.pathInWay;
    case Content.Building:
      return SCENERY_ERR.rideOrStallInWay;
    case Content.Track:
      return SCENERY_ERR.trackInWay;
    case Content.ParkEntrance:
      return SCENERY_ERR.entranceInWay;
    case Content.Scenery:
      return SCENERY_ERR.sceneryInWay;
    default:
      return null;
  }
}

function fail(reason: string, def: SceneryDef | null, tiles: number[] | null): PlacementCheck {
  return { ok: false, reason, def, tiles };
}

/** Centre slot of a centre item or arch on `tile`. */
function centreSlotBlock(world: World, map: MapState, def: SceneryDef, tile: number): string | null {
  const idx = sceneryIndex(world);
  const c = map.content[tile] as number;
  if (def.overPath) {
    if (c === Content.Footpath) return (idx.centre[tile] as number) >= 0 ? SCENERY_ERR.sceneryInWay : null;
    if (c === Content.Empty || c === Content.Queue) return (idx.centre[tile] as number) >= 0 ? SCENERY_ERR.sceneryInWay : SCENERY_ERR.archNeedsPath;
    return contentBlock(c);
  }
  const block = contentBlock(c);
  if (block) return block;
  // An arch left over a removed path still holds the centre slot.
  return (idx.centre[tile] as number) >= 0 ? SCENERY_ERR.sceneryInWay : null;
}

/** Edge slot `dir` of `tile` (shared with the neighbour's facing edge). */
function edgeSlotBlock(world: World, map: MapState, tile: number, dir: Dir): string | null {
  const c = map.content[tile] as number;
  if (c === Content.Building || c === Content.Track || c === Content.ParkEntrance) return contentBlock(c);
  const idx = sceneryIndex(world);
  if ((idx.edge[tile * 4 + dir] as number) >= 0) return SCENERY_ERR.sceneryInWay;
  const n = neighbour(map, tile, dir);
  if (n >= 0 && (idx.edge[n * 4 + oppositeDir(dir)] as number) >= 0) return SCENERY_ERR.sceneryInWay;
  return null;
}

/** Edge items: elevated paths and track over the tile must clear `[z, z + height)`. */
function edgeClearanceBlock(world: World, tile: number, z0: number, z1: number): boolean {
  for (const o of occupantsAt(world, tile)) {
    if (o.kind !== 'elevatedPath' && o.kind !== 'track') continue;
    if (o.zMin < z1 && z0 < o.zMax) return true;
  }
  return false;
}

/** Check a `placeScenery` request without changing anything. */
export function checkPlacement(world: World, req: PlacementRequest, ctx: CommandContext): PlacementCheck {
  const def = getSceneryDef(req.defId) ?? null;
  if (!def) return fail(SCENERY_ERR.unknownItem, null, null);
  if (!isDir(req.rotation)) return fail(SCENERY_ERR.badRotation, def, null);
  if (def.edge ? !isDir(req.edge) : req.edge !== -1) return fail(SCENERY_ERR.badEdge, def, null);
  const s = world.state;
  const map = s.map;
  const tiles = def.edge ? footprintOf(map, { w: 1, d: 1 }, req.x, req.y, 0) : footprintOf(map, def, req.x, req.y, req.rotation);
  if (!tiles) return fail(SCENERY_ERR.outsidePark, def, null);

  for (const t of tiles) {
    const own = groundOwnershipBlock(map, t);
    if (own) return fail(own, def, tiles);
  }
  for (const t of tiles) if (isWet(map, t)) return fail(SCENERY_ERR.inWater, def, tiles);
  for (const t of tiles) {
    const block = def.edge ? edgeSlotBlock(world, map, t, req.edge as Dir) : centreSlotBlock(world, map, def, t);
    if (block) return fail(block, def, tiles);
  }
  const z = map.heights[tiles[0] as number] as number;
  for (const t of tiles) {
    if ((!def.slopeOk && !isFlat(map, t)) || (map.heights[t] as number) !== z) return fail(SCENERY_ERR.needsFlat, def, tiles);
  }
  const zMin = def.overPath ? z + PATH_HEADROOM : z;
  const zMax = z + def.heightM;
  for (const t of tiles) {
    const blocked = def.edge ? edgeClearanceBlock(world, t, z, zMax) : clearanceBlock(world, t, zMin, zMax) !== null;
    if (blocked) return fail(SCENERY_ERR.noClearance, def, tiles);
  }
  if (!ctx.setup && !isUnlocked(world, def.id)) return fail(SCENERY_ERR.notUnlocked, def, tiles);
  if (!canAfford(world, def.buildCost, ctx)) return fail(SCENERY_ERR.notEnoughCash, def, tiles);
  return { ok: true, def, tiles, z, cost: def.buildCost };
}
