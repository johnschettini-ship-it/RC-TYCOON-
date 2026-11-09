/**
 * Guest hook registry. Lets later systems change guest behaviour without editing the guest files.
 * Owner of this file: integrator. The contract (`GuestHooks`) lives in `./hookTypes`. Each hook list comes from its
 * owner's module in a fixed order.
 *
 * The lists are merged on first use (property getters), not at module load: guest modules (thoughts, needs, api)
 * read the hooks, and hook modules import guest modules, so a load-time merge would depend on import order.
 */
import { GUEST_HOOK_KEYS, hookFactor, mergeGuestHooks, type GuestHooks } from './hookTypes';
import { setThoughtListener } from './guests/thoughts';
import { litterHooks } from './litter/hooks';
import { weatherHooks } from './weather/hooks';
import { facilityHooks } from './facilities/hooks';
import { fieldHooks } from './fields/hooks';
import { nightHooks } from './lighting/hooks';
import { waterRideHooks } from './rides/track/waterHooks';
import { scenarioHooks } from './scenario/hooks';
import { showHooks } from './shows/hooks';

export type { GuestHooks };
export { hookFactor };

let merged: GuestHooks | null = null;

/**
 * Fixed order: litter/mess/bench/vandalism (W1-H), weather (W1-I), facilities (W2-C), then Build 2:
 * Calm and Buzz (W3-E), After Dark (W3-F), water rides (W3-C), month metrics (W3-H); Build 3: shows (W4-C).
 */
function all(): GuestHooks {
  if (merged === null) merged = mergeGuestHooks(litterHooks, weatherHooks, facilityHooks, fieldHooks, nightHooks, waterRideHooks, scenarioHooks, showHooks);
  return merged;
}

export const guestHooks: GuestHooks = (() => {
  const out = {} as GuestHooks;
  for (const k of GUEST_HOOK_KEYS) Object.defineProperty(out, k, { enumerable: true, get: () => all()[k] });
  return out;
})();

// `addThought` cannot import this registry (see guests/thoughts.ts), so the registry hands it the `onThought` list.
setThoughtListener((world, guest, id) => {
  for (const hook of guestHooks.onThought) hook(world, guest, id);
});
