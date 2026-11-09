/**
 * Award criteria (Phase 5 §4.10). Owner: W3-I.
 * `measureAwards` reads the closing month (`state.monthMetrics` before its reset, the closed ledger month, and the
 * park as it stands at month end); `awardsWon` is pure and compares with exact integer math where it can.
 *
 * Readings of the spec table:
 * - "Mean day-sample guests", the group shares, and the group happiness come from the month's day samples
 *   (12:00). Group happiness is weighted by the group's guests in each sample.
 * - Best Value's "rating" is the mean daily rating (the rating stored with the day samples). "Mean price paid per
 *   ride" is the month's ride ticket income divided by the guests who boarded a ride (`queueWaits`).
 * - Footpath tiles are tiles with ground footpath content. Litter + mess and Calm are read on those tiles.
 * - "Guests" in the thought shares are the distinct guests seen in the park this month.
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
  AWARD_EXPENSIVE_THOUGHTS,
  AWARD_LITTERBUG_MIN_DIRT_PER_100,
  AWARD_LOST_MIN_SHARE,
  AWARD_LOST_THOUGHTS,
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
import { monthIndexOf } from '../time';
import type { World } from '../types';
import type { EntityId } from '../units';
import { AWARD_IDS, isPositiveAward, type AwardId } from './types';

/** Sums and counts of the closing month. Means are `sum / count`; every criterion compares them exactly. */
export interface AwardMeasures {
  /** Day samples this month and the sums over them. */
  daySamples: number;
  guestSum: number;
  ratingSum: number;
  thrillSum: number;
  chillSum: number;
  /** Σ group happiness × group guests over the day samples. */
  thrillHappinessSum: number;
  chillHappinessSum: number;
  /** Σ guests and Σ mean happiness × guests over the night samples. */
  nightGuestSum: number;
  nightHappinessSum: number;
  footpathTiles: number;
  /** Litter + mess on footpath tiles. */
  dirt: number;
  /** Σ Calm read value over footpath tiles. */
  calmSum: number;
  /** Ride ticket income of the closing month (cents) and the guests who boarded a ride. */
  rideTickets: number;
  boardings: number;
  queueWaitTicks: number;
  /** Open thrill rides with excitement ≥ 6.00. */
  thrillRidesExciting: number;
  rides: number;
  /** Rides (still in the park) that broke down at least once this month. */
  brokenRides: number;
  guestsSeen: number;
  expensiveGuests: number;
  lostGuests: number;
  afterDark: boolean;
  /** Lit footpath tiles / all footpath tiles, 0–1. */
  litShare: number;
}

export function emptyMeasures(): AwardMeasures {
  return {
    daySamples: 0,
    guestSum: 0,
    ratingSum: 0,
    thrillSum: 0,
    chillSum: 0,
    thrillHappinessSum: 0,
    chillHappinessSum: 0,
    nightGuestSum: 0,
    nightHappinessSum: 0,
    footpathTiles: 0,
    dirt: 0,
    calmSum: 0,
    rideTickets: 0,
    boardings: 0,
    queueWaitTicks: 0,
    thrillRidesExciting: 0,
    rides: 0,
    brokenRides: 0,
    guestsSeen: 0,
    expensiveGuests: 0,
    lostGuests: 0,
    afterDark: false,
    litShare: 1,
  };
}

function distinctGuests(thoughtGuests: Readonly<Record<string, readonly EntityId[]>>, ids: readonly string[]): number {
  const seen = new Set<EntityId>();
  for (const id of ids) for (const g of thoughtGuests[id] ?? []) seen.add(g);
  return seen.size;
}

/** Measure the month that just closed. Runs at month start, before the month metrics reset. */
export function measureAwards(world: World): AwardMeasures {
  const s = world.state;
  const mm = s.monthMetrics;
  const m = emptyMeasures();
  for (const d of mm.daySamples) {
    m.daySamples += 1;
    m.guestSum += d.guests;
    m.ratingSum += d.rating;
    m.thrillSum += d.thrill;
    m.chillSum += d.chill;
    m.thrillHappinessSum += d.thrillHappiness * d.thrill;
    m.chillHappinessSum += d.chillHappiness * d.chill;
  }
  for (const n of mm.nightSamples) {
    m.nightGuestSum += n.guests;
    m.nightHappinessSum += n.meanHappiness * n.guests;
  }
  const map = s.map;
  for (let i = 0; i < map.content.length; i++) {
    if (map.content[i] !== Content.Footpath) continue;
    m.footpathTiles += 1;
    m.dirt += (map.litter[i] as number) + (map.mess[i] as number);
    m.calmSum += calmAt(world, i);
  }
  const closing = monthIndexOf(s.tick) - 1;
  m.rideTickets = s.economy.ledger.find((r) => r.monthIndex === closing)?.lines.rideTickets ?? 0;
  m.boardings = mm.queueWaits;
  m.queueWaitTicks = mm.queueWaitTicks;
  for (const r of openRides(world)) {
    if (rideTag(world, r) === 'thrill' && (r.stats?.excitement ?? 0) >= AWARD_THRILL_MIN_EXCITEMENT) m.thrillRidesExciting += 1;
  }
  m.rides = s.rides.length;
  const rideIds = new Set(s.rides.map((r) => r.id));
  m.brokenRides = new Set(mm.brokenRides.filter((id) => rideIds.has(id))).size;
  m.guestsSeen = new Set(mm.guestsSeen).size;
  m.expensiveGuests = distinctGuests(mm.thoughtGuests, AWARD_EXPENSIVE_THOUGHTS);
  m.lostGuests = distinctGuests(mm.thoughtGuests, AWARD_LOST_THOUGHTS);
  m.afterDark = s.park.afterDark;
  m.litShare = litShare(world);
  return m;
}

/** a / b ≥ pct %, with b > 0. */
const shareAtLeast = (a: number, b: number, pct: number): boolean => b > 0 && a * 100 >= pct * b;
/** Weighted mean Σ / n ≥ min, with n > 0. */
const meanAtLeast = (sum: number, n: number, min: number): boolean => n > 0 && sum >= min * n;

/** The criterion of one award on the month's measures (guest minimum not included). */
export function awardCriterion(id: AwardId, m: AwardMeasures): boolean {
  switch (id) {
    case 'spotlessPark':
      return m.footpathTiles > 0 && m.dirt * 100 <= AWARD_SPOTLESS_MAX_DIRT_PER_100 * m.footpathTiles;
    case 'bestValue':
      return meanAtLeast(m.ratingSum, m.daySamples, AWARD_BEST_VALUE_MIN_RATING) && m.boardings > 0 && m.rideTickets <= AWARD_BEST_VALUE_MAX_PRICE * m.boardings;
    case 'thrillSeekersChoice':
      return m.thrillRidesExciting >= AWARD_THRILL_MIN_RIDES && meanAtLeast(m.thrillHappinessSum, m.thrillSum, AWARD_THRILL_HAPPINESS);
    case 'chillHaven':
      return meanAtLeast(m.calmSum, m.footpathTiles, AWARD_CHILL_MIN_CALM) && meanAtLeast(m.chillHappinessSum, m.chillSum, AWARD_CHILL_HAPPINESS);
    case 'perfectBalance':
      return (
        shareAtLeast(m.thrillSum, m.guestSum, AWARD_BALANCE_MIN_SHARE) &&
        shareAtLeast(m.chillSum, m.guestSum, AWARD_BALANCE_MIN_SHARE) &&
        meanAtLeast(m.thrillHappinessSum, m.thrillSum, AWARD_BALANCE_HAPPINESS) &&
        meanAtLeast(m.chillHappinessSum, m.chillSum, AWARD_BALANCE_HAPPINESS)
      );
    case 'nightOwlsFavourite':
      return m.afterDark && m.litShare >= AWARD_NIGHT_MIN_LIT && meanAtLeast(m.nightHappinessSum, m.nightGuestSum, AWARD_NIGHT_HAPPINESS);
    case 'litterbugPark':
      return m.footpathTiles > 0 && m.dirt * 100 >= AWARD_LITTERBUG_MIN_DIRT_PER_100 * m.footpathTiles;
    case 'ripOffPark':
      return shareAtLeast(m.expensiveGuests, m.guestsSeen, AWARD_RIPOFF_MIN_SHARE);
    case 'queueNightmare':
      return meanAtLeast(m.queueWaitTicks, m.boardings, AWARD_QUEUE_MIN_WAIT_TICKS);
    case 'breakdownCentral':
      return shareAtLeast(m.brokenRides, m.rides, AWARD_BREAKDOWN_MIN_SHARE);
    case 'lostAndConfused':
      return shareAtLeast(m.lostGuests, m.guestsSeen, AWARD_LOST_MIN_SHARE);
    case 'darkAndDreary':
      return m.afterDark && m.litShare < AWARD_DARK_MAX_LIT;
  }
}

/** Awards won on these measures, in table order, with the guest minimums (mean day-sample guests ≥ 100 / 50). */
export function awardsWon(m: AwardMeasures): AwardId[] {
  const positiveOk = meanAtLeast(m.guestSum, m.daySamples, AWARD_MIN_GUESTS_POSITIVE);
  const negativeOk = meanAtLeast(m.guestSum, m.daySamples, AWARD_MIN_GUESTS_NEGATIVE);
  return AWARD_IDS.filter((id) => (isPositiveAward(id) ? positiveOk : negativeOk) && awardCriterion(id, m));
}
