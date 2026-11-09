/**
 * Phase 3 §4.11: every research flat ride runs the Phase 1 cycle once unlocked.
 * Real commands, pathing, guests, rides, and tick order (`stepTick`).
 */
import { describe, expect, it } from 'vitest';
import { FLAT_RIDES } from '../../../src/data/catalog';
import { executeCommand } from '../../../src/sim/commands';
import { stepTick } from '../../../src/sim/tick';
import { validateState } from '../../../src/save/codec';
import { LOAD_MAX_WAIT, UNLOAD_TICKS } from '../../../src/data/tuning/economy';
import { addGuestDirect, makeTestWorld } from '../../helpers/world';
import { facilityPark, placeConnectedRide } from './park';

const PHASE3_RIDES = FLAT_RIDES.filter((d) => d.phase === 3);

/** Temperament that likes the ride's tag and can stand its intensity. */
const TEMPERAMENT = { thrill: 90, family: 50, chill: 20 } as const;

describe('Phase 3 flat rides (Phase 3 §4.11)', () => {
  it('the catalog has the 10 research flat rides', () => {
    expect(PHASE3_RIDES.map((d) => d.id)).toEqual([
      'bumper_cars',
      'rocket_rounds',
      'spiral_slide',
      'observation_tower',
      'mirror_maze',
      'haunted_manor',
      'pendulum_ship',
      'thunder_disc',
      'drop_tower',
      'flip_arm',
    ]);
  });

  it.each(PHASE3_RIDES.map((d) => [d.id, d] as const))('%s: locked → unlock → place → open → guests ride the full cycle', (id, def) => {
    const w = makeTestWorld(4100 + def.capacity);
    const p = facilityPark(w);
    expect(executeCommand(w, { type: 'placeRide', defId: id, x: 20, y: 40, rotation: 0 })).toEqual({ ok: false, reason: 'Not unlocked' });

    w.state.management.research.unlocked.push(id);
    const ride = placeConnectedRide(w, id, 24);
    expect(ride.cycle.phase).toBe('waiting');
    expect(executeCommand(w, { type: 'setRideOpen', rideId: ride.id, open: true }).ok).toBe(true);

    const guests = [];
    for (let k = 0; k < Math.min(def.capacity, 6); k++) {
      guests.push(addGuestDirect(w, p.main(22 + k), { temperament: TEMPERAMENT[def.tag], cash: 5000 }));
    }
    const phases = new Set<string>();
    let maxRiders = 0;
    for (let i = 0; i < 1500 && ride.totals.riders < guests.length; i++) {
      stepTick(w);
      phases.add(ride.cycle.phase);
      maxRiders = Math.max(maxRiders, ride.riders.length);
    }
    // Finish the current cycle so every rider gets off.
    for (let i = 0; i < LOAD_MAX_WAIT + def.cycleTicks + UNLOAD_TICKS + 10 && ride.riders.length > 0; i++) {
      stepTick(w);
      phases.add(ride.cycle.phase);
    }

    expect(ride.totals.riders).toBeGreaterThanOrEqual(guests.length);
    expect(ride.totals.income).toBe(ride.totals.riders * ride.price);
    expect(maxRiders).toBeGreaterThan(0);
    expect(maxRiders).toBeLessThanOrEqual(def.capacity);
    expect([...phases]).toEqual(expect.arrayContaining(['loading', 'running', 'unloading']));
    expect(ride.riders).toEqual([]);
    for (const g of guests) expect(g.ridden[String(ride.id)] ?? 0).toBeGreaterThanOrEqual(1);
    expect(validateState(w.state)).toBeNull();
  });
});
