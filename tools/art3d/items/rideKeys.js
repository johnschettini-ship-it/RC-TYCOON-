// Pure (no three.js, so vitest can load it): the frame keys of a flat ride.
import { encodeRideFrame } from '../../../src/render/anim';
import { frameKey } from '../../../src/render/real/indexFormat';

/**
 * Frame keys of a flat ride, grouped by picture. The renderer (Task 8) asks for [item, `f<frame & 255>`, occ0|occ1]:
 * the game's encoded ride frame (anim.ts encodeRideFrame) without its occupancy bits, i.e. angle 0-31 | swing << 5
 * (the phone path passes coarseRideFrame, even angles), and occ1 for any riders. Every angle and swing is listed;
 * `pick(angleEven, swing, full)` returns the id of the picture that shows it (odd angles use the even angle below).
 * Returns Map(pictureId -> { keys, angle, swing, full }).
 */
export function rideKeys(item, swings, pick) {
  const out = new Map();
  for (let a = 0; a < 32; a++) for (const s of swings) for (const full of [false, true]) {
    const id = pick(a & ~1, s, full);
    let e = out.get(id);
    if (!e) { e = { keys: [], angle: a & ~1, swing: s, full }; out.set(id, e); }
    e.keys.push(frameKey([item, `f${encodeRideFrame(a, s, 0)}`, full ? 'occ1' : 'occ0']));
  }
  return out;
}
