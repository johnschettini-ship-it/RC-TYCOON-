/** Mood model (Phase 7 §4.3). Pure: no DOM. */
import { LEAN_BALANCE_POINTS } from '../../data/tuning/interface';

export type Group = 'chill' | 'family' | 'thrill';
/** The output of `sharePercents` in `src/ui/format.ts`. */
export type SharePercents = Record<Group, number>;
export type LeanTextId = 'ui.mood.none' | 'ui.mood.thrill' | 'ui.mood.chill' | 'ui.mood.balance';

/** Thrill share minus Chill share, from -100 to 100. */
export function lean(p: SharePercents): number {
  return p.thrill - p.chill;
}

/** Knot position along the bar, 0 to 100; 50 is balance. */
export function knotPercent(p: SharePercents): number {
  return Math.round(50 + lean(p) / 2);
}

export function leanTextId(p: SharePercents, totalGuests: number): LeanTextId {
  if (totalGuests <= 0) return 'ui.mood.none';
  const l = lean(p);
  if (l >= LEAN_BALANCE_POINTS) return 'ui.mood.thrill';
  if (l <= -LEAN_BALANCE_POINTS) return 'ui.mood.chill';
  return 'ui.mood.balance';
}
