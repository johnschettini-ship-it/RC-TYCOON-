/**
 * Phase 6 flat rides and stalls (phase-6-polish.md §4.5, catalog §1 and §3): each builds by command once researched
 * (charged its catalog build cost), operates the Phase 1 cycle with its catalog capacity, cycle, and price, and each
 * stall sells with its catalog price, stock cost, and effects. Real commands, pathing, guests, and tick order.
 */
import { describe, expect, it } from 'vitest';
import { FLAT_RIDES, getStallDef, STALLS } from '../../../src/data/catalog';
import { LOAD_MAX_WAIT, UNLOAD_TICKS } from '../../../src/data/tuning/economy';
import { executeCommand } from '../../../src/sim/commands';
import { currentLedger } from '../../../src/sim/economy/ledger';
import { updateGuests } from '../../../src/sim/guests/update';
import { stepTick } from '../../../src/sim/tick';
import { validateState } from '../../../src/save/codec';
import { addGuestDirect, makeTestWorld } from '../../helpers/world';
import { facilityPark, MAIN_Y, placeConnectedRide } from '../facilities/park';

const RIDES = FLAT_RIDES.filter((d) => d.phase === 6);
const STALL_IDS = STALLS.filter((d) => d.phase === 6).map((d) => d.id);
const TEMPERAMENT = { thrill: 90, family: 50, chill: 20 } as const;

describe('Phase 6 flat rides build, operate, and earn with their catalog numbers', () => {
  it('the catalog has the 4 Phase 6 flat rides', () => {
    expect(RIDES.map((d) => d.id)).toEqual(['magic_carpet', 'kiddie_cars', 'merry_mill', 'gyro_globe']);
  });

  it.each(RIDES.map((d) => [d.id, d] as const))('%s: locked → researched → placed (charged) → open → guests ride the full cycle', (id, def) => {
    const w = makeTestWorld(6100 + def.capacity);
    const p = facilityPark(w);
    expect(executeCommand(w, { type: 'placeRide', defId: id, x: 20, y: 40, rotation: 0 })).toEqual({ ok: false, reason: 'Not unlocked' });
    w.state.management.research.unlocked.push(id);
    const cash = w.state.park.cash;
    const ride = placeConnectedRide(w, id, 24);
    expect(ride.totalBuildCost).toBe(def.buildCost);
    expect(cash - w.state.park.cash).toBeGreaterThanOrEqual(def.buildCost);
    expect(ride.price).toBe(def.defaultPrice);
    expect(ride.stats).toEqual({ excitement: def.excitement, intensity: def.intensity, nausea: def.nausea });
    expect(executeCommand(w, { type: 'setRideOpen', rideId: ride.id, open: true }).ok).toBe(true);

    const guests = [];
    for (let k = 0; k < Math.min(def.capacity, 6); k++) guests.push(addGuestDirect(w, p.main(22 + k), { temperament: TEMPERAMENT[def.tag], cash: 5000 }));
    let maxRiders = 0;
    let runTicks = 0;
    for (let i = 0; i < 2000 && ride.totals.riders < guests.length; i++) {
      stepTick(w);
      if (ride.cycle.phase === 'running') runTicks++;
      maxRiders = Math.max(maxRiders, ride.riders.length);
    }
    for (let i = 0; i < LOAD_MAX_WAIT + def.cycleTicks + UNLOAD_TICKS + 10 && ride.riders.length > 0; i++) {
      stepTick(w);
      if (ride.cycle.phase === 'running') runTicks++;
    }
    expect(ride.totals.riders).toBeGreaterThanOrEqual(guests.length);
    expect(ride.totals.income).toBe(ride.totals.riders * def.defaultPrice);
    expect(maxRiders).toBeGreaterThan(0);
    expect(maxRiders).toBeLessThanOrEqual(def.capacity);
    // Every run lasts the catalog cycle.
    expect(runTicks % def.cycleTicks).toBe(0);
    expect(runTicks).toBeGreaterThan(0);
    expect(ride.riders).toEqual([]);
    for (const g of guests) expect(g.ridden[String(ride.id)] ?? 0).toBeGreaterThanOrEqual(1);
    expect(validateState(w.state)).toBeNull();
  });
});

describe('Phase 6 stalls build and sell with their catalog numbers', () => {
  it('the catalog has the 3 Phase 6 stalls', () => {
    expect(STALL_IDS).toEqual(['noodle_bar', 'smoothie_bar', 'photo_booth']);
  });

  it.each(STALL_IDS)('%s: locked → researched → placed (charged its build cost)', (id) => {
    const w = makeTestWorld(77);
    facilityPark(w);
    const cmd = { type: 'placeStall', defId: id, x: 30, y: MAIN_Y - 1, rotation: 2 } as const;
    expect(executeCommand(w, cmd)).toEqual({ ok: false, reason: 'Not unlocked' });
    w.state.management.research.unlocked.push(id);
    const cash = w.state.park.cash;
    const r = executeCommand(w, cmd);
    expect(r.ok).toBe(true);
    const def = getStallDef(id)!;
    expect(cash - w.state.park.cash).toBe(def.buildCost);
    const stall = w.state.stalls.find((s) => s.defId === id)!;
    expect([stall.price, stall.totalBuildCost]).toEqual([def.defaultPrice, def.buildCost]);
  });

  /** Walk a guest to the stall and let it buy; returns the guest. */
  function buy(id: string, patch: Parameters<typeof addGuestDirect>[2]) {
    const w = makeTestWorld(91);
    const p = facilityPark(w);
    const stall = p.stall(id, 33);
    const g = addGuestDirect(w, p.main(30), { target: `stall:${stall.id}`, ...patch });
    const before = currentLedger(w).lines;
    const stock0 = before.stock ?? 0;
    for (let k = 0; k < 300 && stall.totals.sales === 0; k++) updateGuests(w);
    return { w, stall, g, stock0 };
  }

  it('Noodle Bar: hunger −170 at $4.50 (stock $1.60)', () => {
    const { w, stall, g, stock0 } = buy('noodle_bar', { needs: { hunger: 220, thirst: 40, bladder: 20, energy: 200, happiness: 150, nausea: 0 } });
    expect(stall.totals.sales).toBe(1);
    expect(stall.totals.income).toBe(450);
    expect(g.needs.hunger).toBe(50);
    expect(g.cash).toBe(8000 - 450);
    expect((currentLedger(w).lines.stock ?? 0) - stock0).toBe(-160);
  });

  it('Smoothie Bar: thirst −140 and energy +20 at $3.00 (stock $0.90)', () => {
    const { w, stall, g, stock0 } = buy('smoothie_bar', { needs: { hunger: 40, thirst: 200, bladder: 20, energy: 120, happiness: 150, nausea: 0 } });
    expect(stall.totals.sales).toBe(1);
    expect(stall.totals.income).toBe(300);
    expect(g.needs.thirst).toBe(60);
    expect(g.needs.energy).toBe(140);
    expect((currentLedger(w).lines.stock ?? 0) - stock0).toBe(-90);
  });

  it('Photo Booth: a photo and happiness +10 at $4.00 (stock $0.80)', () => {
    const { w, stall, g, stock0 } = buy('photo_booth', { needs: { hunger: 40, thirst: 40, bladder: 20, energy: 200, happiness: 150, nausea: 0 } });
    expect(stall.totals.sales).toBe(1);
    expect(stall.totals.income).toBe(400);
    expect(g.items.photo).toBe(true);
    expect(g.needs.happiness).toBeGreaterThanOrEqual(160);
    expect((currentLedger(w).lines.stock ?? 0) - stock0).toBe(-80);
    expect(validateState(w.state)).toBeNull();
  });
});
