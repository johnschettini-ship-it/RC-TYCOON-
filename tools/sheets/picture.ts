/** Phase 8b stage 0b test (never merged): a picture is a slot image painted once on a pixel surface (no canvas). */
import { PixelSurface, type SurfaceOptions } from '../../src/render/pixel/surface';
import type { ArtBounds } from '../../src/render/sprites/rides';
import type { Ctx } from '../../src/render/sprites/shapes';

/** Row-major slot indices (0 transparent) and the anchor's image pixel `(ox, oy)`. */
export interface Picture {
  w: number;
  h: number;
  ox: number;
  oy: number;
  slots: Uint8Array;
}

/** Bounds widened to even world pixels, so the anchor is a whole art pixel (stage 0 `canvas.ts`). */
export function evenBounds(b: ArtBounds): ArtBounds {
  return {
    left: 2 * Math.floor(b.left / 2),
    right: 2 * Math.ceil(b.right / 2),
    top: 2 * Math.floor(b.top / 2),
    bottom: 2 * Math.ceil(b.bottom / 2),
  };
}

/** Stage 0 `buildPixelSprite` without the canvas: paint on a surface of the even bounds, finish, read the slots. */
export function paintPicture(bounds: ArtBounds, paint: (ctx: Ctx) => void, opts?: SurfaceOptions): Picture {
  const s = new PixelSurface(evenBounds(bounds), opts);
  paint(s as unknown as Ctx);
  s.finish();
  const slots = new Uint8Array(s.w * s.h);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) slots[y * s.w + x] = s.pixel(x, y);
  return { w: s.w, h: s.h, ox: s.ox, oy: s.oy, slots };
}

/** Drop fully transparent border rows and columns; the anchor keeps its place. An empty picture becomes 0 × 0. */
export function trim(p: Picture): Picture {
  let x0 = p.w;
  let y0 = p.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (p.slots[y * p.w + x] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { w: 0, h: 0, ox: p.ox, oy: p.oy, slots: new Uint8Array(0) };
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const slots = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) slots.set(p.slots.subarray((y + y0) * p.w + x0, (y + y0) * p.w + x0 + w), y * w);
  return { w, h, ox: p.ox - x0, oy: p.oy - y0, slots };
}

/** FNV-1a over `w, h, ox, oy` (int32 LE) and the slots: the dedupe key. */
export function pictureHash(p: Picture): number {
  let hv = 0x811c9dc5;
  const byte = (b: number): void => {
    hv = Math.imul(hv ^ (b & 255), 0x01000193) >>> 0;
  };
  for (const v of [p.w, p.h, p.ox, p.oy]) for (let s = 0; s < 32; s += 8) byte(v >>> s);
  for (let k = 0; k < p.slots.length; k++) byte(p.slots[k] as number);
  return hv >>> 0;
}
