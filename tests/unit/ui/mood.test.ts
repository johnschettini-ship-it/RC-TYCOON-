import { describe, expect, it } from 'vitest';
import { knotPercent, lean, leanTextId } from '../../../src/ui/mood/model';

const p = (chill: number, family: number, thrill: number) => ({ chill, family, thrill });

describe('mood model (Phase 7 §4.3)', () => {
  it('lean is thrill minus chill; the knot is at 50 + lean / 2', () => {
    expect(lean(p(100, 0, 0))).toBe(-100);
    expect(knotPercent(p(100, 0, 0))).toBe(0);
    expect(knotPercent(p(0, 100, 0))).toBe(50);
    expect(knotPercent(p(15, 56, 29))).toBe(57);
    expect(knotPercent(p(0, 0, 100))).toBe(100);
  });
  it.each([
    [p(100, 0, 0), 'ui.mood.chill'],
    [p(40, 30, 30), 'ui.mood.chill'],
    [p(39, 31, 30), 'ui.mood.balance'],
    [p(30, 40, 30), 'ui.mood.balance'],
    [p(30, 31, 39), 'ui.mood.balance'],
    [p(30, 30, 40), 'ui.mood.thrill'],
    [p(0, 0, 100), 'ui.mood.thrill'],
  ])('%j gives %s', (shares, id) => expect(leanTextId(shares, 50)).toBe(id));
  it('no guests gives the no-guests text', () => expect(leanTextId(p(0, 0, 0), 0)).toBe('ui.mood.none'));
});
