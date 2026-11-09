/** Phase 4 §4.7 darkness curve (render only) and night window (simulation). Owner: W3-F. */
import { describe, expect, it } from 'vitest';
import { ambientColour, darknessAt } from '../../../src/render/lighting/layer';
import { isNight, nightActive } from '../../../src/sim/lighting/api';
import { MAX_DARKNESS, NIGHT_AMBIENT } from '../../../src/data/tuning/night';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../../src/data/tuning/core';
import { makeTestWorld } from '../../helpers/world';

const at = (hour: number, minute = 0, day = 0): number => day * TICKS_PER_DAY + hour * TICKS_PER_HOUR + Math.round((minute / 60) * TICKS_PER_HOUR);

describe('darkness curve (Phase 4 §4.7, render only)', () => {
  it('is 0.375 at 06:00, 0 at 12:00, 0.375 at 20:00, and 0.75 at 22:00', () => {
    expect(darknessAt(at(6), true)).toBeCloseTo(0.375, 10);
    expect(darknessAt(at(12), true)).toBe(0);
    expect(darknessAt(at(20), true)).toBeCloseTo(0.375, 10);
    expect(darknessAt(at(22), true)).toBe(MAX_DARKNESS);
  });

  it('follows the table edges: 0 from 07:00 to 19:00, ramps over 19–21 and 05–07, 0.75 from 21:00 to 05:00', () => {
    expect(darknessAt(at(7), true)).toBe(0);
    expect(darknessAt(at(18, 59), true)).toBe(0);
    expect(darknessAt(at(19), true)).toBe(0);
    expect(darknessAt(at(19, 30), true)).toBeCloseTo(0.1875, 10);
    expect(darknessAt(at(21), true)).toBe(0.75);
    expect(darknessAt(at(0), true)).toBe(0.75);
    expect(darknessAt(at(4, 59), true)).toBe(0.75);
    expect(darknessAt(at(5), true)).toBe(0.75);
    expect(darknessAt(at(6, 30), true)).toBeCloseTo(0.1875, 10);
    expect(darknessAt(at(22, 0, 7), true)).toBe(0.75);
  });

  it('is continuous between ticks (render interpolation) and monotonic over the dusk ramp', () => {
    let last = -1;
    for (let t = at(19); t <= at(21); t += 0.25) {
      const d = darknessAt(t, true);
      expect(d).toBeGreaterThanOrEqual(last);
      last = d;
    }
    expect(last).toBe(0.75);
  });

  it('is always 0 when After Dark is off', () => {
    for (let h = 0; h < 24; h++) expect(darknessAt(at(h), false)).toBe(0);
  });
});

describe('ambient colour (light canvas fill)', () => {
  it('lerps from white to rgb(70, 80, 130) by darkness / 0.75', () => {
    expect(ambientColour(0)).toEqual({ r: 255, g: 255, b: 255 });
    expect(ambientColour(MAX_DARKNESS)).toEqual(NIGHT_AMBIENT);
    expect(ambientColour(MAX_DARKNESS / 2)).toEqual({ r: 163, g: 168, b: 193 });
  });
});

describe('night window (Phase 4 §4.7, simulation)', () => {
  it('is 20:00 inclusive to 06:00 exclusive, from the integer clock', () => {
    expect(isNight(at(20) - 1)).toBe(false);
    expect(isNight(at(20))).toBe(true);
    expect(isNight(at(6) - 1)).toBe(true);
    expect(isNight(at(6))).toBe(false);
  });

  it('applies only with After Dark on', () => {
    const w = makeTestWorld();
    w.state.tick = at(22);
    expect(nightActive(w)).toBe(true);
    w.state.park.afterDark = false;
    expect(nightActive(w)).toBe(false);
    w.state.park.afterDark = true;
    w.state.tick = at(12);
    expect(nightActive(w)).toBe(false);
  });
});
