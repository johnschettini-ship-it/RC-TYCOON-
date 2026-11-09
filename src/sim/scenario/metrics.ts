/**
 * Month metrics (Phase 5 §4.3, §5): day and night samples, tracked thoughts, queue waits, broken rides. Owner: W3-H.
 * Every park kind records them (awards need them in free play and sandbox too).
 */
import { monthIndexOf } from '../time';
import type { World } from '../types';
import { emptyMonthMetrics } from './types';

/**
 * Hour-start work after the rating (master R13): a day sample at 12:00 and a night sample at 22:00 (the day sample
 * stores the "daily rating"), and the guests-seen list. Stub: no-op.
 */
export function recordSamples(_world: World): void {}

/** Step 6 of the month-end pipeline: start the new month's metrics. Real body. */
export function resetMonthMetrics(world: World): void {
  world.state.monthMetrics = emptyMonthMetrics(monthIndexOf(world.state.tick));
}
