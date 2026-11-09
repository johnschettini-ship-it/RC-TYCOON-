/**
 * Owner: W1-D. Spawn guests at the park entrance using `arrivalsPerHour` (W1-E).
 * Phase 1 §4.3 Spawn and entry, §4.6 (spawn side): every tick while the park is open,
 * `park.arrivalCarry` (thousandths of a guest) grows by arrivalsPerHour × 1000 / 50; one guest per 1000.
 * The fee comes from `effectiveEntranceFee` and temperament from `arrivalTemperament` (W1-I campaigns).
 */
import { TICKS_PER_HOUR } from '../../data/tuning/core';
import {
  ARRIVAL_CARRY_UNIT,
  FEE_FACTOR_MAX,
  FEE_FACTOR_MIN,
  FEE_TOLERANCE_BASE,
  FEE_TOLERANCE_PER_RIDE,
  GUEST_LANES,
  START_BLADDER,
  START_CASH,
  START_ENERGY,
  START_HAPPINESS,
  START_HUNGER,
  START_NAUSEA,
  START_THIRST,
} from '../../data/tuning/guests';
import { recordLedger } from '../economy/ledger';
import { emit } from '../events';
import { allocId } from '../ids';
import { arrivalTemperament, effectiveEntranceFee } from '../marketing/campaigns';
import { arrivalsPerHour } from '../park/arrivals';
import { rngInt, rngNext } from '../rng';
import type { World } from '../types';
import type { Cents } from '../units';
import { drawTemperament } from './temperament';
import type { Guest } from './types';
import { isRideOperating } from '../park/rides';

/** Entrance fee tolerance before the random factor: $5 + $2.50 × open rides (cents). */
export function feeToleranceBase(world: World): Cents {
  let open = 0;
  for (const r of world.state.rides) if (isRideOperating(r)) open++;
  return FEE_TOLERANCE_BASE + FEE_TOLERANCE_PER_RIDE * open;
}

/**
 * One arriving guest. Returns the new guest, or null when the fee is above the guest's tolerance
 * (or the guest's cash) and the guest turns away ("turned away: too expensive").
 */
export function spawnGuest(world: World): Guest | null {
  const s = world.state;
  const map = s.map;
  const factor = FEE_FACTOR_MIN + rngNext(s) * (FEE_FACTOR_MAX - FEE_FACTOR_MIN);
  const tolerance = feeToleranceBase(world) * factor * s.modifiers.priceTolerance;
  const fee = effectiveEntranceFee(world);
  if (fee > tolerance) {
    s.park.turnedAway += 1;
    return null;
  }
  const temperament = arrivalTemperament(world, drawTemperament(s));
  const hunger = rngInt(s, START_HUNGER.min, START_HUNGER.max);
  const thirst = rngInt(s, START_THIRST.min, START_THIRST.max);
  const bladder = rngInt(s, START_BLADDER.min, START_BLADDER.max);
  const energy = rngInt(s, START_ENERGY.min, START_ENERGY.max);
  const cash = rngInt(s, START_CASH.min / 100, START_CASH.max / 100) * 100;
  if (cash < fee) {
    s.park.turnedAway += 1;
    return null;
  }
  const id = allocId(s);
  const guest: Guest = {
    id,
    tile: map.entranceTile,
    z: map.heights[map.entranceTile] as number,
    nextTile: -1,
    progress: 0,
    dir: 0,
    lane: id % GUEST_LANES,
    state: 'arriving',
    stateTicks: 0,
    target: null,
    cash: cash - fee,
    needs: { hunger, thirst, bladder, energy, happiness: START_HAPPINESS, nausea: START_NAUSEA },
    temperament,
    thoughts: [],
    thoughtCooldowns: {},
    ridden: {},
    spent: fee,
    items: { map: false, umbrella: false, balloon: false },
    nextDecisionTick: s.tick,
    lostSinceTick: -1,
    noRideStreak: 0,
    seat: null,
    activityId: -1,
    trashTimer: 0,
    withdrawals: 0,
    lostSteps: 0,
    bestDistance: -1,
    lostTarget: null,
    wetUntilTick: -1,
  };
  if (fee !== 0) recordLedger(world, 'entranceTickets', fee);
  s.guests.push(guest);
  s.park.guestsArrivedTotal += 1;
  return guest;
}

/** Spawn up to `count` guests now (scenarios and tests). Returns the guests who came in. */
export function spawnGuests(world: World, count: number): Guest[] {
  const out: Guest[] = [];
  for (let i = 0; i < count; i++) {
    const g = spawnGuest(world);
    if (g) out.push(g);
  }
  if (out.length > 0) emit(world, { type: 'guestsChanged' });
  return out;
}

export function spawnArrivals(world: World): void {
  const park = world.state.park;
  if (!park.open) return;
  const perHour = arrivalsPerHour(world);
  if (perHour > 0) park.arrivalCarry += (perHour * ARRIVAL_CARRY_UNIT) / TICKS_PER_HOUR;
  let spawned = false;
  while (park.arrivalCarry >= ARRIVAL_CARRY_UNIT) {
    park.arrivalCarry -= ARRIVAL_CARRY_UNIT;
    if (spawnGuest(world)) spawned = true;
  }
  if (spawned) emit(world, { type: 'guestsChanged' });
}
