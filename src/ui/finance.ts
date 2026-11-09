/** Finance panel data (Phase 1 §4.5, Phase 3 §4.15 financing rule). Owner: W1-B. Pure. */
import { LEDGER_CATEGORIES, type LedgerCategory, type LedgerMonth } from '../sim/economy/types';
import { MONTH_NAMES } from '../sim/time';
import type { Cents } from '../sim/units';

/** Borrowed and repaid amounts are financing: they change cash but not profit. */
const FINANCING: ReadonlySet<LedgerCategory> = new Set<LedgerCategory>(['loan']);

export function monthProfit(m: LedgerMonth): Cents {
  let sum = 0;
  for (const c of LEDGER_CATEGORIES) if (!FINANCING.has(c)) sum += m.lines[c];
  return sum;
}

export interface FinanceRow {
  category: LedgerCategory;
  thisMonth: Cents;
  lastMonth: Cents;
}

/** This month and last month by category. Only categories with money in either month, in ledger order. */
export function financeSummary(ledger: readonly LedgerMonth[], monthIndex: number): { rows: FinanceRow[]; thisTotal: Cents; lastTotal: Cents } {
  const cur = ledger.find((m) => m.monthIndex === monthIndex);
  const prev = ledger.find((m) => m.monthIndex === monthIndex - 1);
  const rows: FinanceRow[] = [];
  for (const c of LEDGER_CATEGORIES) {
    const a = cur?.lines[c] ?? 0;
    const b = prev?.lines[c] ?? 0;
    if (a !== 0 || b !== 0) rows.push({ category: c, thisMonth: a, lastMonth: b });
  }
  return { rows, thisTotal: cur ? monthProfit(cur) : 0, lastTotal: prev ? monthProfit(prev) : 0 };
}

/** Profit of the newest `months` ledger records up to `monthIndex`, oldest first. */
export function profitHistory(ledger: readonly LedgerMonth[], monthIndex: number, months = 12): Array<{ monthIndex: number; profit: Cents }> {
  return ledger
    .filter((m) => m.monthIndex <= monthIndex && m.monthIndex > monthIndex - months)
    .map((m) => ({ monthIndex: m.monthIndex, profit: monthProfit(m) }));
}

/** "Mar Y1" for month index 0. */
export function monthLabel(monthIndex: number): string {
  return `${MONTH_NAMES[monthIndex % 12]} Y${Math.floor(monthIndex / 12) + 1}`;
}
