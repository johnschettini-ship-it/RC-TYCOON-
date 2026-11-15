// Pure (no three.js, so vitest can load it): the frame keys and motion of the batch 1 "swinger" flat rides
// (pendulum_ship, magic_carpet, flip_arm). Each motion is today's (src/render/sprites/content/thrillRides.ts and
// phase6Rides.ts), which reads `st.angle` = angle slot / 32: one full motion cycle per 32 slots. None of the three
// has a REVOLUTIONS entry in src/render/anim.ts, so the game runs 2 cycles per run, today and in the bake alike;
// anim.ts is not changed.
// Size rule (decoded <= 32 MB per turn at density 4; compressed <= 4 MB for a ride whose motion needs the pictures):
// these rides have a front (4 rotations) and large pictures, so the 16 time steps share fewer poses: 7 swing poses
// for the ship (only 63 and 68 degrees share one), 8 carpet positions and 8 arm angles, both evenly spaced (45
// degrees). Every step shows a pose close to today's at that step (tests/unit/art3d/flatRides.test.ts).
import { cycleKeys, timeKeys } from './flatRides.js';

/** Pendulum Ship: peak swing angle (today's SHIP_SWING). */
export const SHIP_SWING = (68 * Math.PI) / 180;

/**
 * Pendulum Ship: signed swing level (-4..4) of time step `t` (0..15, angle slot t * 2). Today's swing is
 * SHIP_SWING * sin(2 PI * slot / 32) = SHIP_SWING * sin(PI * t / 8): level k is that swing at t = k.
 */
export function shipLevel(t) {
  const q = ((t % 16) + 16) % 16;
  return q <= 4 ? q : q <= 12 ? 8 - q : q - 16;
}

/**
 * Pendulum Ship: baked pose (-3..3) of a swing level. Levels 0-2 have their own pose; levels 3 and 4 (63 and 68
 * degrees today, 5 degrees apart) share pose 3, where the ship hangs at the top of each swing.
 */
export function shipPose(level) {
  return Math.sign(level) * Math.min(3, Math.abs(level));
}

/** Swing angle (radians) of a baked ship pose: today's swing at levels 0, 1, 2 and between levels 3 and 4. */
export function shipTheta(pose) {
  const at = [0, 1, 2, 3.5][Math.abs(pose)];
  return Math.sign(pose) * SHIP_SWING * Math.sin((Math.PI * at) / 8);
}

/** Pendulum Ship frame keys: Map(`<pose>:<occ>` -> { keys, ... }), 7 swing poses x empty / full. */
export function shipKeys() {
  return timeKeys('pendulum_ship', {}, (t, full) => `${shipPose(shipLevel(t))}:${full ? 1 : 0}`);
}

/** Magic Carpet: arm angle (radians) of time step `t` (0..15): today's phi = 2 PI * slot / 32, one turn per cycle. */
export function carpetPhi(t) {
  return (Math.PI * 2 * t) / 16;
}

/** Magic Carpet frame keys: Map(`<step>:<occ>` -> ...), 8 positions (every other time step, 45 degrees) x empty / full. */
export function carpetKeys() {
  return timeKeys('magic_carpet', {}, (t, full) => `${t & ~1}:${full ? 1 : 0}`);
}

/** Flip Arm: arm angle (radians) of an even angle slot (0..30): today's phi = 2 PI * slot / 32. */
export function flipPhi(slot) {
  return (Math.PI * 2 * slot) / 32;
}

/**
 * Flip Arm frame keys: Map(`<slot>:<occ>` -> ...). A one-sided arm repeats only every full turn (period 32); 8 arm
 * angles 45 degrees apart (slots 0, 4, ...), each serving its slot and the one after.
 */
export function flipKeys() {
  return cycleKeys('flip_arm', { period: 32 }, (a, full) => `${a & ~3}:${full ? 1 : 0}`);
}

/**
 * Entrances and exits in the model frame ([x, z] metres, footprint centred, front at +z, x along the front edge):
 * the sim's gates (src/sim/footprint.ts flatRideGates) are the front-row tile of column floor((w - 1) / 2) and the
 * back-row tile of the same column. The models put their entrance gate (and its steps) and exit gate there.
 */
export const GATES = {
  pendulum_ship: { entrance: [0, 8.7], exit: [0, -8.7] }, // w 3: column 1, x 0
  magic_carpet: { entrance: [-2, 4.2], exit: [-2, -4.2] }, // w 4: column 1, x -2
  flip_arm: { entrance: [0, 5.0], exit: [0, -5.6] }, // w 3: column 1, x 0
};
