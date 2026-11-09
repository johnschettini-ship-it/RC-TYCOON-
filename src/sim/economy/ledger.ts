/**
 * Ledger contract (master 5.3, Phase 1 §4.5, Phase 3 §4.1). Owner: integrator.
 * Every cash change goes through `recordLedger`, so cash change = sum of ledger lines.
 */
import { HOURS_PER_MONTH } from '../../data/tuning/core';
import { monthIndexOf } from '../time';
import type { World } from '../types';
import type { Cents } from '../units';
import { LEDGER_CATEGORIES, type LedgerCategory, type LedgerMonth } from './types';

export interface CommandContext {
  /** Scenario setup and tests: skip cash checks and ledger lines. */
  setup: boolean;
}

export function newLedgerMonth(monthIndex: number): LedgerMonth {
  const lines = {} as Record<LedgerCategory, Cents>;
  for (const c of LEDGER_CATEGORIES) lines[c] = 0;
  return { monthIndex, lines };
}

/** The record for the current month. Creates it (and any skipped months) when missing. */
export function currentLedger(world: World): LedgerMonth {
  const ledger = world.state.economy.ledger;
  const m = monthIndexOf(world.state.tick);
  let last = ledger[ledger.length - 1];
  if (last && last.monthIndex > m) {
    throw new Error(`Ledger month ${last.monthIndex} is after the current month ${m}`);
  }
  while (!last || last.monthIndex < m) {
    last = newLedgerMonth(last ? last.monthIndex + 1 : m);
    ledger.push(last);
  }
  return last;
}

/** Signed amount: income > 0, expense < 0. Changes cash and the ledger line together. */
export function recordLedger(world: World, category: LedgerCategory, cents: Cents): void {
  if (!Number.isInteger(cents)) throw new Error(`Ledger amounts are integer cents, got ${cents}`);
  currentLedger(world).lines[category] += cents;
  world.state.park.cash += cents;
}

export function canAfford(world: World, cost: Cents, ctx: CommandContext): boolean {
  return ctx.setup || world.state.park.cash >= cost;
}

/** Pay `cost` (≥ 0) unless in setup mode. */
export function pay(world: World, cost: Cents, category: LedgerCategory, ctx: CommandContext): void {
  if (ctx.setup || cost === 0) return;
  recordLedger(world, category, -cost);
}

/**
 * Hourly charge rule (Phase 3 §4.1, master R9). Charge for hour `hourOfMonth` (0–71) of a monthly amount.
 * The last hour adds the remainder only when the item was active all month, so a full month costs exactly `monthly`.
 */
export function hourlyShare(monthly: Cents, hourOfMonth: number, activeAllMonth: boolean): Cents {
  const base = Math.floor(monthly / HOURS_PER_MONTH);
  if (hourOfMonth === HOURS_PER_MONTH - 1 && activeAllMonth) {
    return base + (monthly - HOURS_PER_MONTH * base);
  }
  return base;
}
