/** Owner: W1-I. Finance views over the ledger (Phase 3 §4.15). */
import { LEDGER_CATEGORIES, type LedgerCategory, type LedgerMonth } from '../economy/types';
import type { Cents } from '../units';

/** Financing rows: they change cash but not profit (borrowed > 0, repaid < 0). */
export const FINANCING_CATEGORIES: readonly LedgerCategory[] = ['loan'];

export function isFinancing(category: LedgerCategory): boolean {
  return FINANCING_CATEGORIES.includes(category);
}

/** Income − expenses for one month, without financing rows. */
export function monthProfit(month: LedgerMonth): Cents {
  let sum = 0;
  for (const c of LEDGER_CATEGORIES) if (!isFinancing(c)) sum += month.lines[c];
  return sum;
}
