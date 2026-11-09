/**
 * Per-tile occupancy list (master 6.3, Phase 4 §4.1, §4.2, §4.5). Owner: W3-B. Derived; never saved.
 *
 * Height ranges are absolute metres, half-open `[zMin, zMax)`:
 * - ground path: `[ground, ground + 3)`; elevated path: `[z, z + 3)` (PATH_HEADROOM), its supports do not block.
 *   A ramp's walking surface ends 1 step higher, so a ramp keeps its 3 m headroom: `[z, z + 4)`;
 * - track: the Phase 2 envelopes from `buildOccupancy` (`rides/track/placement.ts`): `[railMin − 1, railMax + 3)`,
 *   down to the ground for the envelope that owns the tile's ground (a support or a ground-level rail);
 * - scenery: `[ground, ground + height)`; an `overPath` arch `[ground + 3, ground + height)`
 *   (from `forEachSceneryOccupant`, `scenery/occupancy.ts`, W3-D).
 * Every check that needs clearance (terrain edits, water, elevated paths, track, scenery) goes through this module,
 * so all of them agree. Ground paths are read from the map on every call; the rest is cached per world and rebuilt
 * after `markOccupancyDirty` (also called by `markNetworkDirty`) or when a list changes size.
 */
import { TERRAIN_ERR } from '../../data/strings/terrain';
import { PATH_HEADROOM } from '../../data/tuning/paths';
import { ENVELOPE_ABOVE_M, ENVELOPE_BELOW_M } from '../../data/tuning/track';
import { Content } from '../map';
import { rampDirOfMask } from '../paths/nodes';
import type { ElevatedPath } from '../paths/types';
import { buildOccupancy, groundOwner } from '../rides/track/placement';
import { forEachSceneryOccupant } from '../scenery/occupancy';
import type { GameState, World } from '../types';
import type { EntityId } from '../units';

export type OccupantKind = 'groundPath' | 'elevatedPath' | 'track' | 'scenery';

export interface Occupant {
  kind: OccupantKind;
  /** Elevated path, ride, or scenery id; −1 for a ground path. */
  id: EntityId;
  zMin: number;
  zMax: number;
}

const KIND_ORDER: Record<OccupantKind, number> = { groundPath: 0, elevatedPath: 1, track: 2, scenery: 3 };

/** Top of a path's clearance: 3 m above its walking surface (a ramp's surface is 1 step higher at its high edge). */
export function pathClearanceTop(z: number, ramp: number): number {
  return z + PATH_HEADROOM + (ramp >= 0 ? 1 : 0);
}

interface OccupancyCache {
  state: GameState;
  elevated: ElevatedPath[];
  elevatedCount: number;
  scenery: unknown[];
  sceneryCount: number;
  rideCount: number;
  dirty: boolean;
  /** Objects above or on the ground (not ground paths), by tile, lowest first. */
  byTile: Map<number, Occupant[]>;
}

const caches = new WeakMap<World, OccupancyCache>();
const EMPTY: readonly Occupant[] = [];

function compareOccupants(a: Occupant, b: Occupant): number {
  return a.zMin - b.zMin || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id - b.id || a.zMax - b.zMax;
}

function rebuild(world: World): OccupancyCache {
  const s = world.state;
  const map = s.map;
  const byTile = new Map<number, Occupant[]>();
  const add = (tile: number, o: Occupant): void => {
    let list = byTile.get(tile);
    if (!list) {
      list = [];
      byTile.set(tile, list);
    }
    list.push(o);
  };
  for (const p of s.elevatedPaths) {
    if (p.x < 0 || p.y < 0 || p.x >= map.width || p.y >= map.height) continue;
    add(p.y * map.width + p.x, { kind: 'elevatedPath', id: p.id, zMin: p.z, zMax: pathClearanceTop(p.z, p.rampDir) });
  }
  if (s.rides.some((r) => r.kind === 'track')) {
    for (const [tile, envs] of buildOccupancy(world)) {
      const g = map.heights[tile] as number;
      const owner = map.content[tile] === Content.Track ? groundOwner(envs, g) : null;
      for (const e of envs) {
        add(tile, { kind: 'track', id: e.rideId, zMin: e === owner ? g : e.railMin - ENVELOPE_BELOW_M, zMax: e.railMax + ENVELOPE_ABOVE_M });
      }
    }
  }
  forEachSceneryOccupant(world, (tile, zMin, zMax, id) => add(tile, { kind: 'scenery', id, zMin, zMax }));
  for (const list of byTile.values()) list.sort(compareOccupants);
  return {
    state: s,
    elevated: s.elevatedPaths,
    elevatedCount: s.elevatedPaths.length,
    scenery: s.scenery,
    sceneryCount: s.scenery.length,
    rideCount: s.rides.length,
    dirty: false,
    byTile,
  };
}

function cache(world: World): OccupancyCache {
  const s = world.state;
  const c = caches.get(world);
  if (
    c &&
    !c.dirty &&
    c.state === s &&
    c.elevated === s.elevatedPaths &&
    c.elevatedCount === s.elevatedPaths.length &&
    c.scenery === s.scenery &&
    c.sceneryCount === s.scenery.length &&
    c.rideCount === s.rides.length
  ) {
    return c;
  }
  const fresh = rebuild(world);
  caches.set(world, fresh);
  return fresh;
}

/** The ground path on `tile` as an occupant, or null. */
function groundPathOccupant(world: World, tile: number): Occupant | null {
  const map = world.state.map;
  const c = map.content[tile];
  if (c !== Content.Footpath && c !== Content.Queue) return null;
  const g = map.heights[tile] as number;
  return { kind: 'groundPath', id: -1, zMin: g, zMax: pathClearanceTop(g, rampDirOfMask(map.slope[tile] as number)) };
}

/** Occupants of `tile`, lowest first. */
export function occupantsAt(world: World, tile: number): readonly Occupant[] {
  const map = world.state.map;
  if (!Number.isInteger(tile) || tile < 0 || tile >= map.width * map.height) return EMPTY;
  const objects = cache(world).byTile.get(tile) ?? EMPTY;
  const ground = groundPathOccupant(world, tile);
  if (!ground) return objects;
  return [ground, ...objects].sort(compareOccupants);
}

/**
 * The first occupant of `tile` whose range overlaps `[zMin, zMax)`, ignoring the object `ignoreId` (an object
 * being moved or rebuilt), or null when the range is free.
 */
export function clearanceBlock(world: World, tile: number, zMin: number, zMax: number, ignoreId: EntityId = -1): Occupant | null {
  for (const o of occupantsAt(world, tile)) {
    if (ignoreId !== -1 && o.id === ignoreId && o.kind !== 'groundPath') continue;
    if (o.zMin < zMax && zMin < o.zMax) return o;
  }
  return null;
}

/** `zMin` of the lowest occupant of `tile` that starts at or above `z` (terrain "clearance under an object"), or null. */
export function lowestAbove(world: World, tile: number, z: number): number | null {
  let best: number | null = null;
  for (const o of occupantsAt(world, tile)) {
    if (o.zMin >= z && (best === null || o.zMin < best)) best = o.zMin;
  }
  return best;
}

/** Call after any change to paths, elevated paths, track, or scenery. */
export function markOccupancyDirty(world: World): void {
  const c = caches.get(world);
  if (c) c.dirty = true;
}

/** The §4.1 reason string for an object in the way. Real body. */
export function occupantReason(o: Occupant): string {
  switch (o.kind) {
    case 'groundPath':
      return TERRAIN_ERR.pathInWay;
    case 'track':
      return TERRAIN_ERR.trackInWay;
    case 'scenery':
      return TERRAIN_ERR.sceneryInWay;
    default:
      return TERRAIN_ERR.noClearance;
  }
}
