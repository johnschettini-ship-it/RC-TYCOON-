/**
 * The 10 goal types of Phase 5 §4.3 and their progress records. Owner: W3-H.
 * `evaluateGoal` runs at a month end for the month that just closed (`monthIndex`), before the metrics reset;
 * `onDaySample` keeps the day-based counters (rating streaks, low-rating days) at each 12:00 sample.
 */
import { getFlatRideDef, getTrackRideDef, type ContentFlags, type RideTag } from '../../data/catalog';
import { getScenarioDef, type Objective } from '../../data/scenarios';
import { DAYS_PER_MONTH } from '../../data/tuning/core';
import { RATING_COLLAPSE_BELOW } from '../../data/tuning/scenario';
import { monthProfit } from '../finance/ledger';
import { rideTag } from '../guests/scoring';
import type { Ride } from '../rides/types';
import type { LedgerMonth } from '../economy/types';
import type { World } from '../types';
import { sampleMeans } from './samples';
import type { ObjectiveProgress, ParkSample } from './types';

export const NO_PROGRESS: Readonly<ObjectiveProgress> = Object.freeze({ met: false, value: 0, streak: 0 });

function ledgerMonth(world: World, monthIndex: number): LedgerMonth | undefined {
  const ledger = world.state.economy.ledger;
  for (let k = ledger.length - 1; k >= 0; k--) {
    const m = ledger[k] as LedgerMonth;
    if (m.monthIndex === monthIndex) return m;
    if (m.monthIndex < monthIndex) return undefined;
  }
  return undefined;
}

/** Type id of a ride: the flat ride def, or the track type. */
function typeIdOf(world: World, ride: Ride): string {
  return ride.kind === 'track' ? (world.state.track.rides[String(ride.id)]?.typeId ?? ride.defId) : ride.defId;
}

function flagsOf(world: World, ride: Ride): ContentFlags | undefined {
  return ride.kind === 'flat' ? getFlatRideDef(ride.defId)?.flags : getTrackRideDef(typeIdOf(world, ride))?.flags;
}

/** Gravity-driven coaster types: the `coasterExcitement` default (Phase 5 §4.3). */
function isGravityCoaster(typeId: string): boolean {
  return getTrackRideDef(typeId)?.drive === 'gravity';
}

/** Open track rides with a passed test that meet the `coasterExcitement` filters. */
export function qualifyingCoasters(world: World, obj: Extract<Objective, { type: 'coasterExcitement' }>): number {
  let n = 0;
  for (const r of world.state.rides) {
    if (r.kind !== 'track' || r.status !== 'open') continue;
    const data = world.state.track.rides[String(r.id)];
    const test = data?.test;
    if (!test?.passed) continue;
    const typeId = typeIdOf(world, r);
    if (obj.types ? !obj.types.includes(typeId) : !isGravityCoaster(typeId)) continue;
    if (test.excitement < obj.minExcitement) continue;
    if (obj.maxIntensity !== undefined && test.intensity > obj.maxIntensity) continue;
    n++;
  }
  return n;
}

/** Open rides (flat and track) that match every filter of a `ridesOpen` goal. */
export function matchingOpenRides(world: World, obj: { tag?: RideTag; flag?: keyof ContentFlags; defIds?: string[] }): number {
  let n = 0;
  for (const r of world.state.rides) {
    if (r.status !== 'open') continue;
    if (obj.tag !== undefined && rideTag(world, r) !== obj.tag) continue;
    if (obj.flag !== undefined && flagsOf(world, r)?.[obj.flag] !== true) continue;
    if (obj.defIds !== undefined && !obj.defIds.includes(typeIdOf(world, r))) continue;
    n++;
  }
  return n;
}

/** A goal that holds at one month end: streak counts month ends in a row. */
function atMonthEnd(prev: ObjectiveProgress, ok: boolean, value: number): ObjectiveProgress {
  return { met: ok, value, streak: ok ? prev.streak + 1 : 0 };
}

/** A goal that must hold for `months` closed months in a row. */
function forMonths(prev: ObjectiveProgress, monthOk: boolean, value: number, months: number): ObjectiveProgress {
  const streak = monthOk ? prev.streak + 1 : 0;
  return { met: streak >= months, value, streak };
}

/** Progress of `obj` at the end of month `monthIndex` (Phase 5 §4.3 table), from the previous record. */
export function evaluateGoal(world: World, obj: Objective, prev: ObjectiveProgress, monthIndex: number): ObjectiveProgress {
  const s = world.state;
  switch (obj.type) {
    case 'guestsInPark': {
      const guests = s.guests.length;
      return atMonthEnd(prev, guests >= obj.count && (obj.minRating === undefined || s.park.rating >= obj.minRating), guests);
    }
    case 'parkRatingHeld':
      // The streak and value move at the day samples (`onDaySample`).
      return { met: prev.streak >= obj.months * DAYS_PER_MONTH, value: prev.value, streak: prev.streak };
    case 'parkValue':
      return atMonthEnd(prev, s.management.parkValue >= obj.value, s.management.parkValue);
    case 'monthlyRideIncome': {
      const m = ledgerMonth(world, monthIndex);
      const income = m ? m.lines.rideTickets : 0;
      return forMonths(prev, m !== undefined && income >= obj.amount, income, obj.months);
    }
    case 'monthlyProfit': {
      const m = ledgerMonth(world, monthIndex);
      const profit = m ? monthProfit(m) : 0;
      return forMonths(prev, m !== undefined && profit >= obj.amount, profit, obj.months);
    }
    case 'coasterExcitement': {
      const n = qualifyingCoasters(world, obj);
      return atMonthEnd(prev, n >= obj.count, n);
    }
    case 'ridesOpen': {
      const n = matchingOpenRides(world, obj);
      return atMonthEnd(prev, n >= obj.count, n);
    }
    case 'repayLoan': {
      const balance = s.management.loan.balance;
      return atMonthEnd(prev, balance === 0 && s.park.cash >= 0, balance);
    }
    case 'temperamentBalance': {
      const m = sampleMeans(s.monthMetrics.daySamples);
      const ok =
        m.samples > 0 &&
        m.guests >= obj.minGuests &&
        m.thrillShare >= obj.minShare &&
        m.chillShare >= obj.minShare &&
        m.thrillHappiness >= obj.minHappiness &&
        m.chillHappiness >= obj.minHappiness;
      return forMonths(prev, ok, Math.round(m.guests), obj.months);
    }
    case 'afterDarkHappiness': {
      const m = sampleMeans(s.monthMetrics.nightSamples);
      const ok = s.park.afterDark && m.samples > 0 && m.guests >= obj.minGuests && m.happiness >= obj.minHappiness;
      return forMonths(prev, ok, Math.round(m.guests), obj.months);
    }
  }
}

/**
 * At each day sample (12:00) of an active scenario run: the `parkRatingHeld` streaks (one day below resets to 0)
 * and the rating-collapse counter (days in a row below 200) take the daily rating.
 */
export function onDaySample(world: World, sample: ParkSample): void {
  const run = world.state.scenario;
  if (run.kind !== 'scenario' || run.status !== 'active') return;
  const def = getScenarioDef(run.id);
  if (def) {
    def.objectives.forEach((obj, i) => {
      if (obj.type !== 'parkRatingHeld') return;
      const p = run.objectives[i];
      if (!p) return;
      p.streak = sample.rating >= obj.rating ? p.streak + 1 : 0;
      p.value = sample.rating;
    });
  }
  run.loseCounters.lowRatingDays = sample.rating < RATING_COLLAPSE_BELOW ? run.loseCounters.lowRatingDays + 1 : 0;
}
