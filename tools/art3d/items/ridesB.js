// Pure (no three.js, so vitest can load it): the motion and frame keys of the new rides batch B
// (docs/superpowers/specs/2026-11-17-new-rides-design.md): chair_swing_twist, spin_wheel_drop, loop_swing,
// carousel_deluxe, station_show. Each ride's picture for a game frame depends only on the frame's angle slot (0-31),
// the fraction of the CURRENT turn: none of these rides has a REVOLUTIONS entry in src/render/anim.ts (unchanged), so
// the game turns 2 turns per run and every motion here is one whole cycle per turn, played twice per run, starting and
// ending at rest (slot 0) as today's look (src/render/sprites/content/batchBRides.ts) does.
// An empty flat ride never runs in the game (src/sim/rides/flat/update.ts starts a run only with riders aboard), so the
// empty frames show one rest picture and the size budget goes to the running, full ones (as items/towerMotion.js).
import { cycleD2, cycleKeys, timeD2, timeKeys } from './flatRides.js';

const TAU = Math.PI * 2;

/**
 * The batch B rides with a front (rots [0, 1, 2, 3]): the loop swing's arm turns in one plane between its towers; the
 * station show has an entrance and a non-square footprint. Kept here, not in flatRides.js NON_ROUND, so the shared file
 * every flat ride's cache key hashes stays as it was (no re-bake of the batch 1 rides).
 */
export const NON_ROUND_B = ['loop_swing', 'station_show'];

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

// ------------------------------------------------------------------ Loop Swing

/**
 * Loop Swing (today's drawLoopSwing, LOOP_STEPS): the arm's angle in degrees at each of the 16 time steps of a turn
 * (the even angle slots): three swings, each higher than the last, then all the way over the top.
 */
export const LOOP_STEPS = [0, 30, 0, -50, 0, 70, 0, -90, 0, 115, 0, -140, 0, 90, 180, 270];

/** The arm angle (degrees, folded into -180..180) of a time step: a picture shows one angle. */
export const loopAngle = (step) => {
  const d = ((LOOP_STEPS[step] % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
};

/**
 * Loop Swing frame keys: 16 time steps per turn (timeKeys); steps at the same arm angle share a picture: the arm hangs
 * down at 7 steps, and -90 (a swing's peak) is 270 (on the way over): 9 pictures full, one at rest. Density 2 keeps
 * every full picture (step 1): the motion is a swing, and every other step would show only the arm hanging down.
 */
export function loopKeys() {
  const pick = (t, full) => (full ? `d${loopAngle(t)}` : 'rest');
  return timeD2('loop_swing', timeKeys('loop_swing', {}, pick), pick, 1);
}

/**
 * Loop Swing entrance and exit in the model frame ([x, z] metres, footprint centred, front at +z): the sim's gate
 * column floor((w - 1) / 2) = 1 for w = 3 is x = 0, on the front and back rows (d = 4: z in (4, 8) and (-8, -4)).
 */
export const LOOP_GATES = { entrance: [0, 7.3], exit: [0, -7.3] };

// ------------------------------------------------------------------ Carousel Deluxe

/**
 * Carousel Deluxe (today's drawCarouselDeluxe): one turn per turn, and the whole ride repeats every 60 degrees (6 of each
 * design round each ring, horses rising and falling 6 times a turn). The game's even angle slots are 22.5 degrees
 * apart, which fold into a 60 degree period at 8 places 7.5 degrees apart: 8 pictures show every angle.
 */
export const DELUXE = { period: Math.PI / 3, steps: 8, step: Math.PI / 24 };

/** The picture (0..7, 7.5 degree steps within the 60 degree period) of an even angle slot. */
export const deluxeStep = (a) => (3 * (a >> 1)) % DELUXE.steps;

/** Carousel Deluxe frame keys: `s<step>` full, `rest` empty; density 2 keeps all 8 (4 would turn 15 degrees a step). */
export function deluxeKeys() {
  const opts = { period: 32 };
  const pick = fullOrRest((a) => `s${deluxeStep(a)}`);
  return cycleD2('carousel_deluxe', cycleKeys('carousel_deluxe', opts, pick), opts, pick, 2);
}

// ------------------------------------------------------------------ Train Station Show

/**
 * Train Station Show (today's drawStationShow): a walk-through, no riders, one occupancy state; 4 light steps that
 * repeat every 8 angle slots (as the mirror maze and haunted manor). Density 2 keeps all 4: 2 steps would move the
 * chasing lamps two places a step, with no direction.
 */
export const STATION_LIGHT_STEPS = 4;
export const stationKeys = () => cycleKeys('station_show', { period: 8, walkThrough: true }, (slot) => `l${slot >> 1}`);

/**
 * Entrance and exit in the model frame ([x, z] metres, footprint centred, front at +z): the sim's gate column
 * floor((w - 1) / 2) = 1 for w = 4 is x = -2, on the front row and the back row (d = 3: z in (2, 6) and (-6, -2)).
 */
export const STATION_GATES = { entrance: [-2, 5.4], exit: [-2, -5.4] };
