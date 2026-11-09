/**
 * Calm and Buzz effects on guests (Phase 4 §4.6 effects table), as pure functions of the tile values and the
 * temperament. Owner: W3-E.
 *
 * `t` = temperament 0–100, `c = (100 − t) / 100` (chill share), `h = t / 100` (thrill share), `C = calm / 255`,
 * `B = buzz / 255`. Energy, nausea, and happiness scale smoothly with `t` (master R6 allows that); the walking speed
 * rows use the master R6 groups (Chill: t ≤ 35, Thrill: t ≥ 65). Happiness is integer math, rounded half up.
 */
import { temperamentGroup } from '../../data/catalog';
import {
  BUZZ_CHILL_UNHAPPY,
  BUZZ_THRILL_HAPPY,
  BUZZ_WALK_FAST,
  CALM_CHILL_HAPPY,
  CALM_ENERGY_CUT,
  CALM_NAUSEA_CHILL_WEIGHT,
  CALM_WALK_SLOW,
  FIELD_MAX,
} from '../../data/tuning/fields';

const T_MAX = 100;
/** Denominator of `C × c` (and `B × c`, `B × h`) in integer form: 255 × 100. */
const SHARE_DEN = FIELD_MAX * T_MAX;

/** `round(num / den)` for num ≥ 0, den > 0, halves up, in exact integer math. */
export function roundDiv(num: number, den: number): number {
  return Math.floor((2 * num + den) / (2 * den));
}

/** Energy loss factor: `1 − 0.6 × C × c`. Exactly 1 with no Calm. */
export function energyFactorOf(calm: number, t: number): number {
  if (calm === 0) return 1;
  return 1 - (CALM_ENERGY_CUT * calm * (T_MAX - t)) / SHARE_DEN;
}

/** Nausea recovery factor: `1 + C × (1 + 2c)`. Exactly 1 with no Calm. */
export function nauseaRecoveryFactorOf(calm: number, t: number): number {
  if (calm === 0) return 1;
  return 1 + (calm / FIELD_MAX) * (1 + (CALM_NAUSEA_CHILL_WEIGHT * (T_MAX - t)) / T_MAX);
}

/** Happiness per game hour: `round(6 × C × c) − round(3 × B × c) + round(6 × B × h)`. */
export function happinessDeltaOf(calm: number, buzz: number, t: number): number {
  const chill = T_MAX - t;
  return (
    roundDiv(CALM_CHILL_HAPPY * calm * chill, SHARE_DEN) -
    roundDiv(BUZZ_CHILL_UNHAPPY * buzz * chill, SHARE_DEN) +
    roundDiv(BUZZ_THRILL_HAPPY * buzz * t, SHARE_DEN)
  );
}

/**
 * Walking speed factor: Chill × `(1 − 0.15 × C × c)`; Thrill walking to a `thrill` ride × `(1 + 0.25 × B × h)`;
 * otherwise 1.
 */
export function walkFactorOf(calm: number, buzz: number, t: number, toThrillRide: boolean): number {
  const group = temperamentGroup(t);
  if (group === 'chill') return calm === 0 ? 1 : 1 - (CALM_WALK_SLOW * calm * (T_MAX - t)) / SHARE_DEN;
  if (group === 'thrill' && toThrillRide && buzz !== 0) return 1 + (BUZZ_WALK_FAST * buzz * t) / SHARE_DEN;
  return 1;
}

/** Atmosphere term of one guest in integer form: `255 × 100 × (c × C + h × B)` = `(100 − t) × calm + t × buzz`. */
export function atmosphereUnits(calm: number, buzz: number, t: number): number {
  return (T_MAX - t) * calm + t * buzz;
}

/** Units of `atmosphereUnits` per 1.0 of `c × C + h × B`. */
export const ATMOSPHERE_UNIT = SHARE_DEN;
