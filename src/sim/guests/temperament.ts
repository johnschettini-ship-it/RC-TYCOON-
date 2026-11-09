/**
 * Temperament and derived values (Phase 1 §4.3 table). Owner: W1-D.
 * Intensities are integer hundredths so comparisons with ride stats are exact.
 */
import type { RideTag } from '../../data/catalog/types';
import {
  ENERGY_MULT_BASE,
  ENERGY_MULT_DIV,
  MAX_INTENSITY_BASE,
  MAX_INTENSITY_PER_T,
  MIN_INTENSITY_PER_T,
  NAUSEA_MULT_BASE,
  TAG_FIT_FAMILY,
} from '../../data/tuning/guests';
import { rngNext, type RngHolder } from '../rng';

/** T = round of the mean of two uniform draws in [0, 100] (a triangle centred on 50). */
export function drawTemperament(rng: RngHolder): number {
  const a = rngNext(rng) * 100;
  const b = rngNext(rng) * 100;
  return Math.round((a + b) / 2);
}

/** Max intensity in hundredths: 2.0 + 0.08 × T. */
export function maxIntensity(t: number): number {
  return Math.round(MAX_INTENSITY_BASE * 100 + MAX_INTENSITY_PER_T * 100 * t);
}

/** Min intensity in hundredths (below = boring): 0.05 × T. */
export function minIntensity(t: number): number {
  return Math.round(MIN_INTENSITY_PER_T * 100 * t);
}

export function nauseaGainMultiplier(t: number): number {
  return NAUSEA_MULT_BASE - t / 100;
}

export function energyDrainMultiplier(t: number): number {
  return ENERGY_MULT_BASE + t / ENERGY_MULT_DIV;
}

export function tagFit(t: number, tag: RideTag): number {
  if (tag === 'thrill') return (t - 50) / 50;
  if (tag === 'chill') return (50 - t) / 50;
  return TAG_FIT_FAMILY;
}
