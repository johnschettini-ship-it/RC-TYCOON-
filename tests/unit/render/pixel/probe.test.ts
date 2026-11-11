/** Phase 8 stage 0 prototype (never merged): the `window.__pixelStats` probe of the renderer (§11.3). */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeCanvas, install, make } from '../fakeCanvas';
import { createCanvasRenderer } from '../../../../src/render/renderer';
import { terrainClock } from '../../../../src/render/terrain';
import { defaultToolState, type Camera } from '../../../../src/render/types';
import { setArtStyle } from '../../../../src/render/pixel/style';
import { executeCommand } from '../../../../src/sim/commands';
import { createWorld } from '../../../../src/sim/world';
import { tileIndex } from '../../../../src/sim/map';
import type { World } from '../../../../src/sim/types';
import { addGuestDirect, placeFootpath, runTicks } from '../../../helpers/world';

type Stats = Record<string, number>;
const win = (): { __pixelStats?: Stats } => (globalThis as unknown as { window: { __pixelStats?: Stats } }).window;

beforeAll(() => install());
beforeEach(() => {
  terrainClock.now = () => 0;
  (globalThis as unknown as { window?: unknown }).window = {};
});
afterEach(() => {
  setArtStyle('classic');
  vi.restoreAllMocks();
  delete (globalThis as unknown as { window?: unknown }).window;
});

const W = 800;
const H = 600;

/** The park of `frame.test.ts`: a footpath with guests and a carousel. */
function park(): World {
  const world = createWorld({ seed: 5, parkName: 'Probe Park', mapSize: 32 });
  const map = world.state.map;
  for (let x = 4; x <= 20; x++) placeFootpath(world, x, 16);
  for (let k = 0; k < 30; k++) addGuestDirect(world, tileIndex(map, 4 + (k % 16), 16));
  expect(executeCommand(world, { type: 'placeRide', defId: 'carousel', x: 8, y: 10, rotation: 2 }).ok).toBe(true);
  runTicks(world, 200);
  return world;
}

function cam(): Camera {
  return { centerX: 0, centerY: 32 * 16 - 64, zoom: 1, rotation: 0 };
}

function renderer(style: 'pixel' | 'classic'): { world: World; draw: (k: Camera) => void } {
  setArtStyle(style);
  const world = park();
  const c = Object.assign(make(W, H), { style: {} as Record<string, string> }) as FakeCanvas;
  const r = createCanvasRenderer(c as unknown as HTMLCanvasElement);
  r.resize(W, H, 1);
  const tool = defaultToolState();
  return { world, draw: (k) => r.draw(world, k, tool, 0) };
}

const KEYS = ['spriteBuildMsMax', 'chunkBuildMsMax', 'turnFrameMsMax', 'rideBuildMsMax', 'spriteMb', 'chunkMb'];
const resetMaxima = (s: Stats): void => {
  for (const k of KEYS) if (k.endsWith('Max')) s[k] = 0;
};

describe('the __pixelStats probe (§11.3 renderer row)', () => {
  it('the probe fills __pixelStats in Pixel', () => {
    const { draw } = renderer('pixel');
    const k = cam();
    draw(k);
    draw(k);
    const s = win().__pixelStats;
    expect(s).toBeDefined();
    for (const key of KEYS) {
      expect(Number.isFinite(s![key]), key).toBe(true);
      expect(s![key], key).toBeGreaterThanOrEqual(0);
    }
    expect(s!.spriteMb).toBeGreaterThan(0);
    expect(s!.chunkMb).toBeGreaterThan(0);
  });

  it('a view turn sets turnFrameMsMax', () => {
    const { draw } = renderer('pixel');
    const k = cam();
    draw(k);
    draw(k);
    const s = win().__pixelStats!;
    resetMaxima(s);
    k.rotation = 1;
    for (let f = 0; f < 3; f++) draw(k);
    expect(s.turnFrameMsMax).toBeGreaterThan(0);
  });

  it('turnFrameMsMax is the interval between draw starts, not the draw time', () => {
    const { draw } = renderer('pixel');
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const k = cam();
    clock = 0;
    draw(k); // rot 0
    const s = win().__pixelStats!;
    resetMaxima(s);
    clock = 100;
    k.rotation = 1;
    draw(k); // the turn draw
    clock = 150;
    draw(k);
    clock = 400;
    draw(k);
    // A draw-body time would be 0 here: the clock does not move within one draw.
    expect(s.turnFrameMsMax).toBe(250);
  });

  it('Classic sets no __pixelStats', () => {
    const { draw } = renderer('classic');
    const k = cam();
    draw(k);
    draw(k);
    expect(win().__pixelStats).toBeUndefined();
  });
});
