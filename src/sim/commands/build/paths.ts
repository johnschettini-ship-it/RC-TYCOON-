/**
 * `buildPath` and `buildPathLine` (Phase 1 §4.1). Owner: W1-C.
 * Validation order: land, then obstacles, then cash. Nothing changes unless every check passes.
 * A tile that already has the same kind is skipped (no cost). Footpath ↔ queue conversion costs the new kind.
 */
import { PATH_COST, QUEUE_COST } from '../../../data/tuning/world';
import { canAfford, pay } from '../../economy/ledger';
import { Content } from '../../map';
import { lineTiles, ownedTileAt, setPathTile } from '../../map-ops';
import { markNetworkDirty } from '../../pathing';
import type { World } from '../../types';
import { fail, ok, type BuildCommand, type CommandContext, type CommandResult, type PathKind } from '../types';
import { BUILD_STRINGS } from './strings';

type PathContent = typeof Content.Footpath | typeof Content.Queue;

export function pathCost(kind: PathKind): number {
  return kind === 'queue' ? QUEUE_COST : PATH_COST;
}

function pathContent(kind: PathKind): PathContent {
  return kind === 'queue' ? Content.Queue : Content.Footpath;
}

/** Validate and apply one path build over `coords` (all or nothing). */
function buildPathTiles(world: World, coords: { x: number; y: number }[] | null, kind: PathKind, ctx: CommandContext): CommandResult {
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
  const cost = changed.length * pathCost(kind);
  if (cost > 0 && !canAfford(world, cost, ctx)) return fail(BUILD_STRINGS.notEnoughCash);

  for (const i of changed) setPathTile(map, i, want);
  pay(world, cost, 'construction', ctx);
  if (changed.length > 0) markNetworkDirty(world);
  return ok(cost);
}

export function buildPath(world: World, cmd: Extract<BuildCommand, { type: 'buildPath' }>, ctx: CommandContext): CommandResult {
  return buildPathTiles(world, [{ x: cmd.x, y: cmd.y }], cmd.kind, ctx);
}

/** A straight line along the axis with the larger distance from the start tile; one charge for all new tiles. */
export function buildPathLine(world: World, cmd: Extract<BuildCommand, { type: 'buildPathLine' }>, ctx: CommandContext): CommandResult {
  return buildPathTiles(world, lineTiles(world.state.map, cmd.x0, cmd.y0, cmd.x1, cmd.y1), cmd.kind, ctx);
}
