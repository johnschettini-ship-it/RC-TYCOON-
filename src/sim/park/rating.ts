/**
 * Owner: W1-E. Park rating (Phase 3 §4.13 formula, master R8). Runs at every hour start.
 *
 * rating = round(Σ weight × subScore + modifiers.ratingBonus), clamped to 0–1,000. Each sub-score is 0–1.
 *
 * | Sub-score   | Formula                                                                     | Weight |
 * |-------------|-----------------------------------------------------------------------------|--------|
 * | Happiness H | average guest happiness / 255                                               | 400    |
 * | Cleanliness C | from Phase 3 §4.3 (`cleanliness`)                                          | 150    |
 * | Reliability B | `reliabilityScore` (Phase 3 §4.13 formula, breakdown system)               | 100    |
 * | Fair prices P | 1 − min(1, 3 × tooExpensiveThoughtsToday / max(1, guests))                 | 100    |
 * | Variety V   | (1 − 0.5 × Σ |guestShare − rideShare|) × min(1, openRides / 8)              | 100    |
 * | Lost guests L | 1 − min(1, 4 × lostGuests / max(1, guests))                                | 75     |
 * | Queues Q    | 1 − min(1, average over open rides of queueLength / (3 × capacity))         | 75     |
 *
 * "No data" values (documented formula choices, shown in the rating tooltip; not missing-data fill-ins):
 * - Spec (Phase 3 §4.13): "With 0 guests, H, P, L use 0.5."
 *   H averages the guests in the park and the last 200 leavers (Phase 1 §4.6), so H uses 0.5 only when
 *   both lists are empty. P and L use 0.5 when no guest is in the park.
 * - V with no guests: the guest shares are all 0, so Σ |guestShare − rideShare| = 1 and V = 0.5 × ride term.
 *   V with no open rides: the ride term min(1, 0 / 8) is 0, so V = 0.
 * - Q with no open rides: 0 (the Phase 1 §4.6 choice for the queue term: "With no open rides: 0").
 * - C and B come from their owners (litter, breakdowns) with their own no-data rules.
 *
 * Interpretations:
 * - "Guests" are all guests in `state.guests`. Groups follow master R6 (chill ≤ 35, family 36–64, thrill ≥ 65).
 * - "Today" for P is the last game day: a thought counts if a guest showed it within the last 1,200 ticks.
 *   Thought ids are found by their spec text in the English string table (TOO_EXPENSIVE_THOUGHT_TEXTS).
 * - Lost guests have `lostSinceTick ≥ 0`.
 */
import { temperamentGroup, type RideTag } from '../../data/catalog';
import { en } from '../../data/strings/en';
import {
  FAIR_PRICE_THOUGHT_FACTOR,
  FAIR_PRICE_WINDOW_TICKS,
  LOST_GUEST_FACTOR,
  QUEUE_CAPACITY_FACTOR,
  RATING_MAX,
  RATING_MIN,
  RATING_NO_GUESTS_SCORE,
  RATING_WEIGHTS,
  TOO_EXPENSIVE_THOUGHT_TEXTS,
  VARIETY_FULL_RIDES,
} from '../../data/tuning/economy';
import { reliabilityScore } from '../breakdowns/api';
import type { Guest } from '../guests/types';
import { cleanliness } from '../litter/metrics';
import type { World } from '../types';
import { openRides, rideCapacity, rideTag } from './rides';

export interface RatingParts {
  happiness: number;
  cleanliness: number;
  reliability: number;
  fairPrices: number;
  variety: number;
  lostGuests: number;
  queues: number;
}

const GROUPS: readonly RideTag[] = ['chill', 'family', 'thrill'];
const HAPPINESS_MAX = 255;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function happinessScore(world: World): number {
  const { guests, park } = world.state;
  const n = guests.length + park.recentLeavers.length;
  if (n === 0) return RATING_NO_GUESTS_SCORE;
  let sum = 0;
  for (const g of guests) sum += g.needs.happiness;
  for (const h of park.recentLeavers) sum += h;
  return clamp01(sum / n / HAPPINESS_MAX);
}

/** Ids in the English string table whose text is a "too expensive" thought. */
function tooExpensiveIds(): string[] {
  const texts = new Set(TOO_EXPENSIVE_THOUGHT_TEXTS);
  return Object.keys(en)
    .filter((id) => texts.has(en[id] as string))
    .sort();
}

/** Newest tick this guest showed thought `id`, or −Infinity. */
function lastShown(guest: Guest, id: string): number {
  let last = guest.thoughtCooldowns[id] ?? Number.NEGATIVE_INFINITY;
  for (const t of guest.thoughts) if (t.id === id && t.tick > last) last = t.tick;
  return last;
}

function fairPriceScore(world: World): number {
  const { guests, tick } = world.state;
  if (guests.length === 0) return RATING_NO_GUESTS_SCORE;
  const ids = tooExpensiveIds();
  let count = 0;
  for (const g of guests) {
    for (const id of ids) {
      const last = lastShown(g, id);
      if (last <= tick && tick - last < FAIR_PRICE_WINDOW_TICKS) count++;
    }
  }
  return 1 - Math.min(1, (FAIR_PRICE_THOUGHT_FACTOR * count) / guests.length);
}

function varietyScore(world: World): number {
  const guests = world.state.guests;
  const open = openRides(world);
  const guestCount: Record<RideTag, number> = { chill: 0, family: 0, thrill: 0 };
  const rideCount: Record<RideTag, number> = { chill: 0, family: 0, thrill: 0 };
  for (const g of guests) guestCount[temperamentGroup(g.temperament)]++;
  for (const r of open) {
    const tag = rideTag(world, r);
    if (tag) rideCount[tag]++;
  }
  let diff = 0;
  for (const k of GROUPS) {
    const gs = guests.length > 0 ? guestCount[k] / guests.length : 0;
    const rs = open.length > 0 ? rideCount[k] / open.length : 0;
    diff += Math.abs(gs - rs);
  }
  return clamp01((1 - 0.5 * diff) * Math.min(1, open.length / VARIETY_FULL_RIDES));
}

function lostGuestScore(world: World): number {
  const guests = world.state.guests;
  if (guests.length === 0) return RATING_NO_GUESTS_SCORE;
  let lost = 0;
  for (const g of guests) if (g.lostSinceTick >= 0) lost++;
  return 1 - Math.min(1, (LOST_GUEST_FACTOR * lost) / guests.length);
}

function queueScore(world: World): number {
  const open = openRides(world);
  if (open.length === 0) return 0;
  let sum = 0;
  for (const r of open) sum += r.queue.length / (QUEUE_CAPACITY_FACTOR * rideCapacity(world, r));
  return 1 - Math.min(1, sum / open.length);
}

/** The 7 sub-scores (0–1) for the rating and its tooltip. */
export function ratingParts(world: World): RatingParts {
  return {
    happiness: happinessScore(world),
    cleanliness: clamp01(cleanliness(world)),
    reliability: clamp01(reliabilityScore(world)),
    fairPrices: fairPriceScore(world),
    variety: varietyScore(world),
    lostGuests: lostGuestScore(world),
    queues: queueScore(world),
  };
}

/** round(Σ weight × part + bonus), clamped to 0–1,000. */
export function ratingFromParts(parts: RatingParts, bonus: number): number {
  let sum = 0;
  for (const k of Object.keys(RATING_WEIGHTS) as (keyof RatingParts)[]) sum += RATING_WEIGHTS[k] * parts[k];
  return Math.min(RATING_MAX, Math.max(RATING_MIN, Math.round(sum + bonus)));
}

export function computeRating(world: World): number {
  return ratingFromParts(ratingParts(world), world.state.modifiers.ratingBonus);
}

export function updateRating(world: World): void {
  world.state.park.rating = computeRating(world);
}
