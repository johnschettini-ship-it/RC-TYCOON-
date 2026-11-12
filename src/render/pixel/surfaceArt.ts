/** Phase 8b stage 0b test (never merged): installs the stage 0 art functions into the tool hook (`surfaceArt`). */
// Imported only by tools/ and tests: the game never loads this file.
import { surfaceArt, type SurfaceArt } from '../artHook';
import type { ArtCtx } from '../sprites/shapes';
import { PIXEL_RIDE_ART } from './art/rides';
import { pixelBox, pixelCone, pixelCylinder, pixelHead, pixelPyramid } from './art/shapes';
import { paintSlicePixel, widenRuns } from './art/track';
import { noteDerived, noteMixed } from './derived';
import { drawGuestPixel } from './sprites/people';
import { isPixelSurface, type PixelSurface } from './surface';

// The hook calls a member only after `is(ctx)` said yes, so `ctx` is a surface there.
const art = (ctx: unknown): ArtCtx => ctx as ArtCtx;

const STAGE0: SurfaceArt = {
  is: isPixelSurface,
  box: (ctx, u0, v0, u1, v1, h0, h1, top, left, right) => pixelBox(art(ctx), u0, v0, u1, v1, h0, h1, top, left, right),
  cylinder: (ctx, cu, cv, r, h0, h1, side, top) => pixelCylinder(art(ctx), cu, cv, r, h0, h1, side, top),
  cone: (ctx, cu, cv, r, h0, h1, colours, segments) => pixelCone(art(ctx), cu, cv, r, h0, h1, colours, segments),
  pyramid: (ctx, u0, v0, u1, v1, h0, h1, back, left, right) => pixelPyramid(art(ctx), u0, v0, u1, v1, h0, h1, back, left, right),
  head: (ctx, x, y, r, skin, hair) => pixelHead(art(ctx), x, y, r, skin, hair),
  guest: (ctx, g) => drawGuestPixel(art(ctx), g),
  ride: (ctx, defId, ex, ey, st) => {
    const twin = PIXEL_RIDE_ART[defId];
    if (!twin) return false;
    twin(art(ctx), ex, ey, st);
    return true;
  },
  slice: (ctx, sl, f, extras) => paintSlicePixel(ctx as unknown as PixelSurface, sl, f, extras),
  widenRuns,
  noteDerived,
  noteMixed,
};

/** Turns the stage 0 branches on (sheet tool and tests). */
export function installSurfaceArt(): void {
  surfaceArt.on = STAGE0;
}

/** Turns them off again. */
export function clearSurfaceArt(): void {
  surfaceArt.on = null;
}
