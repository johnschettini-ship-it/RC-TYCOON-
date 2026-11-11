// tests/unit/render/pixel/grid.test.ts
import { describe, expect, it } from 'vitest';
import { artScale, blitArt, blitArtColumn, makeGrid, nearestLevel, planStretch, snapArt, snapWalker, zoomLevels } from '../../../../src/render/pixel/grid';

const levels = (dpr: number, dev: 'phone' | 'desktop', capped = false) => zoomLevels(makeGrid(dpr, dev, capped)).map((l) => [Number(l.zoom.toFixed(3)), l.n, l.soft]);

describe('grid (§7)', () => {
  it('planStretch table (§7.1)', () => {
    expect(planStretch(1, 'desktop', false)).toBe(1);
    expect(planStretch(1.5, 'desktop', true)).toBe(1);
    expect(planStretch(2, 'desktop', true)).toBe(2);
    expect(planStretch(2.625, 'phone', false)).toBe(2);
    expect(planStretch(2.625, 'phone', true)).toBe(3);
    expect(planStretch(3, 'phone', false)).toBe(2);
    expect(makeGrid(2.625, 'phone', false)).toEqual({ device: 'phone', deviceRatio: 2.625, stretch: 2, canvasRatio: 1.3125 });
  });
  it('levels for ratio 1 and 2.625 (§7.3)', () => {
    expect(levels(1, 'desktop')).toEqual([[0.25, 0, true], [0.5, 1, false], [1, 2, false], [1.5, 3, false], [2, 4, false]]);
    expect(levels(2.625, 'phone')).toEqual([[0.25, 0, true], [0.381, 1, false], [0.762, 2, false], [1.143, 3, false], [1.524, 4, false], [1.905, 5, false]]);
    expect(levels(2.625, 'phone', true)).toEqual([[0.25, 0, true], [0.571, 1, false], [1.143, 2, false], [1.714, 3, false]]);
  });
  it('home level and the tie rule (§7.2, §7.6)', () => {
    expect(nearestLevel(1, makeGrid(1, 'desktop', false))).toBe(1);
    expect(nearestLevel(1, makeGrid(2.625, 'phone', false))).toBeCloseTo(8 / 7, 12);
    expect(nearestLevel(0.75, makeGrid(1, 'desktop', false))).toBe(0.5);
  });
  it('a level read back at full precision is crisp; 3 decimals are not (Review Focus 5)', () => {
    for (const g of [makeGrid(1, 'desktop', false), makeGrid(2.625, 'phone', false), makeGrid(2.625, 'phone', true)]) {
      for (const l of zoomLevels(g)) if (!l.soft) expect(artScale(Number(String(l.zoom)), g)).toBeGreaterThan(0);
    }
    expect(artScale(1.143, makeGrid(2.625, 'phone', false))).toBe(0);
  });
  it('snapArt and the walker stair (§7.7)', () => {
    expect(snapArt(11.52)).toBe(12);
    expect(snapArt(-3)).toBe(-2);
    for (let ax = 0; ax <= 40; ax += 0.25) {
      const p = snapWalker(ax, ax / 2, 0.5);
      expect(p.x % 2).toBe(0);
      expect(p.y % 2).toBe(0);
      expect(p.y).toBe(2 * Math.round(p.x / 4));
    }
  });
  it('blitArt copies at factor n with whole edges', () => {
    const calls: number[][] = [];
    const ctx = { drawImage: (...a: unknown[]) => calls.push(a.slice(1) as number[]) } as unknown as CanvasRenderingContext2D;
    const sp = { image: {} as never, w: 20, h: 30, ox: 10, oy: 25, scale: 0.5 };
    blitArt(ctx, sp, 64, 32, { n: 3, scale: 1.5, offX: 101, offY: 57 });
    expect(calls[0]).toEqual([167, 30, 60, 90]);
  });
  it('blitArt at n = 0 rounds as renderer blit (renderer.ts:338-345)', () => {
    const calls: number[][] = [];
    const ctx = { drawImage: (...a: unknown[]) => calls.push(a.slice(1) as number[]) } as unknown as CanvasRenderingContext2D;
    const sp = { image: {} as never, w: 20, h: 30, ox: 10, oy: 25, scale: 0.5 };
    blitArt(ctx, sp, 33, 17, { n: 0, scale: 1.2, offX: 10.3, offY: 4.6 });
    expect(calls[0]).toEqual([26, -35, 48, 72]);
  });
  it('blitArtColumn ends bits extend the strip to the image edges', () => {
    const calls: number[][] = [];
    const ctx = { drawImage: (...a: unknown[]) => calls.push(a.slice(1) as number[]) } as unknown as CanvasRenderingContext2D;
    const sp = { image: {} as never, w: 40, h: 30, ox: 20, oy: 25, scale: 0.5 };
    const f = { n: 2, scale: 1, offX: 0, offY: 0 };
    blitArtColumn(ctx, sp, 0, 0, -32, 0, f, 0);
    blitArtColumn(ctx, sp, 0, 0, -32, 0, f, 1);
    blitArtColumn(ctx, sp, 0, 0, 0, 32, f, 2);
    expect(calls).toEqual([
      [4, 0, 16, 30, -32, -50, 32, 60],
      [0, 0, 20, 30, -40, -50, 40, 60],
      [20, 0, 20, 30, 0, -50, 40, 60],
    ]);
  });
});
