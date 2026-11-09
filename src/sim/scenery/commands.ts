/**
 * Scenery placement and removal (Phase 4 §4.5, §6). Owner: W3-D.
 *
 * Contract:
 * - `placeScenery { defId, x, y, rotation, edge }` checks, in order: owned (`groundOwnershipBlock`), dry, centre slot
 *   free (the §4.1 string of the blocking object), flat unless `slopeOk`, clearance `[ground, ground + height)` in the
 *   occupancy list, unlocked (skipped in setup mode), then cash. Edge items need `edge` 0–3 and go on any owned tile,
 *   path tiles included; `overPath` items need a flat ground footpath. A new item gets id from `allocId`, is inserted
 *   in id order, `waterLevel = 255`, and a centre item marks its tiles `Content.Scenery` / `contentRef = id`.
 *   Returns `{ ok: true, cost, warnings, id }`. Booked as `construction`. Rules in detail: `./rules.ts`.
 * - `removeScenery { id }` refunds 50% of the build cost (`demolitionRefunds`) and clears its tiles. The result's
 *   `cost` is the signed cash change for the player (−refund), as `demolish` reports it.
 * - Both call `markFieldsDirty`, `markLightDirty`, `markOccupancyDirty`, and (edge items) `markNetworkDirty` for the
 *   tiles touched.
 */
import { getSceneryDef, type SceneryDef } from '../../data/catalog';
import { SCENERY_ERR } from '../../data/strings/scenery';
import { GARDEN_WATER_MAX, SCENERY_REFUND } from '../../data/tuning/scenery';
import { fail, ok, type HandlerMap, type SceneryCommand } from '../commands/types';
import { pay, recordLedger, type CommandContext } from '../economy/ledger';
import { markFieldsDirty } from '../fields/api';
import { allocId } from '../ids';
import { markLightDirty } from '../lighting/api';
import { Content } from '../map';
import { insertById } from '../map-ops';
import { markOccupancyDirty } from '../occupancy';
import { markNetworkDirty } from '../pathing';
import type { World } from '../types';
import type { Cents } from '../units';
import { findScenery } from './api';
import { indexAdd, indexRemove, itemTiles, sceneryIndex } from './index';
import { checkPlacement } from './rules';
import type { Scenery } from './types';

/** Phase 4 §4.5: removal refunds 50% of the build cost, rounded down to the cent. */
export function sceneryRefund(buildCost: Cents): Cents {
  return Math.max(0, Math.floor(buildCost * SCENERY_REFUND));
}

function changed(world: World, def: SceneryDef, tiles: readonly number[]): void {
  for (const t of tiles) {
    markFieldsDirty(world, t);
    markLightDirty(world, t);
  }
  markOccupancyDirty(world);
  if (def.edge) markNetworkDirty(world);
}

function placeScenery(world: World, cmd: Extract<SceneryCommand, { type: 'placeScenery' }>, ctx: CommandContext) {
  const check = checkPlacement(world, cmd, ctx);
  if (!check.ok) return fail(check.reason);
  const s = world.state;
  const map = s.map;
  const { def, tiles, z, cost } = check;
  sceneryIndex(world);
  const id = allocId(s);
  const item: Scenery = { id, defId: def.id, x: cmd.x, y: cmd.y, z, rotation: cmd.rotation, edge: def.edge ? cmd.edge : -1, waterLevel: GARDEN_WATER_MAX };
  if (!def.edge && !def.overPath) {
    for (const t of tiles) {
      map.content[t] = Content.Scenery;
      map.contentRef[t] = id;
    }
  }
  insertById(s.scenery, item);
  indexAdd(world, item);
  pay(world, cost, 'construction', ctx);
  changed(world, def, tiles);
  return ok(cost, [], id);
}

function removeScenery(world: World, cmd: Extract<SceneryCommand, { type: 'removeScenery' }>, ctx: CommandContext) {
  const s = world.state;
  const item = Number.isInteger(cmd.id) ? findScenery(world, cmd.id) : undefined;
  if (!item) return fail(SCENERY_ERR.nothingToRemove);
  const def = getSceneryDef(item.defId);
  sceneryIndex(world);
  const tiles = def ? itemTiles(s.map, item, def) : [];
  const map = s.map;
  for (const t of tiles) {
    if (map.content[t] === Content.Scenery && map.contentRef[t] === item.id) {
      map.content[t] = Content.Empty;
      map.contentRef[t] = -1;
    }
  }
  const k = s.scenery.indexOf(item);
  if (k >= 0) s.scenery.splice(k, 1);
  indexRemove(world, item);
  const refund = def ? sceneryRefund(def.buildCost) : 0;
  if (!ctx.setup && refund > 0) recordLedger(world, 'demolitionRefunds', refund);
  if (def) changed(world, def, tiles);
  // Signed cash change for the player, as `demolish` reports it (setup mode books nothing but reports the same).
  return ok(refund === 0 ? 0 : -refund);
}

export const sceneryHandlers: HandlerMap<SceneryCommand> = {
  placeScenery,
  removeScenery,
};
