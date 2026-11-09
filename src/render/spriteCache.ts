/**
 * Sprite cache keyed by (defId, rotation, frame, zoom bucket). Owner: W1-A, W4-E.
 * Keys are plain numbers so lookups in the frame loop do not allocate strings.
 *
 * Phase 6 §4.6 sprite cache limits: every `SpriteCache` (sprites, terrain chunk images, scenery, track cars) joins
 * one shared `SpriteMemory` with a byte budget (`width × height × 4` per canvas): 64 MB on phones, 192 MB on
 * desktops. Each cache keeps its own LRU and pixel cap as well; when the shared bytes run over budget, the least
 * recently used images of all caches go first. Images used in the current frame are never evicted.
 */
import { SPRITE_CACHE_BUDGET_MB } from '../data/tuning/perf';
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

/** Device class for the Phase 6 §4.6 budgets (`./device.ts` decides it). */
export type DeviceClass = 'phone' | 'desktop';

/** Shared byte budget of all sprite and chunk caches for a device class (Phase 6 §8). */
export function spriteBudgetBytes(device: DeviceClass): number {
  return SPRITE_CACHE_BUDGET_MB[device] * 1024 * 1024;
}

interface Entry {
  sprite: Sprite;
  usedFrame: number;
  /** Shared-memory clock at the last move to the recent end: orders entries across caches. */
  stamp: number;
}

/** The byte budget every sprite and chunk cache shares (Phase 6 §4.6). */
export class SpriteMemory {
  private readonly caches = new Set<SpriteCache>();
  private clock = 0;

  constructor(public budgetBytes = spriteBudgetBytes('desktop')) {}

  /** Bytes held by every cache now (`width × height × 4` per image). */
  get bytes(): number {
    let b = 0;
    for (const c of this.caches) b += c.bytes;
    return b;
  }

  /**
   * Stamp at the start of the renderer's current frame (0 until the first `beginFrame`). An image is in use when
   * its cache used it in the cache's current frame and its stamp is from this frame: a cache whose layer skipped
   * this frame (the static terrain layer was copied instead) keeps no image alive.
   */
  frameMark = 0;

  /** The renderer starts a frame. */
  beginFrame(): void {
    this.frameMark = ++this.clock;
  }

  /** @internal A stamp for an entry moved to the recent end of its cache. */
  stamp(): number {
    return ++this.clock;
  }

  /** @internal A cache that holds images; it leaves when it empties. */
  join(c: SpriteCache): void {
    this.caches.add(c);
  }

  /** @internal */
  leave(c: SpriteCache): void {
    this.caches.delete(c);
  }

  /** Bytes per cache label (`chunks`, `sprites`, `static`, `other`), for the overlay and the perf run. */
  breakdown(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const c of this.caches) out[c.label] = (out[c.label] ?? 0) + c.bytes;
    return out;
  }

  /** Evict least recently used images (of any cache, none used this frame) until the bytes fit the budget. */
  trim(): void {
    let bytes = this.bytes;
    while (bytes > this.budgetBytes) {
      let oldest: SpriteCache | null = null;
      let oldestStamp = Infinity;
      for (const c of this.caches) {
        const s = c.oldestStamp();
        if (s < oldestStamp) {
          oldestStamp = s;
          oldest = c;
        }
      }
      if (!oldest) return;
      bytes -= oldest.evictOldest();
    }
  }
}

/** The game's shared sprite memory. The renderer sets its budget from the device class. */
export const spriteMemory = new SpriteMemory();

/** LRU cache with a pixel budget. Sprites used in the current frame are never evicted. */
export class SpriteCache {
  private map = new Map<number, Entry>();
  private frame = 0;
  pixels = 0;

  /**
   * `budgetPixels`: this cache's own cap; `memory`: the shared byte budget it counts toward (null: none); `label`:
   * what it holds, for the memory breakdown.
   */
  constructor(
    public budgetPixels = 24_000_000,
    private readonly memory: SpriteMemory | null = spriteMemory,
    readonly label = 'other',
  ) {}

  get size(): number {
    return this.map.size;
  }

  /** Bytes of the cached images (`width × height × 4`). */
  get bytes(): number {
    return this.pixels * 4;
  }

  beginFrame(): void {
    this.frame++;
  }

  private stamp(): number {
    return this.memory ? this.memory.stamp() : 0;
  }

  get(key: number): Sprite | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.usedFrame !== this.frame) {
      e.usedFrame = this.frame;
      e.stamp = this.stamp();
      // Move to the most recent end.
      this.map.delete(key);
      this.map.set(key, e);
    }
    return e.sprite;
  }

  /** The sprite under `key` without touching the LRU order (or marking it used this frame). */
  peekSprite(key: number): Sprite | undefined {
    return this.map.get(key)?.sprite;
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
    this.map.set(key, { sprite, usedFrame: this.frame, stamp: this.stamp() });
    this.pixels += sprite.w * sprite.h;
    this.memory?.join(this);
  }

  delete(key: number): void {
    const e = this.map.get(key);
    if (!e) return;
    this.map.delete(key);
    this.pixels -= e.sprite.w * e.sprite.h;
    if (this.map.size === 0) this.memory?.leave(this);
  }

  /** Drop least recently used sprites (not used this frame) until under budget, then fit the shared budget. */
  trim(): void {
    if (this.pixels > this.budgetPixels) {
      for (const [key, e] of this.map) {
        if (this.pixels <= this.budgetPixels) break;
        if (e.usedFrame === this.frame) continue;
        this.map.delete(key);
        this.pixels -= e.sprite.w * e.sprite.h;
      }
      if (this.map.size === 0) this.memory?.leave(this);
    }
    this.memory?.trim();
  }

  /** @internal Stamp of the least recently used entry not used this frame, or Infinity. */
  oldestStamp(): number {
    const mark = this.memory ? this.memory.frameMark : 0;
    for (const e of this.map.values()) return e.usedFrame === this.frame && e.stamp >= mark ? Infinity : e.stamp;
    return Infinity;
  }

  /** @internal Evict the least recently used entry; returns its bytes. */
  evictOldest(): number {
    for (const [key, e] of this.map) {
      this.map.delete(key);
      const px = e.sprite.w * e.sprite.h;
      this.pixels -= px;
      if (this.map.size === 0) this.memory?.leave(this);
      return px * 4;
    }
    return 0;
  }

  clear(): void {
    this.map.clear();
    this.pixels = 0;
    this.memory?.leave(this);
  }
}
