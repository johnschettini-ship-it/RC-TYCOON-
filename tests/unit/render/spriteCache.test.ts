import { describe, expect, it } from 'vitest';
import { SpriteCache, bucketIndex, defHash, spriteKey, type Sprite } from '../../../src/render/spriteCache';
import { FLAT_RIDES, STALLS } from '../../../src/data/catalog';

/** Reference FNV-1a (32-bit) used to pin the key layout. */
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

describe('sprite cache key (defId, rotation, frame, zoom bucket)', () => {
  it('is a stable number with a fixed layout', () => {
    expect(defHash('carousel')).toBe(fnv('carousel'));
    expect(spriteKey('carousel', 2, 17, 1)).toBe(((fnv('carousel') * 4 + 2) * 4096 + 17) * 4 + 1);
    expect(spriteKey('carousel', 2, 17, 1)).toBe(spriteKey('carousel', 2, 17, 1));
    expect(Number.isSafeInteger(spriteKey('zzzzzzzzzzzzzzzz', 3, 4095, 2))).toBe(true);
    expect([bucketIndex(0.5), bucketIndex(1), bucketIndex(2)]).toEqual([0, 1, 2]);
  });

  it('gives distinct keys for every catalog id, rotation, frame, and bucket', () => {
    const ids = [...FLAT_RIDES.map((r) => r.id), ...STALLS.map((s) => s.id), 'guest', 'fence', 'park_entrance', 'ghost'];
    const seen = new Set<number>();
    for (const id of ids) {
      for (let rot = 0; rot < 4; rot++) {
        for (const frame of [0, 1, 23, 255, 4095]) {
          for (const b of [0.5, 1, 2] as const) {
            const key = spriteKey(id, rot as 0 | 1 | 2 | 3, frame, b);
            expect(seen.has(key)).toBe(false);
            seen.add(key);
          }
        }
      }
    }
  });

  it('wraps frames outside 0–4095 instead of colliding with the next rotation', () => {
    expect(spriteKey('carousel', 0, 4096, 1)).toBe(spriteKey('carousel', 0, 0, 1));
  });
});

describe('SpriteCache', () => {
  const sprite = (px: number): Sprite => ({ image: {} as CanvasImageSource, w: px, h: 1, ox: 0, oy: 0, scale: 1 });

  it('returns stored sprites and counts pixels', () => {
    const c = new SpriteCache(1000);
    const s = sprite(10);
    c.set(1, s);
    expect(c.get(1)).toBe(s);
    expect(c.get(2)).toBeUndefined();
    expect(c.pixels).toBe(10);
    expect(c.size).toBe(1);
  });

  it('evicts least recently used sprites over the pixel budget, but not sprites used this frame', () => {
    const c = new SpriteCache(100);
    c.beginFrame();
    c.set(1, sprite(40));
    c.set(2, sprite(40));
    c.beginFrame();
    c.get(1); // 1 is now more recent than 2
    c.set(3, sprite(40));
    c.trim();
    expect(c.get(2)).toBeUndefined();
    expect(c.get(1)).toBeDefined();
    expect(c.get(3)).toBeDefined();
    // Everything is in use this frame: the cache may run over budget rather than drop live sprites.
    c.set(4, sprite(40));
    c.trim();
    expect(c.size).toBe(3);
    c.beginFrame();
    c.trim();
    expect(c.pixels).toBeLessThanOrEqual(100);
  });

  it('clear() empties the cache', () => {
    const c = new SpriteCache(100);
    c.set(1, sprite(10));
    c.clear();
    expect(c.size).toBe(0);
    expect(c.pixels).toBe(0);
  });
});
