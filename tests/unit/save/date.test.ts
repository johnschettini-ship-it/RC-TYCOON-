import { describe, expect, it } from 'vitest';
import { formatSaveDate } from '../../../src/save/date';
import { formatDate } from '../../../src/sim/time';

describe('formatSaveDate (the park line under Continue)', () => {
  it('is the month and the year as the date formatter writes them, without the clock', () => {
    for (const tick of [0, 1, 3675, 9 * 60 * 60, 123_456, 2_000_000]) {
      const date = formatSaveDate(tick);
      expect(formatDate(tick).startsWith(`${date} · `), `${tick}: ${formatDate(tick)}`).toBe(true);
      expect(date).toMatch(/^[A-Z][a-z]{2} · Year \d+$/);
    }
    expect(formatSaveDate(0)).toBe('Mar · Year 1');
  });
});
