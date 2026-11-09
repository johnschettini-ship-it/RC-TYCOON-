/** content-catalog.md §1. Money in cents, ratings in hundredths, cycle in ticks (20 per second). */
import type { ContentFlags, FlatRideDef, Phase, RideTag, Unlock } from './types';

const F = (covered = false, spooky = false, tall = false): ContentFlags => ({ covered, spooky, tall });

function ride(
  id: string, name: string, phase: Phase, unlock: Unlock, tag: RideTag, flags: ContentFlags,
  w: number, d: number, exc: number, int: number, nau: number, capacity: number, cycleS: number,
  build: number, run: number, price: number,
): FlatRideDef {
  return {
    id, name, phase, unlock, tag, flags, w, d,
    excitement: Math.round(exc * 100), intensity: Math.round(int * 100), nausea: Math.round(nau * 100),
    capacity, cycleTicks: cycleS * 20,
    buildCost: build * 100, runningCostMonthly: run * 100, defaultPrice: price * 100,
  };
}

export const FLAT_RIDES: readonly FlatRideDef[] = Object.freeze([
  ride('carousel', 'Carousel', 1, 'start', 'family', F(true), 3, 3, 2.5, 1.0, 0.5, 16, 20, 1200, 40, 2),
  ride('big_wheel', 'Big Wheel', 1, 'start', 'chill', F(false, false, true), 3, 3, 3.0, 0.8, 0.3, 24, 30, 1800, 60, 3),
  ride('swing_tower', 'Swing Tower', 1, 'start', 'thrill', F(false, false, true), 3, 3, 4.5, 4.0, 2.0, 20, 25, 2400, 80, 3),
  ride('teacup_twirl', 'Teacup Twirl', 1, 'start', 'family', F(true), 3, 3, 3.5, 3.5, 4.5, 18, 20, 1500, 50, 2),
  ride('bumper_cars', 'Bumper Cars', 3, 'gentle', 'family', F(true), 4, 4, 4.0, 2.5, 0.5, 12, 25, 2000, 70, 2),
  ride('rocket_rounds', 'Rocket Rounds', 3, 'gentle', 'family', F(), 3, 3, 2.8, 1.5, 1.0, 16, 20, 1400, 45, 2),
  ride('spiral_slide', 'Spiral Slide', 3, 'gentle', 'chill', F(), 2, 2, 2.0, 1.5, 0.2, 4, 15, 900, 30, 1),
  ride('observation_tower', 'Observation Tower', 3, 'gentle', 'chill', F(true, false, true), 2, 2, 3.0, 0.5, 0.2, 20, 40, 3500, 90, 3),
  ride('mirror_maze', 'Mirror Maze', 3, 'gentle', 'chill', F(true), 3, 3, 2.5, 0.5, 0.0, 15, 40, 1400, 35, 2),
  ride('haunted_manor', 'Haunted Manor', 3, 'gentle', 'chill', F(true, true), 4, 4, 4.0, 2.0, 0.5, 20, 40, 3200, 80, 3),
  ride('pendulum_ship', 'Pendulum Ship', 3, 'thrill', 'thrill', F(), 3, 5, 5.0, 5.5, 3.5, 24, 25, 3000, 90, 3),
  ride('thunder_disc', 'Thunder Disc', 3, 'thrill', 'thrill', F(), 4, 4, 5.5, 6.5, 4.5, 24, 25, 4000, 110, 4),
  ride('drop_tower', 'Drop Tower', 3, 'thrill', 'thrill', F(false, false, true), 2, 2, 6.0, 7.5, 3.0, 12, 20, 4500, 120, 4),
  ride('flip_arm', 'Flip Arm', 3, 'thrill', 'thrill', F(false, false, true), 3, 3, 6.5, 8.0, 6.0, 16, 25, 5000, 140, 4),
  // Phase 6 §4.5 (Build 3): locked while BUILD_MAX_PHASE < 6; research entries and art come with W4-D.
  ride('magic_carpet', 'Magic Carpet', 6, 'thrill', 'thrill', F(), 4, 3, 5.2, 6.0, 3.8, 20, 25, 3600, 100, 3),
  ride('kiddie_cars', 'Kiddie Cars', 6, 'gentle', 'family', F(), 3, 3, 2.2, 0.6, 0.2, 12, 20, 1000, 30, 1),
  ride('merry_mill', 'Merry Mill', 6, 'gentle', 'chill', F(), 3, 3, 3.2, 1.2, 0.8, 16, 30, 2200, 60, 2),
  ride('gyro_globe', 'Gyro Globe', 6, 'thrill', 'thrill', F(false, false, true), 3, 3, 7.0, 8.5, 7.0, 8, 25, 6000, 160, 5),
]);

/** Definitions by id (first entry wins, as `find` would). The simulation looks these up many times per tick. */
const FLAT_RIDES_BY_ID: ReadonlyMap<string, FlatRideDef> = (() => {
  const byId = new Map<string, FlatRideDef>();
  for (const d of FLAT_RIDES) if (!byId.has(d.id)) byId.set(d.id, d);
  return byId;
})();

export function getFlatRideDef(id: string): FlatRideDef | undefined {
  return FLAT_RIDES_BY_ID.get(id);
}

/** Catalog legend: the entrance gate is front-edge tile floor((w − 1) / 2); the exit is the matching back-edge tile. */
export function gateIndex(w: number): number {
  return Math.floor((w - 1) / 2);
}
