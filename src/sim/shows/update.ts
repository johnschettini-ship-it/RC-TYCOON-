/**
 * Show tick systems (Phase 6 §4.4; master R13, R9, R20, R27). Owner: W4-C. Called by `tick.ts`.
 *
 * `updateShows` runs every tick after stalls and breakdowns ("shows" in R13), sites in ascending id order:
 * - `idle` → `announced` at `nextShowTick − SHOW_ANNOUNCE_TICKS` when the schedule is on and After Dark is on.
 *   Gathering: every guest who is walking (not queueing, riding, buying, sitting, leaving, or already heading for a
 *   show), has energy ≥ 40, and is within 20 tiles of walking distance of a viewing tile decides with the sim RNG
 *   (ascending id order): chance 0.5, +0.2 for the matching temperament group (master R6). Watchers walk to the
 *   viewing tiles (`show:N` field) and make no other decision until the show is over (their next decision moves to
 *   the show's end; every release decides at once). With After Dark off the show is skipped: the next one is
 *   `everyNDays` later.
 * - `announced` → `running` at `nextShowTick`: the cost per show goes to the `shows` ledger line. With cash below the
 *   cost (and money not unlimited) the show is cancelled instead: nothing is charged, a `show` event `cancelled`
 *   (the UI toasts "Not enough cash for the show"), and the gathered guests go back to deciding. After Dark turned off
 *   in the meantime cancels it quietly.
 * - `running` → `done` after the def's `showTicks`: every watcher thinks `greatShow` and walks on; the watcher count
 *   goes to `lastWatchers` and the totals.
 * - `done` → `idle` on the next tick with the next `nextShowTick` (`everyNDays` after this show's day), or −1 when
 *   the schedule is off.
 * Events: `show` with `announced` (guests gathered), `started` (guests already watching), `ended` (watchers),
 * `cancelled` (0).
 *
 * `hourlyShows` runs at hour start right after wages: each site's monthly running cost by the hourly charge rule
 * (`hourlyShare`, R9/R20), booked to `shows` (R27).
 */
import { getShowSiteDef, type ShowSiteDef } from '../../data/catalog';
import { TICKS_PER_MONTH } from '../../data/tuning/core';
import {
  SHOW_ANNOUNCE_TICKS,
  SHOW_GATHER_DISTANCE,
  SHOW_GATHER_ENERGY_MIN,
  SHOW_WATCH_CHANCE,
  SHOW_WATCH_MATCH_BONUS,
} from '../../data/tuning/shows';
import { hourlyShare, recordLedger } from '../economy/ledger';
import { emit } from '../events';
import { showDest } from '../guests/state';
import { THOUGHT } from '../guests/thoughts';
import { nightActive } from '../lighting/api';
import { distanceTo } from '../pathing';
import { rngChance } from '../rng';
import { unlimitedMoney } from '../scenario/api';
import { hourOfMonth } from '../time';
import type { World } from '../types';
import { showMatches, watcherCount } from './api';
import { releaseShowGuests } from './guests';
import { followingStartTick } from './schedule';
import type { ShowSite } from './types';

/** Walking guests near the site decide whether to watch (Phase 6 §4.4 Gathering). Returns how many go. */
export function gatherWatchers(world: World, site: ShowSite, def: ShowSiteDef): number {
  const s = world.state;
  const dest = showDest(site.id);
  let n = 0;
  for (const g of s.guests) {
    if (g.state !== 'walking' || g.showTarget >= 0 || g.needs.energy < SHOW_GATHER_ENERGY_MIN) continue;
    const d = distanceTo(world, g.tile, dest, g.z);
    if (d === null || d > SHOW_GATHER_DISTANCE) continue;
    const chance = SHOW_WATCH_CHANCE + (showMatches(def.id, g.temperament) ? SHOW_WATCH_MATCH_BONUS : 0);
    if (!rngChance(s, chance)) continue;
    g.showTarget = site.id;
    g.target = dest;
    g.activityId = -1;
    g.lostSinceTick = -1;
    // No other plans until the show is over: the release (end, drop, demolish) gives a decision at once.
    g.nextDecisionTick = Math.max(g.nextDecisionTick, site.nextShowTick + def.showTicks);
    n++;
  }
  return n;
}

/** The show of `site` will not run (cancelled or skipped): back to idle with the next date, guests released. */
function dropShow(world: World, site: ShowSite): void {
  const tick = world.state.tick;
  const showTick = site.nextShowTick;
  site.status = 'idle';
  site.nextShowTick = site.schedule.enabled ? followingStartTick(site.schedule, showTick, tick) : -1;
  releaseShowGuests(world, site.id, null);
}

function stepSite(world: World, site: ShowSite, def: ShowSiteDef): void {
  const s = world.state;
  const tick = s.tick;
  switch (site.status) {
    case 'idle': {
      if (!site.schedule.enabled || site.nextShowTick < 0 || tick < site.nextShowTick - SHOW_ANNOUNCE_TICKS) return;
      if (!s.park.afterDark) {
        // Shows need After Dark on: this one is skipped.
        site.nextShowTick = followingStartTick(site.schedule, site.nextShowTick, tick);
        return;
      }
      site.status = 'announced';
      const gathered = gatherWatchers(world, site, def);
      emit(world, { type: 'show', siteId: site.id, phase: 'announced', watchers: gathered });
      return;
    }
    case 'announced': {
      if (tick < site.nextShowTick) return;
      if (!nightActive(world)) {
        dropShow(world, site);
        return;
      }
      const cost = def.costPerShow;
      if (s.park.cash < cost && !unlimitedMoney(s)) {
        dropShow(world, site);
        emit(world, { type: 'show', siteId: site.id, phase: 'cancelled', watchers: 0 });
        return;
      }
      if (cost > 0) recordLedger(world, 'shows', -cost);
      site.status = 'running';
      site.startTick = tick;
      site.totals.shows += 1;
      site.totals.cost += cost;
      emit(world, { type: 'show', siteId: site.id, phase: 'started', watchers: watcherCount(world, site.id) });
      return;
    }
    case 'running': {
      if (tick < site.startTick + def.showTicks) return;
      const watchers = releaseShowGuests(world, site.id, THOUGHT.greatShow);
      site.status = 'done';
      site.lastWatchers = watchers;
      site.totals.watchers += watchers;
      emit(world, { type: 'show', siteId: site.id, phase: 'ended', watchers });
      return;
    }
    case 'done': {
      site.status = 'idle';
      site.nextShowTick = site.schedule.enabled ? followingStartTick(site.schedule, site.startTick, tick) : -1;
      return;
    }
  }
}

export function updateShows(world: World): void {
  const list = world.state.shows;
  for (let i = 0; i < list.length; i++) {
    const site = list[i] as ShowSite;
    const def = getShowSiteDef(site.defId);
    if (def) stepSite(world, site, def);
  }
}

export function hourlyShows(world: World): void {
  const s = world.state;
  if (s.shows.length === 0) return;
  const tick = s.tick;
  const hour = hourOfMonth(tick);
  const monthStart = tick - (tick % TICKS_PER_MONTH);
  for (const site of s.shows) {
    const def = getShowSiteDef(site.defId);
    if (!def) continue;
    // Active all month = it existed at hour 0 of this month (the same rule as rides and stalls).
    const share = hourlyShare(def.runningCostMonthly, hour, site.builtTick <= monthStart);
    if (share !== 0) recordLedger(world, 'shows', -share);
  }
}
