/**
 * Show watchers (Phase 6 §4.4). Owner: W4-C. Called by the guest system (`guests/update.ts`) and the show system.
 *
 * Flow: gathering (`updateShows`) sets `showTarget = N`, `target = 'show:N'` on a walking guest and holds its next
 * decision until the show's end. The guest walks with the normal walking code; on a viewing node
 * `arriveAtShow` turns it into `watchingShow` (standing still on the node). `updateWatchingShow` runs each tick for
 * such a guest: +1 happiness per 20 ticks of the running show (`watchGain`: cap +40 per show, ×1.3 for a matching
 * group). When the show ends, `updateShows` gives every watcher `greatShow` and sends it back to walking; a show that
 * is cancelled or a site that goes sends its guests back to deciding with no thought. No guest is ever left in a show
 * state, and `showTarget` never points at a missing site.
 */
import { SHOW_HAPPY_TICKS } from '../../data/tuning/shows';
import { keepOnNode, relocate, stopWalking } from '../guests/movement';
import { changeNeed } from '../guests/needs';
import { replan, setState, showDest } from '../guests/state';
import { addThought } from '../guests/thoughts';
import type { Guest } from '../guests/types';
import type { World } from '../types';
import type { EntityId } from '../units';
import { findShowSite, showMatches, showTargetValid, watchGain } from './api';

/**
 * Back to deciding: no show target; a watcher steps off the show state; a walker drops its show target. A walking
 * guest decides at once (gathering held its decisions back until the show's end); other states keep their timers.
 */
export function releaseFromShow(world: World, guest: Guest): void {
  const heading = guest.target !== null && guest.target === showDest(guest.showTarget);
  guest.showTarget = -1;
  if (guest.state === 'watchingShow' || (guest.state === 'walking' && heading)) replan(world, guest);
  else if (guest.state === 'walking' && guest.nextDecisionTick > world.state.tick) guest.nextDecisionTick = world.state.tick;
}

/** Release every guest heading for or watching site `id`. With `thought`, watchers think it first (in id order). */
export function releaseShowGuests(world: World, id: EntityId, thought: string | null): number {
  let watchers = 0;
  for (const g of world.state.guests) {
    if (g.showTarget !== id) continue;
    if (g.state === 'watchingShow') {
      watchers++;
      if (thought) addThought(world, g, thought);
    }
    releaseFromShow(world, g);
  }
  return watchers;
}

/** The guest reached a viewing node of site `siteId` (its target was `show:siteId`): stand and watch. */
export function arriveAtShow(world: World, guest: Guest, siteId: EntityId): void {
  if (guest.showTarget !== siteId || !showTargetValid(world, siteId)) {
    releaseFromShow(world, guest);
    if (guest.target === showDest(siteId)) replan(world, guest);
    return;
  }
  setState(guest, 'watchingShow');
  stopWalking(guest);
  guest.activityId = -1;
}

/** One tick of a guest in state `watchingShow`. */
export function updateWatchingShow(world: World, guest: Guest): void {
  const site = findShowSite(world, guest.showTarget);
  if (!site || (site.status !== 'announced' && site.status !== 'running')) {
    releaseFromShow(world, guest);
    return;
  }
  if (!keepOnNode(world, guest)) {
    // The path under the watcher went (a demolished footpath): back onto the network, no show.
    releaseFromShow(world, guest);
    relocate(world, guest);
    return;
  }
  stopWalking(guest);
  if (site.status !== 'running') return;
  const elapsed = world.state.tick - site.startTick;
  if (elapsed <= 0 || elapsed % SHOW_HAPPY_TICKS !== 0) return;
  const k = elapsed / SHOW_HAPPY_TICKS;
  const match = showMatches(site.defId, guest.temperament);
  const gain = watchGain(k, match) - watchGain(k - 1, match);
  if (gain > 0) changeNeed(guest, 'happiness', gain);
}

