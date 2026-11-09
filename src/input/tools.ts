/**
 * Build tool geometry (Phase 1 §4.1). Owner: W1-B. Pure: no DOM.
 * Ghost validity is a local preview from the map (in bounds, owned, empty, cash).
 * The command result is the final word.
 */
import { getFlatRideDef, getStallDef } from '../data/catalog';
import { text } from '../data/strings/en';
import { extent, footprintTiles } from '../sim/footprint';
import { Content, Owned, type Dir, type MapState } from '../sim/map';
import type { PathKind } from '../sim/commands/types';
import type { World } from '../sim/types';
import type { Cents } from '../sim/units';
import type { GhostState, ToolState } from '../render/types';

/**
 * Path prices per tile (Phase 1 §8: PATH_COST $10, QUEUE_COST $12).
 * Integration: switch to W1-C's `src/data/tuning/world.ts` constants once merged.
 */
export const PATH_TILE_COST: Readonly<Record<PathKind, Cents>> = { footpath: 1000, queue: 1200 };

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Projected end tile: the line follows the axis with the larger distance from the start (a tie follows x). */
export function pathLineEnd(map: MapState, start: number, current: number): number {
  const sx = start % map.width;
  const sy = Math.floor(start / map.width);
  const cx = current % map.width;
  const cy = Math.floor(current / map.width);
  return Math.abs(cx - sx) >= Math.abs(cy - sy) ? sy * map.width + cx : cy * map.width + sx;
}

/** Every tile of the straight line from `start` toward `current`, start first. */
export function pathLineTiles(map: MapState, start: number, current: number): number[] {
  const end = pathLineEnd(map, start, current);
  const sx = start % map.width;
  const sy = Math.floor(start / map.width);
  const ex = end % map.width;
  const ey = Math.floor(end / map.width);
  const n = Math.max(Math.abs(ex - sx), Math.abs(ey - sy));
  const stepX = Math.sign(ex - sx);
  const stepY = Math.sign(ey - sy);
  const out: number[] = [];
  for (let k = 0; k <= n; k++) out.push((sy + stepY * k) * map.width + (sx + stepX * k));
  return out;
}

/** Estimated cost of a path line: tiles that already hold this path kind are free. */
export function pathLineCost(map: MapState, tiles: readonly number[], kind: PathKind): Cents {
  const same = kind === 'footpath' ? Content.Footpath : Content.Queue;
  let n = 0;
  for (const i of tiles) if (map.content[i] !== same) n++;
  return n * PATH_TILE_COST[kind];
}

export function pathKindOf(tool: ToolState['tool']): PathKind | null {
  return tool === 'footpath' || tool === 'queue' ? tool : null;
}

/**
 * Ghost for a ride or stall whose footprint is centred on `anchor` (the tile under the pointer).
 * `GhostState.tile` is the footprint origin (minimum corner), the same x/y the place command takes.
 * The origin is clamped so the footprint stays inside the map.
 */
export function computeGhost(world: World, kind: 'ride' | 'stall', defId: string, anchor: number, rotation: Dir): GhostState | null {
  const map = world.state.map;
  let w = 1;
  let d = 1;
  let cost: Cents;
  if (kind === 'ride') {
    const def = getFlatRideDef(defId);
    if (!def) return null;
    w = def.w;
    d = def.d;
    cost = def.buildCost;
  } else {
    const def = getStallDef(defId);
    if (!def) return null;
    cost = def.buildCost;
  }
  // A stall's rotation is its service side; its 1 × 1 footprint does not turn.
  const footRot: Dir = kind === 'ride' ? rotation : 0;
  const { ex, ey } = extent(w, d, footRot);
  const ax = anchor % map.width;
  const ay = Math.floor(anchor / map.width);
  const ox = clamp(ax - Math.floor((ex - 1) / 2), 0, Math.max(0, map.width - ex));
  const oy = clamp(ay - Math.floor((ey - 1) / 2), 0, Math.max(0, map.height - ey));
  const tiles = footprintTiles(map, ox, oy, w, d, footRot);
  let reason: string | null = null;
  if (!tiles || tiles.some((i) => map.owned[i] !== Owned.Owned)) reason = text('ui.ghost.notOwned');
  else if (tiles.some((i) => map.content[i] !== Content.Empty)) reason = text('ui.ghost.blocked');
  else if (world.state.park.cash < cost) reason = text('ui.ghost.noCash');
  return { kind, defId, tile: oy * map.width + ox, rotation, valid: reason === null, reason, cost };
}

export type PickedEntity = NonNullable<ToolState['selectedEntity']>;

/** What Inspect opens on a tile: a ride or stall building first, then a guest standing there. */
export function pickEntity(world: World, tile: number | null): PickedEntity | null {
  if (tile === null || tile < 0) return null;
  const s = world.state;
  const content = s.map.content[tile];
  if (content === Content.Building || content === Content.Track) {
    const ref = s.map.contentRef[tile] ?? -1;
    if (s.rides.some((r) => r.id === ref)) return { kind: 'ride', id: ref };
    if (s.stalls.some((st) => st.id === ref)) return { kind: 'stall', id: ref };
  }
  const guest = s.guests.find((g) => g.tile === tile);
  if (guest) return { kind: 'guest', id: guest.id };
  return null;
}
