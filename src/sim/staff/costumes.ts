/**
 * Owner: W1-H. Costume matches (Phase 3 §4.2, master R6). Frost: Chill (T ≤ 35). Spark: Thrill (T ≥ 65).
 * Boo has no match in Phase 3 (Phase 4 adds night and spooky rides).
 */
import { COSTUMES } from '../../data/catalog/people';
import type { Costume } from '../../data/catalog/types';
import { PERFORMER_HAPPY, PERFORMER_HAPPY_MATCH } from '../../data/tuning/staff';

export function costumeMatches(costume: Costume | null, temperament: number): boolean {
  if (costume === null) return false;
  const def = COSTUMES.find((c) => c.id === costume);
  if (!def || def.temperament === null) return false;
  return temperament >= def.temperament.min && temperament <= def.temperament.max;
}

export function performerBonus(costume: Costume | null, temperament: number): number {
  return costumeMatches(costume, temperament) ? PERFORMER_HAPPY_MATCH : PERFORMER_HAPPY;
}
