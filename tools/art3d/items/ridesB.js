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
