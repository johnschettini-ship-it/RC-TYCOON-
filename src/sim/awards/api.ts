/**
 * Award effects read by the arrival formula and the park rating (Phase 5 §4.10). Owner: W3-I.
 * Each active award: positive → arrivals × 1.10 and rating +20; negative → × 0.90 and −20; totals clamped to
 * 0.70–1.30 and −60 to +60.
 */
import type { World } from '../types';

/** Product of the active awards' arrival factors, clamped. Stub: 1. */
export function awardArrivalFactor(_world: World): number {
  return 1;
}

/** Sum of the active awards' rating terms, clamped. Stub: 0. */
export function awardRatingBonus(_world: World): number {
  return 0;
}
