/** After Dark formulas (Phase 4 §4.7, §8). Owner: W3-F. Pure. */
import { SPOOKY_ITEM_BONUS, SPOOKY_ITEM_BONUS_CAP, SPOOKY_NIGHT_MULT } from '../../data/tuning/night';

/** Night arrivals: Phase 1 arrival curve × `(0.5 + 0.5 × litShare)`. */
export function nightArrivalFactorFor(litShare: number): number {
  return 0.5 + 0.5 * litShare;
}

/**
 * Spooky ride choice score at night: × 1.3, plus 2% per spooky scenery item within 6 tiles of the ride, at most
 * +20% (so the factor runs from 1.3 to 1.5).
 */
export function spookyScoreFactorFor(spookyItems: number): number {
  return SPOOKY_NIGHT_MULT + Math.min(SPOOKY_ITEM_BONUS_CAP, SPOOKY_ITEM_BONUS * Math.max(0, spookyItems));
}
