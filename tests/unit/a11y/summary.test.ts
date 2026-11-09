/** Month-end summaries for the live region (Phase 6 §4.7). */
import { describe, expect, it } from 'vitest';
import { monthEndSummary } from '../../../src/a11y/summary';
import { newLedgerMonth } from '../../../src/sim/economy/ledger';

describe('monthEndSummary', () => {
  it('reads the profit of the month that ended (financing lines left out, as in the Finance panel)', () => {
    const m0 = newLedgerMonth(0);
    m0.lines.entranceTickets = 50_000;
    m0.lines.wages = -12_345;
    m0.lines.loan = 1_000_000;
    const m1 = newLedgerMonth(1);
    m1.lines.construction = -99_00;
    expect(monthEndSummary([m0, m1], 0)).toBe('Month ended: profit $376.55');
    expect(monthEndSummary([m0, m1], 1)).toBe('Month ended: loss $99');
    expect(monthEndSummary([m0, m1], 5)).toBeNull();
  });
});
