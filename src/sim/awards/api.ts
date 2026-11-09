/**
 * Award effects read by the arrival formula and the park rating (Phase 5 §4.10). Owner: W3-I.
 * Each active award: positive → arrivals × 1.10 and rating +20; negative → × 0.90 and −20; totals clamped to
 * 0.70–1.30 and −60 to +60. Neutral in the tutorial and in a sandbox with Awards off.
 */
import {
  AWARD_ARRIVALS_CLAMP,
  AWARD_ARRIVALS_NEGATIVE,
  AWARD_ARRIVALS_POSITIVE,
  AWARD_RATING_CLAMP,
  AWARD_RATING_NEGATIVE,
  AWARD_RATING_POSITIVE,
} from '../../data/tuning/awards';
import type { World } from '../types';
import { isPositiveAward, type AwardId } from './types';

/** Awards are won and applied: every park kind but the tutorial, and a sandbox only with its Awards option on. */
export function awardsEnabled(world: World): boolean {
  const s = world.state.scenario;
  if (s.kind === 'tutorial') return false;
  if (s.kind === 'sandbox') return s.options.awards;
  return true;
}

function activeAwards(world: World): readonly AwardId[] {
  const s = world.state.scenario;
  return s.kind === 'tutorial' || !awardsEnabled(world) ? [] : s.awards.active;
}

const clamp = (v: number, [lo, hi]: readonly [number, number]): number => Math.min(hi, Math.max(lo, v));

/** Product of the active awards' arrival factors, clamped to 0.70–1.30. */
export function awardArrivalFactor(world: World): number {
  const active = activeAwards(world);
  if (active.length === 0) return 1;
  let f = 1;
  for (const id of active) f *= isPositiveAward(id) ? AWARD_ARRIVALS_POSITIVE : AWARD_ARRIVALS_NEGATIVE;
  return clamp(f, AWARD_ARRIVALS_CLAMP);
}

/** Sum of the active awards' rating terms, clamped to −60 to +60. */
export function awardRatingBonus(world: World): number {
  let sum = 0;
  for (const id of activeAwards(world)) sum += isPositiveAward(id) ? AWARD_RATING_POSITIVE : AWARD_RATING_NEGATIVE;
  return clamp(sum, AWARD_RATING_CLAMP);
}
