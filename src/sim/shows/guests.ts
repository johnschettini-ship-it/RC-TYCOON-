/**
 * Show watchers (Phase 6 §4.4). Owner: W4-C. Called by the guest system (`guests/update.ts`); neutral stubs until
 * W4-C, which send the guest back to deciding so no guest is ever stuck in a show state.
 *
 * Flow: gathering (W4-C `updateShows`) sets `showTarget = N`, `target = 'show:N'` on a walking guest. The guest walks
 * with the normal walking code; on a viewing node `arriveAtShow` turns it into `watchingShow` (stand still on the
 * node). `updateWatchingShow` runs each tick for such a guest: +1 happiness per 20 ticks of the show (cap +40 per
 * show, ×1.3 for a matching group), then `greatShow` and back to walking when the show ends or the site goes.
 */
import { replan } from '../guests/state';
import type { Guest } from '../guests/types';
import type { World } from '../types';
import type { EntityId } from '../units';

/** The guest reached a viewing node of site `siteId` (its target was `show:siteId`). Neutral: re-plan. */
export function arriveAtShow(world: World, guest: Guest, siteId: EntityId): void {
  void siteId;
  guest.showTarget = -1;
  replan(world, guest);
}

/** One tick of a guest in state `watchingShow`. Neutral: stop watching and re-plan. */
export function updateWatchingShow(world: World, guest: Guest): void {
  guest.showTarget = -1;
  replan(world, guest);
}
