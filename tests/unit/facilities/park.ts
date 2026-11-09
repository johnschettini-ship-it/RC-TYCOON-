/**
 * Small parks for facility tests (not a test file). Owner: W2-C.
 *
 *   y=50..59  branch path x = 20 (junction at (20, 60))
 *   y=59      stalls placed with `stall(defId, x)` face south: service tile (x, 60)
 *   y=60      ======== main path x = 4..58 ========
 *   y=61..62  generator stub x = 31 (junction at (31, 60)), park entrance (31, 63)
 */
import { executeCommand } from '../../../src/sim/commands';
import { tileIndex } from '../../../src/sim/map';
import { markNetworkDirty } from '../../../src/sim/pathing';
import type { Ride } from '../../../src/sim/rides/types';
import type { Stall } from '../../../src/sim/stalls/types';
import type { World } from '../../../src/sim/types';
import { getFlatRideDef } from '../../../src/data/catalog';
import { gateIndex } from '../../../src/data/catalog/flatRides';
import { placeFootpath, placeStallDirect } from '../../helpers/world';

export const MAIN_Y = 60;
export const MAIN_X0 = 4;
export const MAIN_X1 = 58;
export const BRANCH_X = 20;

export interface FacilityPark {
  t: (x: number, y: number) => number;
  /** Main path tile at (x, 60). */
  main: (x: number) => number;
  /** Place a stall at (x, 59), service side south onto the main path. */
  stall: (defId: string, x: number) => Stall;
}

/**
 * Main path, a branch north at x = 20, weather pinned to `sunny`, park closed (no arrivals).
 * The clock moves one tick past the start so the first tick is not an hour start (balloon rolls).
 */
export function facilityPark(w: World): FacilityPark {
  const t = (x: number, y: number): number => tileIndex(w.state.map, x, y);
  w.state.tick += 1;
  for (let x = MAIN_X0; x <= MAIN_X1; x++) placeFootpath(w, x, MAIN_Y);
  for (let y = 50; y < MAIN_Y; y++) placeFootpath(w, BRANCH_X, y);
  pinWeather(w, 'sunny');
  w.state.park.open = false;
  markNetworkDirty(w);
  return {
    t,
    main: (x) => t(x, MAIN_Y),
    stall: (defId, x) => {
      const s = placeStallDirect(w, defId, x, MAIN_Y - 1, 2);
      markNetworkDirty(w);
      return s;
    },
  };
}

/** Keep the weather fixed for the whole test (no interval change, no RNG draw). */
export function pinWeather(w: World, weather: World['state']['management']['weather']['current']): void {
  const wx = w.state.management.weather;
  wx.current = weather;
  wx.next = weather;
  wx.nextChangeTick = Number.MAX_SAFE_INTEGER;
}

/**
 * Place flat ride `defId` with real commands (rotation 0, front faces south) so its front edge sits at
 * y = 55, then build its queue down to the main path and an exit path back to it. Returns the ride.
 */
export function placeConnectedRide(w: World, defId: string, x0: number): Ride {
  const def = getFlatRideDef(defId);
  if (!def) throw new Error(`unknown ride ${defId}`);
  const y0 = 56 - def.d;
  const res = executeCommand(w, { type: 'placeRide', defId, x: x0, y: y0, rotation: 0 });
  if (!res.ok) throw new Error(`placeRide ${defId}: ${res.reason}`);
  const g = x0 + gateIndex(def.w);
  const build = (x0_: number, y0_: number, x1: number, y1: number, kind: 'footpath' | 'queue'): void => {
    const r = executeCommand(w, { type: 'buildPathLine', x0: x0_, y0: y0_, x1, y1, kind });
    if (!r.ok) throw new Error(`path ${kind} (${x0_},${y0_})→(${x1},${y1}): ${r.reason}`);
  };
  build(g, 56, g, MAIN_Y - 1, 'queue');
  build(g, y0 - 1, x0 + def.w, y0 - 1, 'footpath');
  build(x0 + def.w, y0 - 1, x0 + def.w, MAIN_Y - 1, 'footpath');
  const ride = w.state.rides.find((r) => r.id === res.id);
  if (!ride) throw new Error('ride not found');
  return ride;
}
