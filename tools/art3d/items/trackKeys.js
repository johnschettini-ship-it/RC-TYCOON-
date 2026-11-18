// Frame keys and the frame plan of a track type's bake (phase 8c batch 5 Task 3). Pure: no three.js, so the tests
// count a type's frames from the same plan the track kit (trackKit.js) shoots.
//
// The bake input (tools/art3d/bakeNode.ts trackGeometry(typeId)) carries the classes, computed with the game's own
// src/render/real/trackClasses.ts: rail pieces grouped by `pieceClass`, car poses by `poseClassOf` (spin yaws a piece
// never reaches resolve to `base` there, so they are filed under `~base`).
//   rail:<type>~<class>:d*:r<t>   frames [pieceId, `t<rail tile>`] (stage 1 contract, steel_coaster.js), and for a tile
//                                 taller than TALL_M of rail range, stacked sub-frames [pieceId, `t<i>`, `u<k>`]
//                                 (k = 0 at the bottom), all anchored at the tile centre at piece.z, so the game draws
//                                 them bottom-up at the one anchor.
//   support:<type>:d*:r<t>        frames [`foot`], [`seg`], [`top`]
//   car:<type>~<class>:d*:rall    frames [`y<yaw>`, `p<pitch>`, `r<roll>`, `full` | `empty`] and, for a type with a
//                                 front car (input `front`), the same keys plus `front`.
import { frameKey } from '../../../src/render/real/indexFormat';

/** A rail tile with more rail range than this (metres) is cut into sub-frames (d4 picture past the atlas's 1024 px). */
export const TALL_M = 22;
/** Rail range (metres) of one sub-frame of a tall tile. */
export const SUB_M = 20;

export const SUPPORT_PARTS = ['foot', 'seg', 'top'];

/** The set item of a class: `<type>~<class>`. */
export const classItem = (type, cls) => `${type}~${cls}`;

/** Sub-frames a rail tile of `rangeM` metres of rail range is cut into (1: not cut). */
export function subFrameCount(rangeM) {
  return rangeM > TALL_M ? Math.ceil(rangeM / SUB_M) : 1;
}

export function railKey(pieceId, ti, sub = null) {
  return frameKey(sub === null ? [pieceId, `t${ti}`] : [pieceId, `t${ti}`, `u${sub}`]);
}

export function carKey(p, full, front = false) {
  return frameKey([`y${p.yaw}`, `p${p.pitch}`, `r${p.roll}`, full ? 'full' : 'empty', ...(front ? ['front'] : [])]);
}

export function supportKey(part) {
  return frameKey([part]);
}

/**
 * Every rail picture of the bake, in bake order: classes, then headings, then pieces, then rail tiles (then
 * sub-frames). `alpha`: the frame takes the track colour everywhere and goes on an alpha-tint sheet; a piece with
 * untinted parts (station deck, brake fins, water: input `untinted`) goes on a masked sheet.
 */
export function railFrames(track) {
  const out = [];
  for (const c of track.classes) {
    if (!c.pieces.length) continue;
    for (let t = 0; t < 4; t++) {
      for (const id of c.pieces) {
        const pc = track.pieces[id];
        pc.dirs[t].tiles.filter((tile) => tile.rail).forEach((tile, ti) => {
          const subs = subFrameCount(tile.railMax - tile.railMin);
          for (let k = 0; k < subs; k++) {
            out.push({ cls: c.cls, heading: t, piece: id, ti, tile, sub: subs > 1 ? k : null, subs, key: railKey(id, ti, subs > 1 ? k : null), alpha: !pc.untinted });
          }
        });
      }
    }
  }
  return out;
}

/** Every car picture of the bake, in bake order: classes, then poses, then full and empty (then the front car). */
export function carFrames(track) {
  const out = [];
  for (const c of track.classes) {
    for (const pose of c.poses) {
      for (const front of track.front ? [false, true] : [false]) {
        for (const full of [true, false]) out.push({ cls: c.cls, pose, full, front, key: carKey(pose, full, front) });
      }
    }
  }
  return out;
}
