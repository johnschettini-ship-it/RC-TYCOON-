/**
 * Owner: W1-H. Costume matches (Phase 3 §4.2, master R6). A costume with a temperament range matches the guests in it
 * (the Frost and Spark costumes were; both were removed with the mascots, Task 24). Boo (Phase 4 §4.7): matches every guest when `booActive` (night with After Dark on, or within 6 tiles of a spooky
 * ride; the caller asks `booBonusActive` in `lighting/api.ts`, W3-F).
 */
import { COSTUMES } from '../../data/catalog/people';
import type { Costume } from '../../data/catalog/types';
import { PERFORMER_HAPPY, PERFORMER_HAPPY_MATCH } from '../../data/tuning/staff';

export function costumeMatches(costume: Costume | null, temperament: number, booActive = false): boolean {
  if (costume === null) return false;
  if (costume === 'boo') return booActive;
  const def = COSTUMES.find((c) => c.id === costume);
  if (!def || def.temperament === null) return false;
  return temperament >= def.temperament.min && temperament <= def.temperament.max;
}

export function performerBonus(costume: Costume | null, temperament: number, booActive = false): number {
  return costumeMatches(costume, temperament, booActive) ? PERFORMER_HAPPY_MATCH : PERFORMER_HAPPY;
}
