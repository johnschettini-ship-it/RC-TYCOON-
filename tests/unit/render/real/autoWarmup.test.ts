/**
 * `auto` render quality in the renderer (batch 0 phone run 1 fix): in the VITE_ART=real build a park load (a new world
 * drawn) and the realistic look's first complete frame after it restart the `AutoScale` warm-up, so the frames that
 * load and decode a park never step the render ratio down. The website build (VITE_ART unset) keeps today's rule.
 * Frame intervals come from a fake `performance.now()`; the canvas is a desktop (budget 20 ms, step down over 25 ms)
 * at device pixel ratio 2, so `dataset.pixelRatio` reads 2 until a step down makes it 1.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { install, make } from '../fakeCanvas';
import { createCanvasRenderer, type RealOptions } from '../../../../src/render/renderer';
import { defaultToolState, type Camera, type Renderer } from '../../../../src/render/types';
import { terrainClock } from '../../../../src/render/terrain';
import { AUTO_WARMUP_FRAMES, AUTO_WINDOW_FRAMES, renderQuality, setRenderQuality } from '../../../../src/perf/quality';
import type { RealLook } from '../../../../src/render/real/look';
import { createWorld } from '../../../../src/sim/world';
import type { World } from '../../../../src/sim/types';

const W = 800;
const H = 700;
let now = 0;
let qualityWas = renderQuality();

beforeAll(() => {
  install();
  terrainClock.now = () => 0;
});

beforeEach(() => {
  vi.stubEnv('VITE_ART', 'real');
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  qualityWas = renderQuality();
  setRenderQuality('auto');
  now = 1000;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  setRenderQuality(qualityWas);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

/** A look whose incomplete count the test sets (every object drawn with today's art). */
function look(): RealLook & { skipped: number } {
  const none = (): undefined => undefined;
  const l = {
    skipped: 0,
    density: () => 2,
    prepare() {},
    ride: none,
    stall: none,
    scenery: none,
    guest: none,
    staff: none,
    rail: none,
    car: none,
    support: none,
    shadow: none,
    groundPiece: none,
    dispose() {},
    reclaim: () => 0,
    currentDensity: () => 2,
    incomplete: () => l.skipped,
    soft: () => 0,
    fallbacksUsed: () => [],
  };
  return l as unknown as RealLook & { skipped: number };
}

const park = (seed: number): World => createWorld({ seed, parkName: 'P', mapSize: 16 });
const cam = (): Camera => ({ centerX: 0, centerY: 200, zoom: 1, rotation: 0 });

function setup(real?: RealOptions): { r: Renderer; ratio: () => string | undefined; draw: (world: World, ms: number, n: number) => void } {
  const canvas = make(W, H);
  const r = createCanvasRenderer(canvas as unknown as HTMLCanvasElement, real);
  r.resize(W, H, 2);
  const c = cam();
  const tool = defaultToolState();
  return {
    r,
    ratio: () => (canvas as unknown as HTMLCanvasElement).dataset.pixelRatio,
    draw(world, ms, n) {
      for (let k = 0; k < n; k++) {
        now += ms;
        r.draw(world, c, tool, 0);
      }
    },
  };
}

describe('auto warm-up restarts on a park load (VITE_ART=real)', () => {
  it('the setup steps down when play is slow (the instrument works)', () => {
    const t = setup({ look: look() });
    const a = park(1);
    t.draw(a, 16, AUTO_WARMUP_FRAMES + 1);
    expect(t.ratio()).toBe('2');
    t.draw(a, 40, AUTO_WINDOW_FRAMES);
    expect(t.ratio()).toBe('1');
  });

  it('a new world restarts the warm-up: its load frames do not step the ratio down', () => {
    const t = setup({ look: look() });
    t.draw(park(1), 16, AUTO_WARMUP_FRAMES + 30);
    // The load: 15 slow frames (a whole window's 5 % is 3), then steady play.
    const b = park(2);
    t.draw(b, 200, 15);
    t.draw(b, 16, AUTO_WARMUP_FRAMES + AUTO_WINDOW_FRAMES * 4);
    expect(t.ratio()).toBe('2');
  });

  it("the realistic look's first complete frame after a load restarts it again", () => {
    const l = look();
    const t = setup({ look: l });
    t.draw(park(1), 16, 10);
    const b = park(2);
    // The load restart, then the park's sets decode: incomplete frames, the slow ones late in the warm-up.
    l.skipped = 5;
    t.draw(b, 16, AUTO_WARMUP_FRAMES - 10);
    t.draw(b, 200, 15);
    // First complete frame: from here on the warm-up starts over.
    l.skipped = 0;
    t.draw(b, 16, AUTO_WARMUP_FRAMES + AUTO_WINDOW_FRAMES * 4);
    expect(t.ratio()).toBe('2');
  });

  it('only the first complete frame after a load restarts: a later incomplete spell is judged as play', () => {
    const l = look();
    const t = setup({ look: l });
    const a = park(1);
    t.draw(a, 16, AUTO_WARMUP_FRAMES + 30);
    // Incomplete then complete again in the same park (a turn): no restart, its slow frames count.
    l.skipped = 5;
    t.draw(a, 200, 15);
    l.skipped = 0;
    t.draw(a, 16, AUTO_WINDOW_FRAMES);
    expect(t.ratio()).toBe('1');
  });

  it("the website build (VITE_ART unset) keeps today's rule: a load does not restart the warm-up", () => {
    vi.stubEnv('VITE_ART', '');
    const t = setup();
    t.draw(park(1), 16, AUTO_WARMUP_FRAMES + 30);
    const b = park(2);
    t.draw(b, 200, 15);
    t.draw(b, 16, AUTO_WINDOW_FRAMES);
    expect(t.ratio()).toBe('1');
  });
});
