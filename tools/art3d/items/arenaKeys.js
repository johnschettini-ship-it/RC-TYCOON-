// Pure (no three.js, so vitest can load it): the frame keys of the batch 1 "buildings and arenas" rides (Task 5),
// shared by their bake modules and tests/unit/art3d/flatRides.test.ts.
//
// The game turns REVOLUTIONS[defId] ?? 2 (src/render/anim.ts) per run and none of these rides has an entry, so a
// run plays the 32 angle slots twice. The flat rides here only ever run with riders on board (src/sim/rides/flat/
// update.ts dispatches at riders >= 1), and an empty ride rests at angle 0, so occ0 is baked as ONE rest picture
// (the ride standing still) for every slot: the budget goes to the running, full pictures.
import { timeKeys, cycleKeys } from './flatRides.js';

/**
 * The 16 time steps folded into `pics` pictures (the size rule: compressed <= 4 MB for these two rides, controller ruling): step s shows picture
 * floor(s * pics / 16); picture k is posed at its first step (stepOf), so picture 0 is the start of the cycle.
 */
const timeFold = (item, pics) => timeKeys(item, {}, (step, full) => (full ? `t${Math.floor((step * pics) / 16)}` : 'rest'));

/** Bumper cars: 8 pictures per cycle (each car jostles round its own spot once per cycle), empty = one rest picture. */
export const BUMPER_PICS = 8;
export const bumperKeys = () => timeFold('bumper_cars', BUMPER_PICS);

/** Thunder disc: the disc swings once along the U and spins three turns per cycle (today's look), in 8 pictures. */
export const THUNDER_PICS = 8;
export const thunderKeys = () => timeFold('thunder_disc', THUNDER_PICS);

/** Walk-throughs: no riders, one occupancy state; 4 light steps that repeat every 8 angle slots. */
export const LIGHT_STEPS = 4;
export const mirrorKeys = () => cycleKeys('mirror_maze', { period: 8, walkThrough: true }, (slot) => `l${slot >> 1}`);
export const manorKeys = () => cycleKeys('haunted_manor', { period: 8, walkThrough: true }, (slot) => `l${slot >> 1}`);

/** Picture id -> time in [0, 1) of the cycle at its first time step (the rest picture is t = 0 without riders). */
export function stepOf(id, pics) {
  if (id === 'rest') return { t: 0, full: false };
  return { t: Math.ceil((Number(id.slice(1)) * 16) / pics) / 16, full: true };
}

/**
 * Model x (metres, footprint centre = 0, front at +z) of each ride's entrance and exit opening: the centre of the
 * sim's gate column floor((w - 1) / 2) (src/data/catalog/flatRides.ts gateIndex, src/sim/footprint.ts
 * flatRideGates), entrance on the front edge, exit on the back edge of the same column, at every view turn.
 * w = 4: column 1, x = -2 m; w = 3: column 1, x = 0.
 */
export const GATE_X = { bumper_cars: -2, haunted_manor: -2, thunder_disc: -2, mirror_maze: 0 };
