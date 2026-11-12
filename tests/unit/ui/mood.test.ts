import { describe, expect, it } from 'vitest';
import { knotPercent, lean, leadShare, leanTextId, segmentLabel } from '../../../src/ui/mood/model';

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
  // A 300 px track: a percentage needs a 44 px room that the knot (6 px, and 2 px on each side) does not cover.
  it('a segment percentage sits in the middle of its segment when the knot is away from it', () => {
    expect(segmentLabel(p(30, 40, 30), 'chill', 300)).toEqual({ show: true, padStart: 0, padEnd: 0 });
    expect(segmentLabel(p(30, 40, 30), 'thrill', 300)).toEqual({ show: true, padStart: 0, padEnd: 0 });
  });
  it('the knot on the middle of a segment moves its percentage to the side with more room', () => {
    // Knot at 150 px; Family is 90 to 210 px: the room left of the knot is 90 to 145 px (a tie goes to the start).
    expect(segmentLabel(p(30, 40, 30), 'family', 300)).toEqual({ show: true, padStart: 0, padEnd: 65 });
    // Knot at 159 px (53%); Family is 75 to 210 px: 79 px left of the knot, 46 px right of it.
    expect(segmentLabel(p(25, 45, 30), 'family', 300)).toEqual({ show: true, padStart: 0, padEnd: 56 });
    // Knot at 144 px (48%); Family is 90 to 225 px: 49 px left of the knot, 76 px right of it.
    expect(segmentLabel(p(30, 45, 25), 'family', 300)).toEqual({ show: true, padStart: 59, padEnd: 0 });
  });
  it('a segment percentage is hidden when no room of 44 px is free of the knot, or the segment is under 44 px', () => {
    // Knot at 150 px; Family is 114 to 189 px: 31 px left of the knot, 34 px right of it.
    expect(segmentLabel(p(38, 25, 37), 'family', 300).show).toBe(false);
    expect(segmentLabel(p(10, 45, 45), 'chill', 300).show).toBe(false);
    expect(segmentLabel(p(0, 50, 50), 'chill', 300).show).toBe(false);
  });
});

describe('mood circle share (Task 21; no face since Task 23)', () => {
  it('shows the leading group and its share', () => {
    expect(leadShare(p(40, 30, 30), 10)).toEqual({ group: 'chill', share: 40 });
    expect(leadShare(p(20, 38, 42), 12)).toEqual({ group: 'thrill', share: 42 });
    expect(leadShare(p(30, 40, 30), 10)).toEqual({ group: 'family', share: 40 });
  });
  it('ties go Chill, Family, Thrill; no guests has no group', () => {
    expect(leadShare(p(40, 40, 20), 5).group).toBe('chill');
    expect(leadShare(p(20, 40, 40), 5).group).toBe('family');
    expect(leadShare(p(0, 0, 0), 0)).toEqual({ group: null, share: 0 });
  });
});
