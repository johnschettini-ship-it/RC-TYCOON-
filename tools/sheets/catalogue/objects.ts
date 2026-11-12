/** Phase 8b stage 0b test (never merged): catalogue of objects (rides, stalls, scenery, path items, decals, fence, entrance, show sites), ghosts and shadows. */
import { FLAT_RIDES } from '../../../src/data/catalog/flatRides';
import { BIN_CAPACITY } from '../../../src/data/catalog/people';
import { SCENERY } from '../../../src/data/catalog/scenery';
import { SHOW_SITES } from '../../../src/data/catalog/showSites';
import { STALLS } from '../../../src/data/catalog/stalls';
import { ANGLE_FRAMES, coarseRideFrame, decodeRideFrame, encodeRideFrame } from '../../../src/render/anim';
import {
  K_DECAL,
  K_ENTRANCE,
  K_FENCE,
  K_GHOST,
  K_PATH_ITEM,
  K_RIDE,
  K_SCENERY,
  K_SHADOW,
  K_SHOW,
  K_STALL,
  ghostKey,
  shadowKey,
} from '../../../src/render/pixel/app/keys';
import { casterMask, casterOf } from '../../../src/render/pixel/shadows';
import { drawSceneryArt, sceneryArtBounds } from '../../../src/render/scenery/art';
import { artOpts, scenerySpriteKey, sceneryFrame } from '../../../src/render/scenery/sprites';
import { drawShowSiteArt, showArtBounds } from '../../../src/render/shows/art';
import { spriteKey } from '../../../src/render/spriteCache';
import { DECAL_MESS, decalSpriteKey, pathItemSpriteKey } from '../../../src/render/sprites/bank';
import { ITEM_BENCH, ITEM_BIN, ITEM_LAMP, LITTER_BOUNDS, MESS_BOUNDS, PATH_ITEM_BOUNDS, binFillLevel, drawLitterArt, drawMessArt, drawPathItemArt, pathItemFrame } from '../../../src/render/sprites/litter';
import { drawEntranceArt, drawFenceArt, entranceBounds, fenceBounds } from '../../../src/render/sprites/props';
import { drawRideArt, rideArtBounds, type ArtBounds } from '../../../src/render/sprites/rides';
import type { Ctx } from '../../../src/render/sprites/shapes';
import { drawStallArt, stallArtBounds } from '../../../src/render/sprites/stalls';
import type { Dir } from '../../../src/sim/map';
import { paintPicture, type Picture } from '../picture';
import { shadowPicture, withRoles } from '../ramps';
import type { PictureSpec } from './types';

const VIEWS: readonly Dir[] = [0, 1, 2, 3];
/** Objects keep the game's cache keys at this zoom bucket. */
const BUCKET = 0.5;

/** A painter that runs inside the colour roles (Task 4); needs `installSurfaceArt()`. */
export function painter(bounds: ArtBounds, draw: (ctx: Ctx) => void): () => Picture {
  return () => withRoles(() => paintPicture(bounds, draw));
}

/** Range 0 … n − 1. */
const upTo = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

/** Ride paint as `SpriteBank.ride` decodes the frame. */
function ridePainter(defId: string, w: number, d: number, view: Dir, frame: number): () => Picture {
  const f = decodeRideFrame(frame);
  return painter(rideArtBounds(defId, w, d, view), (ctx) =>
    drawRideArt(ctx, defId, w, d, { rotation: view, angle: f.angle / ANGLE_FRAMES, swing: f.swing / 4, occupancy: f.occupancy }),
  );
}

/** Every frame `rideFrameFor` can give a ride: 32 angles, swing levels (swing tower only), occupancy 0 to 4. */
function rideFrames(defId: string): number[] {
  const swings = defId === 'swing_tower' ? upTo(5) : [0];
  const out: number[] = [];
  for (const occupancy of upTo(5)) for (const swing of swings) for (const angle of upTo(ANGLE_FRAMES)) out.push(encodeRideFrame(angle, swing, occupancy));
  return out;
}

function rideSpecs(): PictureSpec[] {
  const out: PictureSpec[] = [];
  for (const def of FLAT_RIDES) {
    const full = rideFrames(def.id);
    const coarse = [...new Set(full.map(coarseRideFrame))];
    for (const view of VIEWS) {
      for (const [pack, frames] of [
        ['rides-full', full],
        ['rides-coarse', coarse],
      ] as const) {
        for (const frame of frames) {
          out.push({
            pack,
            group: `${def.id}/${view}/${decodeRideFrame(frame).occupancy}`,
            kind: K_RIDE,
            key: spriteKey(def.id, view, frame, BUCKET),
            paint: ridePainter(def.id, def.w, def.d, view, frame),
            ref: ['ride', def.id, def.w, def.d, view, frame],
          });
        }
      }
    }
  }
  return out;
}

/** The scenery frames the scenery layer asks for: edge items frame 0; arches back and front parts; others plain and wilted. */
function sceneryFrames(def: (typeof SCENERY)[number]): number[] {
  if (def.edge) return [0];
  if (def.overPath) return [sceneryFrame(false, 1, null), sceneryFrame(false, 2, null)];
  return def.needsWater ? [sceneryFrame(false, 0, null), sceneryFrame(true, 0, null)] : [sceneryFrame(false, 0, null)];
}

function sceneryPainter(def: (typeof SCENERY)[number], f: Dir, frame: number): () => Picture {
  const o = artOpts(def, f, frame);
  return painter(sceneryArtBounds(def, o.ex, o.ey), (ctx) => drawSceneryArt(ctx, def.id, o));
}

/** Every path item frame: item code, side, bin fill level (bins only), broken. */
function pathItemFrames(): number[] {
  const levels = [...new Set(upTo(BIN_CAPACITY + 1).map((f) => binFillLevel(f, BIN_CAPACITY)))];
  const out: number[] = [];
  for (const code of [ITEM_BENCH, ITEM_BIN, ITEM_LAMP])
    for (const side of VIEWS) for (const fill of code === ITEM_BIN ? levels : [0]) for (const broken of [false, true]) out.push(pathItemFrame(code, side, fill, broken));
  return out;
}

function objectPackSpecs(): PictureSpec[] {
  const out: PictureSpec[] = [];
  const add = (group: string, kind: number, key: number, paint: () => Picture, ref: PictureSpec['ref']): void => {
    out.push({ pack: 'objects', group, kind, key, paint, ref });
  };
  for (const def of STALLS)
    for (const view of VIEWS) add(`stall/${def.id}`, K_STALL, spriteKey(def.id, view, 0, BUCKET), painter(stallArtBounds(), (ctx) => drawStallArt(ctx, def.id, view)), ['stall', def.id, view, 0]);
  for (const def of SCENERY) {
    for (const f of VIEWS) {
      for (const frame of sceneryFrames(def)) {
        const key = scenerySpriteKey(def.id, f, frame, BUCKET);
        add(`scenery/${def.id}`, K_SCENERY, key, sceneryPainter(def, f, frame), ['scenery', key, def.id, f, frame]);
      }
    }
  }
  for (const frame of pathItemFrames()) {
    const key = pathItemSpriteKey(frame, BUCKET);
    const paint = painter(PATH_ITEM_BOUNDS, (ctx) => drawPathItemArt(ctx, frame & 3, (frame >> 2) & 3, (frame >> 4) & 3, (frame & 64) !== 0));
    add('pathItem', K_PATH_ITEM, key, paint, ['pathItem', key, frame]);
  }
  // Decals: litter variants 0 to 3, mess variants 0 and 1 (frames 8 and 9); flip 0 and 1.
  for (const frame of [0, 1, 2, 3, DECAL_MESS, DECAL_MESS + 1]) {
    for (const flip of [0, 1]) {
      const key = decalSpriteKey(frame, flip, BUCKET);
      const paint =
        frame >= DECAL_MESS
          ? painter(MESS_BOUNDS, (ctx) => drawMessArt(ctx, frame - DECAL_MESS, flip))
          : painter(LITTER_BOUNDS, (ctx) => drawLitterArt(ctx, frame, flip));
      add('decal', K_DECAL, key, paint, ['decal', key, frame, flip]);
    }
  }
  for (const dir of VIEWS) add('fence', K_FENCE, spriteKey('fence', dir, 0, BUCKET), painter(fenceBounds(), (ctx) => drawFenceArt(ctx, dir)), ['fence', dir]);
  // Entrance: outer −1 has the key (and the art) of outer 2 (`SpriteBank.entrance`), so it adds no picture.
  const entranceKeys = new Set<number>();
  for (const part of [0, 1] as const) {
    for (const outer of [0, 1, 2, 3, -1] as const) {
      const key = spriteKey('park_entrance', outer < 0 ? 2 : outer, part, BUCKET);
      if (entranceKeys.has(key)) continue;
      entranceKeys.add(key);
      add('entrance', K_ENTRANCE, key, painter(entranceBounds(), (ctx) => drawEntranceArt(ctx, part, outer)), ['entrance', part, outer]);
    }
  }
  for (const def of SHOW_SITES)
    for (const view of VIEWS) add(`show/${def.id}`, K_SHOW, spriteKey(def.id, view, 0, BUCKET), painter(showArtBounds(def.id), (ctx) => drawShowSiteArt(ctx, def.id, view)), ['show', def.id, view, 0]);
  return out;
}

/** Frame-0 pictures of every placeable, swapped at run time with the ghost tables (Test decision 16). */
function ghostSpecs(): PictureSpec[] {
  const out: PictureSpec[] = [];
  const add = (group: string, kind: number, defId: string, view: Dir, paint: () => Picture): void => {
    out.push({ pack: 'ghosts', group, kind: K_GHOST, key: ghostKey(kind, defId, view), paint, ref: null });
  };
  for (const def of FLAT_RIDES) for (const view of VIEWS) add('ghost/ride', K_RIDE, def.id, view, ridePainter(def.id, def.w, def.d, view, 0));
  for (const def of STALLS) for (const view of VIEWS) add('ghost/stall', K_STALL, def.id, view, painter(stallArtBounds(), (ctx) => drawStallArt(ctx, def.id, view)));
  for (const def of SCENERY) for (const view of VIEWS) add('ghost/scenery', K_SCENERY, def.id, view, sceneryPainter(def, view, 0));
  for (const def of SHOW_SITES) for (const view of VIEWS) add('ghost/show', K_SHOW, def.id, view, painter(showArtBounds(def.id), (ctx) => drawShowSiteArt(ctx, def.id, view)));
  return out;
}

/**
 * Shadow pictures (Test decision 6): two checkerboard phases of the stage 0 caster mask per (object, view). `view` is the
 * object's view rotation (as the sprite rotation), so the caster is built for it and the mask takes no further turn.
 */
function shadowSpecs(): PictureSpec[] {
  const out: PictureSpec[] = [];
  const kinds = [
    ['ride', K_RIDE, FLAT_RIDES],
    ['stall', K_STALL, STALLS],
    ['scenery', K_SCENERY, SCENERY],
  ] as const;
  for (const [name, kind, defs] of kinds) {
    for (const def of defs) {
      for (const view of VIEWS) {
        const c = casterOf(name, def.id, view);
        if (!c) continue;
        for (const phase of [0, 1] as const) {
          out.push({ pack: 'shadows', group: 'shadow', kind: K_SHADOW, key: shadowKey(kind, def.id, view, phase), paint: () => shadowPicture(casterMask(c, 0), phase), ref: null });
        }
      }
    }
  }
  return out;
}

/** Every object, ghost and shadow picture (packs `rides-full`, `rides-coarse`, `objects`, `ghosts`, `shadows`). */
export function objectSpecs(): PictureSpec[] {
  return [...rideSpecs(), ...objectPackSpecs(), ...ghostSpecs(), ...shadowSpecs()];
}

