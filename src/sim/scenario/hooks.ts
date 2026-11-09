/**
 * Month-metric counters fed by the guest hooks (Phase 5 §5). Owner: W3-H.
 * - onThought: distinct guests per tracked thought this month (`TRACKED_THOUGHTS`: the too-expensive and lost
 *   thoughts for the awards); other thoughts return at once (thoughts are frequent)
 * - onBoard: queue wait sum and count of guests who board a ride
 * The guests-seen list is kept at hour starts (`metrics.ts`).
 */
import { TRACKED_THOUGHTS } from '../../data/tuning/scenario';
import type { GuestHooks } from '../hookTypes';
import { insertSorted } from './samples';

const TRACKED = new Set(TRACKED_THOUGHTS);

export const scenarioHooks: Partial<GuestHooks> = {
  onThought: [
    (world, guest, thoughtId) => {
      if (!TRACKED.has(thoughtId)) return;
      const m = world.state.monthMetrics;
      const list = m.thoughtGuests[thoughtId] ?? (m.thoughtGuests[thoughtId] = []);
      insertSorted(list, guest.id);
    },
  ],
  onBoard: [
    (world, _guest, _ride, waitTicks) => {
      const m = world.state.monthMetrics;
      m.queueWaitTicks += waitTicks;
      m.queueWaits += 1;
    },
  ],
};
