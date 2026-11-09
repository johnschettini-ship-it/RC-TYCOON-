/**
 * Show site placement rules (Phase 6 §6 `placeShowSite`). Owner: W4-C. Pure checks shared by the command and the
 * placement ghost (`input/shows`), so the ghost and the command always agree. Nothing here changes the world.
 *
 * Order (first failure wins; each rule runs over every footprint tile before the next rule): command data → unlocked
 * (skipped in setup mode) → inside the map and owned → empty → flat at one height → dry → clearance (no elevated path,
 * track, or scenery over the tile) → cash. A site is a building like a stall: the block strings are the Phase 4 §4.1 ones.
 */
import { getShowSiteDef, type ShowSiteDef } from '../../data/catalog';
import { SHOW_ERR } from '../../data/strings/shows';
import { canAfford, type CommandContext } from '../economy/ledger';
import { footprintTiles } from '../footprint';
import { groundOwnershipBlock } from '../land/api';
import { Content, type Dir, type MapState } from '../map';
import { occupantReason, occupantsAt } from '../occupancy';
import { isUnlocked } from '../research/api';
import { isFlat, isWet } from '../terrain/corners';
import type { World } from '../types';
import type { Cents } from '../units';

export interface ShowPlacementRequest {
  defId: string;
  x: number;
  y: number;
  rotation: Dir;
}

export type ShowPlacementCheck =
  | { ok: true; def: ShowSiteDef; tiles: number[]; cost: Cents }
  | { ok: false; reason: string; def: ShowSiteDef | null; tiles: number[] | null };

function isDir(v: unknown): v is Dir {
  return v === 0 || v === 1 || v === 2 || v === 3;
}

function fail(reason: string, def: ShowSiteDef | null, tiles: number[] | null): ShowPlacementCheck {
  return { ok: false, reason, def, tiles };
}

/** The §4.1 string of the object on a tile, or null when the tile is empty. */
export function contentBlock(c: number): string | null {
  switch (c) {
    case Content.Empty:
      return null;
    case Content.Footpath:
    case Content.Queue:
      return SHOW_ERR.pathInWay;
    case Content.Track:
      return SHOW_ERR.trackInWay;
    case Content.ParkEntrance:
      return SHOW_ERR.entranceInWay;
    case Content.Scenery:
      return SHOW_ERR.sceneryInWay;
    default:
      return SHOW_ERR.rideOrStallInWay;
  }
}

/** Footprint tiles inside the map (for a ghost hanging over the map edge). */
export function clippedFootprint(map: Pick<MapState, 'width' | 'height'>, x: number, y: number, w: number, d: number): number[] {
  const out: number[] = [];
  for (let dy = 0; dy < d; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx >= 0 && ty >= 0 && tx < map.width && ty < map.height) out.push(ty * map.width + tx);
    }
  }
  return out;
}

/** Check a `placeShowSite` request without changing anything. */
export function checkShowPlacement(world: World, req: ShowPlacementRequest, ctx: CommandContext): ShowPlacementCheck {
  const def = typeof req.defId === 'string' ? (getShowSiteDef(req.defId) ?? null) : null;
  if (!def) return fail(SHOW_ERR.unknown, null, null);
  if (!isDir(req.rotation)) return fail(SHOW_ERR.badRotation, def, null);
  if (!ctx.setup && !isUnlocked(world, def.id)) return fail(SHOW_ERR.notUnlocked, def, null);
  const map = world.state.map;
  const okCoords = Number.isInteger(req.x) && Number.isInteger(req.y);
  const tiles = okCoords ? footprintTiles(map, req.x, req.y, def.w, def.d, req.rotation) : null;
  if (!tiles) return fail(SHOW_ERR.outsidePark, def, okCoords ? clippedFootprint(map, req.x, req.y, def.w, def.d) : null);
  for (const t of tiles) {
    const own = groundOwnershipBlock(map, t);
    if (own) return fail(own, def, tiles);
  }
  for (const t of tiles) {
    const block = contentBlock(map.content[t] as number);
    if (block) return fail(block, def, tiles);
  }
  const z = map.heights[tiles[0] as number] as number;
  for (const t of tiles) if (!isFlat(map, t) || map.heights[t] !== z) return fail(SHOW_ERR.notFlat, def, tiles);
  for (const t of tiles) if (isWet(map, t)) return fail(SHOW_ERR.inWater, def, tiles);
  // Anything above the ground blocks a tower or a launcher: elevated paths ("Not enough clearance under an object"),
  // track envelopes, and an arch left over a removed path (their §4.1 strings).
  for (const t of tiles) {
    const o = occupantsAt(world, t)[0];
    if (o) return fail(occupantReason(o), def, tiles);
  }
  if (!canAfford(world, def.buildCost, ctx)) return fail(SHOW_ERR.notEnoughCash, def, tiles);
  return { ok: true, def, tiles, cost: def.buildCost };
}
