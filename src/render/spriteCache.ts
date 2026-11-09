/**
 * Sprite cache keyed by (defId, rotation, frame, zoom bucket). Owner: W1-A.
 * Keys are plain numbers so lookups in the frame loop do not allocate strings.
 */
import type { ZoomBucket } from './camera';

/** A pre-drawn image. `ox`, `oy`: image pixel of the anchor point. `scale`: image pixels per world pixel. */
export interface Sprite {
  image: CanvasImageSource;
  w: number;
  h: number;
  ox: number;
  oy: number;
  scale: number;
}

const hashMemo = new Map<string, number>();

/** FNV-1a (32-bit) of a def id. Deterministic across sessions; memoized. */
export function defHash(defId: string): number {
  const m = hashMemo.get(defId);
  if (m !== undefined) return m;
  let h = 0x811c9dc5;
  for (let i = 0; i < defId.length; i++) {
    h ^= defId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h >>>= 0;
  hashMemo.set(defId, h);
  return h;
}

export function bucketIndex(bucket: ZoomBucket): 0 | 1 | 2 {
  return bucket === 0.5 ? 0 : bucket === 1 ? 1 : 2;
}

/** Frame values wrap at 4096 (12 bits). */
export const FRAME_SPAN = 4096;

/** Layout: ((hash × 4 + rotation) × 4096 + frame) × 4 + bucket index. At most 2^48. */
export function spriteKey(defId: string, rotation: number, frame: number, bucket: ZoomBucket): number {
  const f = ((frame % FRAME_SPAN) + FRAME_SPAN) % FRAME_SPAN;
  return ((defHash(defId) * 4 + (rotation & 3)) * FRAME_SPAN + f) * 4 + bucketIndex(bucket);
}

interface Entry {
  sprite: Sprite;
  usedFrame: number;
}

/** LRU cache with a pixel budget. Sprites used in the current frame are never evicted. */
export class SpriteCache {
  private map = new Map<number, Entry>();
  private frame = 0;
  pixels = 0;

  constructor(public budgetPixels = 24_000_000) {}

  get size(): number {
    return this.map.size;
  }

  beginFrame(): void {
    this.frame++;
  }

  get(key: number): Sprite | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.usedFrame !== this.frame) {
      e.usedFrame = this.frame;
      // Move to the most recent end.
      this.map.delete(key);
      this.map.set(key, e);
    }
    return e.sprite;
  }

  /** Is `key` cached? Does not touch the LRU order. */
  peek(key: number): boolean {
    return this.map.has(key);
  }

  set(key: number, sprite: Sprite): void {
    const old = this.map.get(key);
    if (old) {
      this.pixels -= old.sprite.w * old.sprite.h;
      this.map.delete(key);
    }
    this.map.set(key, { sprite, usedFrame: this.frame });
    this.pixels += sprite.w * sprite.h;
  }

  delete(key: number): void {
    const e = this.map.get(key);
    if (!e) return;
    this.map.delete(key);
    this.pixels -= e.sprite.w * e.sprite.h;
  }

  /** Drop least recently used sprites (not used this frame) until under budget. */
  trim(): void {
    if (this.pixels <= this.budgetPixels) return;
    for (const [key, e] of this.map) {
      if (this.pixels <= this.budgetPixels) break;
      if (e.usedFrame === this.frame) continue;
      this.map.delete(key);
      this.pixels -= e.sprite.w * e.sprite.h;
    }
  }

  clear(): void {
    this.map.clear();
    this.pixels = 0;
  }
}
