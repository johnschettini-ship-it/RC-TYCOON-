import { describe, expect, it } from 'vitest';
import { bakeCamera } from '../../../tools/art3d/camera';
import { tileToScreen, setStepPx } from '../../../src/render/iso';
import { REAL_STEP_PX } from '../../../src/render/artStyle';
import { viewAffine, viewTileSX, viewTileSY, type ViewRotation } from '../../../src/render/view';
import { TILE_M } from '../../../src/data/tuning/track';

/** The game's own projection in the realistic look (step 9.8 px per metre), scaled by bake density. */
function tileToScreenReal(x: number, y: number, z: number, density: number): { sx: number; sy: number } {
  setStepPx(REAL_STEP_PX);
  try {
    const g = tileToScreen(x, y, z);
    return { sx: g.sx * density, sy: g.sy * density };
  } finally {
    setStepPx(8);
  }
}

/** Screen offset (zoom 1 world px × density) from map tile (0, 0, 0) to (x, y, z) in view rotation `r`. */
function viewDelta(r: ViewRotation, x: number, y: number, z: number, density: number): { sx: number; sy: number } {
  setStepPx(REAL_STEP_PX);
  try {
    const a = viewAffine(r, 32, 24);
    return {
      sx: (viewTileSX(a, x, y) - viewTileSX(a, 0, 0)) * density,
      sy: (viewTileSY(a, x, y, z) - viewTileSY(a, 0, 0, 0)) * density,
    };
  } finally {
    setStepPx(8);
  }
}

describe('bakeCamera', () => {
  it('matches the game projection at density 2', () => {
    const cam = bakeCamera(0, 2);
    const g = tileToScreenReal(3, 5, 2, 2);
    const p = cam.project(3 * 4, 5 * 4, 2);
    expect(p.sx).toBeCloseTo(g.sx, 3);
    expect(p.sy).toBeCloseTo(g.sy, 3);
  });

  it('matches the game projection at density 4, including tall points', () => {
    const cam = bakeCamera(0, 4);
    for (const [x, y, z] of [[0, 0, 0], [7, 2, 0], [-3, 9, 31], [10.5, 4.25, 12.5]] as const) {
      const g = tileToScreenReal(x, y, z, 4);
      const p = cam.project(x * TILE_M, y * TILE_M, z);
      expect(p.sx).toBeCloseTo(g.sx, 3);
      expect(p.sy).toBeCloseTo(g.sy, 3);
    }
  });

  it('pxPerMetre is 22.6 and 45.2', () => {
    expect(bakeCamera(0, 2).pxPerMetre).toBeCloseTo(22.63, 1);
    expect(bakeCamera(0, 4).pxPerMetre).toBeCloseTo(45.25, 1);
  });

  it('turn 1 maps like viewTileSX/SY for rotation 1', () => {
    const cam = bakeCamera(1, 2);
    for (const [x, y, z] of [[3, 5, 2], [1, 0, 0], [0, 1, 0], [6, 2, 17]] as const) {
      const g = viewDelta(1, x, y, z, 2);
      const p = cam.project(x * TILE_M, y * TILE_M, z);
      expect(p.sx).toBeCloseTo(g.sx, 3);
      expect(p.sy).toBeCloseTo(g.sy, 3);
    }
  });

  it('every turn maps like view.ts at both densities', () => {
    for (const r of [0, 1, 2, 3] as const) {
      for (const d of [2, 4] as const) {
        const cam = bakeCamera(r, d);
        for (const [x, y, z] of [[3, 5, 2], [2, 7, 0], [5, 1, 9]] as const) {
          const g = viewDelta(r, x, y, z, d);
          const p = cam.project(x * TILE_M, y * TILE_M, z);
          expect(p.sx).toBeCloseTo(g.sx, 3);
          expect(p.sy).toBeCloseTo(g.sy, 3);
        }
      }
    }
  });

  it('is an orthographic camera at yaw 45° + 90°·rot and pitch 30°', () => {
    for (const r of [0, 1, 2, 3] as const) {
      const cam = bakeCamera(r, 2);
      expect(cam.yawDeg).toBe(45 + 90 * r);
      expect(cam.pitchDeg).toBe(30);
      // The true camera draws a metre of height at pxPerMetre·cos 30°; the game rounds that to 9.8 px, so the bake
      // stretches models by heightScale (a 0.02 % correction) to land on the game's own pixels.
      expect(cam.heightScale * cam.pxPerMetre * Math.cos(Math.PI / 6)).toBeCloseTo(REAL_STEP_PX * 2, 9);
      expect(Math.abs(cam.heightScale - 1)).toBeLessThan(0.001);
    }
  });

  it('leaves the live height step at 8', () => {
    bakeCamera(0, 2).project(4, 4, 4);
    expect(tileToScreen(0, 0, 1).sy).toBe(-8);
  });
});
