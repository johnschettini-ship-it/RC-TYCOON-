/**
 * `buildPath` and `buildPathLine` (Phase 1 §4.1, Phase 4 §4.2). Owners: W1-C (Build 1), W3-B (slopes, elevated).
 * Validation order: land, then obstacles, then the Phase 4 checks, then cash. Nothing changes unless every check
 * passes. A tile that already has the same kind is skipped (no cost). Footpath ↔ queue conversion costs the new kind.
 *
 * Ground paths (no `z`): flat land or one of the 4 ramp masks, dry, with `[ground, ground + 3)` free of objects.
 * Elevated paths (`z` given): `z ≥ maxCorner + 1`, at most ground + 20, not below the water surface, `[z, z + 3)`
 * free in the occupancy list, not over a ride, stall, or the park entrance; owned land, or construction rights when
 * `z ≥ ground + 3`. Cost: the path kind plus $2 per m of support (`z − ground`).
 * A line with a ramp rises (`up`) or falls (`down`) one step per tile along the drag; its start edge is at `z`.
 */
import { PATH_COST, QUEUE_COST } from '../../../data/tuning/world';
import { ELEVATED_PATH_COST, ELEVATED_PATH_MAX_ABOVE_GROUND, ELEVATED_SUPPORT_COST_PER_M } from '../../../data/tuning/paths';
import { RIGHTS_MIN_CLEARANCE } from '../../../data/tuning/land';
import { TERRAIN_ERR } from '../../../data/strings/terrain';
import { PATH_ERR } from '../../../data/strings/paths';
import { canAfford, pay } from '../../economy/ledger';
import { allocId } from '../../ids';
import { aboveGroundOwnershipBlock } from '../../land/api';
import { Content, PathItem, type Dir } from '../../map';
import { insertById, lineTiles, ownedTileAt, setPathTile, tileAt } from '../../map-ops';
import { clearanceBlock, markOccupancyDirty, pathClearanceTop } from '../../occupancy';
import { markNetworkDirty } from '../../pathing';
import { BAD_SLOPE, dirTo, firstElevatedOnTile, markElevatedDirty, nextElevatedOnTile, rampDirOfMask } from '../../paths/nodes';
import type { ElevatedPath, RampDir } from '../../paths/types';
import type { World } from '../../types';
import { fail, ok, type BuildCommand, type CommandContext, type CommandResult, type PathKind, type RampMode } from '../types';
import { BUILD_STRINGS } from './strings';

type PathContent = typeof Content.Footpath | typeof Content.Queue;

export function pathCost(kind: PathKind): number {
  return kind === 'queue' ? QUEUE_COST : PATH_COST;
}

/** Cost of one elevated path tile: the kind plus $2 per m of support from `z` down to the ground. */
export function elevatedPathCost(kind: PathKind, z: number, ground: number): number {
  return ELEVATED_PATH_COST[kind] + ELEVATED_SUPPORT_COST_PER_M * Math.max(0, z - ground);
}

function pathContent(kind: PathKind): PathContent {
  return kind === 'queue' ? Content.Queue : Content.Footpath;
}

function isPathKind(kind: unknown): kind is PathKind {
  return kind === 'footpath' || kind === 'queue';
}

/** The Phase 4 checks for a new ground path on tile `i`, or null when it may go there. */
export function groundPathBlock(world: World, i: number): string | null {
  const map = world.state.map;
  const ramp = rampDirOfMask(map.slope[i] as number);
  if (ramp === BAD_SLOPE) return TERRAIN_ERR.pathSlope;
  const g = map.heights[i] as number;
  if ((map.water[i] as number) > g) return TERRAIN_ERR.pathInWater;
  if (clearanceBlock(world, i, g, pathClearanceTop(g, ramp))) return TERRAIN_ERR.noClearance;
  return null;
}

/** Validate and apply one ground path build over `coords` (all or nothing). `dryRun`: validate only. */
function buildGroundTiles(world: World, coords: { x: number; y: number }[] | null, kind: PathKind, ctx: CommandContext, dryRun = false): CommandResult {
  const map = world.state.map;
  if (!coords || coords.length === 0) return fail(BUILD_STRINGS.notOwned);
  const tiles: number[] = [];
  for (const { x, y } of coords) {
    const i = ownedTileAt(map, x, y);
    if (i < 0) return fail(BUILD_STRINGS.notOwned);
    tiles.push(i);
  }
  const want = pathContent(kind);
  const changed: number[] = [];
  for (const i of tiles) {
    const c = map.content[i];
    if (c === want) continue;
    if (c !== Content.Empty && c !== Content.Footpath && c !== Content.Queue) return fail(BUILD_STRINGS.inTheWay);
    changed.push(i);
  }
  for (const i of changed) {
    if (map.content[i] !== Content.Empty) continue; // a conversion keeps the path where it is
    const block = groundPathBlock(world, i);
    if (block) return fail(block);
  }
  const cost = changed.length * pathCost(kind);
  if (cost > 0 && !canAfford(world, cost, ctx)) return fail(BUILD_STRINGS.notEnoughCash);
  if (dryRun) return ok(cost);

  for (const i of changed) {
    if (want === Content.Queue && map.pathItemLevel[i] !== 0) {
      // The tile's path item stands on an elevated path: keep it (setPathTile would remove it with the ground item).
      map.content[i] = want;
      map.contentRef[i] = -1;
    } else {
      setPathTile(map, i, want);
    }
  }
  pay(world, cost, 'construction', ctx);
  if (changed.length > 0) markNetworkDirty(world);
  return ok(cost);
}

/** One planned elevated path tile. */
interface ElevatedPlan {
  x: number;
  y: number;
  z: number;
  rampDir: RampDir;
}

function isRampDir(r: unknown): r is RampDir {
  return r === -1 || r === 0 || r === 1 || r === 2 || r === 3;
}

/** The elevated path on tile `i` at exactly height `z`, or undefined. */
function elevatedAt(world: World, i: number, z: number): ElevatedPath | undefined {
  for (let k = firstElevatedOnTile(world, i); k >= 0; k = nextElevatedOnTile(world, k)) {
    const p = world.state.elevatedPaths[k] as ElevatedPath;
    if (p.z === z) return p;
  }
  return undefined;
}

/** The Phase 4 checks for an elevated path tile, or null. `same` is an existing path at this z and ramp (kept). */
function elevatedBlock(world: World, i: number, z: number, rampDir: RampDir, same: ElevatedPath | undefined): string | null {
  const map = world.state.map;
  const ground = map.heights[i] as number;
  const own = aboveGroundOwnershipBlock(map, i, z >= ground + RIGHTS_MIN_CLEARANCE);
  if (own) return own;
  const c = map.content[i];
  if (c === Content.Building) return TERRAIN_ERR.rideOrStallInWay;
  if (c === Content.ParkEntrance) return TERRAIN_ERR.entranceInWay;
  const maxCorner = ground + ((map.slope[i] as number) !== 0 ? 1 : 0);
  if (z < maxCorner + 1) return TERRAIN_ERR.pathBelowLand;
  if (z > ground + ELEVATED_PATH_MAX_ABOVE_GROUND) return PATH_ERR.tooHigh;
  if ((map.water[i] as number) > z) return TERRAIN_ERR.pathInWater;
  if (!same && clearanceBlock(world, i, z, pathClearanceTop(z, rampDir))) return TERRAIN_ERR.noClearance;
  return null;
}

/** Validate and apply one elevated path build (all or nothing). `dryRun`: validate only. */
function buildElevatedTiles(world: World, plan: ElevatedPlan[] | null, kind: PathKind, ctx: CommandContext, dryRun = false): CommandResult {
  const s = world.state;
  const map = s.map;
  if (!plan || plan.length === 0 || !isPathKind(kind)) return fail(TERRAIN_ERR.outsidePark);
  const fresh: { i: number; p: ElevatedPlan }[] = [];
  const convert: ElevatedPath[] = [];
  let cost = 0;
  for (const p of plan) {
    const i = tileAt(map, p.x, p.y);
    if (i < 0) return fail(TERRAIN_ERR.outsidePark);
    if (!Number.isInteger(p.z) || p.z < 0 || p.z > 255 || !isRampDir(p.rampDir)) return fail(PATH_ERR.badHeight);
    const existing = elevatedAt(world, i, p.z);
    const same = existing && existing.rampDir === p.rampDir ? existing : undefined;
    const block = elevatedBlock(world, i, p.z, p.rampDir, same);
    if (block) return fail(block);
    if (same) {
      if (same.kind !== kind) {
        convert.push(same);
        cost += ELEVATED_PATH_COST[kind];
      }
      continue;
    }
    fresh.push({ i, p });
    cost += elevatedPathCost(kind, p.z, map.heights[i] as number);
  }
  if (cost > 0 && !canAfford(world, cost, ctx)) return fail(BUILD_STRINGS.notEnoughCash);
  if (dryRun) return ok(cost);

  for (const p of convert) {
    p.kind = kind;
    const i = p.y * map.width + p.x;
    if (kind === 'queue' && map.pathItemLevel[i] === p.id) clearItem(world, i);
  }
  for (const { p } of fresh) {
    insertById(s.elevatedPaths, { id: allocId(s), x: p.x, y: p.y, z: p.z, kind, rampDir: p.rampDir });
  }
  pay(world, cost, 'construction', ctx);
  if (fresh.length > 0 || convert.length > 0) {
    markElevatedDirty(world);
    markOccupancyDirty(world);
    markNetworkDirty(world);
  }
  return ok(cost);
}

/** Remove the path item of tile `i` (its level goes back to the ground). */
function clearItem(world: World, i: number): void {
  const map = world.state.map;
  map.pathItem[i] = PathItem.None;
  map.pathItemFlags[i] = 0;
  map.binFill[i] = 0;
  map.pathItemLevel[i] = 0;
}

/** The elevated plan of a line: flat at `z`, or one step per tile up or down along the drag. */
function elevatedLinePlan(world: World, x0: number, y0: number, x1: number, y1: number, z: number, ramp: RampMode | undefined): ElevatedPlan[] | null {
  const map = world.state.map;
  const coords = lineTiles(map, x0, y0, x1, y1);
  if (!coords) return null;
  let dir = -1;
  if (coords.length > 1) {
    const a = coords[0] as { x: number; y: number };
    const b = coords[1] as { x: number; y: number };
    dir = dirTo(map, a.y * map.width + a.x, b.y * map.width + b.x);
  }
  const mode = dir < 0 ? 'flat' : (ramp ?? 'flat');
  return coords.map((c, k) => {
    if (mode === 'up') return { x: c.x, y: c.y, z: z + k, rampDir: dir as Dir };
    if (mode === 'down') return { x: c.x, y: c.y, z: z - k - 1, rampDir: ((dir + 2) % 4) as Dir };
    return { x: c.x, y: c.y, z, rampDir: -1 };
  });
}

export function buildPath(world: World, cmd: Extract<BuildCommand, { type: 'buildPath' }>, ctx: CommandContext): CommandResult {
  if (cmd.z === undefined) return buildGroundTiles(world, [{ x: cmd.x, y: cmd.y }], cmd.kind, ctx);
  return buildElevatedTiles(world, [{ x: cmd.x, y: cmd.y, z: cmd.z, rampDir: cmd.rampDir ?? -1 }], cmd.kind, ctx);
}

/** A straight line along the axis with the larger distance from the start tile; one charge for all new tiles. */
export function buildPathLine(world: World, cmd: Extract<BuildCommand, { type: 'buildPathLine' }>, ctx: CommandContext): CommandResult {
  if (cmd.z === undefined) return buildGroundTiles(world, lineTiles(world.state.map, cmd.x0, cmd.y0, cmd.x1, cmd.y1), cmd.kind, ctx);
  if (!Number.isInteger(cmd.z)) return fail(PATH_ERR.badHeight);
  return buildElevatedTiles(world, elevatedLinePlan(world, cmd.x0, cmd.y0, cmd.x1, cmd.y1, cmd.z, cmd.ramp), cmd.kind, ctx);
}

/**
 * The result a path command would have now — cost or reason — without changing anything (ghosts and the cost
 * shown before release; Phase 4 §7). Same checks and order as the command.
 */
export function previewPathCommand(world: World, cmd: Extract<BuildCommand, { type: 'buildPath' | 'buildPathLine' }>, ctx: CommandContext = { setup: false }): CommandResult {
  const map = world.state.map;
  if (cmd.type === 'buildPath') {
    if (cmd.z === undefined) return buildGroundTiles(world, [{ x: cmd.x, y: cmd.y }], cmd.kind, ctx, true);
    return buildElevatedTiles(world, [{ x: cmd.x, y: cmd.y, z: cmd.z, rampDir: cmd.rampDir ?? -1 }], cmd.kind, ctx, true);
  }
  if (cmd.z === undefined) return buildGroundTiles(world, lineTiles(map, cmd.x0, cmd.y0, cmd.x1, cmd.y1), cmd.kind, ctx, true);
  if (!Number.isInteger(cmd.z)) return fail(PATH_ERR.badHeight);
  return buildElevatedTiles(world, elevatedLinePlan(world, cmd.x0, cmd.y0, cmd.x1, cmd.y1, cmd.z, cmd.ramp), cmd.kind, ctx, true);
}

/**
 * Remove one elevated path with its path item (bench sitters stand up through `onBenchRemoved`). Paths refund
 * nothing (master R15). The caller marks the network dirty.
 */
export function removeElevatedPath(world: World, p: ElevatedPath, onBenchRemoved: (tile: number) => void): void {
  const s = world.state;
  const map = s.map;
  const i = p.y * map.width + p.x;
  if (i >= 0 && i < map.pathItemLevel.length && map.pathItemLevel[i] === p.id) {
    if (map.pathItem[i] === PathItem.Bench) onBenchRemoved(i);
    clearItem(world, i);
  }
  const k = s.elevatedPaths.indexOf(p);
  if (k >= 0) s.elevatedPaths.splice(k, 1);
  markElevatedDirty(world);
  markOccupancyDirty(world);
}
