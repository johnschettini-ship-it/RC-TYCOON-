import { describe, expect, it } from 'vitest';
import { generateMap } from '../../../src/sim/map';
import {
  CAMERA_MARGIN_TILES,
  WHEEL_ZOOM_FACTOR,
  centerOnMap,
  clampToMap,
  mapCameraBox,
  panCamera,
  wheelZoomFactor,
} from '../../../src/input/camera';
import type { Camera } from '../../../src/render/types';

const cam = (x = 0, y = 0, zoom = 1): Camera => ({ centerX: x, centerY: y, zoom, rotation: 0 });

describe('camera bounds (Phase 0 §4.9)', () => {
  const map = generateMap();

  it('box is the map screen box plus a 4-tile margin', () => {
    expect(CAMERA_MARGIN_TILES).toBe(4);
    // 64 × 64 map at ground level 8: x from −64·32 to 64·32, y from −8·8 to 128·16 − 8·8.
    expect(mapCameraBox(map)).toEqual({ minX: -2048 - 256, maxX: 2048 + 256, minY: -64 - 128, maxY: 2048 - 64 + 128 });
  });

  it('clamps a camera that left the box', () => {
    const c = cam(99999, -99999);
    clampToMap(c, map);
    expect(c.centerX).toBe(2304);
    expect(c.centerY).toBe(-192);
  });

  it('pans by screen px divided by zoom, opposite to the finger, then clamps', () => {
    const c = cam(0, 500, 2);
    panCamera(c, 100, -40, map);
    expect(c.centerX).toBe(-50);
    expect(c.centerY).toBe(520);
    panCamera(c, 1e7, 0, map);
    expect(c.centerX).toBe(-2304);
  });

  it('centres on the middle of the map', () => {
    const c = cam(5, 5);
    centerOnMap(c, map);
    expect(c.centerX).toBe(0);
    expect(c.centerY).toBe(64 * 16 - 64);
  });
});

describe('wheel zoom (×1.15 per notch toward the cursor)', () => {
  it('one notch up zooms in by 1.15, one notch down zooms out', () => {
    expect(WHEEL_ZOOM_FACTOR).toBe(1.15);
    expect(wheelZoomFactor(-100, 0)).toBeCloseTo(1.15, 10);
    expect(wheelZoomFactor(100, 0)).toBeCloseTo(1 / 1.15, 10);
  });

  it('line mode counts 3 lines as one notch', () => {
    expect(wheelZoomFactor(-3, 1)).toBeCloseTo(1.15, 10);
  });

  it('small trackpad deltas zoom a fraction of a notch, big deltas at most one notch', () => {
    expect(wheelZoomFactor(-10, 0)).toBeCloseTo(1.15 ** 0.1, 10);
    expect(wheelZoomFactor(-1000, 0)).toBeCloseTo(1.15, 10);
    expect(wheelZoomFactor(0, 0)).toBe(1);
  });
});
