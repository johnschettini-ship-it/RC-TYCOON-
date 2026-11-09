/**
 * Show site commands (Phase 6 §6). Owner: W4-C.
 *
 * - `placeShowSite { defId, x, y, rotation }`: the rules of `./placement.ts` (unlocked — skipped in setup mode —,
 *   every footprint tile owned, empty, flat, dry, with clearance, then cash). A new site gets `allocId`, is inserted
 *   in id order, marks its tiles `Content.Building` / `contentRef = id`, books `construction`, starts `idle` with the
 *   default schedule (disabled, 21:00, every day, `nextShowTick = −1`), and marks the network, occupancy, light, and
 *   field caches dirty. Returns `{ ok: true, cost, warnings: [], id }`.
 * - `setShowSchedule { id, hour, minute, everyNDays }`: hour 20–23, minute 0 or 30, N 1–3. An idle site with shows on
 *   gets the next start from the new schedule at once; a show already announced or running keeps its time (the new
 *   schedule applies from the next one). Free.
 * - `setShowEnabled { id, enabled }`: the site exists. On: an idle site gets its next start (the first one that can be
 *   announced a full game hour ahead). Off: no next show; a show being announced is dropped and its guests go back to
 *   deciding; a running show finishes. Free.
 * - `demolishShowSite` (called by `demolish` on a site tile): refunds 50% (master R15, `demolitionRefunds`), clears the
 *   tiles, sends watchers and walkers back to deciding (`showTarget = −1`), marks the same caches dirty. The result's
 *   `cost` is the signed cash change for the player (−refund), as `demolish` reports it.
 */
import { SHOW_ERR } from '../../data/strings/shows';
import { DEMOLISH_REFUND_PERCENT } from '../../data/tuning/world';
import { fail, ok, type CommandResult, type HandlerMap, type ShowCommand } from '../commands/types';
import { pay, recordLedger, type CommandContext } from '../economy/ledger';
import { markFieldsDirty } from '../fields/api';
import { allocId } from '../ids';
import { markLightDirty } from '../lighting/api';
import { Content } from '../map';
import { clearEntityTiles, forgetEntityReferences, insertById } from '../map-ops';
import { markOccupancyDirty } from '../occupancy';
import { markNetworkDirty } from '../pathing';
import type { World } from '../types';
import type { Cents } from '../units';
import { findShowSite, showSiteTiles } from './api';
import { releaseShowGuests } from './guests';
import { checkShowPlacement } from './placement';
import { nextStartTick, scheduleError } from './schedule';
import { dayIndexOf } from '../time';
import { defaultShowSchedule, type ShowSite } from './types';

/** Master R15: a show site refunds 50% of its build cost, rounded down to the cent. */
export function showSiteRefund(buildCost: Cents): Cents {
  return Math.max(0, Math.floor((buildCost * DEMOLISH_REFUND_PERCENT) / 100));
}

function cachesChanged(world: World, tiles: readonly number[]): void {
  for (const t of tiles) {
    markFieldsDirty(world, t);
    markLightDirty(world, t);
  }
  markOccupancyDirty(world);
  markNetworkDirty(world);
}

/** The next start of an idle site whose shows are on, from now. */
function scheduleFromNow(world: World, site: ShowSite): void {
  const tick = world.state.tick;
  site.nextShowTick = site.schedule.enabled ? nextStartTick(site.schedule, tick, dayIndexOf(tick)) : -1;
}

function placeShowSite(world: World, cmd: Extract<ShowCommand, { type: 'placeShowSite' }>, ctx: CommandContext): CommandResult {
  const check = checkShowPlacement(world, cmd, ctx);
  if (!check.ok) return fail(check.reason);
  const s = world.state;
  const { def, tiles, cost } = check;
  const id = allocId(s);
  for (const t of tiles) {
    s.map.content[t] = Content.Building;
    s.map.contentRef[t] = id;
  }
  const site: ShowSite = {
    id,
    defId: def.id,
    x: cmd.x,
    y: cmd.y,
    rotation: cmd.rotation,
    schedule: defaultShowSchedule(),
    status: 'idle',
    nextShowTick: -1,
    startTick: -1,
    lastWatchers: 0,
    totals: { shows: 0, cost: 0, watchers: 0 },
    totalBuildCost: cost,
    builtTick: s.tick,
  };
  insertById(s.shows, site);
  pay(world, cost, 'construction', ctx);
  cachesChanged(world, tiles);
  return ok(cost, [], id);
}

function setShowSchedule(world: World, cmd: Extract<ShowCommand, { type: 'setShowSchedule' }>): CommandResult {
  const site = Number.isInteger(cmd.id) ? findShowSite(world, cmd.id) : undefined;
  if (!site) return fail(SHOW_ERR.noSite);
  const bad = scheduleError(cmd.hour, cmd.minute, cmd.everyNDays);
  if (bad) return fail(bad);
  site.schedule.hour = cmd.hour;
  site.schedule.minute = cmd.minute as 0 | 30;
  site.schedule.everyNDays = cmd.everyNDays;
  if (site.status === 'idle') scheduleFromNow(world, site);
  return ok(0);
}

function setShowEnabled(world: World, cmd: Extract<ShowCommand, { type: 'setShowEnabled' }>): CommandResult {
  const site = Number.isInteger(cmd.id) ? findShowSite(world, cmd.id) : undefined;
  if (!site) return fail(SHOW_ERR.noSite);
  if (typeof cmd.enabled !== 'boolean') return fail(SHOW_ERR.badValue);
  site.schedule.enabled = cmd.enabled;
  if (site.status === 'announced' && !cmd.enabled) {
    site.status = 'idle';
    releaseShowGuests(world, site.id, null);
  }
  if (site.status === 'idle') scheduleFromNow(world, site);
  return ok(0);
}

export const showHandlers: HandlerMap<ShowCommand> = {
  placeShowSite,
  setShowSchedule,
  setShowEnabled,
};

/** `demolish` on a show site tile: 50% refund, tiles cleared, its guests back to deciding, caches dirty. */
export function demolishShowSite(world: World, site: ShowSite, ctx: CommandContext): CommandResult {
  const s = world.state;
  const tiles = showSiteTiles(world, site);
  releaseShowGuests(world, site.id, null);
  clearEntityTiles(s.map, site.id);
  const k = s.shows.indexOf(site);
  if (k >= 0) s.shows.splice(k, 1);
  forgetEntityReferences(world, site.id);
  const refund = showSiteRefund(site.totalBuildCost);
  if (!ctx.setup && refund > 0) recordLedger(world, 'demolitionRefunds', refund);
  cachesChanged(world, tiles);
  return ok(refund === 0 ? 0 : -refund);
}
