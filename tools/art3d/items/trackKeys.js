// Frame keys and the frame plan of a track type's bake (phase 8c batch 5 Task 3). Pure: no three.js, so the tests
// count a type's frames from the same plan the track kit (trackKit.js) shoots.
//
// The bake input (tools/art3d/bakeNode.ts trackGeometry(typeId)) carries the classes, computed with the game's own
// src/render/real/trackClasses.ts: rail pieces grouped by `pieceClass`, car poses by `poseClassOf` (spin yaws a piece
// never reaches resolve to `base` there, so they are filed under `~base`).
//   rail:<type>~<class>:d*:r<t>   frames [pieceId, `t<rail tile>`] (stage 1 contract, steel_coaster.js), one picture per
//                                 tile. No tile is cut into sub-frames: the reader draws one picture per tile, so a
//                                 tile over TALL_M of rail range fails the plan (Task 3 review P2; the tallest tile of
//                                 the 17 types is the vertical loop's, 13 m).
//                                 Each rail tile also has its shadow [pieceId, `t<i>`, `sh`] (Task 4), and each tile of
//                                 a chainable piece its chain trough [pieceId, `t<i>`, `chain`] (Task 5), untinted.
//   support:<type>:d*:r<t>        frames [`foot`], [`seg`], [`top`], and their shadows [`<part>`, `sh`] (Task 4)
//   car:<type>~<class>:d*:r<q>    frames [`y<yaw>`, `p<pitch>`, `r<roll>`, `full` | `empty`] and, for a type with a
//                                 front car (input `front`), the same keys plus `front`. q: the pose's yaw quadrant
//                                 (input pose `q`, trackClasses.ts carQuadrant; the game picks the set by the view yaw).
import { frameKey } from '../../../src/render/real/indexFormat';

/**
 * The most rail range (metres) a rail tile may have: past it its d4 picture passes the tint atlas's 1024 px side and
 * could not be tinted. The reader has no sub-frames, so the frame plan refuses such a tile instead of cutting it.
 */
export const TALL_M = 22;

export const SUPPORT_PARTS = ['foot', 'seg', 'top'];

/** The set item of a class: `<type>~<class>`. */
export const classItem = (type, cls) => `${type}~${cls}`;

export function railKey(pieceId, ti) {
  return frameKey([pieceId, `t${ti}`]);
}

/**
 * A rail tile's untinted extra picture (batch 5): `sh` its shadow (Task 4), `chain` its chain lift trough (Task 5).
 * Frame [pieceId, `t<i>`, part] in the tile's rail set, on a plain sheet.
 */
export function railPartKey(pieceId, ti, part) {
  return frameKey([pieceId, `t${ti}`, part]);
}

/** A support part's shadow (Task 4): frame [part, `sh`] in the support set, on a plain sheet. */
export function supportShadowKey(part) {
  return frameKey([part, 'sh']);
}

export function carKey(p, full, front = false) {
  return frameKey([`y${p.yaw}`, `p${p.pitch}`, `r${p.roll}`, full ? 'full' : 'empty', ...(front ? ['front'] : [])]);
}

export function supportKey(part) {
  return frameKey([part]);
}

/**
 * Every rail picture of the bake, in bake order: classes, then headings, then pieces, then rail tiles; `shadow` the key
 * of the tile's shadow (Task 4, shot with it), `chain` of a chainable piece's chain trough (Task 5; else null). `alpha`: the frame takes the track colour everywhere and goes on an alpha-tint sheet; a piece with
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
          if (tile.railMax - tile.railMin > TALL_M) throw new Error(`${id} r${t} tile ${ti}: ${(tile.railMax - tile.railMin).toFixed(1)} m of rail, taller than ${TALL_M} m (no sub-frames: the reader draws one picture per tile)`);
          out.push({ cls: c.cls, heading: t, piece: id, ti, tile, key: railKey(id, ti), shadow: railPartKey(id, ti, 'sh'), chain: pc.chainable ? railPartKey(id, ti, 'chain') : null, alpha: !pc.untinted });
        });
      }
    }
  }
  return out;
}

/** Every car picture of the bake, in bake order: classes, then poses, then full and empty (then the front car); `q` its set's quadrant. */
export function carFrames(track) {
  const out = [];
  for (const c of track.classes) {
    for (const pose of c.poses) {
      for (const front of track.front ? [false, true] : [false]) {
        for (const full of [true, false]) out.push({ cls: c.cls, q: pose.q, pose, full, front, key: carKey(pose, full, front) });
      }
    }
  }
  return out;
}
