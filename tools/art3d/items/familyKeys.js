// Pure (no three.js, so vitest can load it): the frame keys of the new family flat rides of batch A (dodgem_boats,
// mini_pirate_ship, balloon_wheel, frog_hopper), shared by their bake modules and tests/unit/art3d/familyRides.test.ts.
// Motion comes from src/render/sprites/content/familyMotion.ts, the functions today's look draws with, so both looks
// pose a ride the same at every angle slot.
//
// None of the four has a REVOLUTIONS entry (src/render/anim.ts), so a run turns 2 turns and plays each motion twice,
// starting and ending at slot 0. A flat ride only runs with riders aboard (src/sim/rides/flat/update.ts), so the empty
// ride is ONE rest picture for every slot, as the towers and arenas of batch 1 do; the budget goes to the full pictures.
import { cycleD2, cycleKeys, timeD2, timeKeys } from './flatRides.js';
import { frogShare, miniShipTheta } from '../../../src/render/sprites/content/familyMotion';

// ------------------------------------------------------------------ Dodgem Boats

/** 8 pictures per turn (the boats drift an eighth of the way round between pictures), as the bumper cars. */
export const BOAT_PICS = 8;
export function dodgemKeys() {
  const pick = (step, full) => (full ? `t${Math.floor((step * BOAT_PICS) / 16)}` : 'rest');
  // Density 2: every other picture (4 per turn).
  return timeD2('dodgem_boats', timeKeys('dodgem_boats', {}, pick), pick, 4);
}
/** Turn share a dodgem picture is posed at (the rest picture: 0, no riders). */
export function dodgemTime(id) {
  return id === 'rest' ? { t: 0, full: false } : { t: Number(id.slice(1)) / BOAT_PICS, full: true };
}

// ------------------------------------------------------------------ Mini Pirate Ship

/**
 * Signed swing level (-4..4) of time step `t` (0..15): today's swing MINI_SHIP_SWING * sin(2 PI * slot / 32) is
 * MINI_SHIP_SWING * sin(PI * t / 8), so level k is the swing at step k. 9 poses, each today's swing exactly.
 */
export function miniShipLevel(t) {
  const q = ((t % 16) + 16) % 16;
  return q <= 4 ? q : q <= 12 ? 8 - q : q - 16;
}
/** Swing angle (radians) of a level: today's miniShipTheta at the step of that level. */
export const miniShipLevelTheta = (level) => miniShipTheta(level / 16);
export function miniShipKeys() {
  const pick = (t, full) => (full ? `${miniShipLevel(t)}:1` : 'rest');
  // Density 2: every other time step (levels 0, +-2, +-4).
  return timeD2('mini_pirate_ship', timeKeys('mini_pirate_ship', {}, pick), pick, 2);
}

// ------------------------------------------------------------------ Balloon Wheel

/** 8 cars in 4 balloon colours, riders of car i copied from car i % 4: the wheel repeats every quarter turn. */
export const BALLOON_PERIOD = 8;
export function balloonKeys() {
  const opts = { period: BALLOON_PERIOD };
  const pick = (a, full) => (full ? `${a}:1` : 'rest');
  return cycleD2('balloon_wheel', cycleKeys('balloon_wheel', opts, pick), opts, pick, 2);
}

// ------------------------------------------------------------------ Frog Hopper

/** Seat ring heights are baked to the nearest 1/FROG_Q of the travel (14 cm): steps at one height share a picture. */
export const FROG_Q = 20;
export const frogLevel = (step) => Math.round(frogShare(step / 16) * FROG_Q);
export function frogKeys() {
  const pick = (t, full) => (full ? `h${frogLevel(t)}` : 'rest');
  // Density 2 keeps every picture: the hops are four steps long, every other step would lose the top of each hop.
  return timeD2('frog_hopper', timeKeys('frog_hopper', {}, pick), pick, 1);
}

/**
 * The batch A rides with a front (flatRides.js NON_ROUND's rule): all four bake rots [0, 1, 2, 3]: the pond, the ship
 * and the tower have their gates on one column, the wheel stands in one plane. Kept here, not added to flatRides.js
 * NON_ROUND: every flat ride's cache key hashes flatRides.js, and an edit there re-bakes all 18 batch 1 rides.
 */
export const FAMILY_NON_ROUND = ['dodgem_boats', 'mini_pirate_ship', 'balloon_wheel'];

/**
 * Entrances and exits in the model frame ([x, z] metres, footprint centred, front at +z): the sim's gate column
 * floor((w - 1) / 2) (src/data/catalog/flatRides.ts gateIndex), entrance on the front row, exit on the back row.
 * w = 3: x 0; w = 2: x -2.
 */
export const FAMILY_GATES = {
  dodgem_boats: { entrance: [0, 5.75], exit: [0, -5.75] },
  mini_pirate_ship: { entrance: [0, 7.4], exit: [0, -7.4] },
  balloon_wheel: { entrance: [-2, 3.6], exit: [-2, -3.6] },
  frog_hopper: { entrance: [-2, 3.4], exit: [-2, -3.4] },
};
