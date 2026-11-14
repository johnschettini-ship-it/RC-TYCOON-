/**
 * RealLook: turns world objects into `Sprite`s cut from the baked realistic-art sets.
 *
 * Per frame the caller runs: `sets.beginFrame(n)`, `look.prepare(...)` (wants the sets of the objects inside the view
 * plus one screen, of the guests, the ground and the path items: spec §5.4.2(d)), the draw calls (`look.ride(...)` etc.;
 * a getter wants a set nobody wanted yet, so an object outside that scope never waits forever), then `sets.endFrame()`.
 * A getter returns
 *   - a `Sprite`: draw it with `blit`/`blitColumn` as today (its `scale` is the density of the set it came from);
 *   - `null`: the set is still loading; skip the object this frame (counted by `incomplete()`). The ladder's last step
 *     (spec §5.4.4): once its density-2 set has had no room to decode for `DEGRADE_FRAMES` prepares, the object
 *     draws today's art instead (`undefined`, counted by `degraded()`), so no object is skipped for ever;
 *   - `undefined`: draw today's art (item mapped to 'classic', set failed, or the bake lacks the set or frame).
 * At density 4, an object whose density-4 set is still loading draws from its density-2 set when that one is ready
 * (scaled; counted by `soft()`, not by `incomplete()`), so a turn or a zoom never waits for density 4 (spec §5.4).
 * `prepare` wants the current turn at the chosen density ('now'), with the density-2 twin of each density-4 set not
 * ready yet ('now', first), and the ahead turn at density 2 only ('ahead').
 *
 * Sprites are atlas sprites: `image` is the decoded sheet and `sx`/`sy` the frame's rectangle in it. Tinted sprites
 * (sheet with a mask) point into the shared tint atlas (spec §5.7, Task 4, `../tintAtlas.ts`): each (frame, colour)
 * drawn is tinted on its own into a slot of a few shared pages (24 MiB at most), never a whole sheet. Frames are tinted
 * under a per-frame time budget (`TINT_FRAME_MS`, round 3 item 4); a frame not tinted yet draws its untinted picture
 * meanwhile, counted by `incomplete()`. Atlas pages are admitted before they are made (`SetManager.admit`, held as
 * `tint:<page>`); when the atlas is full the least recently used frame not drawn this frame or the one before is
 * evicted, and with none to evict (or no room in the budget) the frame draws untinted (incomplete, then `degraded()`
 * after `DEGRADE_FRAMES`), never nothing. Tinted frames are freed when their set is freed, when unused for
 * `KEEP_FRAMES` prepares, or page by page by `reclaim` (least recently used first) when the set manager needs room.
 *
 * Contract with the bake (Task 9, tools/art3d/items/*.js), frame keys via `frameKey`; "turn" below is the set's rot:
 *   ride     set ride:<item>        frame [item, `f<frame>`, `occ0` | `occ1`]   (occupancy > 0 → occ1, full)
 *            anchor: top corner of the footprint's view-origin tile at base height; drawn in depth columns
 *   stall    set stall:<item>       frame [item]                                anchor: the tile's top corner
 *   scenery  set scenery:<item>     frame [item, `f<frame>`]                    (bench and bin are scenery items,
 *            frame = the side they stand on in the view; anchor: their base point on the path)
 *   shadow   set shadow:<item>      frame [item]                                anchor and turn of its object; a
 *            path item's shadow set is turned by its side (`shadow:bench:r<side>`), not by the view turn
 *   guest    set guest:b<B>o<O>     frame [`f<facing 0-3>`, `w<walk>` | `sit`]  (rot 'all'; shirt mask; anchor: feet)
 *   staff    set guest:staff_<type> frame [`f<facing 0-3>`, `w<walk>`]          (not baked in stage 1)
 *   rail     set rail:<item>        frame [pieceId, `t<tile>`]                  (track-colour mask)
 *            turn = the piece's heading in the view, (piece.dir + view turn) mod 4; tile = the slice's number among
 *            the piece's rail tiles; anchor: the tile's centre at the piece's ENTRY rail height (piece.z)
 *   car      set car:<item>         frame [`y<0-31>`, `p<0-23>`, `r<0-23>`, `full` | `empty`] (car-colour mask)
 *            steps from `quantisePose` (./pose.ts, shared with the bake); anchor: the car centre on the rail line
 *   support  set support:<item>     frames [`foot`], [`seg`], [`top`]           (support-colour mask)
 *            turn = the saddle's (track's) heading in the view. Stacked by the track layer (`supportStack`):
 *            `foot` at the ground point; `seg` (1 m, anchored at its bottom centre, drawn 1.1 m tall) once per
 *            metre of column; `top` (plate + post, 0.67 m) anchored `SUPPORT_TOP_BELOW_RAIL` m under the rail line
 *   ground   set ground:<terrain>   frame [`s<slopeMask>`, `v<variant>`]        anchor: the tile's top corner
 *            path and queue: frame [`j<join mask>`] (kerbs or rails on the sides without a join, view terms)
 * A set with `rot: 'all'` serves every view rotation and is wanted once. Rail, support and path-item shadow sets are
 * keyed by a heading, so every turn of them is wanted. A sheet's tint mask is listed as another sheet of the same set
 * (`sheets[i].mask` names its file); a sheet without a mask is drawn untinted.
 * Anchors and offsets: a frame's `ox`/`oy` in the index are the offset FROM the game anchor TO the frame's top-left
 * corner, in density px (so they are usually negative: the top-left is up and left of the anchor). A Sprite's
 * `ox`/`oy` are the anchor's position inside the image, the other way round: `sprite.ox = −frame.ox`,
 * `sprite.oy = −frame.oy`, because `blit` puts the top-left at anchor − sprite.ox.
 */
import type { ViewRotation } from '../../view';
import { createLookCore, pickDensity } from './core';
import { makeGroundGetters } from './ground';
import { makePeopleGetters } from './people';
import { makeRideGetters } from './rides';
import { makeScope } from './scope';
import { makeSceneryGetters } from './scenery';
import { makeTrackGetters } from './track';
import type { RealIndex } from '../indexFormat';
import type { RealLook, RealLookOptions, RealSets } from './types';

export type { RealLook, RealLookOptions, RealSets, SupportPart } from './types';
export { DEGRADE_FRAMES, NO_ROOM_GAP, pickDensity } from './core';
export { TINT_FRAME_MS } from './tint';
/** Car poses, as baked (Task 9): yaw in 32 steps, pitch and roll in 15° steps (one source: `./pose`). */
export { CAR_TILT_STEPS, CAR_YAW_STEPS, quantisePose } from '../pose';

export function createRealLook(index: RealIndex, sets: RealSets, opts: RealLookOptions = {}): RealLook {
  const core = createLookCore(index, sets, opts);
  const scope = makeScope(core, sets);
  const look: RealLook = {
    density(zoom, dpr) {
      return pickDensity(zoom, dpr, sets.densityCap());
    },

    prepare(world, rot: ViewRotation, view, zoom, dpr) {
      core.beginFrame(rot, look.density(zoom, dpr));
      scope.prepare(world, rot, view, core.density);
    },

    ...makeRideGetters(core),
    ...makeSceneryGetters(core),
    ...makePeopleGetters(core),
    ...makeTrackGetters(core),
    ...makeGroundGetters(core, sets),

    dispose: core.dispose,
    reclaim: core.reclaim,

    currentDensity() {
      return core.density;
    },

    incomplete: core.incomplete,
    soft: core.soft,
    degraded: core.degraded,
    fallbacksUsed: core.fallbacksUsed,
    scope: scope.stats,

    setItemMap(map) {
      core.setItemMap(map);
      // The objects' set groups change with the mapping: index the park again on the next prepare.
      scope.invalidate();
    },
  };
  return look;
}
