/**
 * Award criteria (Phase 5 §4.10). Owner: W3-I.
 * `measureAwards` reads the closing month (`state.monthMetrics` before its reset, the closed ledger month, and the
 * park as it stands at month end); `awardsWon` is pure.
 *
 * One source of truth per metric: the month's samples, thought shares, and queue waits come from W3-H's
 * month-metric helpers (`scenario/samples.ts`: `sampleMeans`, `tooExpensiveShare`, `lostShare`,
 * `meanQueueWaitTicks`) — the same numbers the scenario goals read — and the lit share from W3-F's light map
 * (`litShare`).
 *
 * Readings of the spec table:
 * - "Mean day-sample guests", the group shares, and the group happiness are the means of the month's day samples
 *   (12:00); group happiness is weighted by the group's guests in each sample. Night happiness: the night samples.
 * - Best Value's "rating" is the mean daily rating (the rating stored with the day samples). "Mean price paid per
 *   ride" is the month's ride ticket income divided by the guests who boarded a ride (`queueWaits`).
 * - Footpath tiles are tile columns with a ground footpath or an elevated footpath (litter falls on the column).
 *   Litter + mess and Calm are read on those tiles.
 * - "Guests" in the thought shares are the distinct guests seen in the park this month (`guestsSeen`).
 */
import {
  AWARD_BALANCE_HAPPINESS,
  AWARD_BALANCE_MIN_SHARE,
  AWARD_BEST_VALUE_MAX_PRICE,
  AWARD_BEST_VALUE_MIN_RATING,
  AWARD_BREAKDOWN_MIN_SHARE,
  AWARD_CHILL_HAPPINESS,
  AWARD_CHILL_MIN_CALM,
  AWARD_DARK_MAX_LIT,
  AWARD_LITTERBUG_MIN_DIRT_PER_100,
  AWARD_LOST_MIN_SHARE,
  AWARD_MIN_GUESTS_NEGATIVE,
  AWARD_MIN_GUESTS_POSITIVE,
  AWARD_NIGHT_HAPPINESS,
  AWARD_NIGHT_MIN_LIT,
  AWARD_QUEUE_MIN_WAIT_TICKS,
  AWARD_RIPOFF_MIN_SHARE,
  AWARD_SPOTLESS_MAX_DIRT_PER_100,
  AWARD_THRILL_HAPPINESS,
  AWARD_THRILL_MIN_EXCITEMENT,
  AWARD_THRILL_MIN_RIDES,
} from '../../data/tuning/awards';
import { calmAt } from '../fields/api';
import { litShare } from '../lighting/api';
import { Content } from '../map';
import { openRides, rideTag } from '../park/rides';
import { lostShare, meanQueueWaitTicks, sampleMeans, tooExpensiveShare, type SampleMeans } from '../scenario/samples';
import { monthIndexOf } from '../time';
import type { World } from '../types';
import { AWARD_IDS, isPositiveAward, type AwardId } from './types';

export type { SampleMeans };

/** What the awards read about the closing month. */
export interface AwardMeasures {
  /** Means of the month's day samples (`sampleMeans`): guests per sample, daily rating, shares %, group happiness. */
  day: SampleMeans;
  /** Means of the month's night samples (`sampleMeans`). */
  night: SampleMeans;
  footpathTiles: number;
  /** Litter + mess on footpath tiles. */
  dirt: number;
  /** Σ Calm read value over footpath tiles. */
  calmSum: number;
  /** Ride ticket income of the closing month (cents) and the guests who boarded a ride. */
  rideTickets: number;
  boardings: number;
  /** Mean queue wait in ticks of the guests who boarded (`meanQueueWaitTicks`), 0 with none. */
  queueWaitTicks: number;
  /** Open thrill rides with excitement ≥ 6.00. */
  thrillRidesExciting: number;
  rides: number;
  /** Rides (still in the park) that broke down at least once this month. */
  brokenRides: number;
  /** Shares 0–1 of this month's guests with a "too expensive" or a "lost" thought (`tooExpensiveShare`, `lostShare`). */
  tooExpensiveShare: number;
  lostShare: number;
  afterDark: boolean;
  /** Lit footpath tiles / all footpath tiles, 0–1 (`litShare`). */
  litShare: number;
}

export function emptyMeasures(): AwardMeasures {
  return {
    day: sampleMeans([]),
    night: sampleMeans([]),
    footpathTiles: 0,
    dirt: 0,
    calmSum: 0,
    rideTickets: 0,
    boardings: 0,
    queueWaitTicks: 0,
    thrillRidesExciting: 0,
    rides: 0,
    brokenRides: 0,
    tooExpensiveShare: 0,
    lostShare: 0,
    afterDark: false,
    litShare: 1,
  };
}

/** Measure the month that just closed. Runs at month start, before the month metrics reset. */
export function measureAwards(world: World): AwardMeasures {
  const s = world.state;
  const mm = s.monthMetrics;
  const m = emptyMeasures();
  m.day = sampleMeans(mm.daySamples);
  m.night = sampleMeans(mm.nightSamples);
  const map = s.map;
  const elevated = new Set<number>();
  for (const p of s.elevatedPaths) if (p.kind === 'footpath') elevated.add(p.y * map.width + p.x);
  for (let i = 0; i < map.content.length; i++) {
    if (map.content[i] !== Content.Footpath && !elevated.has(i)) continue;
    m.footpathTiles += 1;
    m.dirt += (map.litter[i] as number) + (map.mess[i] as number);
    m.calmSum += calmAt(world, i);
  }
  const closing = monthIndexOf(s.tick) - 1;
  m.rideTickets = s.economy.ledger.find((r) => r.monthIndex === closing)?.lines.rideTickets ?? 0;
  m.boardings = mm.queueWaits;
  m.queueWaitTicks = meanQueueWaitTicks(mm);
  for (const r of openRides(world)) {
    if (rideTag(world, r) === 'thrill' && (r.stats?.excitement ?? 0) >= AWARD_THRILL_MIN_EXCITEMENT) m.thrillRidesExciting += 1;
  }
  m.rides = s.rides.length;
  const rideIds = new Set(s.rides.map((r) => r.id));
  m.brokenRides = new Set(mm.brokenRides.filter((id) => rideIds.has(id))).size;
  m.tooExpensiveShare = tooExpensiveShare(mm);
  m.lostShare = lostShare(mm);
  m.afterDark = s.park.afterDark;
  m.litShare = litShare(world);
  return m;
}

/** The criterion of one award on the month's measures (guest minimum not included). */
export function awardCriterion(id: AwardId, m: AwardMeasures): boolean {
  const { day, night } = m;
  switch (id) {
    case 'spotlessPark':
      return m.footpathTiles > 0 && m.dirt * 100 <= AWARD_SPOTLESS_MAX_DIRT_PER_100 * m.footpathTiles;
    case 'bestValue':
      return day.samples > 0 && day.rating >= AWARD_BEST_VALUE_MIN_RATING && m.boardings > 0 && m.rideTickets <= AWARD_BEST_VALUE_MAX_PRICE * m.boardings;
    case 'thrillSeekersChoice':
      return m.thrillRidesExciting >= AWARD_THRILL_MIN_RIDES && day.thrillShare > 0 && day.thrillHappiness >= AWARD_THRILL_HAPPINESS;
    case 'chillHaven':
      return m.footpathTiles > 0 && m.calmSum >= AWARD_CHILL_MIN_CALM * m.footpathTiles && day.chillShare > 0 && day.chillHappiness >= AWARD_CHILL_HAPPINESS;
    case 'perfectBalance':
      return (
        day.thrillShare >= AWARD_BALANCE_MIN_SHARE &&
        day.chillShare >= AWARD_BALANCE_MIN_SHARE &&
        day.thrillHappiness >= AWARD_BALANCE_HAPPINESS &&
        day.chillHappiness >= AWARD_BALANCE_HAPPINESS
      );
    case 'nightOwlsFavourite':
      return m.afterDark && m.litShare >= AWARD_NIGHT_MIN_LIT && night.guests > 0 && night.happiness >= AWARD_NIGHT_HAPPINESS;
    case 'litterbugPark':
      return m.footpathTiles > 0 && m.dirt * 100 >= AWARD_LITTERBUG_MIN_DIRT_PER_100 * m.footpathTiles;
    case 'ripOffPark':
      return m.tooExpensiveShare >= AWARD_RIPOFF_MIN_SHARE;
    case 'queueNightmare':
      return m.boardings > 0 && m.queueWaitTicks >= AWARD_QUEUE_MIN_WAIT_TICKS;
    case 'breakdownCentral':
      return m.rides > 0 && m.brokenRides * 100 >= AWARD_BREAKDOWN_MIN_SHARE * m.rides;
    case 'lostAndConfused':
      return m.lostShare >= AWARD_LOST_MIN_SHARE;
    case 'darkAndDreary':
      return m.afterDark && m.litShare < AWARD_DARK_MAX_LIT;
  }
}

/** Awards won on these measures, in table order, with the guest minimums (mean day-sample guests ≥ 100 / 50). */
export function awardsWon(m: AwardMeasures): AwardId[] {
  const positiveOk = m.day.samples > 0 && m.day.guests >= AWARD_MIN_GUESTS_POSITIVE;
  const negativeOk = m.day.samples > 0 && m.day.guests >= AWARD_MIN_GUESTS_NEGATIVE;
  return AWARD_IDS.filter((id) => (isPositiveAward(id) ? positiveOk : negativeOk) && awardCriterion(id, m));
}
