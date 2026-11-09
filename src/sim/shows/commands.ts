/**
 * Show site commands (Phase 6 §6). Owner: W4-C. Every stub returns "Not implemented yet" and changes nothing.
 *
 * Contract:
 * - `placeShowSite { defId, x, y, rotation }`: unlocked (`isUnlocked`, skipped in setup mode), every footprint tile
 *   owned, empty, flat, dry, with clearance, then cash. A new site gets `allocId`, is inserted in id order, marks
 *   its tiles `Content.Building` / `contentRef = id`, books `construction`, starts `idle` with the default schedule
 *   (disabled, 21:00, every day, `nextShowTick = −1`), and calls `markNetworkDirty`, `markOccupancyDirty`,
 *   `markLightDirty`, `markFieldsDirty`. Returns `{ ok: true, cost, warnings, id }`. Strings: `data/strings/shows.ts`.
 * - `setShowSchedule { id, hour, minute, everyNDays }`: hour 20–23, minute 0 or 30, N 1–3; recomputes
 *   `nextShowTick` when enabled. `setShowEnabled { id, enabled }`: the site exists. Both free.
 * - `demolishShowSite` (called by `demolish` on a site tile): refunds 50% (master R15, `demolitionRefunds`), clears
 *   the tiles, sends watchers and walkers back to deciding (`showTarget = −1`), marks the same caches dirty.
 */
import { notImplemented, type CommandResult, type HandlerMap, type ShowCommand } from '../commands/types';
import type { CommandContext } from '../economy/ledger';
import type { World } from '../types';
import type { ShowSite } from './types';

export const showHandlers: HandlerMap<ShowCommand> = {
  placeShowSite: notImplemented,
  setShowSchedule: notImplemented,
  setShowEnabled: notImplemented,
};

/** `demolish` on a show site tile. Neutral: "Not implemented yet" (no site can exist before W4-C). */
export function demolishShowSite(world: World, site: ShowSite, ctx: CommandContext): CommandResult {
  void world;
  void site;
  void ctx;
  return notImplemented();
}
