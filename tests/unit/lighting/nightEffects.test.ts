/** Phase 4 §4.7 night effects on guests, arrivals, and the Boo costume. Owner: W3-F. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NIGHT_ENERGY_MULT, SPOOKY_RIDE_NIGHT_HAPPY } from '../../../src/data/tuning/night';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../../src/data/tuning/core';
import { guestHooks } from '../../../src/sim/hooks';
import { THOUGHT } from '../../../src/sim/guests/thoughts';
import { arrivalsPerHour } from '../../../src/sim/park/arrivals';
import { booBonusActive, nightArrivalFactor } from '../../../src/sim/lighting/api';
import { darkPathHour, darkPathPhase, darkPathTick, nightEnergyFactor, nightHooks, spookyAfterRide, spookyRideScoreFactor } from '../../../src/sim/lighting/hooks';
import { nightArrivalFactorFor, spookyScoreFactorFor } from '../../../src/sim/lighting/rules';
import { isSpookyRide, spookyRideCentre } from '../../../src/sim/lighting/spooky';
import { spookyItemsNear } from '../../../src/sim/scenery/api';
import { Content, PathItem, tileIndex, type Dir } from '../../../src/sim/map';
import { footprintTiles } from '../../../src/sim/footprint';
import type { Guest } from '../../../src/sim/guests/types';
import type { Ride } from '../../../src/sim/rides/types';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, makeTestWorld, makeTrackRideDataDirect, placeFootpath, placeQueue, placeRideDirect, runTicks } from '../../helpers/world';

// W3-D owns `spookyItemsNear` (a stub until it merges): count items here.
vi.mock('../../../src/sim/scenery/api', async (orig) => ({ ...(await orig<typeof import('../../../src/sim/scenery/api')>()), spookyItemsNear: vi.fn(() => 0) }));

const at = (hour: number, day = 1): number => day * TICKS_PER_DAY + hour * TICKS_PER_HOUR;

function lampAt(w: World, x: number, y: number): number {
  const i = placeFootpath(w, x, y);
  w.state.map.pathItem[i] = PathItem.Lamp;
  return i;
}

function trackRideDirect(w: World, typeId: string, x: number, y: number, rotation: Dir = 1): Ride {
  const ride = placeRideDirect(w, 'carousel', 2, 2, 0);
  const map = w.state.map;
  for (const t of footprintTiles(map, 2, 2, 3, 3, 0) ?? []) {
    map.content[t] = Content.Empty;
    map.contentRef[t] = -1;
  }
  Object.assign(ride, { kind: 'track', defId: typeId, name: typeId, x, y, rotation, entrance: null, exit: null });
  makeTrackRideDataDirect(w, ride);
  return ride;
}

function darkGuest(w: World, patch: Partial<Guest> = {}): Guest {
  return addGuestDirect(w, placeFootpath(w, 10, 10), patch);
}

afterEach(() => {
  vi.mocked(spookyItemsNear).mockReset().mockReturnValue(0);
});

describe('the hook set is registered', () => {
  it('nightHooks fill perTick, energyFactor, rideScoreFactor, and afterRide in the registry', () => {
    expect(nightHooks.perTick).toEqual([darkPathTick]);
    expect(nightHooks.energyFactor).toEqual([nightEnergyFactor]);
    expect(nightHooks.rideScoreFactor).toEqual([spookyRideScoreFactor]);
    expect(nightHooks.afterRide).toEqual([spookyAfterRide]);
    expect(guestHooks.perTick).toContain(darkPathTick);
    expect(guestHooks.energyFactor).toContain(nightEnergyFactor);
  });
});

describe('dark paths at night (−4 happiness per game hour, thought "This path is too dark")', () => {
  it('a guest on an unlit footpath at night loses 4 happiness and thinks the path is too dark', () => {
    const w = makeTestWorld();
    w.state.tick = at(22);
    const g = darkGuest(w);
    darkPathHour(w, g);
    expect(g.needs.happiness).toBe(176);
    expect(g.thoughts.map((t) => t.id)).toEqual([THOUGHT.pathTooDark]);
  });

  it('repeats the penalty every hour, but the thought at most once per game day (master R5)', () => {
    const w = makeTestWorld();
    w.state.tick = at(22);
    const g = darkGuest(w);
    darkPathHour(w, g);
    w.state.tick = at(23);
    darkPathHour(w, g);
    w.state.tick = at(3, 2);
    darkPathHour(w, g);
    expect(g.needs.happiness).toBe(168);
    expect(g.thoughts.filter((t) => t.id === THOUGHT.pathTooDark)).toHaveLength(1);
  });

  it('applies on dark queue tiles too', () => {
    const w = makeTestWorld();
    w.state.tick = at(1);
    const g = addGuestDirect(w, placeQueue(w, 20, 20), { state: 'queueing' });
    darkPathHour(w, g);
    expect(g.needs.happiness).toBe(176);
  });

  it('no penalty on a lit path, by day, with After Dark off, while riding, or off a path', () => {
    const w = makeTestWorld();
    w.state.tick = at(22);
    lampAt(w, 30, 30);
    const lit = addGuestDirect(w, placeFootpath(w, 31, 30));
    darkPathHour(w, lit);
    expect(lit.needs.happiness).toBe(180);

    const g = darkGuest(w);
    w.state.tick = at(12);
    darkPathHour(w, g);
    expect(g.needs.happiness).toBe(180);

    w.state.tick = at(22);
    w.state.park.afterDark = false;
    darkPathHour(w, g);
    expect(g.needs.happiness).toBe(180);
    w.state.park.afterDark = true;

    const rider = darkGuest(w, { state: 'riding' });
    darkPathHour(w, rider);
    expect(rider.needs.happiness).toBe(180);

    const grass = addGuestDirect(w, tileIndex(w.state.map, 40, 40));
    darkPathHour(w, grass);
    expect(grass.needs.happiness).toBe(180);
    expect(g.thoughts).toEqual([]);
  });

  it('runs through the real guest tick once per game hour, at the guest\'s own phase of the hour', () => {
    const w = makeTestWorld();
    w.state.tick = at(22);
    const g = darkGuest(w, { needs: { hunger: 0, thirst: 0, bladder: 0, energy: 250, happiness: 250, nausea: 0 } });
    const phase = (TICKS_PER_HOUR - (g.id % TICKS_PER_HOUR)) % TICKS_PER_HOUR;
    expect(darkPathPhase(at(22) + phase, g.id)).toBe(true);
    let hits = 0;
    for (let t = at(22); t < at(22) + 3 * TICKS_PER_HOUR; t++) if (darkPathPhase(t, g.id)) hits++;
    expect(hits).toBe(3);
    runTicks(w, phase);
    expect(g.thoughts.some((t) => t.id === THOUGHT.pathTooDark)).toBe(false);
    runTicks(w, 1);
    expect(g.thoughts.some((t) => t.id === THOUGHT.pathTooDark)).toBe(true);
  });

  it('spreads the guests over the hour: each tick checks about 1/50 of them', () => {
    const counts = new Array<number>(TICKS_PER_HOUR).fill(0);
    for (let id = 0; id < 5000; id++) for (let t = 0; t < TICKS_PER_HOUR; t++) if (darkPathPhase(at(21) + t, id)) counts[t]!++;
    expect(Math.max(...counts)).toBe(100);
    expect(Math.min(...counts)).toBe(100);
  });
});

describe('night energy and spooky rides', () => {
  it('energy loss × 1.25 at night with After Dark on, else × 1', () => {
    const w = makeTestWorld();
    const g = darkGuest(w);
    w.state.tick = at(23);
    expect(nightEnergyFactor(w, g)).toBe(NIGHT_ENERGY_MULT);
    w.state.tick = at(10);
    expect(nightEnergyFactor(w, g)).toBe(1);
    w.state.tick = at(23);
    w.state.park.afterDark = false;
    expect(nightEnergyFactor(w, g)).toBe(1);
  });

  it('the catalog spooky flag marks the Haunted Manor and the Ghost Train', () => {
    const w = makeTestWorld();
    expect(isSpookyRide(w, placeRideDirect(w, 'haunted_manor', 10, 10, 0))).toBe(true);
    expect(isSpookyRide(w, placeRideDirect(w, 'carousel', 20, 10, 0))).toBe(false);
    expect(isSpookyRide(w, trackRideDirect(w, 'ghost_train', 30, 30))).toBe(true);
    expect(isSpookyRide(w, trackRideDirect(w, 'mini_railway', 30, 40))).toBe(false);
  });

  it('spooky ride score × 1.3 plus 2% per spooky scenery item within 6 tiles, at most +20%', () => {
    expect(spookyScoreFactorFor(0)).toBe(1.3);
    expect(spookyScoreFactorFor(3)).toBeCloseTo(1.36, 12);
    expect(spookyScoreFactorFor(10)).toBeCloseTo(1.5, 12);
    expect(spookyScoreFactorFor(25)).toBeCloseTo(1.5, 12);
    const w = makeTestWorld();
    const manor = placeRideDirect(w, 'haunted_manor', 10, 10, 0);
    const carousel = placeRideDirect(w, 'carousel', 20, 10, 0);
    const g = darkGuest(w);
    const spy = vi.mocked(spookyItemsNear).mockReturnValue(4);
    w.state.tick = at(21);
    expect(spookyRideScoreFactor(w, g, manor)).toBeCloseTo(1.38, 12);
    expect(spy).toHaveBeenCalledWith(w, spookyRideCentre(w, manor), 6);
    expect(spookyRideScoreFactor(w, g, carousel)).toBe(1);
    w.state.tick = at(14);
    expect(spookyRideScoreFactor(w, g, manor)).toBe(1);
    w.state.tick = at(21);
    w.state.park.afterDark = false;
    expect(spookyRideScoreFactor(w, g, manor)).toBe(1);
  });

  it('the count centre is the footprint centre of a flat ride and the station origin of a track ride', () => {
    const w = makeTestWorld();
    const manor = placeRideDirect(w, 'haunted_manor', 10, 10, 0);
    expect(spookyRideCentre(w, manor)).toBe(tileIndex(w.state.map, 12, 12));
    const train = trackRideDirect(w, 'ghost_train', 30, 30);
    expect(spookyRideCentre(w, train)).toBe(tileIndex(w.state.map, 30, 30));
  });

  it('riding a spooky ride at night gives +5 happiness extra', () => {
    const w = makeTestWorld();
    const manor = placeRideDirect(w, 'haunted_manor', 10, 10, 0);
    const carousel = placeRideDirect(w, 'carousel', 20, 10, 0);
    const g = darkGuest(w);
    w.state.tick = at(0);
    spookyAfterRide(w, g, manor);
    expect(g.needs.happiness).toBe(180 + SPOOKY_RIDE_NIGHT_HAPPY);
    spookyAfterRide(w, g, carousel);
    expect(g.needs.happiness).toBe(185);
    w.state.tick = at(13);
    spookyAfterRide(w, g, manor);
    expect(g.needs.happiness).toBe(185);
  });
});

describe('arrivals at night', () => {
  it('Phase 1 curve × (0.5 + 0.5 × litShare) at night with After Dark on; × 1 by day or when off', () => {
    expect(nightArrivalFactorFor(0)).toBe(0.5);
    expect(nightArrivalFactorFor(1)).toBe(1);
    const w = makeTestWorld();
    placeFootpath(w, 10, 10); // 3 lit entrance stub tiles + 1 dark tile
    w.state.tick = at(22);
    expect(nightArrivalFactor(w)).toBe(0.5 + 0.5 * 0.75);
    w.state.tick = at(12);
    expect(nightArrivalFactor(w)).toBe(1);
    w.state.tick = at(22);
    w.state.park.afterDark = false;
    expect(nightArrivalFactor(w)).toBe(1);
  });

  it('reaches the arrival rate', () => {
    const w = makeTestWorld();
    w.state.park.open = true;
    placeRideDirect(w, 'carousel', 20, 20, 0).status = 'open';
    for (let x = 5; x < 15; x++) placeFootpath(w, x, 10);
    w.state.tick = at(23);
    const dark = arrivalsPerHour(w);
    for (let x = 5; x < 15; x += 3) w.state.map.pathItem[tileIndex(w.state.map, x, 10)] = PathItem.Lamp;
    const lit = arrivalsPerHour(w);
    expect(dark).toBeGreaterThan(0);
    expect(lit).toBeGreaterThan(dark);
    w.state.park.afterDark = false;
    expect(arrivalsPerHour(w)).toBeCloseTo(lit, 12);
  });
});

describe('Boo costume bonus (catalog §5): at night, or within 6 tiles of a spooky ride', () => {
  it('is active at night with After Dark on, anywhere', () => {
    const w = makeTestWorld();
    const tile = tileIndex(w.state.map, 40, 40);
    w.state.tick = at(22);
    expect(booBonusActive(w, tile)).toBe(true);
    w.state.tick = at(15);
    expect(booBonusActive(w, tile)).toBe(false);
  });

  it('uses only the spooky-ride distance rule when After Dark is off', () => {
    const w = makeTestWorld();
    w.state.park.afterDark = false;
    w.state.tick = at(22);
    placeRideDirect(w, 'haunted_manor', 10, 10, 0); // footprint x, y 10–13
    expect(booBonusActive(w, tileIndex(w.state.map, 40, 40))).toBe(false);
    expect(booBonusActive(w, tileIndex(w.state.map, 19, 13))).toBe(true); // 6 tiles east of x = 13
    expect(booBonusActive(w, tileIndex(w.state.map, 20, 13))).toBe(false); // 7 tiles
    expect(booBonusActive(w, tileIndex(w.state.map, 4, 4))).toBe(true); // 6 diagonal (Chebyshev)
    expect(booBonusActive(w, tileIndex(w.state.map, 3, 4))).toBe(false);
  });

  it('counts track spooky rides by their track tiles and ignores other rides', () => {
    const w = makeTestWorld();
    w.state.tick = at(12);
    placeRideDirect(w, 'carousel', 40, 40, 0);
    expect(booBonusActive(w, tileIndex(w.state.map, 41, 41))).toBe(false);
    trackRideDirect(w, 'ghost_train', 20, 30); // stations (20..22, 30)
    expect(booBonusActive(w, tileIndex(w.state.map, 28, 30))).toBe(true);
    expect(booBonusActive(w, tileIndex(w.state.map, 29, 30))).toBe(false);
    expect(booBonusActive(w, -1)).toBe(false);
  });
});

describe('After Dark off: no night effects (Phase 4 §4.7)', () => {
  it('a whole night with After Dark off leaves happiness, energy, arrivals, and thoughts as by day', () => {
    const run = (afterDark: boolean): { happiness: number; energy: number; dark: boolean } => {
      const w = makeTestWorld(99);
      w.state.park.afterDark = afterDark;
      const stop = (): number => 0;
      guestHooks.walkSpeed.push(stop);
      try {
        for (let x = 5; x < 25; x++) placeFootpath(w, x, 20);
        const guests = [] as Guest[];
        for (let x = 5; x < 25; x += 2) guests.push(addGuestDirect(w, tileIndex(w.state.map, x, 20), { needs: { hunger: 0, thirst: 0, bladder: 0, energy: 250, happiness: 200, nausea: 0 } }));
        w.state.tick = at(20);
        runTicks(w, 8 * TICKS_PER_HOUR);
        return {
          happiness: guests.reduce((a, g) => a + g.needs.happiness, 0),
          energy: guests.reduce((a, g) => a + g.needs.energy, 0),
          dark: guests.some((g) => g.thoughts.some((t) => t.id === THOUGHT.pathTooDark)),
        };
      } finally {
        guestHooks.walkSpeed.splice(guestHooks.walkSpeed.indexOf(stop), 1);
      }
    };
    const on = run(true);
    const off = run(false);
    expect(off.dark).toBe(false);
    expect(on.dark).toBe(true);
    expect(on.happiness).toBeLessThan(off.happiness);
    expect(on.energy).toBeLessThan(off.energy);
  });
});

describe('lit paths at night keep guests happier (Phase 4 §9.2 check, in small)', () => {
  it('mean happiness of guests on lit paths is higher than on unlit paths after a night', () => {
    const w = makeTestWorld(321);
    const stop = (): number => 0;
    guestHooks.walkSpeed.push(stop);
    try {
      const lit: Guest[] = [];
      const dark: Guest[] = [];
      for (let x = 5; x < 30; x++) {
        placeFootpath(w, x, 15);
        placeFootpath(w, x, 40);
      }
      for (let x = 5; x < 30; x += 4) w.state.map.pathItem[tileIndex(w.state.map, x, 15)] = PathItem.Lamp;
      for (let x = 6; x < 30; x += 2) {
        lit.push(addGuestDirect(w, tileIndex(w.state.map, x, 15)));
        dark.push(addGuestDirect(w, tileIndex(w.state.map, x, 40)));
      }
      w.state.tick = at(20);
      runTicks(w, 10 * TICKS_PER_HOUR);
      const mean = (gs: Guest[]): number => gs.reduce((a, g) => a + g.needs.happiness, 0) / gs.length;
      expect(mean(lit)).toBeGreaterThan(mean(dark) + 20);
    } finally {
      guestHooks.walkSpeed.splice(guestHooks.walkSpeed.indexOf(stop), 1);
    }
  });
});
