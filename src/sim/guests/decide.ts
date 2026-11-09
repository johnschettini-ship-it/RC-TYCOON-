/**
 * Guest decisions (Phase 1 §4.3 Decisions, Leaving; §4.2 lost guests). Owner: W1-D.
 * Runs for walking guests every GUEST_DECISION_INTERVAL ticks and at once after arriving or re-planning.
 */
import { getStallDef } from '../../data/catalog';
import type { StallKind } from '../../data/catalog/types';
import {
  ENERGY_GO_HOME,
  GREAT_PARK_HAPPINESS,
  HAPPINESS_GO_HOME,
  LOST_EXIT_TICKS,
  NAUSEA_UNCOMFORTABLE,
  NEED_UNCOMFORTABLE,
  NO_RIDE_STREAK_LEAVE,
  SCORE_NOISE,
} from '../../data/tuning/guests';
import { guestHooks } from '../hooks';
import { distanceTo } from '../pathing';
import type { Ride } from '../rides/types';
import { rngNext } from '../rng';
import type { Stall } from '../stalls/types';
import type { World } from '../types';
import type { Cents } from '../units';
import { stallPriceReject } from './buying';
import { isRideReject, scoreRide } from './scoring';
import { rideChoosable, rideDest, setState, stallDest } from './state';
import { THOUGHT, addThought } from './thoughts';
import type { Guest } from './types';

const NEED_STALLS: readonly { need: 'hunger' | 'thirst' | 'bladder'; kind: StallKind; thought: string }[] = [
  { need: 'hunger', kind: 'food', thought: THOUGHT.hungry },
  { need: 'thirst', kind: 'drink', thought: THOUGHT.thirsty },
  { need: 'bladder', kind: 'toilet', thought: THOUGHT.needRestroom },
];

/** Cheapest price among open rides and open stalls, or null when nothing is open. */
export function cheapestOpenPrice(world: World): Cents | null {
  let min: Cents | null = null;
  for (const r of world.state.rides) if (rideChoosable(r) && (min === null || r.price < min)) min = r.price;
  for (const s of world.state.stalls) if (s.open && (min === null || s.price < min)) min = s.price;
  return min;
}

/** Product of the stallWant hooks (weather factors). */
function stallWant(world: World, guest: Guest, stall: Stall): number {
  let f = 1;
  for (const hook of guestHooks.stallWant) f *= hook(world, guest, stall);
  return f;
}

/**
 * Nearest reachable open stall of `kind` the guest will pay for. Distance is divided by the stallWant
 * factor (Phase 3 §4.9). Ties go to the lower id. Rejected prices give their thought.
 */
export function nearestStall(world: World, guest: Guest, kind: StallKind): Stall | null {
  let best: Stall | null = null;
  let bestCost = Infinity;
  for (const stall of world.state.stalls) {
    if (!stall.open || stall.serviceTile < 0) continue;
    const def = getStallDef(stall.defId);
    if (!def || def.kind !== kind) continue;
    const d = distanceTo(world, guest.tile, stallDest(stall.id));
    if (d === null) continue;
    const reject = stallPriceReject(world, stall, def);
    if (reject !== undefined) {
      if (reject) addThought(world, guest, reject);
      continue;
    }
    if (guest.cash < stall.price) {
      addThought(world, guest, THOUGHT.needCash);
      continue;
    }
    const want = stallWant(world, guest, stall);
    if (!(want > 0)) continue;
    const cost = d / want;
    if (cost < bestCost) {
      best = stall;
      bestCost = cost;
    }
  }
  return best;
}

/** Most pressing need at or above uncomfortable with a reachable stall, else null. */
export function chooseNeedStall(world: World, guest: Guest): Stall | null {
  const pressing = NEED_STALLS.filter((n) => guest.needs[n.need] >= NEED_UNCOMFORTABLE).sort(
    (a, b) => guest.needs[b.need] - guest.needs[a.need],
  );
  for (const n of pressing) {
    const stall = nearestStall(world, guest, n.kind);
    if (stall) return stall;
  }
  return null;
}

/** Best open, reachable ride with a score above 0 (Phase 1 §4.3 Ride score), else null. */
export function chooseRide(world: World, guest: Guest): Ride | null {
  let best: Ride | null = null;
  let bestScore = 0;
  for (const ride of world.state.rides) {
    if (!rideChoosable(ride) || ride.price > guest.cash) continue;
    const d = distanceTo(world, guest.tile, rideDest(ride.id));
    if (d === null) continue;
    const base = scoreRide(world, guest, ride, d);
    if (isRideReject(base)) {
      if (base.thought) addThought(world, guest, base.thought);
      continue;
    }
    let score = base + (rngNext(world.state) - 0.5) * 2 * SCORE_NOISE;
    for (const hook of guestHooks.rideScore) score += hook(world, guest, ride);
    if (score > bestScore) {
      best = ride;
      bestScore = score;
    }
  }
  return best;
}

/** Start walking to the park entrance and leave. */
export function startLeaving(world: World, guest: Guest): void {
  setState(guest, 'leaving');
  guest.target = 'exit';
  guest.activityId = -1;
  guest.lostSinceTick = -1;
  addThought(world, guest, THOUGHT.goHome);
  if (guest.needs.happiness >= GREAT_PARK_HAPPINESS) addThought(world, guest, THOUGHT.greatPark);
}

/** The guest has no route: wander and think "I am lost". */
export function becomeLost(world: World, guest: Guest): void {
  if (guest.lostSinceTick < 0) guest.lostSinceTick = world.state.tick;
  addThought(world, guest, THOUGHT.lost);
}

function needThoughts(world: World, guest: Guest): void {
  for (const n of NEED_STALLS) if (guest.needs[n.need] >= NEED_UNCOMFORTABLE) addThought(world, guest, n.thought);
  if (guest.needs.nausea >= NAUSEA_UNCOMFORTABLE) addThought(world, guest, THOUGHT.sick);
}

/** Leave rule 3 except the no-ride streak: happiness ≤ 60, energy ≤ 50, cash below the cheapest open price. */
function wantsToGoHome(world: World, guest: Guest): boolean {
  if (guest.needs.happiness <= HAPPINESS_GO_HOME) return true;
  if (guest.needs.energy <= ENERGY_GO_HOME) {
    addThought(world, guest, THOUGHT.tired);
    return true;
  }
  const cheapest = cheapestOpenPrice(world);
  return cheapest !== null && guest.cash < cheapest;
}

/** One decision. Hooks first; a hook that returns true takes the decision. */
export function decide(world: World, guest: Guest): void {
  for (const hook of guestHooks.beforeDecision) if (hook(world, guest)) return;
  if (guest.state !== 'walking') return;
  needThoughts(world, guest);
  if (guest.target !== null) return;

  if (wantsToGoHome(world, guest)) {
    startLeaving(world, guest);
    return;
  }

  const lost = guest.lostSinceTick >= 0;
  if (lost && world.state.tick - guest.lostSinceTick >= LOST_EXIT_TICKS && distanceTo(world, guest.tile, 'exit') !== null) {
    startLeaving(world, guest);
    return;
  }

  const stall = chooseNeedStall(world, guest);
  if (stall) {
    guest.target = stallDest(stall.id);
    guest.lostSinceTick = -1;
    return;
  }

  const ride = chooseRide(world, guest);
  if (ride) {
    guest.target = rideDest(ride.id);
    guest.noRideStreak = 0;
    guest.lostSinceTick = -1;
    return;
  }

  if (lost) {
    addThought(world, guest, THOUGHT.lost);
    return;
  }
  if (distanceTo(world, guest.tile, 'exit') === null) {
    // On a path island: nothing to reach and no way out.
    becomeLost(world, guest);
    return;
  }
  guest.noRideStreak += 1;
  if (guest.noRideStreak >= NO_RIDE_STREAK_LEAVE) startLeaving(world, guest);
}
