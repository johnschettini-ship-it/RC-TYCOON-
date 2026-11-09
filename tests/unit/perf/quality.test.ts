import { describe, expect, it } from 'vitest';
import { AutoScale, AUTO_WARMUP_FRAMES, AUTO_WINDOW_FRAMES, deviceClass, renderPlan } from '../../../src/perf/quality';

describe('device class (Phase 6 §4.6)', () => {
  const fine = { coarsePointer: false, deviceMemoryGb: undefined };
  it('phone: coarse pointer, or device memory ≤ 4 GB when known, or a phone-sized screen', () => {
    expect(deviceClass({ coarsePointer: true, deviceMemoryGb: 8 }, 1280, 800)).toBe('phone');
    expect(deviceClass({ coarsePointer: false, deviceMemoryGb: 4 }, 1280, 800)).toBe('phone');
    expect(deviceClass({ coarsePointer: false, deviceMemoryGb: 8 }, 1280, 800)).toBe('desktop');
    expect(deviceClass(fine, 1280, 800)).toBe('desktop');
    expect(deviceClass(fine, 412, 915)).toBe('phone');
  });
});

describe('render plan (Phase 6 §4.6, §4.9 render quality)', () => {
  it('desktop: full ratio and 4 zoom slots at auto and high; low = 1× and 3 buckets', () => {
    expect(renderPlan('auto', 'desktop', 2)).toMatchObject({ pixelRatio: 2, zoomBuckets: 4, guestLodZoom: 0.5, budgetBytes: 192 * 1024 * 1024 });
    expect(renderPlan('high', 'desktop', 3)).toMatchObject({ pixelRatio: 3, zoomBuckets: 4 });
    expect(renderPlan('low', 'desktop', 2)).toMatchObject({ pixelRatio: 1, zoomBuckets: 3, guestLodZoom: 0.75 });
  });

  it('phone: render scale capped at 2×, max 3 zoom buckets, 64 MB', () => {
    expect(renderPlan('auto', 'phone', 2.625)).toMatchObject({ pixelRatio: 2, zoomBuckets: 3, budgetBytes: 64 * 1024 * 1024 });
    expect(renderPlan('high', 'phone', 1.5)).toMatchObject({ pixelRatio: 1.5, zoomBuckets: 3 });
    expect(renderPlan('low', 'phone', 2.625)).toMatchObject({ pixelRatio: 1, zoomBuckets: 3 });
    // An auto step down (see AutoScale) renders at 1×.
    expect(renderPlan('auto', 'phone', 2.625, 1)).toMatchObject({ pixelRatio: 1 });
    expect(renderPlan('high', 'phone', 2.625, 1)).toMatchObject({ pixelRatio: 2 });
  });
});

describe('auto render scale', () => {
  const run = (a: AutoScale, ms: number, frames: number): boolean => {
    let changed = false;
    for (let k = 0; k < frames; k++) if (a.frame(ms)) changed = true;
    return changed;
  };

  it('steps down to 1× once frame p95 stays over 1.25 × the budget after the warm-up', () => {
    const a = new AutoScale(40);
    expect(a.maxRatio).toBe(Infinity);
    // Slow frames during the warm-up (sprite builds after a load) do not count.
    expect(run(a, 80, AUTO_WARMUP_FRAMES)).toBe(false);
    // Fast enough: stays.
    expect(run(a, 45, AUTO_WINDOW_FRAMES * 3)).toBe(false);
    expect(a.maxRatio).toBe(Infinity);
    // Too slow for a whole window: steps down, once.
    expect(run(a, 60, AUTO_WINDOW_FRAMES)).toBe(true);
    expect(a.maxRatio).toBe(1);
    expect(run(a, 90, AUTO_WINDOW_FRAMES * 2)).toBe(false);
  });

  it('a few long frames (a view turn) do not step down', () => {
    const a = new AutoScale(40);
    run(a, 16, AUTO_WARMUP_FRAMES);
    for (let k = 0; k < 10; k++) {
      expect(run(a, 16, AUTO_WINDOW_FRAMES - 3)).toBe(false);
      expect(run(a, 200, 3)).toBe(false);
    }
    expect(a.maxRatio).toBe(Infinity);
  });

  it('a gap (hidden tab) is not a frame; reset starts over', () => {
    const a = new AutoScale(40);
    run(a, 16, AUTO_WARMUP_FRAMES);
    expect(run(a, 5000, AUTO_WINDOW_FRAMES)).toBe(false);
    run(a, 60, AUTO_WINDOW_FRAMES);
    expect(a.maxRatio).toBe(1);
    a.reset();
    expect(a.maxRatio).toBe(Infinity);
    expect(run(a, 60, AUTO_WARMUP_FRAMES)).toBe(false);
  });
});
