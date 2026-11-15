// Shared helpers of the batch 1 flat-ride bake modules (phase 8c). The frame rule follows src/render/anim.ts:
// 32 angle slots, phones use the even ones (coarseRideFrame), occupancy is baked as occ0 (empty) and occ1 (full).
import { rideKeys } from './rideKeys.js';

/** Rides with a front (entrance, boarding side, non-square footprint): they bake rots [0,1,2,3]. The rest are round. */
export const NON_ROUND = ['bumper_cars', 'pendulum_ship', 'magic_carpet', 'big_wheel', 'haunted_manor', 'mirror_maze', 'thunder_disc', 'drop_tower', 'observation_tower', 'spiral_slide'];

/**
 * Frame keys for a rotating ride whose pictures repeat every `period` angle slots (even, 2..32, dividing 32).
 * `pick(slot, full)` gets the slot folded into the period (even, 0..period-2) and returns a picture id; angle slot
 * 32 wraps to 0 so a cycle never jumps. `walkThrough` rides have no riders: one picture serves occ0 and occ1.
 * Returns Map(pictureId -> { keys, angle, swing, full }) like rideKeys.
 */
export function cycleKeys(item, opts, pick) {
  const { period, walkThrough = false } = opts;
  if (!Number.isInteger(period) || period < 2 || period > 32 || period % 2 || 32 % period) {
    throw new Error(`cycleKeys(${item}): period must be an even divisor of 32 (2..32), got ${period}`);
  }
  return rideKeys(item, [0], (a, _s, full) => pick(a % period, walkThrough ? false : full));
}

/**
 * Frame keys for motion that is not a rotation (swing, drop, lift): the 16 even angle slots are 16 time steps of
 * the cycle. `pick(step, full)` gets step 0..15. `walkThrough` rides bake one occupancy state.
 */
export function timeKeys(item, opts, pick) {
  const { walkThrough = false } = opts ?? {};
  return rideKeys(item, [0], (a, _s, full) => pick(a >> 1, walkThrough ? false : full));
}
