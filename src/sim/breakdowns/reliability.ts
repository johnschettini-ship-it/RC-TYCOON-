/**
 * Owner: W1-H. Reliability formulas (Phase 3 §4.5). Reliability is integer hundredths (0–10,000).
 * Age counts whole years from placement (`builtTick`).
 */
import { MONTHS_PER_YEAR, TICKS_PER_MONTH } from '../../data/tuning/core';
import {
  AGE_FACTOR_MAX,
  AGE_FACTOR_PER_YEAR,
  BREAK_BASE,
  BREAK_SCALE,
  BREAKDOWNS,
  type BreakdownDef,
  type BreakdownKind,
  REL_CAP_LOSS_PER_YEAR,
  REL_CAP_MIN,
  REL_MAX,
  WEAR_PER_CYCLE,
} from '../../data/tuning/staff';
import { rngInt, type RngHolder } from '../rng';

const TICKS_PER_YEAR = TICKS_PER_MONTH * MONTHS_PER_YEAR;

export function rideAgeYears(builtTick: number, now: number): number {
  return Math.max(0, Math.floor((now - builtTick) / TICKS_PER_YEAR));
}

/** cap = max(REL_CAP_MIN, 100 − REL_CAP_LOSS_PER_YEAR × ageYears), in hundredths. */
export function reliabilityCap(ageYears: number): number {
  return Math.max(REL_CAP_MIN, REL_MAX - REL_CAP_LOSS_PER_YEAR * ageYears);
}

export function ageFactor(ageYears: number): number {
  return Math.min(AGE_FACTOR_MAX, 1 + AGE_FACTOR_PER_YEAR * ageYears);
}

/** Wear per cycle or dispatch, in hundredths. */
export function wearAmount(ageYears: number): number {
  return Math.round(WEAR_PER_CYCLE * ageFactor(ageYears));
}

export function wornReliability(r: number, ageYears: number): number {
  return Math.max(0, r - wearAmount(ageYears));
}

/** p = BREAK_BASE + BREAK_SCALE × ((100 − R) / 100)², before `modifiers.breakdownChance`. */
export function breakdownChance(r: number): number {
  const loss = (REL_MAX - Math.min(REL_MAX, Math.max(0, r))) / REL_MAX;
  return BREAK_BASE + BREAK_SCALE * loss * loss;
}

/** Inspection: R += max(1, 0.5 × (cap − R)), clamped to cap. */
export function inspectedReliability(r: number, ageYears: number): number {
  const cap = reliabilityCap(ageYears);
  const gain = Math.max(100, Math.round(0.5 * (cap - r)));
  return Math.min(cap, r + gain);
}

/** Fix: R += 0.25 × (cap − R), clamped to cap. */
export function fixedReliability(r: number, ageYears: number): number {
  const cap = reliabilityCap(ageYears);
  return Math.min(cap, r + Math.round(0.25 * (cap - r)));
}

export function breakdownTypesFor(kind: 'flat' | 'track'): BreakdownDef[] {
  return BREAKDOWNS.filter((b) => b.appliesTo === 'all' || b.appliesTo === kind);
}

/** Weighted draw from the §4.5 table for this ride kind (one RNG draw). */
export function pickBreakdownType(rng: RngHolder, kind: 'flat' | 'track'): BreakdownKind {
  const defs = breakdownTypesFor(kind);
  const total = defs.reduce((sum, d) => sum + d.weight, 0);
  let roll = rngInt(rng, 0, total - 1);
  for (const d of defs) {
    if (roll < d.weight) return d.id;
    roll -= d.weight;
  }
  return (defs[defs.length - 1] as BreakdownDef).id;
}

export function fixFactor(type: string | null): number {
  const def = BREAKDOWNS.find((b) => b.id === type);
  return def ? def.fixFactor : 1;
}
