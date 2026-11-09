/**
 * Needs over time (Phase 1 §4.3 needs table). Owner: W1-D.
 * Each guest steps once per NEED_INTERVAL ticks, phased by id so the work spreads over ticks.
 * Fractional rates (energy drain, happiness decay modifier) are dithered: over k steps the total
 * is floor(k × rate), so long-run rates are exact without extra state.
 */
import {
  BLADDER_RATE,
  ENERGY_RATE,
  HAPPY_LOSS_UNCOMFORTABLE,
  HAPPY_LOSS_URGENT,
  HUNGER_RATE,
  NAUSEA_RECOVERY,
  NAUSEA_UNCOMFORTABLE,
  NAUSEA_URGENT,
  NEED_INTERVAL,
  NEED_MAX,
  NEED_UNCOMFORTABLE,
  NEED_URGENT,
  THIRST_RATE,
} from '../../data/tuning/guests';
import type { World } from '../types';
import { energyDrainMultiplier } from './temperament';
import type { Guest, Needs } from './types';

export function clampNeed(v: number): number {
  return v < 0 ? 0 : v > NEED_MAX ? NEED_MAX : v;
}

/** Add `delta` to a need and clamp to 0–255. */
export function changeNeed(guest: Guest, key: keyof Needs, delta: number): void {
  guest.needs[key] = clampNeed(guest.needs[key] + delta);
}

/** Integer amount for step `k` of a fractional per-step `rate` (≥ 0). */
export function ditherStep(rate: number, k: number): number {
  const eps = 1e-9;
  return Math.floor((k + 1) * rate + eps) - Math.floor(k * rate + eps);
}

/** Step index of this guest's need clock, or −1 when this tick is not a step. */
export function needStepIndex(tick: number, guestId: number): number {
  const p = tick + guestId;
  return p % NEED_INTERVAL === 0 ? p / NEED_INTERVAL : -1;
}

/** Happiness loss per step from needs at or above their thresholds. */
export function needDiscomfort(n: Needs): number {
  let loss = 0;
  for (const v of [n.hunger, n.thirst, n.bladder]) {
    if (v >= NEED_URGENT) loss += HAPPY_LOSS_URGENT;
    else if (v >= NEED_UNCOMFORTABLE) loss += HAPPY_LOSS_UNCOMFORTABLE;
  }
  if (n.nausea >= NAUSEA_URGENT) loss += HAPPY_LOSS_URGENT;
  else if (n.nausea >= NAUSEA_UNCOMFORTABLE) loss += HAPPY_LOSS_UNCOMFORTABLE;
  return loss;
}

/** Call every tick. Applies one need step when this guest's need clock ticks. */
export function updateNeeds(world: World, guest: Guest): void {
  const k = needStepIndex(world.state.tick, guest.id);
  if (k < 0) return;
  const n = guest.needs;
  n.hunger = clampNeed(n.hunger + HUNGER_RATE);
  n.thirst = clampNeed(n.thirst + THIRST_RATE);
  n.bladder = clampNeed(n.bladder + BLADDER_RATE);
  n.energy = clampNeed(n.energy - ditherStep(ENERGY_RATE * energyDrainMultiplier(guest.temperament), k));
  n.nausea = clampNeed(n.nausea - NAUSEA_RECOVERY);
  const loss = needDiscomfort(n);
  if (loss > 0) n.happiness = clampNeed(n.happiness - ditherStep(loss * world.state.modifiers.happinessDecay, k));
}
