import { describe, expect, it } from 'vitest';
import {
  cameraBounds,
  clampCamera,
  clampCameraToMap,
  panByScreen,
  screenToWorld,
  worldToScreen,
  zoomAt,
  zoomBucket,
  ZOOM_BUCKETS,
  ZOOM_MAX,
  ZOOM_MIN,
} from '../../../src/render/camera';
import { mapScreenBox } from '../../../src/render/iso';
import { generateMap } from '../../../src/sim/map';
import type { Camera } from '../../../src/render/types';

const cam = (centerX = 0, centerY = 0, zoom = 1): Camera => ({ centerX, centerY, zoom, rotation: 0 });

describe('camera (Phase 0 §4.9)', () => {
  it('screen ↔ world round-trips', () => {
    const c = cam(120, -40, 1.7);
    const w = screenToWorld(c, 300, 200, 800, 600);
    const s = worldToScreen(c, w.x, w.y, 800, 600);
    expect(s.x).toBeCloseTo(300, 9);
    expect(s.y).toBeCloseTo(200, 9);
  });

  it('clamps the centre to the map screen box plus 4 tiles', () => {
    const map = generateMap();
    const box = mapScreenBox(map);
    const b = cameraBounds(map);
    expect(b.minX).toBe(box.minX - 4 * 64);
    expect(b.maxX).toBe(box.maxX + 4 * 64);
    expect(b.minY).toBe(box.minY - 4 * 32);
    expect(b.maxY).toBe(box.maxY + 4 * 32);

    const far = cam(1e6, -1e6, 1);
    clampCameraToMap(far, map);
    expect(far.centerX).toBe(b.maxX);
    expect(far.centerY).toBe(b.minY);

    const inside = cam(10, 500, 1);
    clampCameraToMap(inside, map);
    expect(inside).toMatchObject({ centerX: 10, centerY: 500 });

    const c2 = cam(-1e6, 1e6);
    clampCamera(c2, b);
    expect([c2.centerX, c2.centerY]).toEqual([b.minX, b.maxY]);
  });

  it('clamps zoom to 0.25–2.0', () => {
    const c = cam(0, 0, 9);
    clampCameraToMap(c, generateMap());
    expect(c.zoom).toBe(ZOOM_MAX);
    const d = cam(0, 0, 0.01);
    clampCameraToMap(d, generateMap());
    expect(d.zoom).toBe(ZOOM_MIN);
    expect([ZOOM_MIN, ZOOM_MAX]).toEqual([0.25, 2]);
  });

  it('zoomAt keeps the anchor point fixed (error < 0.5 px)', () => {
    let seed = 7;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const c = cam(100, 200, 1);
    for (let k = 0; k < 2000; k++) {
      const px = rnd() * 1280;
      const py = rnd() * 800;
      const before = screenToWorld(c, px, py, 1280, 800);
      zoomAt(c, rnd() < 0.5 ? 1.15 : 1 / 1.15 + rnd() * 0.01, px, py, 1280, 800);
      const after = worldToScreen(c, before.x, before.y, 1280, 800);
      expect(Math.hypot(after.x - px, after.y - py)).toBeLessThan(0.5);
      expect(c.zoom).toBeGreaterThanOrEqual(0.25);
      expect(c.zoom).toBeLessThanOrEqual(2);
    }
  });

  it('zoomAt keeps the anchor when the zoom hits its limit', () => {
    const c = cam(0, 0, 1.9);
    const before = screenToWorld(c, 50, 70, 400, 300);
    zoomAt(c, 4, 50, 70, 400, 300);
    expect(c.zoom).toBe(2);
    const after = worldToScreen(c, before.x, before.y, 400, 300);
    expect(Math.hypot(after.x - 50, after.y - 70)).toBeLessThan(0.5);
  });

  it('pans by screen pixels scaled by 1 / zoom', () => {
    const c = cam(0, 0, 2);
    panByScreen(c, 100, -50);
    expect([c.centerX, c.centerY]).toEqual([50, -25]);
  });

  it('chooses the nearest zoom bucket (0.5, 1, 2)', () => {
    expect(ZOOM_BUCKETS).toEqual([0.5, 1, 2]);
    expect(zoomBucket(0.25)).toBe(0.5);
    expect(zoomBucket(0.6)).toBe(0.5);
    expect(zoomBucket(0.8)).toBe(1);
    expect(zoomBucket(1)).toBe(1);
    expect(zoomBucket(1.3)).toBe(1);
    expect(zoomBucket(1.5)).toBe(2);
    expect(zoomBucket(4)).toBe(2);
  });
});
