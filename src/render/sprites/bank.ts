/**
 * Sprite bank: builds procedural sprites on demand and keeps them in the sprite cache keyed by
 * (defId, rotation, frame, zoom bucket). Owner: W1-A.
 */
import { decodeRideFrame, ANGLE_FRAMES, GHOST_FRAME_INVALID, GHOST_FRAME_VALID } from '../anim';
import type { ZoomBucket } from '../camera';
import { buildSprite } from '../canvas';
import { SHIRT_COLOURS, rgbCss, tintStepRgb } from '../palette';
import { bucketIndex, defHash, FRAME_SPAN, SpriteCache, spriteKey, type Sprite } from '../spriteCache';
import type { Dir } from '../../sim/map';
import { drawEntranceArt, drawFenceArt, drawGuestArt, entranceBounds, fenceBounds, GUEST_BOUNDS } from './props';
import { drawRideArt, rideArtBounds } from './rides';
import { HAIR_COLOURS, SKIN_TONES } from './shapes';
import { drawStallArt, stallArtBounds } from './stalls';
import { decodeStaffFrame, drawStaffArt, STAFF_BOUNDS } from './staff';
import { drawLitterArt, drawMessArt, drawPathItemArt, LITTER_BOUNDS, MESS_BOUNDS, PATH_ITEM_BOUNDS } from './litter';

export const GHOST_TINT_VALID = 'rgba(70, 205, 95, 0.5)';
export const GHOST_TINT_INVALID = 'rgba(235, 60, 60, 0.55)';

const GUEST_HASH = defHash('guest');
const STAFF_HASH = defHash('staff');
const PATH_ITEM_HASH = defHash('path_item');
const DECAL_HASH = defHash('decal');
const STAND_IN_ORDER: readonly number[] = [1, 0, 2];

/** Skin and hair pairs: 4 looks keep the number of guest sprites small. */
const LOOKS: ReadonlyArray<readonly [number, number]> = [
  [0, 2],
  [1, 1],
  [2, 0],
  [3, 3],
];

/** Guest frame layout: colour (4 bits) | walk (2) | look (2) | tinted (1). */
export function guestFrame(colour: number, walk: number, look: number, tinted: boolean): number {
  return (colour & 15) | ((walk & 3) << 4) | ((look & 3) << 6) | (tinted ? 256 : 0);
}

/** Same layout as `spriteKey` with a pre-hashed def id (no string work in the guest loop). */
export function guestSpriteKey(facing: number, frame: number, bucket: ZoomBucket): number {
  return ((GUEST_HASH * 4 + (facing & 3)) * FRAME_SPAN + frame) * 4 + bucketIndex(bucket);
}

/** Staff sprite key (Phase 3): pre-hashed like guests; `frame` from `staffFrame`. */
export function staffSpriteKey(facing: number, frame: number, bucket: ZoomBucket): number {
  return ((STAFF_HASH * 4 + (facing & 3)) * FRAME_SPAN + frame) * 4 + bucketIndex(bucket);
}

/** Path item sprite key; `frame` from `pathItemFrame`. */
export function pathItemSpriteKey(frame: number, bucket: ZoomBucket): number {
  return (PATH_ITEM_HASH * 4 * FRAME_SPAN + frame) * 4 + bucketIndex(bucket);
}

/** Ground decal frame: litter variants 0–3, mess variants 8–9; `flip` uses the rotation slot. */
export function decalSpriteKey(frame: number, flip: number, bucket: ZoomBucket): number {
  return ((DECAL_HASH * 4 + (flip & 1)) * FRAME_SPAN + frame) * 4 + bucketIndex(bucket);
}
export const DECAL_MESS = 8;

/** New guest sprites per frame; past this, a cached sprite from another zoom bucket stands in. */
export const GUEST_BUILDS_PER_FRAME = 48;

export class SpriteBank {
  readonly cache: SpriteCache;
  private guestBuilds = 0;

  constructor(budgetPixels = 16_000_000) {
    this.cache = new SpriteCache(budgetPixels);
  }

  beginFrame(): void {
    this.cache.beginFrame();
    this.guestBuilds = 0;
  }

  ride(defId: string, w: number, d: number, rotation: Dir, frame: number, bucket: ZoomBucket): Sprite {
    const key = spriteKey(defId, rotation, frame, bucket);
    let sp = this.cache.get(key);
    if (sp) return sp;
    const ghost = frame === GHOST_FRAME_VALID ? GHOST_TINT_VALID : frame === GHOST_FRAME_INVALID ? GHOST_TINT_INVALID : null;
    const f = ghost ? { angle: 0, swing: 0, occupancy: 0 } : decodeRideFrame(frame);
    sp = buildSprite(
      rideArtBounds(defId, w, d, rotation),
      bucket,
      (ctx) => drawRideArt(ctx, defId, w, d, { rotation, angle: f.angle / ANGLE_FRAMES, swing: f.swing / 4, occupancy: f.occupancy }),
      ghost,
    );
    this.cache.set(key, sp);
    return sp;
  }

  stall(defId: string, rotation: Dir, frame: number, bucket: ZoomBucket): Sprite {
    const key = spriteKey(defId, rotation, frame, bucket);
    let sp = this.cache.get(key);
    if (sp) return sp;
    const ghost = frame === GHOST_FRAME_VALID ? GHOST_TINT_VALID : frame === GHOST_FRAME_INVALID ? GHOST_TINT_INVALID : null;
    sp = buildSprite(stallArtBounds(), bucket, (ctx) => drawStallArt(ctx, defId, rotation), ghost);
    this.cache.set(key, sp);
    return sp;
  }

  /** `key` must come from `guestSpriteKey(facing, frame, bucket)`. */
  guest(key: number, facing: Dir, frame: number, bucket: ZoomBucket): Sprite {
    let sp = this.cache.get(key);
    if (sp) return sp;
    if (this.guestBuilds >= GUEST_BUILDS_PER_FRAME) {
      // Spread a zoom-bucket change over several frames: draw another bucket's sprite scaled.
      const base = key - bucketIndex(bucket);
      for (const b of STAND_IN_ORDER) {
        const alt = this.cache.get(base + b);
        if (alt) return alt;
      }
    }
    this.guestBuilds++;
    const colour = frame & 15;
    const tinted = (frame & 256) !== 0;
    const look = LOOKS[(frame >> 6) & 3] as readonly [number, number];
    const shirt = tinted ? rgbCss(tintStepRgb(colour)) : (SHIRT_COLOURS[colour % SHIRT_COLOURS.length] as string);
    sp = buildSprite(GUEST_BOUNDS, bucket, (ctx) =>
      drawGuestArt(ctx, {
        shirt,
        skin: SKIN_TONES[look[0]] as string,
        hair: HAIR_COLOURS[look[1]] as string,
        facing,
        walk: (frame >> 4) & 3,
        ring: tinted ? shirt : null,
      }),
    );
    this.cache.set(key, sp);
    return sp;
  }

  /** `key` must come from `staffSpriteKey(facing, frame, bucket)`. */
  staff(key: number, facing: Dir, frame: number, bucket: ZoomBucket): Sprite {
    let sp = this.cache.get(key);
    if (sp) return sp;
    const f = decodeStaffFrame(frame);
    sp = buildSprite(STAFF_BOUNDS, bucket, (ctx) => drawStaffArt(ctx, { ...f, facing }));
    this.cache.set(key, sp);
    return sp;
  }

  /** `key` must come from `pathItemSpriteKey(frame, bucket)`. */
  pathItem(key: number, frame: number, bucket: ZoomBucket): Sprite {
    let sp = this.cache.get(key);
    if (sp) return sp;
    sp = buildSprite(PATH_ITEM_BOUNDS, bucket, (ctx) => drawPathItemArt(ctx, frame & 3, (frame >> 2) & 3, (frame >> 4) & 3, (frame & 64) !== 0));
    this.cache.set(key, sp);
    return sp;
  }

  /** `key` must come from `decalSpriteKey(frame, flip, bucket)`. */
  decal(key: number, frame: number, flip: number, bucket: ZoomBucket): Sprite {
    let sp = this.cache.get(key);
    if (sp) return sp;
    sp =
      frame >= DECAL_MESS
        ? buildSprite(MESS_BOUNDS, bucket, (ctx) => drawMessArt(ctx, frame - DECAL_MESS, flip))
        : buildSprite(LITTER_BOUNDS, bucket, (ctx) => drawLitterArt(ctx, frame, flip));
    this.cache.set(key, sp);
    return sp;
  }

  fence(dir: Dir, bucket: ZoomBucket): Sprite {
    const key = spriteKey('fence', dir, 0, bucket);
    let sp = this.cache.get(key);
    if (sp) return sp;
    sp = buildSprite(fenceBounds(), bucket, (ctx) => drawFenceArt(ctx, dir));
    this.cache.set(key, sp);
    return sp;
  }

  entrance(part: 0 | 1, outerDir: Dir | -1, bucket: ZoomBucket): Sprite {
    const rot = outerDir < 0 ? 2 : outerDir;
    const key = spriteKey('park_entrance', rot, part, bucket);
    let sp = this.cache.get(key);
    if (sp) return sp;
    sp = buildSprite(entranceBounds(), bucket, (ctx) => drawEntranceArt(ctx, part, outerDir));
    this.cache.set(key, sp);
    return sp;
  }
}
