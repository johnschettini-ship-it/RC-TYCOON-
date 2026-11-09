/**
 * Show tick systems (Phase 6 §4.4; master R13). Owner: W4-C. Called by `tick.ts`; neutral stubs until W4-C.
 *
 * - `updateShows` runs every tick after stalls and breakdowns ("shows" in R13). Sites in ascending id order:
 *   `idle` → `announced` at `nextShowTick − SHOW_ANNOUNCE_TICKS` (gathering: walking guests with energy ≥ 40 within
 *   20 tiles of walking distance decide with the sim RNG, chance 0.5 + 0.2 for a matching temperament group, R6);
 *   `announced` → `running` at `nextShowTick` (cost to `shows`, or cancelled with a `show` event `cancelled` when
 *   cash is short and money is not unlimited); `running` → `done` after the def's `showTicks` (watchers think
 *   `greatShow`); `done` → `idle` with the next `nextShowTick`. Shows need After Dark on (`nightActive`).
 * - `hourlyShows` runs at hour start right after wages (hourly charge rule R9/R20): each site's monthly running
 *   cost, booked to `shows`.
 */
import type { World } from '../types';

export function updateShows(world: World): void {
  void world;
}

export function hourlyShows(world: World): void {
  void world;
}
