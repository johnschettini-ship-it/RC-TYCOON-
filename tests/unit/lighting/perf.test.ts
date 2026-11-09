/**
 * After Dark time checks in the normal test runner (W3-F), with bounds far above the targets so a slow CI runner
 * passes: Phase 4 §4.7 light pass ≤ 2 ms per frame (JavaScript side here, against a no-op context), §9.4 one
 * scenery change updates light in < 0.2 ms. `TC_PERF=1` prints the measured means. Detail: `npm run bench`.
 */
import { describe, expect, it } from 'vitest';
import { createLightingLayer } from '../../../src/render/lighting/layer';
import { defaultToolState } from '../../../src/render/types';
import { allocId } from '../../../src/sim/ids';
import { lightAt, markLightDirty } from '../../../src/sim/lighting/api';
import { lightRawNow } from '../../../src/sim/lighting/lightMap';
import { benchFrame, buildLightScene, noopCanvas, noopContext, NoopPath, SIZE } from '../../bench/lightScene';

function timeMs(n: number, fn: (k: number) => void): number {
  for (let k = 0; k < Math.min(50, n); k++) fn(k);
  const t0 = performance.now();
  for (let k = 0; k < n; k++) fn(k);
  return (performance.now() - t0) / n;
}

function show(label: string, ms: number): void {
  if (process.env.TC_PERF) console.log(`[perf] ${label}: ${ms.toFixed(4)} ms`);
}

describe('After Dark timings (128 × 128 scene, ~900 light sources)', () => {
  it('a light-map diff with no change, and one scenery change', () => {
    const w = buildLightScene();
    lightRawNow(w);
    const diff = timeMs(400, () => lightRawNow(w));
    show('light map diff, no change', diff);
    const s = w.state;
    const tile = 60 * SIZE + 61;
    let on = false;
    const change = timeMs(400, () => {
      if (on) s.scenery.pop();
      else s.scenery.push({ id: allocId(s), defId: 'ghost_lantern', x: 61, y: 60, z: 8, rotation: 0, edge: -1, waterLevel: 255 });
      on = !on;
      markLightDirty(w, tile);
      lightAt(w, tile);
    });
    show('scenery change → light', change);
    expect(diff).toBeLessThan(2);
    expect(change).toBeLessThan(2);
  });

  it('the light pass JavaScript per frame at 1920 × 1080, still and moving camera', () => {
    const w = buildLightScene();
    const ctx = noopContext() as unknown as CanvasRenderingContext2D;
    const tool = defaultToolState();
    for (const scale of [1, 0.5]) {
      const layer = createLightingLayer({ createCanvas: noopCanvas, createPath: () => new NoopPath() });
      const still = benchFrame(scale);
      const a = timeMs(200, () => layer.drawAfterObjects!(ctx, w, tool, still));
      const frames = Array.from({ length: 200 }, (_, k) => benchFrame(scale, k));
      const b = timeMs(200, (k) => layer.drawAfterObjects!(ctx, w, tool, frames[k % 200]!));
      show(`light pass zoom ${scale}: still ${a.toFixed(3)} ms, moving`, b);
      expect(a).toBeLessThan(10);
      expect(b).toBeLessThan(10);
    }
  });
});
