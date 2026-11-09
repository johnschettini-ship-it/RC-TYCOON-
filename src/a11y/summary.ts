/** Month-end summary line for the live region (Phase 6 §4.7). Owner: W4-F. Pure. */
import { text } from '../data/strings/en';
import type { LedgerMonth } from '../sim/economy/types';
import { monthProfit } from '../ui/finance';
import { formatMoney } from '../ui/format';

/** "Month ended: profit $1,200" (or "loss"), for the month `monthIndex` of the ledger; null when it is not there. */
export function monthEndSummary(ledger: readonly LedgerMonth[], monthIndex: number): string | null {
  const m = ledger.find((x) => x.monthIndex === monthIndex);
  if (!m) return null;
  const p = monthProfit(m);
  return p >= 0 ? text('a11y.monthEnded', { profit: formatMoney(p) }) : text('a11y.monthEndedLoss', { loss: formatMoney(-p) });
}
