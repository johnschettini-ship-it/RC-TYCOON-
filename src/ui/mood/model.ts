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

/** Frost is sad while Chill is the under-served group, Spark while Thrill is; otherwise both are happy. */
export function faceMoods(group: Group | null): { frost: 'happy' | 'sad'; spark: 'happy' | 'sad' } {
  return { frost: group === 'chill' ? 'sad' : 'happy', spark: group === 'thrill' ? 'sad' : 'happy' };
}

/** A segment shows its percentage as text from this width on, and the text needs this much room (CSS px). */
export const SEG_LABEL_PX = 44;
/** Half the knot width (6 px) and 2 px of air on each side (CSS px). */
const KNOT_CLEAR_PX = 5;

/**
 * Where the percentage of a segment shows, on a track `trackPx` wide: in the middle of the segment, or, when the knot
 * would cover it there, in the larger part of the segment beside the knot (`padStart` / `padEnd` shrink the room the
 * text centres in; a tie goes to the start). Hidden when the segment is empty or under `SEG_LABEL_PX`, or when no part
 * beside the knot is `SEG_LABEL_PX` wide.
 */
export function segmentLabel(p: SharePercents, group: Group, trackPx: number): { show: boolean; padStart: number; padEnd: number } {
  const hidden = { show: false, padStart: 0, padEnd: 0 };
  const before = group === 'chill' ? 0 : group === 'family' ? p.chill : p.chill + p.family;
  const a = (before * trackPx) / 100;
  const b = ((before + p[group]) * trackPx) / 100;
  if (p[group] <= 0 || b - a < SEG_LABEL_PX) return hidden;
  const k = (knotPercent(p) * trackPx) / 100;
  const mid = (a + b) / 2;
  if (k + KNOT_CLEAR_PX <= mid - SEG_LABEL_PX / 2 || k - KNOT_CLEAR_PX >= mid + SEG_LABEL_PX / 2) return { show: true, padStart: 0, padEnd: 0 };
  const left = k - KNOT_CLEAR_PX - a;
  const right = b - (k + KNOT_CLEAR_PX);
  if (left >= right && left >= SEG_LABEL_PX) return { show: true, padStart: 0, padEnd: b - (k - KNOT_CLEAR_PX) };
  if (right >= SEG_LABEL_PX) return { show: true, padStart: k + KNOT_CLEAR_PX - a, padEnd: 0 };
  return hidden;
}

/** The face and counter of the phone's mood circle (Task 21): the group that leads now and its share. */
export interface LeadFace {
  /** Frost for Chill, Spark for Thrill; for Family the mascot the face rule makes sad, or both when neither is. */
  who: 'frost' | 'spark' | 'both';
  mood: 'happy' | 'sad';
  /** The leading group (ties go Chill, Family, Thrill); null with no guests. */
  group: Group | null;
  /** The leading group's share in percent (0 with no guests). */
  share: number;
}

export function leadFace(p: SharePercents, totalGuests: number, moods: { frost: 'happy' | 'sad'; spark: 'happy' | 'sad' }): LeadFace {
  if (totalGuests <= 0) return { who: 'both', mood: 'happy', group: null, share: 0 };
  let group: Group = 'chill';
  for (const g of ['family', 'thrill'] as const) if (p[g] > p[group]) group = g;
  const share = p[group];
  if (group === 'chill') return { who: 'frost', mood: moods.frost, group, share };
  if (group === 'thrill') return { who: 'spark', mood: moods.spark, group, share };
  if (moods.frost === 'sad') return { who: 'frost', mood: 'sad', group, share };
  if (moods.spark === 'sad') return { who: 'spark', mood: 'sad', group, share };
  return { who: 'both', mood: 'happy', group, share };
}
