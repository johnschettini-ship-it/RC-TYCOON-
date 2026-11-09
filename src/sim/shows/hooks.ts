/**
 * Guest hooks of the show system (Phase 6 §4.4). Owner: W4-C. Registered last in `sim/hooks.ts`.
 *
 * A guest heading for a show keeps going because gathering holds its next decision until the show's end
 * (`gatherWatchers`), and every way out of a show (the show ends or is dropped, the site goes) releases it with a
 * decision at once (`releaseFromShow`). So there is no `beforeDecision` hook (it would run for every decision of every
 * guest). One `perHour` sweep catches the rest: a guest whose show target went stale on the way (lost, its target
 * dropped, sat down on a bench) forgets the show and decides at once, so no guest waits out a show it is not going to.
 */
import type { GuestHooks } from '../hookTypes';
import { showDest } from '../guests/state';
import { showTargetValid } from './api';

export const showHooks: Partial<GuestHooks> = {
  perHour: [
    (world, guest) => {
      const id = guest.showTarget;
      if (id < 0 || guest.state === 'watchingShow') return;
      if (guest.target === showDest(id) && showTargetValid(world, id)) return;
      guest.showTarget = -1;
      if (guest.state === 'walking' && guest.nextDecisionTick > world.state.tick) guest.nextDecisionTick = world.state.tick;
    },
  ],
};
