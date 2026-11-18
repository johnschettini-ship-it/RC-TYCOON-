/**
 * Path step builder (touch controls spec 2026-11-18 §3). Pure input logic over the game; no DOM.
 *
 * Tap a start tile (nothing is built), then each Forward / Left / Right adds one tile; a tap on a 4-neighbour of the
 * end adds that tile, a tap anywhere else moves the start. The slope (flat, up, down) and the height are the path
 * tool's own options (`tool.pathHeight`), so the tool remembers them; `pathHeight.z` is the height of the end edge,
 * where the next tile starts (as for a drag today: "its start edge is at `z`").
 *
 * Commands (the build rules and costs do not change; these are the commands the game already has):
 * - the first step from an unbuilt start: `buildPathLine` start → next, with `pathCommandHeight` (a two-tile drag);
 * - each later step: `buildPathLine` next → next (ground, or elevated flat at `z`), or `buildPath` with `rampDir` for
 *   an elevated up or down tile (a one-tile line cannot carry a ramp direction);
 * - Undo: `demolish` for the tiles the last step added (paths refund nothing, as today).
 * The ghost and its cost come from the command's own dry run (`previewPathCommand`).
 *
 * State lives beside the shared `ToolState` (keyed by that object, like the land tool's side table) and belongs to one
 * world: a new or loaded world starts with no start.
 */
import { TERRAIN_ERR } from '../data/strings/terrain';
import { mapRotationFromView } from '../render/view';
import type { ToolState } from '../render/types';
import { previewPathCommand } from '../sim/commands/build/paths';
import type { BuildCommand, Command, CommandResult, PathKind } from '../sim/commands/types';
import { Content, type Dir, type MapState } from '../sim/map';
import { dirTo, firstElevatedOnTile, nextElevatedOnTile, stepTile } from '../sim/paths/nodes';
import type { ElevatedPath } from '../sim/paths/types';
import type { World } from '../sim/types';
import type { Cents } from '../sim/units';
import { pathCommandHeight } from './pathHeight';
import { pathKindOf } from './tools';

export type StepMove = 'forward' | 'left' | 'right';

/** What the builder needs from the game (the `Game` itself in play). */
export interface PathBuilderHost {
  readonly world: World;
  readonly tool: ToolState;
  readonly camera: { readonly rotation: Dir };
  dispatch(cmd: Command): CommandResult;
}

/** One path node a step added: its tile and height (null = ground). */
interface BuiltTile {
  tile: number;
  z: number | null;
}

/** What one step changed, so Undo can put it back. */
interface StepRecord {
  end: number;
  dir: Dir;
  started: boolean;
  z: number | null;
  built: BuiltTile[];
}

export interface PathBuilderState {
  /** The end tile (the start before the first step), or −1 for none. */
  end: number;
  /** Heading of the next Forward, in map terms. */
  dir: Dir;
  /** The end tile holds the path (false: an unbuilt start; the first step builds it too). */
  started: boolean;
  history: StepRecord[];
  world: World | null;
}

/** The next step as a command, with its ghost. */
export interface StepPlan {
  cmd: Extract<BuildCommand, { type: 'buildPath' | 'buildPathLine' }> | null;
  tiles: number[];
  dir: Dir;
  /** The nodes the command makes (tile and height). */
  nodes: BuiltTile[];
  /** `pathHeight.z` after the step. */
  zAfter: number | null;
  cost: Cents;
  reason: string | null;
}

/** Steps Undo remembers. */
const MAX_HISTORY = 200;

const store = new WeakMap<ToolState, PathBuilderState>();

export function pathBuilderOf(tool: ToolState): PathBuilderState {
  let s = store.get(tool);
  if (!s) {
    s = { end: -1, dir: 0, started: false, history: [], world: null };
    store.set(tool, s);
  }
  return s;
}

/** Drop the start, the end and the undo history (the path tools closed, a new world). */
export function resetPathBuilder(tool: ToolState): void {
  const s = pathBuilderOf(tool);
  s.end = -1;
  s.started = false;
  s.history.length = 0;
  s.world = null;
}

/** The builder state for the game's current world (a new or loaded world drops the old start). */
function current(game: PathBuilderHost): PathBuilderState {
  const s = pathBuilderOf(game.tool);
  if (s.world !== game.world) {
    resetPathBuilder(game.tool);
    s.world = game.world;
  }
  return s;
}

/** The builder has a start (the panel shows the arrows). */
export function pathBuilderStarted(game: PathBuilderHost): boolean {
  return current(game).end >= 0;
}

/** The builder can undo a step. */
export function canUndoStep(game: PathBuilderHost): boolean {
  return current(game).history.length > 0;
}

function elevatedAt(world: World, tile: number, z: number): ElevatedPath | undefined {
  for (let k = firstElevatedOnTile(world, tile); k >= 0; k = nextElevatedOnTile(world, k)) {
    const p = world.state.elevatedPaths[k] as ElevatedPath;
    if (p.z === z) return p;
  }
  return undefined;
}

function groundPath(map: MapState, tile: number): boolean {
  const c = map.content[tile];
  return c === Content.Footpath || c === Content.Queue;
}

/** A path (either kind) stands on `tile` at height `z` (null = ground). */
function hasNodeAt(world: World, tile: number, z: number | null): boolean {
  return z === null ? groundPath(world.state.map, tile) : elevatedAt(world, tile, z) !== undefined;
}

/** Heading of a fresh start: away from a neighbouring path, else toward the top right of the screen (view north). */
function defaultHeading(game: PathBuilderHost, tile: number): Dir {
  const map = game.world.state.map;
  for (let d = 0; d < 4; d++) {
    const u = stepTile(map, tile, d);
    if (u >= 0 && (groundPath(map, u) || firstElevatedOnTile(game.world, u) >= 0)) return ((d + 2) & 3) as Dir;
  }
  return mapRotationFromView(0, game.camera.rotation);
}

/** Move the start to `tile` (nothing is built). `dir`: the heading, else away from a neighbouring path. */
export function startAt(game: PathBuilderHost, tile: number, dir?: Dir): void {
  const s = current(game);
  const map = game.world.state.map;
  if (tile < 0 || tile >= map.width * map.height) return;
  s.end = tile;
  s.dir = dir ?? defaultHeading(game, tile);
  s.started = hasNodeAt(game.world, tile, game.tool.pathHeight.z);
  refreshPathGhost(game);
}

function turned(dir: Dir, move: StepMove): Dir {
  if (move === 'left') return ((dir + 3) & 3) as Dir;
  if (move === 'right') return ((dir + 1) & 3) as Dir;
  return dir;
}

/** The step toward map direction `d` from the end (null: no start, or not a path tool). */
function planToward(game: PathBuilderHost, d: Dir): StepPlan | null {
  const s = current(game);
  const tool = game.tool;
  const kind: PathKind | null = pathKindOf(tool.tool);
  if (s.end < 0 || !kind) return null;
  const map = game.world.state.map;
  const w = map.width;
  const next = stepTile(map, s.end, d);
  if (next < 0) return { cmd: null, tiles: [], dir: d, nodes: [], zAfter: tool.pathHeight.z, cost: 0, reason: TERRAIN_ERR.outsidePark };
  const z = tool.pathHeight.z;
  const ramp = z === null ? 'flat' : tool.pathHeight.ramp;
  const nx = next % w;
  const ny = Math.floor(next / w);
  let cmd: StepPlan['cmd'];
  let tiles: number[];
  let nodes: BuiltTile[];
  let zAfter = z;
  if (!s.started) {
    tiles = [s.end, next];
    cmd = { type: 'buildPathLine', x0: s.end % w, y0: Math.floor(s.end / w), x1: nx, y1: ny, kind, ...pathCommandHeight(tool) };
    if (z === null) nodes = [{ tile: s.end, z: null }, { tile: next, z: null }];
    else if (ramp === 'up') {
      nodes = [{ tile: s.end, z }, { tile: next, z: z + 1 }];
      zAfter = z + 2;
    } else if (ramp === 'down') {
      nodes = [{ tile: s.end, z: z - 1 }, { tile: next, z: z - 2 }];
      zAfter = z - 2;
    } else nodes = [{ tile: s.end, z }, { tile: next, z }];
  } else {
    tiles = [next];
    if (z === null) {
      cmd = { type: 'buildPathLine', x0: nx, y0: ny, x1: nx, y1: ny, kind };
      nodes = [{ tile: next, z: null }];
    } else if (ramp === 'up') {
      cmd = { type: 'buildPath', x: nx, y: ny, kind, z, rampDir: d };
      nodes = [{ tile: next, z }];
      zAfter = z + 1;
    } else if (ramp === 'down') {
      cmd = { type: 'buildPath', x: nx, y: ny, kind, z: z - 1, rampDir: ((d + 2) & 3) as Dir };
      nodes = [{ tile: next, z: z - 1 }];
      zAfter = z - 1;
    } else {
      cmd = { type: 'buildPathLine', x0: nx, y0: ny, x1: nx, y1: ny, kind, z, ramp: 'flat' };
      nodes = [{ tile: next, z }];
    }
  }
  const r = previewPathCommand(game.world, cmd);
  return { cmd, tiles, dir: d, nodes, zAfter, cost: r.ok ? r.cost : 0, reason: r.ok ? null : (r.reason ?? null) };
}

/** The step a move would make from the end (the ghost shows Forward), or null without a start. */
export function nextStep(game: PathBuilderHost, move: StepMove = 'forward'): StepPlan | null {
  const s = current(game);
  if (s.end < 0) return null;
  return planToward(game, turned(s.dir, move));
}

function apply(game: PathBuilderHost, plan: StepPlan | null): CommandResult | null {
  if (!plan?.cmd) return null;
  const s = current(game);
  const added = plan.nodes.filter((n) => !hasNodeAt(game.world, n.tile, n.z));
  const result = game.dispatch(plan.cmd);
  if (!result.ok) return result;
  s.history.push({ end: s.end, dir: s.dir, started: s.started, z: game.tool.pathHeight.z, built: added });
  if (s.history.length > MAX_HISTORY) s.history.shift();
  s.end = plan.tiles[plan.tiles.length - 1] as number;
  s.dir = plan.dir;
  s.started = true;
  if (game.tool.pathHeight.z !== null) game.tool.pathHeight.z = plan.zAfter;
  refreshPathGhost(game);
  return result;
}

/** Forward, Left or Right: build the next tile (the command result), or null when there is nothing to build. */
export function stepPath(game: PathBuilderHost, move: StepMove = 'forward'): CommandResult | null {
  return apply(game, nextStep(game, move));
}

/** A tap on the map: a 4-neighbour of the end gets the next tile; any other tile moves the start. */
export function tapAt(game: PathBuilderHost, tile: number): CommandResult | null {
  const s = current(game);
  if (s.end >= 0 && tile === s.end) return null;
  const d = s.end >= 0 ? dirTo(game.world.state.map, s.end, tile) : -1;
  if (d < 0) {
    startAt(game, tile);
    return null;
  }
  return apply(game, planToward(game, d as Dir));
}

/** Undo the last step: demolish the tiles it added and put the end, heading and height back. */
export function undoStep(game: PathBuilderHost): boolean {
  const s = current(game);
  const rec = s.history.pop();
  if (!rec) return false;
  const w = game.world.state.map.width;
  for (const b of [...rec.built].reverse()) {
    const x = b.tile % w;
    const y = Math.floor(b.tile / w);
    game.dispatch(b.z === null ? { type: 'demolish', x, y } : { type: 'demolish', x, y, z: b.z });
  }
  s.end = rec.end;
  s.dir = rec.dir;
  s.started = rec.started;
  game.tool.pathHeight.z = rec.z;
  refreshPathGhost(game);
  return true;
}

/** The slope button: flat → up → down → flat (elevated paths only; ground paths follow the land). */
export function cycleSlope(tool: ToolState): void {
  if (tool.pathHeight.z === null) return;
  const r = tool.pathHeight.ramp;
  tool.pathHeight.ramp = r === 'flat' ? 'up' : r === 'up' ? 'down' : 'flat';
}

/** The ghost of the next Forward in `tool.drag` (tiles, cost, the reason it would fail, its heading). */
export function refreshPathGhost(game: PathBuilderHost): void {
  const tool = game.tool;
  const plan = pathKindOf(tool.tool) ? nextStep(game) : null;
  if (!plan || plan.tiles.length === 0) {
    tool.drag = plan ? { startTile: current(game).end, endTile: current(game).end, tiles: [], cost: 0, reason: plan.reason, stepDir: plan.dir } : null;
    return;
  }
  tool.drag = { startTile: plan.tiles[0] as number, endTile: plan.tiles[plan.tiles.length - 1] as number, tiles: plan.tiles, cost: plan.cost, reason: plan.reason, stepDir: plan.dir };
}
