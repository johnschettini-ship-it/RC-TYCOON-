/**
 * Month-metric counters fed by the guest hooks (Phase 5 §5). Owner: W3-H.
 * - onThought: distinct guests per tracked thought this month (`TRACKED_THOUGHTS`: the too-expensive and lost
 *   thoughts for the awards); every guest with a thought also counts as seen this month
 * - onBoard: queue wait sum and count of guests who board a ride
 */
import { TRACKED_THOUGHTS } from '../../data/tuning/scenario';
import type { GuestHooks } from '../hookTypes';
import { insertSorted } from './samples';

const TRACKED = new Set(TRACKED_THOUGHTS);

export const scenarioHooks: Partial<GuestHooks> = {
  onThought: [
    (world, guest, thoughtId) => {
      const m = world.state.monthMetrics;
      insertSorted(m.guestsSeen, guest.id);
      if (!TRACKED.has(thoughtId)) return;
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
