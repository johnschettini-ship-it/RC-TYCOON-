/**
 * Owner: W2-C. First Aid and Cash Machine targeting (Phase 3 §4.10), as beforeDecision hooks.
 * Both act only for a walking guest without a target, set the target, and return false so the guest
 * system still adds its need thoughts (it stops there because the guest now has a target).
 * The visit itself (60 ticks at First Aid, the $40–$80 withdrawal without a ledger line) is the guest
 * system's buying code with the catalog effects.
 */
import { getStallDef } from '../../data/catalog';
import { CASH_MACHINE_HAPPY, CASH_MACHINE_MAX_WITHDRAWALS, FIRST_AID_NAUSEA } from '../../data/tuning/facilities';
import { NEED_UNCOMFORTABLE } from '../../data/tuning/guests';
import { THOUGHT, addThought } from '../guests/thoughts';
import type { Guest } from '../guests/types';
import type { World } from '../types';
import { nearestFacility, targetStall } from './common';

export { nearestFacility } from './common';

const FIRST_AID = 'first_aid';
const CASH_MACHINE = 'cash_machine';
const NEED_KEYS = ['hunger', 'thirst', 'bladder'] as const;

/** Cash below which a guest wants the Cash Machine ($10, catalog §3). */
const CASH_LOW = getStallDef(CASH_MACHINE)?.effects.withdraw?.belowCents ?? 0;

/**
 * First Aid has the urgency of Restrooms (§4.10): nausea ≥ FIRST_AID_NAUSEA counts as a pressing need
 * and competes with hunger, thirst, and bladder at or above uncomfortable by value; a higher one goes first.
 */
export function firstAidDecision(world: World, guest: Guest): boolean {
  if (guest.state !== 'walking' || guest.target !== null) return false;
  const nausea = guest.needs.nausea;
  if (nausea < FIRST_AID_NAUSEA) return false;
  for (const k of NEED_KEYS) if (guest.needs[k] >= NEED_UNCOMFORTABLE && guest.needs[k] > nausea) return false;
  const aid = nearestFacility(world, guest, FIRST_AID);
  if (aid) targetStall(guest, aid.stall);
  return false;
}

/** Cash < $10, happiness ≥ CASH_MACHINE_HAPPY, and fewer than CASH_MACHINE_MAX_WITHDRAWALS withdrawals. */
export function wantsCash(guest: Guest): boolean {
  return guest.cash < CASH_LOW && guest.needs.happiness >= CASH_MACHINE_HAPPY && guest.withdrawals < CASH_MACHINE_MAX_WITHDRAWALS;
}

/** A guest who wants cash thinks "I need cash" and targets the nearest Cash Machine it can reach. */
export function cashMachineDecision(world: World, guest: Guest): boolean {
  if (guest.state !== 'walking' || guest.target !== null || !wantsCash(guest)) return false;
  const atm = nearestFacility(world, guest, CASH_MACHINE);
  if (!atm) return false;
  addThought(world, guest, THOUGHT.needCash);
  targetStall(guest, atm.stall);
  return false;
}
