// tests/unit/render/pixel/buildSprite.test.ts
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { install } from '../fakeCanvas';
import { artBuildLog, buildSprite } from '../../../../src/render/canvas';
import { isPixelSurface } from '../../../../src/render/pixel/surface';
import { setArtStyle } from '../../../../src/render/pixel/style';

beforeAll(() => install());
afterEach(() => {
  setArtStyle('classic');
  artBuildLog.surfaces = null;
});

describe('buildSprite Pixel branch (§5.1)', () => {
  it('odd bounds widen to even world pixels, so the anchor is a whole art pixel', () => {
    setArtStyle('pixel');
    let surface = false;
    const sp = buildSprite({ left: -9, right: 9, top: -7, bottom: 3 }, 2, (ctx) => {
      surface = isPixelSurface(ctx);
      ctx.fillStyle = 'g2';
      ctx.fillRect(-2, -2, 4, 4);
    });
    expect(surface).toBe(true);
    expect([sp.w, sp.h, sp.ox, sp.oy, sp.scale]).toEqual([14, 10, 7, 6, 0.5]);
  });
  it('Classic does not change', () => {
    let surface = true;
    const sp = buildSprite({ left: -9, right: 9, top: -7, bottom: 3 }, 2, (ctx) => {
      surface = isPixelSurface(ctx);
    });
    expect(surface).toBe(false);
    expect([sp.w, sp.h, sp.ox, sp.oy, sp.scale]).toEqual([40, 24, 20, 16, 2]);
  });
  it('the build log takes one entry per Pixel build only while it is an array', () => {
    setArtStyle('pixel');
    buildSprite({ left: -4, right: 4, top: -4, bottom: 4 }, 0.5, () => undefined);
    artBuildLog.surfaces = [];
    buildSprite({ left: -4, right: 4, top: -4, bottom: 4 }, 0.5, () => undefined);
    expect(artBuildLog.surfaces).toHaveLength(1);
    expect(isPixelSurface(artBuildLog.surfaces[0]!.surface)).toBe(true);
  });
});
