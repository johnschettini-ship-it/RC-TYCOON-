/**
 * After Dark benchmarks (W3-F). Phase 4 §4.7 budget: light pass ≤ 2 ms per frame on desktop at 1920 × 1080;
 * §9.4: one scenery change updates fields and light in < 0.2 ms. Run with `npm run bench`.
 *
 * Node has no canvas, so the pass runs against a no-op 2D context: this times the JavaScript side (light-map
 * diff, culling, sprite and bulb placement). The canvas work (one `multiply` blit of the screen, ≤ 400 sprite
 * blits into a quarter-size canvas, ≤ 400 bulbs) is measured in the browser by `tests/e2e/afterDark.spec.ts`
 * with `TC_PERF=1`. Vitest's bench mode adds getter overhead to every call into `src/`, so these are upper bounds.
 */
import { test } from 'vitest';
import { createLightingLayer } from '../../src/render/lighting/layer';
import { defaultToolState } from '../../src/render/types';
import { lightAt, markLightDirty } from '../../src/sim/lighting/api';
import { lightRawNow } from '../../src/sim/lighting/lightMap';
import { allocId } from '../../src/sim/ids';
import { stepTick } from '../../src/sim/tick';
import { benchFrame, buildLightScene, noopCanvas, noopContext, NoopPath, SIZE } from './lightScene';

const RUN = { time: 2_000, warmupTime: 300 };

function report(label: string, mean: number, tail: number, budget: number): void {
  console.log(`[bench] ${label}: mean ${mean.toFixed(4)} ms, p99 ${tail.toFixed(4)} ms (${mean < budget ? 'within' : 'OVER'} the ${budget} ms budget)`);
}

test('light map: full diff with no change (every query, render frame, and night tick)', async ({ bench }) => {
  const w = buildLightScene();
  lightRawNow(w);
  const r = await bench('lightRawNow (128 × 128, ~900 sources)', () => lightRawNow(w)).run(RUN);
  report('light map diff, no change', r.latency.mean, r.latency.p99 ?? r.latency.max, 0.2);
}, 60_000);

test('one scenery change updates the light map (budget 0.2 ms, Phase 4 §9.4)', async ({ bench }) => {
  const w = buildLightScene();
  const s = w.state;
  const tile = 60 * SIZE + 61;
  lightRawNow(w);
  let on = false;
  const r = await bench('place or remove a lit scenery item', () => {
    if (on) s.scenery.pop();
    else s.scenery.push({ id: allocId(s), defId: 'ghost_lantern', x: 61, y: 60, z: 8, rotation: 0, edge: -1, waterLevel: 255 });
    on = !on;
    markLightDirty(w, tile);
    lightAt(w, tile);
  }).run(RUN);
  report('scenery change → light', r.latency.mean, r.latency.p99 ?? r.latency.max, 0.2);
}, 60_000);

test('light pass JavaScript per frame at 1920 × 1080 (budget 2 ms)', async ({ bench }) => {
  const w = buildLightScene();
  const ctx = noopContext() as unknown as CanvasRenderingContext2D;
  const tool = defaultToolState();
  for (const [label, scale] of [['zoom 1', 1], ['zoom 0.5', 0.5]] as const) {
    const layer = createLightingLayer({ createCanvas: noopCanvas, createPath: () => new NoopPath() });
    const still = benchFrame(scale);
    layer.drawAfterObjects!(ctx, w, tool, still);
    const a = await bench(`still camera, ${label}`, () => layer.drawAfterObjects!(ctx, w, tool, still)).run(RUN);
    report(`light pass, still camera, ${label} (${layer.stats().sprites} sprites, ${layer.stats().bulbs} bulbs)`, a.latency.mean, a.latency.p99 ?? a.latency.max, 2);
    let pan = 0;
    const b = await bench(`moving camera, ${label}`, () => layer.drawAfterObjects!(ctx, w, tool, benchFrame(scale, (pan = (pan + 1) % 200)))).run(RUN);
    report(`light pass, moving camera, ${label}`, b.latency.mean, b.latency.p99 ?? b.latency.max, 2);
  }
}, 120_000);

test('night tick with After Dark (arrival factor every tick, dark-path hook at hour starts)', async ({ bench }) => {
  const w = buildLightScene();
  w.state.park.open = true;
  for (let k = 0; k < 50; k++) stepTick(w);
  const r = await bench('stepTick at night', () => stepTick(w)).run(RUN);
  report('night tick (no guests)', r.latency.mean, r.latency.p99 ?? r.latency.max, 4);
}, 60_000);
