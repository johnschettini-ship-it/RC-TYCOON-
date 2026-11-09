/**
 * Ride score (Phase 1 §4.3). Owner: W1-D.
 * Ratings are integer hundredths; money is cents. The score itself is on the spec's scale
 * (excitement 0–10, dollars), so tuning numbers match the spec table.
 */
import { getFlatRideDef, getTrackRideDef } from '../../data/catalog';
import type { RideTag } from '../../data/catalog/types';
import {
  NAUSEA_REJECT,
  QUEUE_MAX_JOIN,
  RIDE_NAUSEA_REJECT,
  RIDE_PRICE_REJECT_FACTOR,
  RIDE_VALUE_CENTS_PER_EXCITEMENT,
  SCORE_BORING,
  SCORE_DISTANCE_PER_TILE,
  SCORE_EXCITEMENT,
  SCORE_PRICE_PER_DOLLAR,
  SCORE_REPEAT,
  SCORE_TAG_FIT,
} from '../../data/tuning/guests';
import type { Ride } from '../rides/types';
import type { World } from '../types';
import type { Cents } from '../units';
import { maxIntensity, minIntensity, tagFit } from './temperament';
import { THOUGHT, type ThoughtId } from './thoughts';
import type { Guest } from './types';

export interface RideReject {
  reject: true;
  /** Thought the guest gets, or null for a silent reject. */
  thought: ThoughtId | null;
}

export function isRideReject(v: number | RideReject): v is RideReject {
  return typeof v === 'object';
}

/** Ride tag from the catalog (flat or track type). Null for unknown ids. */
export function rideTag(world: World, ride: Ride): RideTag | null {
  if (ride.kind === 'flat') return getFlatRideDef(ride.defId)?.tag ?? null;
  const typeId = world.state.track.rides[String(ride.id)]?.typeId ?? ride.defId;
  return getTrackRideDef(typeId)?.tag ?? getTrackRideDef(ride.defId)?.tag ?? null;
}

/** Ride value for price checks: excitement × $1.00 × modifiers.priceTolerance (master R7, R14). */
export function rideValue(world: World, ride: Ride): Cents {
  const exc = ride.stats?.excitement ?? 0;
  return ((exc * RIDE_VALUE_CENTS_PER_EXCITEMENT) / 100) * world.state.modifiers.priceTolerance;
}

const SILENT: RideReject = { reject: true, thought: null };

/**
 * Score of `ride` for `guest` at path `distance` (tiles), or a hard reject.
 * `noise` is the caller's uniform [−0.5, 0.5] draw; hook terms are added by the caller.
 */
export function scoreRide(world: World, guest: Guest, ride: Ride, distance: number, noise = 0): number | RideReject {
  const stats = ride.stats;
  if (!stats) return SILENT;
  const t = guest.temperament;
  if (stats.intensity > maxIntensity(t)) return { reject: true, thought: THOUGHT.tooIntense };
  const value = rideValue(world, ride);
  if (ride.price > value * RIDE_PRICE_REJECT_FACTOR) return { reject: true, thought: THOUGHT.rideTooExpensive };
  if (ride.queue.length >= QUEUE_MAX_JOIN) return { reject: true, thought: THOUGHT.queueTooLong };
  if (guest.needs.nausea >= NAUSEA_REJECT && stats.nausea >= RIDE_NAUSEA_REJECT) return SILENT;

  const tag = rideTag(world, ride);
  const minI = minIntensity(t);
  let score = SCORE_EXCITEMENT * (stats.excitement / 100);
  if (tag) score += SCORE_TAG_FIT * tagFit(t, tag);
  if (stats.intensity < minI) score -= SCORE_BORING * ((minI - stats.intensity) / 100);
  score -= SCORE_PRICE_PER_DOLLAR * (Math.max(0, ride.price - value) / 100);
  score -= SCORE_DISTANCE_PER_TILE * distance;
  score -= SCORE_REPEAT * (guest.ridden[String(ride.id)] ?? 0);
  return score + noise;
}
