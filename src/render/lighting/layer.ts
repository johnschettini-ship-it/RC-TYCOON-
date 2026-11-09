/**
 * After Dark rendering (Phase 4 §4.7): the light canvas at 1/4 resolution filled with the ambient colour, cached
 * warm radial light sprites with `lighter`, multiplied over the frame (`drawAfterObjects`), then emissive sprites;
 * the Light overlay (`tool.overlay === 'light'`) in `drawGround`. Darkness 0 skips the pass. Budget ≤ 2 ms per
 * frame, ≤ 400 visible light sprites. Owner: W3-F.
 */
import type { WorldLayer } from '../layers';
import { LightOverlay } from './overlay';
import { LightPass, type LightPassStats } from './pass';
import { defaultCanvasFactory, type CanvasFactory } from './sprites';

export { ambientColour, darknessAt } from './darkness';
export type { LightPassStats };

export interface LightingLayerOptions {
  /** Canvas factory for the light canvas and sprites (tests inject a fake; default: DOM or offscreen canvas). */
  createCanvas?: CanvasFactory;
}

export interface LightingLayer extends WorldLayer {
  /** Counters of the last light pass (sprites, bulbs, redraw, time). */
  stats(): LightPassStats;
}

export function createLightingLayer(opts: LightingLayerOptions = {}): LightingLayer {
  const make = opts.createCanvas ?? defaultCanvasFactory;
  const pass = new LightPass(make);
  const overlay = new LightOverlay(make);
  return {
    name: 'lighting',
    kinds: [],
    drawGround(ctx, world, tool, f) {
      if (tool.overlay === 'light') overlay.draw(ctx, world, f);
    },
    drawAfterObjects(ctx, world, _tool, f) {
      pass.draw(ctx, world, f);
    },
    stats: () => pass.stats,
  };
}
