/**
 * Terrain and water command handlers (Phase 4 §4.1, §4.3, §6). Owner: W3-A.
 *
 * Contract:
 * - Corner tool (`raiseCorner` / `lowerCorner`): atomic — raise or lower the vertex in every tile that shares it
 *   (up to 4), normalize each; one blocked tile fails the whole command with the §4.1 reason.
 * - Brushes (`raiseLand`, `lowerLand`, `smoothLand`, `levelLand`, `paintTerrain`, `raiseWater`, `lowerWater`):
 *   apply to every tile that passes the checks and warn `"{n} tiles were skipped: {reason}"` with the first reason;
 *   fail with the first reason when every tile fails.
 * - Cost: tile fee + step cost per changed tile (paint: flat fee; water: per tile per step), checked against cash
 *   for the whole command (`"Not enough cash"`), booked as `construction`. Setup mode skips cash and ledger.
 * - After an edit: call `markNetworkDirty` (path connectivity), `markFieldsDirty` / `markLightDirty` for wet-tile
 *   changes; the renderer finds changed tiles itself (terrain tracker).
 *
 * Every command is planned first (`planTerrainCommand`, read-only) and applied only when the plan passes, so a failed
 * command changes nothing. Tiles are visited in ascending index order; "the first reason" is the first in that order.
 * A tile the tool would leave as it is (already flat at the level target, already painted, a corner already at the
 * normalize limit) is not checked, not charged, and not counted as skipped.
 * Water cost: one step per changed tile per command (each raise or lower moves a tile's surface by one tool step).
 */
import { TERRAIN_ERR, TERRAIN_INPUT_ERR } from '../../data/strings/terrain';
import { MAX_CORNER_HEIGHT, PAINT_COST, TERRAIN_STEP_COST, TERRAIN_TILE_FEE, WATER_STEP_COST } from '../../data/tuning/terrain';
import { canAfford, pay } from '../economy/ledger';
import { markFieldsDirty } from '../fields/api';
import { markLightDirty } from '../lighting/api';
import { Terrain, inBounds } from '../map';
import { markOccupancyDirty } from '../occupancy';
import { markNetworkDirty } from '../pathing';
import type { World } from '../types';
import { fail, ok, type CommandContext, type CommandResult, type HandlerMap, type TerrainCommand } from '../commands/types';
import { brushRect, cornerVertex, isBrushSize, rectTiles, clipRect, vertexTiles } from './brush';
import { groundBlock, landEditBlock, lowerWaterBlock, raiseWaterBlock, raisedSurface } from './checks';
import { cornerHeightsOf, isWet, maxCorner, minCorner } from './corners';
import { normalizeCorners, waterAfterLandEdit } from './normalize';
import type { Corner, CornerHeights } from './types';

/** One tile's new values. */
interface TileEdit {
  tile: number;
  height: number;
  slope: number;
  terrain: number;
  water: number;
}

/** A planned command: what would change, what it costs, and what was skipped. Never applied when it fails. */
export interface TerrainPlan {
  /** Every tile the tool covers (brush, rectangle, or the tiles of the vertex), ascending. */
  tiles: number[];
  edits: TileEdit[];
  cost: number;
  /** Tiles the tool would change (each is either an edit or skipped). */
  attempted: number;
  skipped: number;
  firstReason: string | null;
  /** Corner tool: any skipped tile fails the command. */
  atomic: boolean;
  /** Bad command data: the command fails with this. */
  error: string | null;
}

function newPlan(tiles: number[], atomic: boolean): TerrainPlan {
  return { tiles, edits: [], cost: 0, attempted: 0, skipped: 0, firstReason: null, atomic, error: null };
}

function errorPlan(error: string): TerrainPlan {
  const p = newPlan([], false);
  p.error = error;
  return p;
}

function skip(plan: TerrainPlan, reason: string): void {
  plan.skipped++;
  if (plan.firstReason === null) plan.firstReason = reason;
}

/** `"{n} tiles were skipped: {reason}"` (Phase 4 §4.1). */
export function skippedWarning(n: number, reason: string): string {
  return TERRAIN_ERR.skipped.replace('{n}', String(n)).replace('{reason}', reason);
}

/**
 * Plan a land edit of tile `i` to the requested corners `raw`. A tile whose normalized result equals its current
 * shape (and whose request stays in 0–63) is left alone.
 */
function planCorners(world: World, plan: TerrainPlan, i: number, raw: CornerHeights): void {
  const map = world.state.map;
  const next = normalizeCorners(raw);
  let inRange = true;
  for (const v of raw) if (v < 0 || v > MAX_CORNER_HEIGHT) inRange = false;
  const same = next.height === map.heights[i] && next.slope === map.slope[i];
  if (same && inRange) return;
  plan.attempted++;
  const reason = landEditBlock(world, i, raw, next);
  if (reason) {
    skip(plan, reason);
    return;
  }
  if (same) return;
  const old = cornerHeightsOf(map, i);
  let steps = 0;
  for (let k = 0; k < 4; k++) {
    const v = next.height + ((next.slope >> k) & 1);
    steps += Math.abs(v - (old[k] as number));
  }
  const cost = TERRAIN_TILE_FEE + TERRAIN_STEP_COST * steps;
  plan.edits.push({ tile: i, height: next.height, slope: next.slope, terrain: map.terrain[i] as number, water: waterAfterLandEdit(map.water[i] as number, next.height) });
  plan.cost += cost;
}

function isInt(v: unknown): v is number {
  return Number.isInteger(v);
}

function planCorner(world: World, x: number, y: number, corner: Corner, delta: 1 | -1): TerrainPlan {
  const map = world.state.map;
  if (!isInt(x) || !isInt(y)) return errorPlan(TERRAIN_INPUT_ERR.position);
  if (corner !== 0 && corner !== 1 && corner !== 2 && corner !== 3) return errorPlan(TERRAIN_INPUT_ERR.corner);
  if (!inBounds(map, x, y)) return errorPlan(TERRAIN_ERR.outsidePark);
  const { vx, vy } = cornerVertex(x, y, corner);
  const shared = vertexTiles(map, vx, vy);
  const plan = newPlan(
    shared.map((s) => s.tile),
    true,
  );
  for (const s of shared) {
    const c = cornerHeightsOf(map, s.tile);
    const raw: [number, number, number, number] = [c[0], c[1], c[2], c[3]];
    raw[s.corner] += delta;
    planCorners(world, plan, s.tile, raw);
  }
  return plan;
}

function brushPlan(world: World, x: number, y: number, size: unknown): TerrainPlan | string {
  if (!isInt(x) || !isInt(y)) return TERRAIN_INPUT_ERR.position;
  if (!isBrushSize(size)) return TERRAIN_INPUT_ERR.brushSize;
  const tiles = rectTiles(world.state.map, brushRect(world.state.map, x, y, size));
  if (tiles.length === 0) return TERRAIN_ERR.outsidePark;
  return newPlan(tiles, false);
}

/** Raise (+1) or lower (−1) brush: a sloped tile becomes flat at its highest (lowest) corner; a flat tile moves by 1. */
function planRaiseLower(world: World, x: number, y: number, size: unknown, delta: 1 | -1): TerrainPlan {
  const plan = brushPlan(world, x, y, size);
  if (typeof plan === 'string') return errorPlan(plan);
  const map = world.state.map;
  for (const i of plan.tiles) {
    const h = map.heights[i] as number;
    const flat = (map.slope[i] as number) === 0;
    const t = flat ? h + delta : delta > 0 ? maxCorner(map, i) : minCorner(map, i);
    planCorners(world, plan, i, [t, t, t, t]);
  }
  return plan;
}

/** Smooth: each vertex of the brush tiles takes round(mean) of every corner height at it (all tiles that touch it). */
function planSmooth(world: World, x: number, y: number, size: unknown): TerrainPlan {
  const plan = brushPlan(world, x, y, size);
  if (typeof plan === 'string') return errorPlan(plan);
  const map = world.state.map;
  const r = brushRect(map, x, y, size as 1 | 3 | 5 | 7);
  if (!r) return errorPlan(TERRAIN_ERR.outsidePark);
  const gw = r.x1 - r.x0 + 2;
  const gh = r.y1 - r.y0 + 2;
  // New vertex heights from the current map (all computed before any tile changes, so the result is order-free).
  const vert = new Int32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let sum = 0;
      let count = 0;
      for (const s of vertexTiles(map, r.x0 + gx, r.y0 + gy)) {
        sum += cornerHeightsOf(map, s.tile)[s.corner];
        count++;
      }
      vert[gy * gw + gx] = Math.round(sum / count);
    }
  }
  const v = (gx: number, gy: number): number => vert[gy * gw + gx] as number;
  for (const i of plan.tiles) {
    const gx = (i % map.width) - r.x0;
    const gy = Math.floor(i / map.width) - r.y0;
    planCorners(world, plan, i, [v(gx, gy), v(gx + 1, gy), v(gx + 1, gy + 1), v(gx, gy + 1)]);
  }
  return plan;
}

function planLevel(world: World, cmd: Extract<TerrainCommand, { type: 'levelLand' }>): TerrainPlan {
  const { x0, y0, x1, y1, targetHeight: t } = cmd;
  if (!isInt(x0) || !isInt(y0) || !isInt(x1) || !isInt(y1)) return errorPlan(TERRAIN_INPUT_ERR.position);
  if (!isInt(t)) return errorPlan(TERRAIN_INPUT_ERR.height);
  const tiles = rectTiles(world.state.map, clipRect(world.state.map, x0, y0, x1, y1));
  if (tiles.length === 0) return errorPlan(TERRAIN_ERR.outsidePark);
  const plan = newPlan(tiles, false);
  for (const i of tiles) planCorners(world, plan, i, [t, t, t, t]);
  return plan;
}

const TERRAIN_CODES: readonly number[] = Object.values(Terrain);

function planPaint(world: World, cmd: Extract<TerrainCommand, { type: 'paintTerrain' }>): TerrainPlan {
  if (!TERRAIN_CODES.includes(cmd.terrain)) return errorPlan(TERRAIN_INPUT_ERR.terrain);
  const plan = brushPlan(world, cmd.x, cmd.y, cmd.size);
  if (typeof plan === 'string') return errorPlan(plan);
  const map = world.state.map;
  for (const i of plan.tiles) {
    if (map.terrain[i] === cmd.terrain) continue;
    plan.attempted++;
    const reason = groundBlock(world, i);
    if (reason) {
      skip(plan, reason);
      continue;
    }
    plan.edits.push({ tile: i, height: map.heights[i] as number, slope: map.slope[i] as number, terrain: cmd.terrain, water: map.water[i] as number });
    plan.cost += PAINT_COST;
  }
  return plan;
}

function planWater(world: World, x: number, y: number, size: unknown, delta: 1 | -1): TerrainPlan {
  const plan = brushPlan(world, x, y, size);
  if (typeof plan === 'string') return errorPlan(plan);
  const map = world.state.map;
  for (const i of plan.tiles) {
    plan.attempted++;
    let water: number;
    let reason: string | null;
    if (delta > 0) {
      water = raisedSurface(map, i);
      reason = raiseWaterBlock(world, i, water);
    } else {
      reason = lowerWaterBlock(world, i);
      const w = (map.water[i] as number) - 1;
      water = w <= minCorner(map, i) ? 0 : w;
    }
    if (reason) {
      skip(plan, reason);
      continue;
    }
    plan.edits.push({ tile: i, height: map.heights[i] as number, slope: map.slope[i] as number, terrain: map.terrain[i] as number, water });
    plan.cost += WATER_STEP_COST;
  }
  return plan;
}

/** Plan any terrain or water command without changing the world. */
export function planTerrainCommand(world: World, cmd: TerrainCommand): TerrainPlan {
  switch (cmd.type) {
    case 'raiseCorner':
      return planCorner(world, cmd.x, cmd.y, cmd.corner, 1);
    case 'lowerCorner':
      return planCorner(world, cmd.x, cmd.y, cmd.corner, -1);
    case 'raiseLand':
      return planRaiseLower(world, cmd.x, cmd.y, cmd.size, 1);
    case 'lowerLand':
      return planRaiseLower(world, cmd.x, cmd.y, cmd.size, -1);
    case 'smoothLand':
      return planSmooth(world, cmd.x, cmd.y, cmd.size);
    case 'levelLand':
      return planLevel(world, cmd);
    case 'paintTerrain':
      return planPaint(world, cmd);
    case 'raiseWater':
      return planWater(world, cmd.x, cmd.y, cmd.size, 1);
    case 'lowerWater':
      return planWater(world, cmd.x, cmd.y, cmd.size, -1);
    default:
      return errorPlan(TERRAIN_INPUT_ERR.position);
  }
}

/** The command result a plan gives (before anything is applied). */
function verdict(world: World, plan: TerrainPlan, ctx: CommandContext): CommandResult {
  if (plan.error !== null) return fail(plan.error);
  if (plan.attempted === 0) return ok(0);
  const reason = plan.firstReason ?? TERRAIN_ERR.outsidePark;
  if (plan.skipped > 0 && (plan.atomic || plan.skipped === plan.attempted)) return fail(reason);
  if (plan.cost > 0 && !canAfford(world, plan.cost, ctx)) return fail(TERRAIN_ERR.notEnoughCash);
  return ok(plan.cost, plan.skipped > 0 ? [skippedWarning(plan.skipped, reason)] : []);
}

function apply(world: World, plan: TerrainPlan): void {
  const map = world.state.map;
  let land = false;
  let wetChange = false;
  for (const e of plan.edits) {
    const i = e.tile;
    const shape = map.heights[i] !== e.height || map.slope[i] !== e.slope;
    const wetBefore = isWet(map, i);
    const waterBefore = map.water[i];
    map.heights[i] = e.height;
    map.slope[i] = e.slope;
    map.terrain[i] = e.terrain;
    map.water[i] = e.water;
    if (shape) land = true;
    // Wet tiles are Calm sources (§4.3): a new, removed, or deeper / shallower water tile changes the fields.
    const waterChanged = waterBefore !== e.water;
    const depthChanged = shape && (wetBefore || isWet(map, i));
    if (waterChanged || depthChanged) {
      wetChange = true;
      markFieldsDirty(world, i);
      markLightDirty(world, i);
    }
  }
  if (land || wetChange) markNetworkDirty(world);
  if (land) markOccupancyDirty(world);
}

function run(world: World, cmd: TerrainCommand, ctx: CommandContext): CommandResult {
  const plan = planTerrainCommand(world, cmd);
  const result = verdict(world, plan, ctx);
  if (!result.ok || plan.edits.length === 0) return result;
  apply(world, plan);
  pay(world, plan.cost, 'construction', ctx);
  return result;
}

/** What the ghost shows before the player confirms (Phase 4 §4.1 "The ghost shows the total"). Read-only. */
export interface TerrainPreview {
  ok: boolean;
  /** The failure reason, or null. */
  reason: string | null;
  /** Total cost of the tiles that would change (shown even when cash is short). */
  cost: number;
  warnings: string[];
  /** Tiles the tool covers. */
  tiles: number[];
  /** Tiles that would change. */
  changed: number;
}

export function previewTerrainCommand(world: World, cmd: TerrainCommand, ctx: CommandContext = { setup: false }): TerrainPreview {
  const plan = planTerrainCommand(world, cmd);
  const r = verdict(world, plan, ctx);
  return {
    ok: r.ok,
    reason: r.ok ? null : r.reason,
    cost: plan.cost,
    warnings: r.ok ? r.warnings : [],
    tiles: plan.tiles,
    changed: plan.edits.length,
  };
}

export const terrainHandlers: HandlerMap<TerrainCommand> = {
  raiseCorner: run,
  lowerCorner: run,
  raiseLand: run,
  lowerLand: run,
  smoothLand: run,
  levelLand: run,
  paintTerrain: run,
  raiseWater: run,
  lowerWater: run,
};
