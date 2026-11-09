import { describe, expect, it } from 'vitest';
import { drawNextWeather, isTallRide, updateWeather, weatherArrivalFactor } from '../../../src/sim/weather/update';
import { isGuestCovered, rideScoreFactor, weatherHooks, weatherStallFactor } from '../../../src/sim/weather/hooks';
import { executeCommand } from '../../../src/sim/commands';
import { seasonOf, type Season } from '../../../src/sim/time';
import type { WeatherKey } from '../../../src/data/catalog';
import {
  SEASON_WEATHER_WEIGHTS,
  WEATHER_ARRIVAL_FACTOR,
  WEATHER_INTERVAL,
  WEATHER_STATES,
  WEATHER_STAY,
} from '../../../src/data/tuning/management';
import { MSG } from '../../../src/data/strings/management';
import { THOUGHT } from '../../../src/sim/guests/thoughts';
import { START_TICK, TICKS_PER_MONTH } from '../../../src/data/tuning/core';
import {
  addGuestDirect,
  makeTestWorld,
  makeTrackRideDataDirect,
  placeRideDirect,
  placeStallDirect,
  trackPiecesDirect,
} from '../../helpers/world';
import { tileIndex } from '../../../src/sim/map';
import { trackHighestPointM } from '../../../src/sim/rides/track/api';
import type { World } from '../../../src/sim/types';
import type { Ride } from '../../../src/sim/rides/types';
import type { Guest } from '../../../src/sim/guests/types';

const SEASONS: Season[] = ['winter', 'spring', 'summer', 'autumn'];

function counts(fn: () => WeatherKey, n: number): Record<WeatherKey, number> {
  const out: Record<WeatherKey, number> = { sunny: 0, cloudy: 0, rain: 0, storm: 0, hot: 0, cold: 0 };
  for (let i = 0; i < n; i++) out[fn()]++;
  return out;
}

/** Run only the weather system from START_TICK for `ticks` ticks; return each [tick, current] change. */
function weatherSequence(w: World, ticks: number): [number, WeatherKey][] {
  const seq: [number, WeatherKey][] = [];
  let prev = w.state.management.weather.current;
  for (let t = START_TICK; t < START_TICK + ticks; t++) {
    w.state.tick = t;
    updateWeather(w);
    const cur = w.state.management.weather.current;
    if (t % WEATHER_INTERVAL === 0) seq.push([t, cur]);
    else expect(cur).toBe(prev);
    prev = cur;
  }
  return seq;
}

/**
 * An open track ride whose highest rail is `aboveGround` m above the ground: a station at (x, 44), then a gentle
 * climb along +x (flat-to-gentle +1 m, gentle +2 m each, gentle-to-flat +1 m), built from real track pieces.
 */
function trackRide(w: World, aboveGround: number, x: number): Ride {
  const ride = placeRideDirect(w, 'carousel', x, 40);
  ride.kind = 'track';
  ride.defId = 'steel_coaster';
  ride.status = 'open';
  const ups = Array.from({ length: Math.floor((aboveGround - 1) / 2) }, () => 'gentle_up');
  const level = aboveGround % 2 === 0 ? ['gentle_up_to_flat'] : [];
  const ground = w.state.map.heights[tileIndex(w.state.map, x, 44)] as number;
  const pieces = trackPiecesDirect(x, 44, ground, 0, ['station', 'flat_to_gentle_up', ...ups, ...level]);
  makeTrackRideDataDirect(w, ride, { pieces, openedOnce: true });
  expect(trackHighestPointM(w, ride.id)).toBe(aboveGround);
  return ride;
}

function setWeather(w: World, current: WeatherKey): void {
  const ws = w.state.management.weather;
  ws.current = current;
  ws.next = current;
  ws.nextChangeTick = w.state.tick + WEATHER_INTERVAL;
}

function decide(w: World, g: Guest): void {
  for (const h of weatherHooks.beforeDecision ?? []) expect(h(w, g)).toBe(false);
}

describe('weather draw (Phase 3 §4.9)', () => {
  it('stays with chance WEATHER_STAY, else follows the season weights', () => {
    const n = 200_000;
    for (const season of SEASONS) {
      const rng = { rng: 1234 };
      const c = counts(() => drawNextWeather(rng, 'cloudy', season), n);
      const weights = SEASON_WEATHER_WEIGHTS[season];
      for (const k of WEATHER_STATES) {
        const expected = (k === 'cloudy' ? WEATHER_STAY : 0) + (1 - WEATHER_STAY) * (weights[k] / 100);
        expect(Math.abs(c[k] / n - expected)).toBeLessThan(0.006);
        if (weights[k] === 0 && k !== 'cloudy') expect(c[k]).toBe(0);
      }
    }
  });

  it('turns a storm draw into rain unless the current state is rain or cloudy', () => {
    const n = 100_000;
    const rng = { rng: 99 };
    const c = counts(() => drawNextWeather(rng, 'sunny', 'summer'), n);
    expect(c.storm).toBe(0);
    expect(Math.abs(c.rain / n - 0.5 * (10 + 10) / 100)).toBeLessThan(0.005);
    const fromRain = counts(() => drawNextWeather(rng, 'rain', 'summer'), n);
    expect(fromRain.storm).toBeGreaterThan(0);
  });

  it('a storm never lasts more than one interval: after it only rain or cloudy, 1:1', () => {
    const n = 50_000;
    const rng = { rng: 5 };
    const c = counts(() => drawNextWeather(rng, 'storm', 'summer'), n);
    expect(c.rain + c.cloudy).toBe(n);
    expect(Math.abs(c.rain / n - 0.5)).toBeLessThan(0.01);
  });
});

describe('weather over time', () => {
  it('starts sunny and changes only every WEATHER_INTERVAL ticks', () => {
    const w = makeTestWorld();
    expect(w.state.management.weather.current).toBe('sunny');
    updateWeather(w);
    expect(w.state.management.weather.current).toBe('sunny');
    expect(w.state.management.weather.nextChangeTick).toBe(WEATHER_INTERVAL);
    weatherSequence(w, 3 * TICKS_PER_MONTH);
  });

  it('transitions only follow the season table and the storm rules (5 years)', () => {
    const w = makeTestWorld(777);
    const seq = weatherSequence(w, 60 * TICKS_PER_MONTH);
    let prev: WeatherKey = 'sunny';
    let storms = 0;
    for (const [tick, cur] of seq) {
      const weights = SEASON_WEATHER_WEIGHTS[seasonOf(tick)];
      if (prev === 'storm') {
        expect(['rain', 'cloudy']).toContain(cur);
      } else if (cur !== prev) {
        expect(weights[cur]).toBeGreaterThan(0);
        if (cur === 'storm') expect(['rain', 'cloudy']).toContain(prev);
      }
      if (cur === 'storm') storms++;
      prev = cur;
    }
    expect(storms).toBeGreaterThan(0);
    expect(new Set(seq.map(([, c]) => c)).size).toBe(6);
  });

  it('the forecast is always the next state', () => {
    const w = makeTestWorld(3);
    w.state.tick = START_TICK;
    updateWeather(w);
    for (let k = 1; k <= 20; k++) {
      const forecast = w.state.management.weather.next;
      w.state.tick = k * WEATHER_INTERVAL;
      updateWeather(w);
      expect(w.state.management.weather.current).toBe(forecast);
    }
  });

  it('a 12-month weather sequence is deterministic for a fixed seed', () => {
    const a = weatherSequence(makeTestWorld(4242), 12 * TICKS_PER_MONTH);
    const b = weatherSequence(makeTestWorld(4242), 12 * TICKS_PER_MONTH);
    const c = weatherSequence(makeTestWorld(4243), 12 * TICKS_PER_MONTH);
    expect(a).toHaveLength(72);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('posts a weather message when a storm starts', () => {
    const w = makeTestWorld();
    w.state.management.weather = { current: 'rain', next: 'storm', nextChangeTick: 600 };
    w.state.tick = 600;
    updateWeather(w);
    expect(w.state.management.messages.map((m) => [m.category, m.textId])).toEqual([['weather', MSG.storm]]);
  });
});

describe('arrival factor', () => {
  it('follows the effect table', () => {
    const w = makeTestWorld();
    const expected: Record<WeatherKey, number> = { sunny: 1.0, cloudy: 0.9, rain: 0.6, storm: 0.3, hot: 1.1, cold: 0.7 };
    expect(WEATHER_ARRIVAL_FACTOR).toEqual(expected);
    for (const k of WEATHER_STATES) {
      w.state.management.weather.current = k;
      expect(weatherArrivalFactor(w)).toBe(expected[k]);
    }
  });
});

describe('storm hold', () => {
  it('holds open tall rides during a storm and restores them after', () => {
    const w = makeTestWorld();
    const wheel = placeRideDirect(w, 'big_wheel', 10, 10);
    const carousel = placeRideDirect(w, 'carousel', 20, 10);
    const swing = placeRideDirect(w, 'swing_tower', 30, 10);
    wheel.status = 'open';
    carousel.status = 'open';
    swing.status = 'closed';
    setWeather(w, 'storm');
    updateWeather(w);
    expect([wheel.status, carousel.status, swing.status]).toEqual(['stormHold', 'open', 'closed']);
    // A ride the player opens during the storm is held on the next tick.
    swing.status = 'open';
    w.state.tick += 1;
    updateWeather(w);
    expect(swing.status).toBe('stormHold');
    // The storm passes.
    w.state.management.weather.next = 'rain';
    w.state.tick = w.state.management.weather.nextChangeTick;
    updateWeather(w);
    expect(w.state.management.weather.current).toBe('rain');
    expect([wheel.status, carousel.status, swing.status]).toEqual(['open', 'open', 'open']);
  });

  it('a ride the player closes during the hold stays closed after the storm', () => {
    const w = makeTestWorld();
    const wheel = placeRideDirect(w, 'big_wheel', 10, 10);
    wheel.status = 'open';
    setWeather(w, 'storm');
    updateWeather(w);
    wheel.status = 'closed';
    setWeather(w, 'cloudy');
    updateWeather(w);
    expect(wheel.status).toBe('closed');
  });

  it('track rides are tall from a highest rail point 20 m above ground', () => {
    const w = makeTestWorld();
    const high = trackRide(w, 20, 10);
    const low = trackRide(w, 19, 30);
    expect(isTallRide(w, high)).toBe(true);
    expect(isTallRide(w, low)).toBe(false);
    for (const id of ['big_wheel', 'swing_tower', 'observation_tower', 'drop_tower', 'flip_arm']) {
      expect(isTallRide(w, { ...high, kind: 'flat', defId: id })).toBe(true);
    }
    expect(isTallRide(w, { ...high, kind: 'flat', defId: 'carousel' })).toBe(false);
    setWeather(w, 'storm');
    updateWeather(w);
    expect([high.status, low.status]).toEqual(['stormHold', 'open']);
  });
});

describe('guest weather effects (hooks)', () => {
  it('rain and storm lower happiness per decision for uncovered guests; umbrellas help', () => {
    const cases: [WeatherKey, boolean, number][] = [
      ['sunny', false, 0],
      ['cloudy', false, 0],
      ['hot', false, 0],
      ['cold', false, 0],
      ['rain', false, -1],
      ['storm', false, -2],
      ['rain', true, 0],
      ['storm', true, -1],
    ];
    for (const [weather, umbrella, delta] of cases) {
      const w = makeTestWorld();
      setWeather(w, weather);
      const g = addGuestDirect(w, 100, { items: { map: false, umbrella, balloon: false } });
      decide(w, g);
      expect(g.needs.happiness - 180).toBe(delta);
    }
  });

  it('a guest riding a covered ride stays dry', () => {
    const w = makeTestWorld();
    setWeather(w, 'storm');
    const carousel = placeRideDirect(w, 'carousel', 10, 10);
    const wheel = placeRideDirect(w, 'big_wheel', 20, 10);
    const dry = addGuestDirect(w, 100, { state: 'riding', activityId: carousel.id });
    const wet = addGuestDirect(w, 100, { state: 'riding', activityId: wheel.id });
    expect(isGuestCovered(w, dry)).toBe(true);
    expect(isGuestCovered(w, wet)).toBe(false);
    decide(w, dry);
    decide(w, wet);
    expect(dry.needs.happiness).toBe(180);
    expect(wet.needs.happiness).toBe(178);
  });

  it('adds weather thoughts at most once per game day', () => {
    const w = makeTestWorld();
    setWeather(w, 'rain');
    const g = addGuestDirect(w, 100);
    const u = addGuestDirect(w, 100, { items: { map: false, umbrella: true, balloon: false } });
    decide(w, g);
    decide(w, u);
    w.state.tick += 40;
    decide(w, g);
    expect(g.thoughts.map((t) => t.id)).toEqual([THOUGHT.rainNoUmbrella]);
    expect(u.thoughts.map((t) => t.id)).toEqual([THOUGHT.goodUmbrella]);
    w.state.tick += 1200;
    decide(w, g);
    expect(g.thoughts.map((t) => t.id)).toEqual([THOUGHT.rainNoUmbrella, THOUGHT.rainNoUmbrella]);
    setWeather(w, 'hot');
    decide(w, g);
    setWeather(w, 'cold');
    decide(w, g);
    expect(g.thoughts.slice(-2).map((t) => t.id)).toEqual([THOUGHT.tooHot, THOUGHT.tooCold]);
  });

  it('a guest heading for a storm-held ride thinks it was closed for the storm', () => {
    const w = makeTestWorld();
    const wheel = placeRideDirect(w, 'big_wheel', 10, 10);
    wheel.status = 'open';
    setWeather(w, 'storm');
    updateWeather(w);
    const g = addGuestDirect(w, 100, { target: `ride:${wheel.id}`, items: { map: false, umbrella: true, balloon: false } });
    decide(w, g);
    expect(g.thoughts.map((t) => t.id)).toContain(THOUGHT.stormClosed);
  });

  it('hot weather raises thirst ×1.5 and cold weather lowers energy ×1.2 (extra over the base rate)', () => {
    const w = makeTestWorld();
    const g = addGuestDirect(w, 100, { temperament: 50 });
    const perTick = weatherHooks.perTick ?? [];
    expect(perTick.length).toBeGreaterThan(0);
    const run = (from: number, ticks: number): void => {
      for (let t = from; t < from + ticks; t++) {
        w.state.tick = t;
        for (const h of perTick) h(w, g);
      }
    };
    setWeather(w, 'sunny');
    run(1000, 1000);
    expect([g.needs.thirst, g.needs.energy]).toEqual([40, 230]);
    setWeather(w, 'hot');
    run(1000, 1000); // 10 × (8 × 0.5)
    expect(g.needs.thirst).toBe(80);
    setWeather(w, 'cold');
    run(1000, 1000); // 2 × 5 × 3 × 0.2 × drain 1.0
    expect(g.needs.energy).toBe(224);
  });

  it('stall want uses the catalog weather factors and the Snack Deal', () => {
    const w = makeTestWorld();
    const fizz = placeStallDirect(w, 'fizz_stand', 20, 20);
    const umbrella = placeStallDirect(w, 'umbrella_stand', 22, 20);
    const snack = placeStallDirect(w, 'snack_shack', 24, 20);
    const cocoa = placeStallDirect(w, 'cocoa_hut', 26, 20);
    const g = addGuestDirect(w, 100);
    const want = (s: typeof fizz): number => (weatherHooks.stallWant ?? []).reduce((f, h) => f * h(w, g, s), 1);
    setWeather(w, 'hot');
    expect([weatherStallFactor(w, fizz), weatherStallFactor(w, umbrella), weatherStallFactor(w, snack), weatherStallFactor(w, cocoa)]).toEqual([1.5, 1, 1, 0.4]);
    setWeather(w, 'rain');
    expect([want(fizz), want(umbrella), want(snack), want(cocoa)]).toEqual([1, 3, 1, 1.6]);
    setWeather(w, 'sunny');
    expect(want(umbrella)).toBeCloseTo(0.2, 10);
    executeCommand(w, { type: 'startCampaign', campaignType: 'snack_deal', targetId: snack.id });
    expect(want(snack)).toBeCloseTo(1.5, 10);
  });

  it('in rain without an umbrella, covered rides score ×1.5 and others ×0.6 (×0.8 for temperament ≥ 80)', () => {
    const w = makeTestWorld();
    const covered = placeRideDirect(w, 'carousel', 10, 10);
    const open = placeRideDirect(w, 'big_wheel', 20, 10);
    const g = addGuestDirect(w, 100, { temperament: 50 });
    const bold = addGuestDirect(w, 100, { temperament: 80 });
    const dry = addGuestDirect(w, 100, { items: { map: false, umbrella: true, balloon: false } });
    setWeather(w, 'sunny');
    expect([rideScoreFactor(w, g, covered), rideScoreFactor(w, g, open)]).toEqual([1, 1]);
    for (const weather of ['rain', 'storm'] as WeatherKey[]) {
      setWeather(w, weather);
      expect(rideScoreFactor(w, g, covered)).toBe(1.5);
      expect(rideScoreFactor(w, g, open)).toBe(0.6);
      expect(rideScoreFactor(w, bold, open)).toBe(0.8);
      expect([rideScoreFactor(w, dry, covered), rideScoreFactor(w, dry, open)]).toEqual([1, 1]);
    }
  });

  it('the rideScoreFactor hook multiplies the ride score by the weather and campaign factor', () => {
    const w = makeTestWorld();
    const open = placeRideDirect(w, 'big_wheel', 20, 10); // chill, uncovered
    const g = addGuestDirect(w, 100, { temperament: 0 });
    const hook = (weatherHooks.rideScoreFactor ?? [])[0]!;
    expect(weatherHooks.rideScore ?? []).toHaveLength(0);
    setWeather(w, 'sunny');
    expect(hook(w, g, open)).toBe(1);
    setWeather(w, 'rain');
    expect(hook(w, g, open)).toBeCloseTo(0.6, 10);
    executeCommand(w, { type: 'startCampaign', campaignType: 'ride_spotlight', targetId: open.id });
    expect(rideScoreFactor(w, g, open)).toBeCloseTo(0.6 * 1.6, 10);
  });
});
