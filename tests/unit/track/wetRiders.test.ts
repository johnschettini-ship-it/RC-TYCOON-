/** Wet riders (Phase 4 §4.4): the water ride guest hooks. Owner: W3-C. */
import { describe, expect, it } from 'vitest';
import type { WeatherKey } from '../../../src/data/catalog';
import { WET_HAPPINESS_COLD_OR_RAIN, WET_HAPPINESS_HOT, WET_TICKS } from '../../../src/data/tuning/track';
import { guestHooks } from '../../../src/sim/hooks';
import { isGuestWet, rideWetsRiders, waterRideHooks } from '../../../src/sim/rides/track/waterHooks';
import { addGuestDirect, makeTestWorld, placeRideDirect } from '../../helpers/world';
import { addAll, EAST, place } from './helpers';

describe('wet rider happiness per game hour, by weather', () => {
  const cases: Array<[WeatherKey, number]> = [
    ['hot', WET_HAPPINESS_HOT],
    ['cold', WET_HAPPINESS_COLD_OR_RAIN],
    ['rain', WET_HAPPINESS_COLD_OR_RAIN],
    ['storm', WET_HAPPINESS_COLD_OR_RAIN],
    ['sunny', 0],
    ['cloudy', 0],
  ];
  it.each(cases)('%s: %i', (weather, delta) => {
    expect([WET_HAPPINESS_HOT, WET_HAPPINESS_COLD_OR_RAIN]).toEqual([8, -8]);
    const w = makeTestWorld();
    w.state.management.weather.current = weather;
    const wet = addGuestDirect(w, 0, { wetUntilTick: w.state.tick + 10 });
    const dry = addGuestDirect(w, 0, { wetUntilTick: -1 });
    wet.needs.happiness = 100;
    dry.needs.happiness = 100;
    for (const h of waterRideHooks.perHour ?? []) {
      h(w, wet);
      h(w, dry);
    }
    expect(wet.needs.happiness).toBe(100 + delta);
    expect(dry.needs.happiness).toBe(100);
  });

  it('clamps happiness to 0–255 and stops once the hour is over', () => {
    const w = makeTestWorld();
    const g = addGuestDirect(w, 0, { wetUntilTick: w.state.tick });
    w.state.management.weather.current = 'hot';
    g.needs.happiness = 252;
    for (const h of waterRideHooks.perHour ?? []) h(w, g);
    expect(g.needs.happiness).toBe(255);
    w.state.management.weather.current = 'rain';
    g.needs.happiness = 3;
    for (const h of waterRideHooks.perHour ?? []) h(w, g);
    expect(g.needs.happiness).toBe(0);
    expect(isGuestWet(w, g)).toBe(true);
    w.state.tick += 1;
    expect(isGuestWet(w, g)).toBe(false);
    g.needs.happiness = 100;
    for (const h of waterRideHooks.perHour ?? []) h(w, g);
    expect(g.needs.happiness).toBe(100);
  });

  it('the hooks are registered in the guest hook registry', () => {
    for (const h of waterRideHooks.perHour ?? []) expect(guestHooks.perHour).toContain(h);
    for (const h of waterRideHooks.afterRide ?? []) expect(guestHooks.afterRide).toContain(h);
    expect(waterRideHooks.perHour).toHaveLength(1);
    expect(waterRideHooks.afterRide).toHaveLength(1);
  });
});

describe('afterRide: a ride with a wetting piece gets its riders wet for 1 game hour', () => {
  it('wets after a flume with a splashdown and a raft with a waterfall, not after other rides', () => {
    const w = makeTestWorld();
    const flume = place(w, 'log_flume', 10, 10, EAST);
    addAll(w, flume, ['flume_station', 'flume_straight', 'flume_splashdown']);
    const dryFlume = place(w, 'log_flume', 10, 20, EAST);
    addAll(w, dryFlume, ['flume_straight', 'flume_turn_small_r']);
    const raft = place(w, 'rapids_raft', 10, 30, EAST);
    addAll(w, raft, ['rapids_lift', 'rapids_lift', 'rapids_lift', 'rapids_waterfall']);
    const coaster = place(w, 'steel_coaster', 30, 10, EAST);
    const carousel = placeRideDirect(w, 'carousel', 40, 40);
    expect(rideWetsRiders(w, flume)).toBe(true);
    expect(rideWetsRiders(w, raft)).toBe(true);
    expect(rideWetsRiders(w, dryFlume)).toBe(false);
    expect(rideWetsRiders(w, coaster)).toBe(false);
    expect(rideWetsRiders(w, carousel.id)).toBe(false);
    for (const [id, wets] of [[flume, true], [raft, true], [dryFlume, false], [coaster, false], [carousel.id, false]] as const) {
      const g = addGuestDirect(w, 0);
      const ride = w.state.rides.find((r) => r.id === id)!;
      for (const h of waterRideHooks.afterRide ?? []) h(w, g, ride);
      expect(g.wetUntilTick).toBe(wets ? w.state.tick + WET_TICKS : -1);
    }
  });
});
