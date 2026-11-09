/**
 * A park with every Phase 3 facility and ride, real arrivals and weather, run with `stepTick`:
 * same seed → same state hash; every saved state stays valid; facilities see use.
 */
import { describe, expect, it } from 'vitest';
import { FLAT_RIDES, STALLS } from '../../../src/data/catalog';
import { executeCommand } from '../../../src/sim/commands';
import { stepTick } from '../../../src/sim/tick';
import { validateState } from '../../../src/save/codec';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, stateHash } from '../../helpers/world';
import { facilityPark, placeConnectedRide } from './park';

const NEW_STALLS = STALLS.filter((s) => s.phase === 3).map((s) => s.id);
const NEW_RIDES = FLAT_RIDES.filter((r) => r.phase === 3);

function build(seed: number): World {
  const w = makeTestWorld(seed);
  const p = facilityPark(w);
  w.state.management.research.unlocked.push(...NEW_STALLS, ...NEW_RIDES.map((r) => r.id));
  // Real weather: let it change on its interval.
  w.state.management.weather.nextChangeTick = 0;
  w.state.park.cash = 10_000_000;
  // Stalls on the main path's north side; the first three Phase 1 stalls too.
  let x = 5;
  for (const id of ['snack_shack', 'fizz_stand', 'restrooms', ...NEW_STALLS]) {
    p.stall(id, x);
    x += 2;
  }
  // Four of the new rides north of the stalls (the rest are covered by their own tests).
  let rx = 30;
  for (const id of ['bumper_cars', 'spiral_slide', 'pendulum_ship', 'flip_arm']) {
    const ride = placeConnectedRide(w, id, rx);
    expect(executeCommand(w, { type: 'setRideOpen', rideId: ride.id, open: true }).ok).toBe(true);
    rx += (NEW_RIDES.find((r) => r.id === id)?.w ?? 3) + 2;
  }
  expect(executeCommand(w, { type: 'setParkOpen', open: true }).ok).toBe(true);
  return w;
}

function run(w: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    stepTick(w);
    if (w.state.tick % 250 === 0) expect(validateState(w.state)).toBeNull();
  }
}

describe('facilities determinism', () => {
  it('a 2,000-tick run with every facility gives the same state hash for the same seed', () => {
    const a = build(8080);
    const b = build(8080);
    run(a, 2000);
    run(b, 2000);
    expect(stateHash(a)).toBe(stateHash(b));
    expect(a.state.guests.length).toBeGreaterThan(0);
    const sales = a.state.stalls.reduce((n, s) => n + s.totals.sales, 0);
    expect(sales).toBeGreaterThan(0);
    const c = build(8081);
    run(c, 2000);
    expect(stateHash(c)).not.toBe(stateHash(a));
  });
});
