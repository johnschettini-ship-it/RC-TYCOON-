// Shared helpers of the batch 1 flat-ride bake modules (phase 8c). The frame rule follows src/render/anim.ts:
// 32 angle slots, phones use the even ones (coarseRideFrame), occupancy is baked as occ0 (empty) and occ1 (full).
import { rideKeys } from './rideKeys.js';
import { encodeRideFrame } from '../../../src/render/anim';
import { frameKey } from '../../../src/render/real/indexFormat';

/**
 * Rides with a front (entrance, boarding side, non-square footprint): they bake rots [0,1,2,3]. The rest are round.
 * flip_arm (Task 3): square but not round: its arm turns in one vertical plane beside a side pillar, so a view turn
 * must turn that plane (today's drawFlipArm turns it with st.rotation).
 */
export const NON_ROUND = ['bumper_cars', 'pendulum_ship', 'magic_carpet', 'big_wheel', 'haunted_manor', 'mirror_maze', 'thunder_disc', 'drop_tower', 'observation_tower', 'spiral_slide', 'merry_mill', 'flip_arm'];

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
 * the cycle. The game turns REVOLUTIONS (default 2, src/render/anim.ts) per run, so a 16-step time cycle plays
 * twice per run unless the ride adds a REVOLUTIONS entry in src/render/anim.ts. `pick(step, full)` gets step 0..15. `walkThrough` rides bake one occupancy state.
 */
export function timeKeys(item, opts, pick) {
  const { walkThrough = false } = opts ?? {};
  return rideKeys(item, [0], (a, _s, full) => pick(a >> 1, walkThrough ? false : full));
}

// ------------------------------------------------------------------ density 2: fewer pictures (owner decision 2026-11-15)
//
// Eighteen rides at density 2 did not fit the 128 MiB budget in one view (the `rides` bench scene). Density 2 serves the
// far zooms only (zoom x dpr <= 2), so there each ride draws from fewer pictures than at density 4, which is unchanged:
// - running (full) frames show the frame's picture floored to the density-2 step, so a run never shows a picture from
//   later in the cycle than the frame and never steps backwards in it (the floor of a time that only moves forward).
//   Controller ruling 2026-11-15 ("half as many steps"): a ride keeps at least half its density-4 pictures as full
//   ones; most keep every full picture and drop only the empty moving ones, a few (towers, arenas) every other step;
// - empty frames show the ride at rest, the empty picture of slot 0: the game starts a run only with riders aboard and
//   keeps them aboard until it stops (src/sim/rides/flat/update.ts), so an empty ride's frame is slot 0.
// Every game frame key stays listed at density 2 (the reader looks the same key up at either density, and a density-4
// set's twin stands in for it); each names one of the density-4 pictures. src/render/anim.ts is not changed.

const keyOf = (item, a, s, full) => frameKey([item, `f${encodeRideFrame(a, s, 0)}`, full ? 'occ1' : 'occ0']);

/**
 * Sets `keys2` (the frame keys density 2 shows with it; empty: density 2 does not use the picture) on every entry of
 * `groups` (a rideKeys / cycleKeys / timeKeys map) and returns `groups`. `pick2(angleEven, swing, full)` returns the id
 * of the density-4 picture a frame shows at density 2.
 */
export function withD2(item, groups, swings, pick2) {
  for (const e of groups.values()) e.keys2 = [];
  for (let a = 0; a < 32; a++) for (const s of swings) for (const full of [false, true]) {
    const id = pick2(a & ~1, s, full);
    const e = groups.get(id);
    if (!e) throw new Error(`withD2(${item}): density-2 picture '${id}' is not one of the ride's pictures`);
    e.keys2.push(keyOf(item, a, s, full));
  }
  return groups;
}

/**
 * Density 2 of a cycleKeys ride: a full frame shows the picture of its slot (folded into the period) floored to `step`
 * slots (4: every other picture of a ride baked every 2 slots; 2: the same pictures as density 4); an empty frame shows
 * slot 0 empty. `pick` is the cycleKeys pick. A walk-through has no riders: it keeps every picture (`step` must be 2).
 */
export function cycleD2(item, groups, opts, pick, step) {
  const { period, walkThrough = false } = opts;
  if (walkThrough && step !== 2) throw new Error(`cycleD2(${item}): a walk-through has no riders; its pictures are its motion`);
  return withD2(item, groups, [0], (a, _s, full) => {
    if (walkThrough) return pick(a % period, false);
    return full ? pick(Math.floor((a % period) / step) * step, true) : pick(0, false);
  });
}

/**
 * Density 2 of a timeKeys ride: a full frame shows the picture of its time step (0..15) floored to `step` steps; an
 * empty frame shows step 0 empty. `pick` is the timeKeys pick.
 */
export function timeD2(item, groups, pick, step) {
  return withD2(item, groups, [0], (a, _s, full) => (full ? pick(Math.floor((a >> 1) / step) * step, true) : pick(0, false)));
}

/**
 * The bake API for bakeObject (items/common.js) of a ride whose pictures carry `keys2` (withD2):
 * `bakeObject(d2Api(B, pictures), { kind: 'ride', ..., pictures })`. Each picture is still shot once; its ride frames
 * are listed under `keys` at density 4 and under `keys2` at density 2, so a picture density 2 does not use is left out
 * of the density-2 sheets. A picture without `keys2` is listed under `keys` at both densities. Shadows are unchanged.
 */
export function d2Api(B, pictures) {
  const at2 = new Map(pictures.map((p) => [p.keys, p.keys2 ?? p.keys]));
  const set = (kind, item, rot, masked, baseColour, maskLevels) => {
    const s = B.set(kind, item, rot, masked, baseColour, maskLevels);
    if (kind !== 'ride') return s;
    return {
      add(keys, shot) {
        const k2 = at2.get(keys);
        if (!k2) throw new Error(`d2Api(${item}): a picture added that is not one of the pictures given`);
        const { 2: d2, ...rest } = shot;
        if (Object.keys(rest).length && keys.length) s.add(keys, rest);
        if (d2 !== undefined && k2.length) s.add(k2, { 2: d2 });
      },
    };
  };
  return { ...B, set };
}

// ------------------------------------------------------------------ frame keys of the round 7 rides (pure, for the tests)

/** Carousel (items/carousel.js): it repeats every 72 degrees, baked in 16 steps 4.5 degrees apart. */
export const CAROUSEL = { period: (Math.PI * 2) / 5, steps: 16 };
/** The carousel's step (0..15) at an even angle slot: the angle within one 72 degree period. */
export const carouselStep = (a) => Math.round((((a / 32) * Math.PI * 2) % CAROUSEL.period) / (CAROUSEL.period / CAROUSEL.steps)) % CAROUSEL.steps;

/**
 * Carousel frame keys: picture `${step}:${occ}`. Density 2 (half the pictures, controller ruling 2026-11-15): every
 * full step stays (16; 8 would leave 9 degree jumps); an empty frame shows the rest picture.
 */
export function carouselKeys() {
  const pick = (a, _s, full) => `${carouselStep(a)}:${full ? 1 : 0}`;
  return withD2('carousel', rideKeys('carousel', [0], pick), [0], (a, s, full) => (full ? pick(a, s, true) : '0:0'));
}

/**
 * Swing tower frame keys: picture `${slot % period}:${swing}:${occ}` (the chairs repeat every `period` angle slots).
 * Density 2 (half the pictures, controller ruling 2026-11-15): every full picture stays (both angles, all five swing
 * levels); an empty frame shows the rest picture.
 */
export function swingTowerKeys(period) {
  const pick = (a, s, full) => `${a % period}:${s}:${full ? 1 : 0}`;
  const swings = [0, 1, 2, 3, 4];
  return withD2('swing_tower', rideKeys('swing_tower', swings, pick), swings, (a, s, full) => (full ? pick(a, s, true) : pick(0, 0, false)));
}

/**
 * Big wheel frame keys: picture `${slot % 8}:${occ}` (16 gondolas in 4 colours: 90 degrees). Density 2: the full
 * pictures stay (2 per 90 degrees would leave the wheel's direction unreadable); an empty frame shows the rest picture.
 */
export const BIG_WHEEL_PERIOD = 8;
export function bigWheelKeys() {
  const opts = { period: BIG_WHEEL_PERIOD };
  const pick = (a, full) => `${a}:${full ? 1 : 0}`;
  return cycleD2('big_wheel', cycleKeys('big_wheel', opts, pick), opts, pick, 2);
}
