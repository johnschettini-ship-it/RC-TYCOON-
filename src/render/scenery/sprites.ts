/**
 * Scenery sprites (Phase 4 §4.5, §4.8): built on demand from the procedural art and kept in an LRU sprite cache.
 * Owner: W3-D. Key: `spriteKey(defId, spriteRotation, frame, zoomBucket)` where the sprite rotation is
 * `(rotation + viewRotation) mod 4` (edge items: the view edge) and the frame holds the variant bits below.
 * The image depends only on these, so the key is stable across frames, sessions, and view rotations.
 */
import { getSceneryDef, type SceneryDef } from '../../data/catalog';
import type { Dir } from '../../sim/map';
import type { ZoomBucket } from '../camera';
import { buildSprite } from '../canvas';
import { SpriteCache, spriteKey, type Sprite } from '../spriteCache';
import { GHOST_TINT_INVALID, GHOST_TINT_VALID } from '../sprites/bank';
import { drawSceneryArt, sceneryArtBounds, type SceneryArtOpts } from './art';
import { K_GHOST, K_SCENERY, pixel } from '../artHook';

/** Frame (variant) bits. */
export const SCENERY_FRAME = {
  wilted: 1,
  /** Arch back post and beam (sorts behind guests on the tile). */
  archBack: 2,
  /** Arch front post (sorts in front). */
  archFront: 4,
  ghostValid: 8,
  ghostInvalid: 16,
} as const;

export function sceneryFrame(wilted: boolean, part: 0 | 1 | 2, ghost: 'valid' | 'invalid' | null): number {
  return (
    (wilted ? SCENERY_FRAME.wilted : 0) |
    (part === 1 ? SCENERY_FRAME.archBack : part === 2 ? SCENERY_FRAME.archFront : 0) |
    (ghost === 'valid' ? SCENERY_FRAME.ghostValid : ghost === 'invalid' ? SCENERY_FRAME.ghostInvalid : 0)
  );
}

/** Stable numeric cache key (no strings built in the frame loop: `defHash` is memoized). */
export function scenerySpriteKey(defId: string, spriteRotation: Dir, frame: number, bucket: ZoomBucket): number {
  return spriteKey(defId, spriteRotation, frame, bucket);
}

/** View footprint of an item drawn with sprite rotation `f`: 2 × 1 items swap sides at odd sprite rotations. */
export function viewExtent(def: Pick<SceneryDef, 'w' | 'd' | 'edge'>, f: Dir): { ex: number; ey: number } {
  if (def.edge) return { ex: 1, ey: 1 };
  return f % 2 === 1 ? { ex: def.d, ey: def.w } : { ex: def.w, ey: def.d };
}

/** Art options for a sprite (decoded from the key's parts). */
export function artOpts(def: SceneryDef, f: Dir, frame: number): SceneryArtOpts {
  const { ex, ey } = viewExtent(def, f);
  return {
    facing: f,
    ex,
    ey,
    wilted: (frame & SCENERY_FRAME.wilted) !== 0,
    part: (frame & SCENERY_FRAME.archBack) !== 0 ? 1 : (frame & SCENERY_FRAME.archFront) !== 0 ? 2 : 0,
    edge: def.edge ? f : -1,
  };
}

/** About 32 MB of RGBA image memory for scenery (Phase 4 §4.10 sprite LRU, shared budget with W3-G's bank). */
export const SCENERY_SPRITE_BUDGET_PX = 8_000_000;

export class ScenerySprites {
  readonly cache = new SpriteCache(SCENERY_SPRITE_BUDGET_PX);
  builds = 0;

  beginFrame(): void {
    this.cache.beginFrame();
  }

  /** The sprite for `key` (from `scenerySpriteKey(defId, f, frame, bucket)`), built when missing. */
  get(key: number, defId: string, f: Dir, frame: number, bucket: ZoomBucket): Sprite | null {
    // Phase 8b stage 0b: predrawn pictures at bucket 0.5; a ghost is the frame-0 picture with the ghost swap
    // (`ghostKey(K_SCENERY, defId, f)` = `spriteKey(defId, f, K_SCENERY, 0.5)`).
    const rt = __TC_APP__ ? pixel.rt : null;
    if (__TC_APP__ && rt) {
      if (frame & (SCENERY_FRAME.ghostValid | SCENERY_FRAME.ghostInvalid)) {
        return rt.picture(K_GHOST, spriteKey(defId, f, K_SCENERY, 0.5), frame & SCENERY_FRAME.ghostValid ? 0 : 1) ?? null;
      }
      return rt.picture(K_SCENERY, spriteKey(defId, f, frame, 0.5)) ?? null;
    }
    const hit = this.cache.get(key);
    if (hit) return hit;
    const def = getSceneryDef(defId);
    if (!def) return null;
    const o = artOpts(def, f, frame);
    const tint = (frame & SCENERY_FRAME.ghostValid) !== 0 ? GHOST_TINT_VALID : (frame & SCENERY_FRAME.ghostInvalid) !== 0 ? GHOST_TINT_INVALID : null;
    const sp = buildSprite(sceneryArtBounds(def, o.ex, o.ey), bucket, (ctx) => drawSceneryArt(ctx, defId, o), tint);
    this.cache.set(key, sp);
    this.builds++;
    return sp;
  }

  trim(): void {
    this.cache.trim();
  }
}
