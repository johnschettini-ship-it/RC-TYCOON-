import { describe, expect, it } from 'vitest';
import { formatMoney, formatPrice, formatRating, sharePercents, temperamentShares } from '../../../src/ui/format';

describe('money formatting (integer cents)', () => {
  it('shows whole dollars without cents and other amounts with two decimals', () => {
    expect(formatMoney(1_500_000)).toBe('$15,000');
    expect(formatMoney(250)).toBe('$2.50');
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(123_456_789)).toBe('$1,234,567.89');
    expect(formatMoney(-120_000)).toBe('−$1,200');
    expect(formatMoney(-5)).toBe('−$0.05');
  });

  it('prices always show two decimals', () => {
    expect(formatPrice(200)).toBe('$2.00');
    expect(formatPrice(1250)).toBe('$12.50');
    expect(formatPrice(0)).toBe('$0.00');
  });

  it('ratings are hundredths shown as 0.00–10.00', () => {
    expect(formatRating(250)).toBe('2.50');
    expect(formatRating(1000)).toBe('10.00');
    expect(formatRating(5)).toBe('0.05');
  });
});

describe('Thrill/Chill balance (master R6 groups)', () => {
  it('counts Chill ≤ 35, Family 36–64, Thrill ≥ 65', () => {
    const s = temperamentShares([{ temperament: 0 }, { temperament: 35 }, { temperament: 36 }, { temperament: 64 }, { temperament: 65 }, { temperament: 100 }]);
    expect(s).toEqual({ chill: 2, family: 2, thrill: 2, total: 6 });
  });

  it('percentages always add up to 100 (largest remainder)', () => {
    expect(sharePercents({ chill: 1, family: 1, thrill: 1, total: 3 })).toEqual({ chill: 34, family: 33, thrill: 33 });
    expect(sharePercents({ chill: 1, family: 0, thrill: 3, total: 4 })).toEqual({ chill: 25, family: 0, thrill: 75 });
  });

  it('no guests gives all zeros', () => {
    expect(sharePercents(temperamentShares([]))).toEqual({ chill: 0, family: 0, thrill: 0 });
  });
});
