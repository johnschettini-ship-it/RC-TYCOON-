// Shared helpers of the stage 1 bake modules (tools/art3d/items/*.js). Each item module exports
// `default { bake(B) }`, where B is the bake page API (tools/art3d/bakePage.ts BakeApi).
//
// Coordinates: three.js (x, y up, z) = game (x, z, y) in metres; the item's game anchor is at the origin.
// A sprite rotation k (0-3) turns the model k quarter turns clockwise on the map (front S -> W -> N -> E), which in
// three.js is rotation.y = -k * PI / 2 (see footprint.ts and view.ts viewSpriteRotation).
import * as THREE from 'three';
import { makeKit, TILE } from '../kit.js';
import { encodeRideFrame } from '../../../src/render/anim';
import { frameKey } from '../../../src/render/real/indexFormat';

export { THREE, TILE, frameKey };

/** A fresh kit (daylight). Builders add their meshes to K.root. */
export function kit() {
  return makeKit({ night: false });
}

/** Turn a model about its own centre and put that centre at the middle of a w x d footprint seen at rotation k. */
export function placeOnFootprint(holder, w, d, k) {
  const ex = k % 2 === 0 ? w : d;
  const ey = k % 2 === 0 ? d : w;
  holder.rotation.set(0, (-k * Math.PI) / 2, 0);
  holder.position.set((ex * TILE) / 2, 0, (ey * TILE) / 2);
}

/** Scale that makes a model of radius `r` (metres) fit inside a footprint of `tiles` with `margin` metres spare. */
export function fitScale(r, tiles, margin = 0.1) {
  return Math.min(1, ((tiles * TILE) / 2 - margin) / r);
}

/**
 * Bake a placed object: one set per sprite rotation (or one 'all' set) of `kind:item`, and its shadow set.
 *   model: THREE.Object3D centred on its own origin, front facing +z (game south)
 *   rots: 'all' | array of sprite rotations
 *   place(holder, k): put the holder for sprite rotation k (anchor stays at the origin)
 *   pictures: [{ keys: [...frame keys], pose?: () => void }]; the first picture's pose casts the shadow
 *   masked?: (mesh) => boolean   tint mask
 */
export function bakeObject(B, { kind, item, model, rots, place, pictures, masked, shadow = true }) {
  const bs = B.newScene();
  const holder = new THREE.Group();
  holder.add(model);
  bs.world.add(holder);
  B.setEnv(holder);
  const turns = rots === 'all' ? [['all', 0]] : rots.map((r) => [r, r]);
  for (const [rot, k] of turns) {
    place(holder, k);
    const set = B.set(kind, item, rot, !!masked);
    for (const p of pictures) {
      if (p.pose) p.pose();
      set.add(p.keys, B.shoot(bs, { target: holder, masked }));
    }
    if (shadow) {
      if (pictures[0] && pictures[0].pose) pictures[0].pose();
      B.set('shadow', item, rot).add([frameKey([item])], B.shootShadow(bs, holder));
    }
    B.log(`${kind}:${item} r${rot} done`);
  }
}

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
