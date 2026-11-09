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
 * Stub: every handler returns "Not implemented yet" and changes nothing.
 */
import { notImplemented, type HandlerMap, type TerrainCommand } from '../commands/types';

export const terrainHandlers: HandlerMap<TerrainCommand> = {
  raiseCorner: notImplemented,
  lowerCorner: notImplemented,
  raiseLand: notImplemented,
  lowerLand: notImplemented,
  smoothLand: notImplemented,
  levelLand: notImplemented,
  paintTerrain: notImplemented,
  raiseWater: notImplemented,
  lowerWater: notImplemented,
};
