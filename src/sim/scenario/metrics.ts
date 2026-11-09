/**
 * Month metrics (Phase 5 §4.3, §5): day and night samples, tracked thoughts, queue waits, broken rides. Owner: W3-H.
 * Every park kind records them (awards need them in free play and sandbox too). Tracked thoughts and queue waits
 * come from the guest hooks (`hooks.ts`); helpers to read the metrics are in `samples.ts`.
 */
import { TICKS_PER_MONTH } from '../../data/tuning/core';
import { DAY_SAMPLE_HOUR, NIGHT_SAMPLE_HOUR } from '../../data/tuning/scenario';
import { hourOf, monthIndexOf } from '../time';
import type { World } from '../types';
import { onDaySample } from './goals';
import { insertSorted, noteGuestIds, takeSample } from './samples';
import { emptyMonthMetrics } from './types';

/**
 * Hour-start work after the rating (master R13): a day sample at 12:00 and a night sample at 22:00 (the day sample
 * stores the "daily rating" and moves the day-based scenario counters), the guests-seen list, and the rides that
 * broke down this month (by `lastBreakdownTick`).
 */
export function recordSamples(world: World): void {
  const s = world.state;
  const m = s.monthMetrics;
  noteGuestIds(m.guestsSeen, s.guests);
  const monthStart = m.monthIndex * TICKS_PER_MONTH;
  for (const r of s.rides) if (r.lastBreakdownTick >= monthStart) insertSorted(m.brokenRides, r.id);
  const hour = hourOf(s.tick);
  if (hour === DAY_SAMPLE_HOUR) {
    const sample = takeSample(s);
    m.daySamples.push(sample);
    onDaySample(world, sample);
  } else if (hour === NIGHT_SAMPLE_HOUR) {
    m.nightSamples.push(takeSample(s));
  }
}

/** Step 6 of the month-end pipeline: start the new month's metrics. Real body. */
export function resetMonthMetrics(world: World): void {
  world.state.monthMetrics = emptyMonthMetrics(monthIndexOf(world.state.tick));
}
