/**
 * Guest hooks of the show system (Phase 6 §4.4). Owner: W4-C. Registered last in `sim/hooks.ts`.
 * `beforeDecision`: a guest heading for a show that is still gathering or running keeps going (the hook takes the
 * decision); any other guest with a stale `showTarget` (a lost guest that dropped its target, a guest who sat down on
 * the way) forgets the show and decides as usual.
 */
import type { GuestHooks } from '../hookTypes';
import { showDest } from '../guests/state';
import { showTargetValid } from './api';

export const showHooks: Partial<GuestHooks> = {
  beforeDecision: [
    (world, guest) => {
      if (guest.showTarget < 0) return false;
      if (guest.target === showDest(guest.showTarget) && showTargetValid(world, guest.showTarget)) return true;
      guest.showTarget = -1;
      return false;
    },
  ],
};
