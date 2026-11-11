// tests/unit/render/pixel/plan.test.ts
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { install, make } from '../fakeCanvas';
import { renderPlan } from '../../../../src/perf/quality';
import { createCanvasRenderer } from '../../../../src/render/renderer';
import { makeGrid, nearestLevel } from '../../../../src/render/pixel/grid';
import { setArtStyle } from '../../../../src/render/pixel/style';

beforeAll(() => install());
afterEach(() => setArtStyle('classic'));

describe('render plan with a stretch (§7.1)', () => {
  it('Pixel plans', () => {
    const p = (q: 'auto' | 'high' | 'low', dev: 'phone' | 'desktop', d: number, auto = Infinity) => {
      const r = renderPlan(q, dev, d, auto, 'pixel');
      return [r.stretch, r.pixelRatio, r.zoomBuckets];
    };
    expect(p('high', 'phone', 2.625)).toEqual([2, 1.3125, 3]);
    expect(p('auto', 'phone', 2.625)).toEqual([2, 1.3125, 3]);
    expect(p('auto', 'phone', 2.625, 1)).toEqual([3, 0.875, 3]);
    expect(p('low', 'phone', 2.625)).toEqual([3, 0.875, 3]);
    expect(p('high', 'desktop', 1)).toEqual([1, 1, 3]);
  });
  it('Classic plans keep stretch 1 and today’s values', () => {
    const r = renderPlan('high', 'phone', 2.625);
    expect([r.stretch, r.pixelRatio]).toEqual([1, 2]);
  });
  it('applyPlan in Pixel: backing size, box size, stretch and home level at full precision', () => {
    setArtStyle('pixel');
    const c = Object.assign(make(10, 10), { style: {} as Record<string, string> });
    const r = createCanvasRenderer(c as unknown as HTMLCanvasElement);
    r.resize(412, 839, 2.625);
    expect([c.width, c.height]).toEqual([541, 1102]);
    expect(parseFloat(c.style.width as string)).toBeCloseTo((541 * 2) / 2.625, 9);
    expect(c.dataset.stretch).toBe('2');
    expect(c.dataset.pixelRatio).toBe('1.3125');
    expect(c.dataset.device).toBe('phone');
    expect(c.dataset.homeZoom).toBe(String(nearestLevel(1, makeGrid(2.625, 'phone', false))));
  });
  it('applyPlan in Classic does not change', () => {
    const c = Object.assign(make(10, 10), { style: {} as Record<string, string> });
    createCanvasRenderer(c as unknown as HTMLCanvasElement).resize(412, 839, 2.625);
    expect([c.width, c.height]).toEqual([824, 1678]);
    expect(c.style).toEqual({});
    expect(c.dataset.stretch).toBe('1');
    expect(c.dataset.pixelRatio).toBe('2');
  });
});
