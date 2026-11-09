/**
 * Phase 6 §4.6 renderer work (W4-E): the static terrain layer is reused only when nothing changed (terrain version,
 * camera, rotation, zoom); guest level of detail by render quality; device budgets; the draw-call probe.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FakeCanvas, install, make } from './fakeCanvas';
import { createCanvasRenderer } from '../../../src/render/renderer';
import { terrainClock } from '../../../src/render/terrain';
import { defaultToolState, type Camera } from '../../../src/render/types';
import { spriteMemory } from '../../../src/render/spriteCache';
import { setRenderQuality } from '../../../src/perf/quality';
import { perfProbe } from '../../../src/perf/stats';
import { createWorld } from '../../../src/sim/world';
import { tileIndex } from '../../../src/sim/map';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, placeFootpath, runTicks } from '../../helpers/world';

beforeAll(() => install());
beforeEach(() => {
  terrainClock.now = () => 0;
  setRenderQuality('auto');
});
afterEach(() => {
  perfProbe.enabled = false;
  perfProbe.reset();
  setRenderQuality('auto');
});

const W = 800;
const H = 600;

function park(): World {
  const world = createWorld({ seed: 5, parkName: 'Static Park', mapSize: 32 });
  for (let x = 4; x <= 20; x++) placeFootpath(world, x, 16);
  for (let k = 0; k < 30; k++) addGuestDirect(world, tileIndex(world.state.map, 4 + (k % 16), 16));
  return world;
}

function cam(zoom = 1, rotation: 0 | 1 | 2 | 3 = 0, dx = 0): Camera {
  return { centerX: dx, centerY: 32 * 16 - 64, zoom, rotation };
}

/** Draws of the canvas-sized static image on the main canvas, and draws of anything else. */
function split(canvas: FakeCanvas): { statics: number; others: number; image: FakeCanvas | null } {
  let statics = 0;
  let image: FakeCanvas | null = null;
  for (const d of canvas.draws) {
    if (d.image.width === canvas.width && d.image.height === canvas.height && d.x === 0 && d.y === 0) {
      statics++;
      image = d.image;
    }
  }
  return { statics, others: canvas.draws.length - statics, image };
}

describe('static terrain layer (Phase 6 §4.6 step 4)', () => {
  it('a still view composes the layer once, then copies it; the terrain is not drawn again', () => {
    const world = park();
    const canvas = make(W, H);
    const r = createCanvasRenderer(canvas as unknown as HTMLCanvasElement);
    r.resize(W, H, 1);
    const tool = defaultToolState();
    // Frame 1: the view is new, chunks draw straight to the canvas.
    r.draw(world, cam(), tool, 0);
    expect(split(canvas).statics).toBe(0);
    // Frame 2: the same view: the layer is composed and copied.
    canvas.reset();
    r.draw(world, cam(), tool, 0);
    const second = split(canvas);
    expect(second.statics).toBe(1);
    const layer = second.image as FakeCanvas;
    // The layer holds the sky and the chunks.
    expect(layer.count('fillRect')).toBe(1);
    expect(layer.draws.length).toBeGreaterThan(0);
    const objects = second.others;
    // Frame 3 and later: one copy, nothing drawn into the layer, guests still drawn every frame.
    for (let k = 0; k < 3; k++) {
      runTicks(world, 5);
      canvas.reset();
      layer.reset();
      r.draw(world, cam(), tool, 0.5);
      const s = split(canvas);
      expect(s.statics).toBe(1);
      expect(s.image).toBe(layer);
      expect(layer.draws.length).toBe(0);
      expect(layer.count('fillRect')).toBe(0);
      expect(s.others).toBe(objects);
    }
  });

  it('is rebuilt when the camera, zoom, rotation, or a tile changes', () => {
    const world = park();
    const canvas = make(W, H);
    const r = createCanvasRenderer(canvas as unknown as HTMLCanvasElement);
    r.resize(W, H, 1);
    const tool = defaultToolState();
    const settle = (c: Camera): FakeCanvas => {
      r.draw(world, c, tool, 0);
      r.draw(world, c, tool, 0);
      canvas.reset();
      r.draw(world, c, tool, 0);
      const s = split(canvas);
      expect(s.statics).toBe(1);
      return s.image as FakeCanvas;
    };
    const changes: Array<[string, Camera, () => void]> = [
      ['camera moved', cam(1, 0, 64), () => undefined],
      ['zoom', cam(1.5, 0, 64), () => undefined],
      ['rotation', cam(1.5, 1, 64), () => undefined],
      ['tile changed', cam(1.5, 1, 64), () => (world.state.map.heights[tileIndex(world.state.map, 10, 10)] = 12)],
    ];
    let c = cam();
    let layer = settle(c);
    for (const [, next, change] of changes) {
      change();
      layer.reset();
      canvas.reset();
      r.draw(world, next, tool, 0);
      // The changed frame draws the terrain chunks itself (no stale copy).
      expect(split(canvas).statics).toBe(0);
      expect(canvas.draws.filter((d) => d.image.width > 300).length).toBeGreaterThan(0);
      c = next;
      layer = settle(c);
    }
  });

  it('under memory pressure the layer in use stays, and the unused chunk images go', () => {
    const world = park();
    const canvas = make(W, H);
    const r = createCanvasRenderer(canvas as unknown as HTMLCanvasElement);
    r.resize(W, H, 1);
    const tool = defaultToolState();
    r.draw(world, cam(), tool, 0);
    r.draw(world, cam(), tool, 0);
    const budget = spriteMemory.budgetBytes;
    try {
      // Nothing fits: only images used in the current frame may stay.
      spriteMemory.budgetBytes = 1;
      for (let k = 0; k < 3; k++) {
        canvas.reset();
        r.draw(world, cam(), tool, 0);
        expect(split(canvas).statics).toBe(1);
      }
      expect(spriteMemory.breakdown().chunks ?? 0).toBe(0);
      expect(spriteMemory.breakdown().static).toBe(W * H * 4);
    } finally {
      spriteMemory.budgetBytes = budget;
    }
  });

  it('reuse never changes the game state', () => {
    const a = park();
    const b = park();
    const canvas = make(W, H);
    const r = createCanvasRenderer(canvas as unknown as HTMLCanvasElement);
    r.resize(W, H, 1);
    for (let k = 0; k < 10; k++) {
      runTicks(a, 20);
      runTicks(b, 20);
      r.draw(b, cam(1, 0, k < 5 ? 0 : 32), defaultToolState(), 0.25);
    }
    expect(JSON.stringify(b.state.guests)).toBe(JSON.stringify(a.state.guests));
  });
});

describe('render quality and device class (Phase 6 §4.6, §4.9)', () => {
  it('guests turn into colour-batched rectangles at zoom ≤ 0.5, and from 0.75 at low quality', () => {
    const world = park();
    const canvas = make(W, H);
    const r = createCanvasRenderer(canvas as unknown as HTMLCanvasElement);
    r.resize(W, H, 1);
    const tool = defaultToolState();
    const dots = (zoom: number): number => {
      r.draw(world, cam(zoom), tool, 0);
      canvas.reset();
      r.draw(world, cam(zoom), tool, 0);
      return canvas.rects.filter((x) => x.w === 2 && x.h === 3).length;
    };
    const guests = world.state.guests.length;
    expect(dots(0.5)).toBe(guests);
    expect(dots(0.6)).toBe(0);
    setRenderQuality('low');
    expect(dots(0.6)).toBe(guests);
    expect(dots(0.75)).toBe(guests);
    expect(dots(0.8)).toBe(0);
    // One fill per colour group, not per guest.
    canvas.reset();
    r.draw(world, cam(0.5), tool, 0);
    expect(canvas.count('fill')).toBeLessThan(guests);
  });

  it('low quality renders at 1× device pixels; high keeps the device ratio (capped at 2× on phones)', () => {
    const canvas = make(10, 10);
    const r = createCanvasRenderer(canvas as unknown as HTMLCanvasElement);
    r.resize(1280, 800, 2);
    expect(canvas.width).toBe(2560);
    setRenderQuality('low');
    r.draw(park(), cam(), defaultToolState(), 0);
    expect(canvas.width).toBe(1280);
    setRenderQuality('high');
    r.draw(park(), cam(), defaultToolState(), 0);
    expect(canvas.width).toBe(2560);
    r.resize(412, 915, 3);
    expect(canvas.width).toBe(824);
    expect(canvas.dataset.device).toBe('phone');
  });

  it('the shared sprite memory budget follows the device class: 64 MB phone, 192 MB desktop', () => {
    const canvas = make(10, 10);
    const r = createCanvasRenderer(canvas as unknown as HTMLCanvasElement);
    r.resize(412, 915, 2);
    expect(spriteMemory.budgetBytes).toBe(64 * 1024 * 1024);
    r.resize(1280, 800, 1);
    expect(spriteMemory.budgetBytes).toBe(192 * 1024 * 1024);
  });
});

describe('draw-call probe (Phase 6 §4.6 overlay)', () => {
  it('counts every drawImage of a frame while the probe is on, and nothing while it is off', () => {
    const world = park();
    const canvas = make(W, H);
    const r = createCanvasRenderer(canvas as unknown as HTMLCanvasElement);
    r.resize(W, H, 1);
    const tool = defaultToolState();
    r.draw(world, cam(), tool, 0);
    perfProbe.enabled = true;
    perfProbe.frameStart(16);
    canvas.reset();
    r.draw(world, cam(), tool, 0);
    perfProbe.frameEnd();
    expect(perfProbe.snapshot().drawCalls).toBe(canvas.count('drawImage'));
    expect(canvas.count('drawImage')).toBeGreaterThan(10);
    perfProbe.enabled = false;
    canvas.reset();
    r.draw(world, cam(), tool, 0);
    // The context's own drawImage is back: draws still reach the canvas.
    expect(canvas.count('drawImage')).toBeGreaterThan(10);
  });
});
