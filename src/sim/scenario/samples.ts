/**
 * Month-metric building blocks (Phase 5 §4.3, §4.10, §5). Owner: W3-H. Pure helpers shared by the samples
 * (`metrics.ts`), the guest hooks (`hooks.ts`), the goals, and the awards (W3-I reads them).
 */
import { temperamentGroup } from '../../data/catalog';
import { LOST_THOUGHTS, TOO_EXPENSIVE_THOUGHTS } from '../../data/tuning/scenario';
import type { Guest } from '../guests/types';
import type { GameState } from '../types';
import type { MonthMetrics, ParkSample } from './types';

/** Insert `id` into an ascending list of distinct ids (no change when present). */
export function insertSorted(list: number[], id: number): void {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((list[mid] as number) < id) lo = mid + 1;
    else hi = mid;
  }
  if (list[lo] !== id) list.splice(lo, 0, id);
}

/**
 * Add the ids of `guests` (ascending by id, as in `GameState.guests`) to the ascending list `seen`, in place.
 * New arrivals have the largest ids, so most ids are appended or already present (no copying).
 */
export function noteGuestIds(seen: number[], guests: readonly Guest[]): void {
  let missing: number[] | null = null;
  let i = 0;
  for (const g of guests) {
    while (i < seen.length && (seen[i] as number) < g.id) i++;
    if (i < seen.length && seen[i] === g.id) continue;
    (missing ??= []).push(g.id);
  }
  if (missing === null) return;
  for (const id of missing) {
    if (seen.length === 0 || id > (seen[seen.length - 1] as number)) seen.push(id);
    else insertSorted(seen, id);
  }
}

/** A park sample now (Phase 5 §4.3): guests, rating, and happiness overall and per master R6 group. */
export function takeSample(state: GameState): ParkSample {
  let all = 0;
  const count = { chill: 0, family: 0, thrill: 0 };
  const sum = { chill: 0, family: 0, thrill: 0 };
  for (const g of state.guests) {
    const group = temperamentGroup(g.temperament);
    count[group] += 1;
    sum[group] += g.needs.happiness;
    all += g.needs.happiness;
  }
  const n = state.guests.length;
  const mean = (s: number, c: number): number => (c > 0 ? s / c : 0);
  return {
    tick: state.tick,
    guests: n,
    rating: state.park.rating,
    meanHappiness: mean(all, n),
    chill: count.chill,
    family: count.family,
    thrill: count.thrill,
    chillHappiness: mean(sum.chill, count.chill),
    familyHappiness: mean(sum.family, count.family),
    thrillHappiness: mean(sum.thrill, count.thrill),
  };
}

/** Means of a month's samples; group happiness is weighted by group size (every guest counts once). */
export interface SampleMeans {
  samples: number;
  guests: number;
  happiness: number;
  /** Shares in percent 0–100 of all sampled guests. */
  thrillShare: number;
  chillShare: number;
  thrillHappiness: number;
  chillHappiness: number;
}

export function sampleMeans(samples: readonly ParkSample[]): SampleMeans {
  let guests = 0;
  let happy = 0;
  let thrill = 0;
  let chill = 0;
  let thrillHappy = 0;
  let chillHappy = 0;
  for (const s of samples) {
    guests += s.guests;
    happy += s.meanHappiness * s.guests;
    thrill += s.thrill;
    chill += s.chill;
    thrillHappy += s.thrillHappiness * s.thrill;
    chillHappy += s.chillHappiness * s.chill;
  }
  const k = samples.length;
  return {
    samples: k,
    guests: k > 0 ? guests / k : 0,
    happiness: guests > 0 ? happy / guests : 0,
    thrillShare: guests > 0 ? (100 * thrill) / guests : 0,
    chillShare: guests > 0 ? (100 * chill) / guests : 0,
    thrillHappiness: thrill > 0 ? thrillHappy / thrill : 0,
    chillHappiness: chill > 0 ? chillHappy / chill : 0,
  };
}

/** Distinct guests this month with any of the thought ids (awards: Rip-off Park, Lost and Confused). */
export function guestsWithThoughts(metrics: MonthMetrics, ids: readonly string[]): number {
  const seen = new Set<number>();
  for (const id of ids) for (const g of metrics.thoughtGuests[id] ?? []) seen.add(g);
  return seen.size;
}

/**
 * Share (0–1) of this month's guests who had one of the thoughts. The guests seen are those in the park at an hour
 * start of the month; a guest who came and left between two hour starts still counts for the thought, so the
 * share is capped at 1. 0 with no guests.
 */
function thoughtShare(metrics: MonthMetrics, ids: readonly string[]): number {
  if (metrics.guestsSeen.length === 0) return 0;
  return Math.min(1, guestsWithThoughts(metrics, ids) / metrics.guestsSeen.length);
}

/** Share of this month's guests with a "too expensive" thought (Rip-off Park). */
export function tooExpensiveShare(metrics: MonthMetrics): number {
  return thoughtShare(metrics, TOO_EXPENSIVE_THOUGHTS);
}

/** Share of this month's guests who got lost (Lost and Confused). */
export function lostShare(metrics: MonthMetrics): number {
  return thoughtShare(metrics, LOST_THOUGHTS);
}

/** Mean queue wait of the guests who boarded this month, in ticks (0 with none). */
export function meanQueueWaitTicks(metrics: MonthMetrics): number {
  return metrics.queueWaits > 0 ? metrics.queueWaitTicks / metrics.queueWaits : 0;
}
