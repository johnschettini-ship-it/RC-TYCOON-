// Pure (no three.js, so vitest can load it): the motion and frame keys of the new rides batch B
// (docs/superpowers/specs/2026-11-17-new-rides-design.md): chair_swing_twist, spin_wheel_drop, loop_swing,
// carousel_deluxe, station_show. Each ride's picture for a game frame depends only on the frame's angle slot (0-31),
// the fraction of the CURRENT turn: none of these rides has a REVOLUTIONS entry in src/render/anim.ts (unchanged), so
// the game turns 2 turns per run and every motion here is one whole cycle per turn, played twice per run, starting and
// ending at rest (slot 0) as today's look (src/render/sprites/content/batchBRides.ts) does.
// An empty flat ride never runs in the game (src/sim/rides/flat/update.ts starts a run only with riders aboard), so the
// empty frames show one rest picture and the size budget goes to the running, full ones (as items/towerMotion.js).
import { cycleD2, cycleKeys } from './flatRides.js';

const TAU = Math.PI * 2;

/** Picture ids: `a<slot>` for a full frame at an even slot, `rest` for every empty frame. */
const fullOrRest = (id) => (a, full) => (full ? id(a) : 'rest');

// ------------------------------------------------------------------ Chair Swing Twist

/**
 * Chair Swing Twist (today's drawChairSwingTwist): the top climbs the column and tilts by the same share, sin² of the
 * turn (0 at rest, the peak half way); the tilt's lean goes round once per turn and the chairs spin 3 times per turn.
 */
export const TWIST = { tilt: (18 * Math.PI) / 180, spin: 3, throw: (35 * Math.PI) / 180, chairs: 12 };

/** Climb and tilt share (0..1) at an angle slot: today's twistShare(slot / 32). */
export const twistShare = (slot) => Math.sin((Math.PI * slot) / 32) ** 2;

/** The top's pose at an angle slot: climb share, tilt (radians), the lean's heading and the spin (radians). */
export function twistPose(slot) {
  const w = twistShare(slot);
  return { lift: w, tilt: TWIST.tilt * w, heading: (TAU * slot) / 32, spin: (TAU * TWIST.spin * slot) / 32 };
}

/**
 * Chair Swing Twist frame keys: the lean's heading turns once per turn, so no shorter period repeats: period 32, 16
 * pictures full and one at rest. Density 2 keeps every picture (as the gyro globe): every other picture would turn the
 * 12 chairs (two colours, 60 degrees a pair) 135 degrees a step, 15 degrees past a pair: half a chair's spacing, so the
 * ring would read as turning either way.
 */
export function twistKeys() {
  const opts = { period: 32 };
  const pick = fullOrRest((a) => `a${a}`);
  return cycleD2('chair_swing_twist', cycleKeys('chair_swing_twist', opts, pick), opts, pick, 2);
}

// ------------------------------------------------------------------ Spinning Wheel Drop

/**
 * Spinning Wheel Drop (today's drawSpinWheelDrop): the turret turns once per turn; the wheel spins 2.5 turns per turn
 * (16 seats in two colours repeat every 45 degrees, so a turn ends where it began) and, by the share wheelShare, rises
 * on its telescopic arm and tilts up to 75 degrees.
 */
export const WHEEL = { tilt: (75 * Math.PI) / 180, spin: 2.5, seats: 16 };

const smooth = (x) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/** Tilt and rise share (0..1) at turn fraction t: flat, up between 0.15 and 0.4, held until 0.7, flat again by 0.9. */
export function wheelShare(t) {
  const u = t - Math.floor(t);
  if (u < 0.4) return smooth((u - 0.15) / 0.25);
  if (u <= 0.7) return 1;
  return smooth((0.9 - u) / 0.2);
}

/** The wheel's pose at an angle slot: rise share, tilt, the turret's heading and the wheel's spin (radians). */
export function wheelPose(slot) {
  const w = wheelShare(slot / 32);
  return { lift: w, tilt: WHEEL.tilt * w, heading: (TAU * slot) / 32, spin: (TAU * WHEEL.spin * slot) / 32 };
}

/**
 * Spinning Wheel Drop frame keys: the turret's heading turns once per turn, so period 32: 16 pictures full and one at
 * rest. Density 2 keeps every picture: every other one would spin the wheel 112.5 degrees a step, half a seat pair
 * past 90, with no direction.
 */
export function wheelKeys() {
  const opts = { period: 32 };
  const pick = fullOrRest((a) => `a${a}`);
  return cycleD2('spin_wheel_drop', cycleKeys('spin_wheel_drop', opts, pick), opts, pick, 2);
}
