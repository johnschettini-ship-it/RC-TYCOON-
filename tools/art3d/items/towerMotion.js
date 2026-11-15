// Pure (no three.js, so vitest can load it): the motion and frame keys of the four "tower" flat rides of batch 1
// (observation_tower, drop_tower, gyro_globe, spiral_slide). Each ride's picture for a game frame depends only on
// the frame's angle slot (0-31), which is the fraction of the CURRENT turn: the game turns REVOLUTIONS[defId] ?? 2
// turns per run (src/render/anim.ts; none of these rides has an entry, so 2), so every motion here is one whole
// cycle per turn and plays twice per run, starting and ending at rest (slot 0) as today's look does.
import { cycleKeys, timeKeys } from './flatRides.js';

const TAU = Math.PI * 2;

/** Time 0..1 within a turn for a timeKeys step (0..15). */
export const stepTime = (step) => step / 16;

/** Observation tower cabin height share (0 at the boarding level, 1 at the top): today's `wave(angle)`. */
export function liftShare(step) {
  return 0.5 - 0.5 * Math.cos(TAU * stepTime(step));
}

/**
 * Drop tower carriage height share: today's `dropProfile(angle)` (sprites/content/thrillRides.ts) — a slow climb,
 * a short hold at the top, a fast drop and the brakes at the bottom.
 */
export function dropShare(step) {
  const t = stepTime(step);
  if (t < 0.7) return 0.5 - 0.5 * Math.cos((Math.PI * t) / 0.7);
  if (t < 0.8) return 1;
  if (t < 0.9) { const q = (t - 0.8) / 0.1; return 1 - q * q; }
  return 0;
}

/** Gyro globe ring angles at an even angle slot: outer ring 1x, middle ring 2x, rider pod 3x per turn. */
export function gyroAngles(slot) {
  const a = (TAU * slot) / 32;
  return [a, 2 * a, 3 * a];
}

/** Spiral slide: riders on the slide, spaced a quarter of its length, two alternating looks. */
export const SLIDE_RIDERS = 4;
/** The riders slide one whole slide length per turn; with looks A B A B the picture repeats every half turn. */
export const SLIDE_PERIOD = 16;
/** Position 0 (top) .. 1 (bottom) of rider i at an even angle slot. */
export function slideAt(i, slot) {
  const s = i / SLIDE_RIDERS + slot / 32;
  return s - Math.floor(s);
}

/** Height share at a step, rounded to the 1/HEIGHT_Q steps the pictures are baked at. */
export const HEIGHT_Q = 100;
/**
 * Drop tower: shares within DROP_SNAP of the bottom or the top show the bottom or top picture (the last metre of the
 * climb joins the hold, the first 0.4 m of the climb the rest), which keeps the drop tower inside the size rule
 * (2.5 MB): 11 heights, not 14.
 */
export const DROP_SNAP = 0.05;
export function heightStep(item, step) {
  let share = item === 'drop_tower' ? dropShare(step) : liftShare(step);
  if (item === 'drop_tower') share = share < DROP_SNAP ? 0 : share > 1 - DROP_SNAP ? 1 : share;
  return Math.round(share * HEIGHT_Q);
}

/**
 * Picture ids by game frame key, for each tower ride. Empty (occ0), every slot shows the ride at rest: the game
 * starts a flat ride's run only with riders aboard (src/sim/rides/flat/update.ts loadStep/dispatch) and keeps them
 * aboard until it stops, so an empty ride is never running and its frame is always slot 0. Full (occ1) frames move.
 */
export function towerKeys(item) {
  const full = (id) => (_a, f) => (f ? id(_a) : 'rest');
  switch (item) {
    case 'observation_tower':
    case 'drop_tower':
      // Steps at the same height show the same picture (the cabin or carriage is the only moving part): the lift
      // rises and falls symmetrically (steps t and 16 - t), the drop rests at the bottom and holds at the top (DROP_SNAP).
      return timeKeys(item, {}, full((t) => `h${heightStep(item, t)}`));
    case 'gyro_globe':
      return cycleKeys(item, { period: 32 }, full((a) => `a${a}`));
    case 'spiral_slide':
      return cycleKeys(item, { period: SLIDE_PERIOD }, full((a) => `a${a}`));
    default:
      throw new Error(`towerKeys: not a tower ride: ${item}`);
  }
}

/**
 * Entrances and exits of the three 2 x 2 towers in the model frame ([x, z] metres, footprint centred, front at +z, x
 * along the front edge): the sim's gates (src/sim/footprint.ts flatRideGates) are the front-row tile of column
 * floor((w - 1) / 2) (src/data/catalog/flatRides.ts gateIndex) and the back-row tile of the same column; for w = 2
 * that is column 0, centre x = -2 m. Each model puts its openings there:
 *   observation_tower: the gaps and arches in the round railing (radius 3.45 m) where the column crosses it;
 *   drop_tower: the gaps and arches in the square railing's front and back sides (z = +-3.3 m);
 *   spiral_slide: the queue's mouth at the pad's front edge, and the spot on the run-out where riders land and step
 *   off (the run-out ends SLIDE_RUNOUT metres further on, -x, still on the exit tile).
 */
export const TOWER_GATES = {
  observation_tower: { entrance: [-2, 2.81], exit: [-2, -2.81] },
  drop_tower: { entrance: [-2, 3.3], exit: [-2, -3.3] },
  spiral_slide: { entrance: [-2, 3.3], exit: [-2, -2.75] },
};
/** Spiral slide: metres of run-out past the landing spot (TOWER_GATES.spiral_slide.exit), towards -x. */
export const SLIDE_RUNOUT = 1.1;
