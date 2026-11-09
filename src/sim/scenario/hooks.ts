/**
 * Month-metric counters fed by the guest hooks (Phase 5 §5). Owner: W3-H.
 * - onThought: distinct guests per tracked thought this month (`thought.tooExpensive` / lost thoughts for awards)
 * - onBoard: queue wait sum and count of guests who board a ride
 * Stub: no hooks.
 */
import type { GuestHooks } from '../hookTypes';

export const scenarioHooks: Partial<GuestHooks> = {};
