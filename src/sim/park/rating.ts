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
 * - "Today" for P is the last game day: a thought counts if a guest showed it within the last 1,200 ticks,
 *   read from the guest's `thoughtCooldowns` (last tick each thought id was shown, kept by `addThought`).
 *   Thought ids are found once, at module load, by their spec text in the English string table
 *   (TOO_EXPENSIVE_THOUGHT_TEXTS → TOO_EXPENSIVE_THOUGHT_IDS).
 * - Performance (master §10): one pass over the guests gathers H, P, V and L; nothing is allocated except
 *   the returned parts object.
 * - Lost guests: no route (`lostSinceTick ≥ 0`) or lost after wrong turns (`isGuestLost`, Phase 3 §4.10).
 */
import { temperamentGroup } from '../../data/catalog';
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
import { rideCapacity, rideTag } from './rides';
import { isGuestLost } from '../facilities/wayfinding';

export interface RatingParts {
  happiness: number;
  cleanliness: number;
  reliability: number;
  fairPrices: number;
  variety: number;
  lostGuests: number;
  queues: number;
}

const HAPPINESS_MAX = 255;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Ids in the English string table whose text is a "too expensive" thought, sorted. Found once at module
 * load: the string table is static data, and the rating runs at every hour start (master §10 budget).
 */
export const TOO_EXPENSIVE_THOUGHT_IDS: readonly string[] = Object.freeze(
  ((): string[] => {
    const texts = new Set(TOO_EXPENSIVE_THOUGHT_TEXTS);
    return Object.keys(en)
      .filter((id) => texts.has(en[id] as string))
      .sort();
  })(),
);

/** Module-local copies for the per-guest loop (imported bindings are slower to read in a hot loop). */
const EXPENSIVE_IDS = TOO_EXPENSIVE_THOUGHT_IDS;
const FAIR_WINDOW = FAIR_PRICE_WINDOW_TICKS;

/**
 * Too-expensive thought ids this guest showed within the last game day (0 to EXPENSIVE_IDS.length).
 * The guest's `thoughtCooldowns` is the record of the last tick each thought id was shown: `addThought`
 * (the only writer of guest thoughts) sets it every time it adds a thought, so the newest thought-list
 * entry of an id is never newer than its cooldown entry. An entry is deleted only once it is a game day
 * old, which is outside the one-day window: reading the cooldowns alone gives the same count as scanning the
 * thought list too, without touching every thought object (the rating runs at each hour start, master §10).
 */
function tooExpensiveToday(guest: Guest, tick: number): number {
  const ids = EXPENSIVE_IDS;
  const cd = guest.thoughtCooldowns;
  let count = 0;
  for (let k = 0; k < ids.length; k++) {
    const last = cd[ids[k] as string];
    if (last !== undefined && last <= tick && tick - last < FAIR_WINDOW) count++;
  }
  return count;
}

/** Guest totals for H, P, V and L, gathered in one pass over the guests (no allocations). */
interface GuestTotals {
  happiness: number;
  tooExpensive: number;
  lost: number;
  chill: number;
  family: number;
  thrill: number;
}

const totals: GuestTotals = { happiness: 0, tooExpensive: 0, lost: 0, chill: 0, family: 0, thrill: 0 };

function guestTotals(world: World): GuestTotals {
  const { guests, tick } = world.state;
  let happiness = 0;
  let tooExpensive = 0;
  let lost = 0;
  let chill = 0;
  let family = 0;
  let thrill = 0;
  for (let i = 0; i < guests.length; i++) {
    const g = guests[i] as Guest;
    happiness += g.needs.happiness;
    tooExpensive += tooExpensiveToday(g, tick);
    if (isGuestLost(g)) lost++;
    const group = temperamentGroup(g.temperament);
    if (group === 'chill') chill++;
    else if (group === 'family') family++;
    else thrill++;
  }
  totals.happiness = happiness;
  totals.tooExpensive = tooExpensive;
  totals.lost = lost;
  totals.chill = chill;
  totals.family = family;
  totals.thrill = thrill;
  return totals;
}

function happinessScore(world: World, t: GuestTotals): number {
  const { guests, park } = world.state;
  const n = guests.length + park.recentLeavers.length;
  if (n === 0) return RATING_NO_GUESTS_SCORE;
  let sum = t.happiness;
  for (const h of park.recentLeavers) sum += h;
  return clamp01(sum / n / HAPPINESS_MAX);
}

function fairPriceScore(world: World, t: GuestTotals): number {
  const n = world.state.guests.length;
  if (n === 0) return RATING_NO_GUESTS_SCORE;
  return 1 - Math.min(1, (FAIR_PRICE_THOUGHT_FACTOR * t.tooExpensive) / n);
}

function share(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

function varietyScore(world: World, t: GuestTotals): number {
  const n = world.state.guests.length;
  let open = 0;
  let chill = 0;
  let family = 0;
  let thrill = 0;
  for (const r of world.state.rides) {
    if (r.status !== 'open') continue;
    open++;
    const tag = rideTag(world, r);
    if (tag === 'chill') chill++;
    else if (tag === 'family') family++;
    else if (tag === 'thrill') thrill++;
  }
  // Σ |guestShare − rideShare| in the group order chill, family, thrill.
  let diff = 0;
  diff += Math.abs(share(t.chill, n) - share(chill, open));
  diff += Math.abs(share(t.family, n) - share(family, open));
  diff += Math.abs(share(t.thrill, n) - share(thrill, open));
  return clamp01((1 - 0.5 * diff) * Math.min(1, open / VARIETY_FULL_RIDES));
}

function lostGuestScore(world: World, t: GuestTotals): number {
  const n = world.state.guests.length;
  if (n === 0) return RATING_NO_GUESTS_SCORE;
  return 1 - Math.min(1, (LOST_GUEST_FACTOR * t.lost) / n);
}

function queueScore(world: World): number {
  let open = 0;
  let sum = 0;
  for (const r of world.state.rides) {
    if (r.status !== 'open') continue;
    open++;
    sum += r.queue.length / (QUEUE_CAPACITY_FACTOR * rideCapacity(world, r));
  }
  if (open === 0) return 0;
  return 1 - Math.min(1, sum / open);
}

/** The 7 sub-scores (0–1) for the rating and its tooltip. */
export function ratingParts(world: World): RatingParts {
  const t = guestTotals(world);
  return {
    happiness: happinessScore(world, t),
    cleanliness: clamp01(cleanliness(world)),
    reliability: clamp01(reliabilityScore(world)),
    fairPrices: fairPriceScore(world, t),
    variety: varietyScore(world, t),
    lostGuests: lostGuestScore(world, t),
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
