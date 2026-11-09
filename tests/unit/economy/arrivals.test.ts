import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/weather/update', () => ({ updateWeather: vi.fn(), weatherArrivalFactor: vi.fn() }));
vi.mock('../../../src/sim/marketing/update', () => ({ hourlyMarketing: vi.fn(), campaignArrivalFactor: vi.fn() }));

import { weatherArrivalFactor } from '../../../src/sim/weather/update';
import { campaignArrivalFactor } from '../../../src/sim/marketing/update';
import { arrivalsPerHour, clockFactor, ratingFactor, rideFactor } from '../../../src/sim/park/arrivals';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../../src/data/tuning/core';
import { BASE_ARRIVALS_PER_HOUR } from '../../../src/data/tuning/economy';
import { makeTestWorld, placeRideDirect } from '../../helpers/world';
import type { World } from '../../../src/sim/types';

const weather = vi.mocked(weatherArrivalFactor);
const campaign = vi.mocked(campaignArrivalFactor);

beforeEach(() => {
  weather.mockReset().mockReturnValue(1);
  campaign.mockReset().mockReturnValue(1);
});

/** Open park with `open` open rides, rating 500, at 12:00 on day 2. */
function park(open: number): World {
  const w = makeTestWorld();
  w.state.park.open = true;
  w.state.park.rating = 500;
  w.state.tick = TICKS_PER_DAY + 12 * TICKS_PER_HOUR;
  for (let i = 0; i < open; i++) placeRideDirect(w, 'carousel', 4 + i * 4, 10).status = 'open';
  return w;
}

describe('clock factor by band (Phase 1 §4.6)', () => {
  it.each([
    [0, 0.1],
    [3, 0.1],
    [5, 0.1],
    [6, 0.6],
    [9, 0.6],
    [10, 1.0],
    [14, 1.0],
    [17, 1.0],
    [18, 0.6],
    [21, 0.6],
    [22, 0.1],
    [23, 0.1],
  ])('hour %i → %f', (hour, factor) => {
    expect(clockFactor(TICKS_PER_DAY * 4 + hour * TICKS_PER_HOUR)).toBe(factor);
    // Any minute inside the hour is in the same band.
    expect(clockFactor(TICKS_PER_DAY * 4 + hour * TICKS_PER_HOUR + TICKS_PER_HOUR - 1)).toBe(factor);
  });

  it('arrivals follow the clock band', () => {
    const w = park(1);
    const at = (hour: number): number => {
      w.state.tick = TICKS_PER_DAY + hour * TICKS_PER_HOUR;
      return arrivalsPerHour(w);
    };
    expect(at(12)).toBeCloseTo(BASE_ARRIVALS_PER_HOUR * 1 * 0.5 * 1.0, 10);
    expect(at(8)).toBeCloseTo(BASE_ARRIVALS_PER_HOUR * 0.5 * 0.6, 10);
    expect(at(19)).toBeCloseTo(BASE_ARRIVALS_PER_HOUR * 0.5 * 0.6, 10);
    expect(at(2)).toBeCloseTo(BASE_ARRIVALS_PER_HOUR * 0.5 * 0.1, 10);
  });
});

describe('rating and ride factors', () => {
  it('rating factor = clamp(rating / 500, 0.2, 2.0)', () => {
    expect(ratingFactor(0)).toBe(0.2);
    expect(ratingFactor(100)).toBe(0.2);
    expect(ratingFactor(250)).toBe(0.5);
    expect(ratingFactor(500)).toBe(1);
    expect(ratingFactor(1_000)).toBe(2);
  });

  it('ride factor = 0 with no open rides, else min(1.5, 0.25 + open × 0.25)', () => {
    expect(rideFactor(0)).toBe(0);
    expect(rideFactor(1)).toBe(0.5);
    expect(rideFactor(3)).toBe(1);
    expect(rideFactor(5)).toBe(1.5);
    expect(rideFactor(12)).toBe(1.5);
  });

  it('only open rides count', () => {
    const w = park(2);
    placeRideDirect(w, 'big_wheel', 40, 40).status = 'closed';
    const broken = placeRideDirect(w, 'big_wheel', 40, 20);
    broken.status = 'broken';
    expect(arrivalsPerHour(w)).toBeCloseTo(BASE_ARRIVALS_PER_HOUR * 0.75, 10);
  });
});

describe('arrivalsPerHour', () => {
  it('is 0 when the park is closed', () => {
    const w = park(4);
    w.state.park.open = false;
    expect(arrivalsPerHour(w)).toBe(0);
  });

  it('is 0 with no open rides', () => {
    expect(arrivalsPerHour(park(0))).toBe(0);
  });

  it('multiplies base × rating × rides × clock × weather × campaigns × modifiers.arrivals', () => {
    const w = park(5);
    w.state.park.rating = 750;
    w.state.modifiers.arrivals = 0.8;
    weather.mockReturnValue(0.6);
    campaign.mockReturnValue(2.5);
    expect(arrivalsPerHour(w)).toBeCloseTo(4 * 1.5 * 1.5 * 1.0 * 0.6 * 2.5 * 0.8, 10);
    expect(weather).toHaveBeenCalledWith(w);
    expect(campaign).toHaveBeenCalledWith(w);
  });
});
