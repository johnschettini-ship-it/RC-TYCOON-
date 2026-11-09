/**
 * Small hand-built park for guest tests (not a test file).
 *
 *   y=53   C C C C                S S S S          C = Carousel exit loop, S = Swing Tower exit loop
 *   y=54   [Carousel] C          [Swing ] S        rides 3×3, rotation 0 (entrance faces south)
 *   y=57      Q                     Q              queues: 3 tiles each, x = 25 and x = 35
 *   y=59        k   f                         r    stalls: snack (30,59) fizz (32,59) restrooms (40,59)
 *   y=60   ======== main path x = 20..42 ========  service tiles on the main path
 *   y=61..62            |                          stub from the generator (x = 31)
 *   y=63            entrance (31, 63)
 */
import { tileIndex } from '../../../src/sim/map';
import type { World } from '../../../src/sim/types';
import type { Ride } from '../../../src/sim/rides/types';
import type { Stall } from '../../../src/sim/stalls/types';
import { placeFootpath, placeQueue, placeRideDirect, placeStallDirect } from '../../helpers/world';

export interface TestPark {
  carousel: Ride;
  swing: Ride;
  snack: Stall;
  fizz: Stall;
  restrooms: Stall;
  /** Main path tile at (x, 60). */
  main: (x: number) => number;
  t: (x: number, y: number) => number;
}

export function buildPark(w: World): TestPark {
  const t = (x: number, y: number): number => tileIndex(w.state.map, x, y);
  for (let x = 20; x <= 42; x++) placeFootpath(w, x, 60);

  const carousel = placeRideDirect(w, 'carousel', 24, 54);
  for (let y = 57; y <= 59; y++) placeQueue(w, 25, y);
  for (let x = 25; x <= 28; x++) placeFootpath(w, x, 53);
  for (let y = 54; y <= 59; y++) placeFootpath(w, 28, y);

  const swing = placeRideDirect(w, 'swing_tower', 34, 54);
  for (let y = 57; y <= 59; y++) placeQueue(w, 35, y);
  for (let x = 35; x <= 38; x++) placeFootpath(w, x, 53);
  for (let y = 54; y <= 59; y++) placeFootpath(w, 38, y);

  const snack = placeStallDirect(w, 'snack_shack', 30, 59, 2);
  const fizz = placeStallDirect(w, 'fizz_stand', 32, 59, 2);
  const restrooms = placeStallDirect(w, 'restrooms', 40, 59, 2);

  carousel.status = 'open';
  swing.status = 'open';
  w.state.park.open = true;
  return { carousel, swing, snack, fizz, restrooms, main: (x) => t(x, 60), t };
}
