/** Phase 8b stage 0b test (never merged): the Pixel frame of the app runtime (plan, bank pictures, keep-last, copies, turns). */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeCanvas, install, make } from '../fakeCanvas';
import { K_RIDE, K_STALL, pixel, surfaceArt } from '../../../../src/render/artHook';
import { createCanvasRenderer } from '../../../../src/render/renderer';
import { terrainClock } from '../../../../src/render/terrain';
import { defaultToolState, type Camera } from '../../../../src/render/types';
import { defHash, type Sprite } from '../../../../src/render/spriteCache';
import { AppRuntime } from '../../../../src/render/pixel/app/runtime';
import { createStats } from '../../../../src/render/pixel/app/stats';
import { PictureStore, type StoreIo } from '../../../../src/render/pixel/app/store';
import { executeCommand } from '../../../../src/sim/commands';
import { createWorld } from '../../../../src/sim/world';
import { tileIndex } from '../../../../src/sim/map';
import type { World } from '../../../../src/sim/types';
import { addGuestDirect, placeFootpath, runTicks } from '../../../helpers/world';

// Every `buildSprite` call of the game (the bank, scenery, shows) is counted; the function itself stays.
const counts = vi.hoisted(() => ({ buildSprite: 0 }));
vi.mock('../../../../src/render/canvas', async (importOriginal) => {
  const m = await importOriginal<typeof import('../../../../src/render/canvas')>();
  return {
    ...m,
    buildSprite: (...a: Parameters<typeof m.buildSprite>) => {
      counts.buildSprite++;
      return m.buildSprite(...a);
    },
  };
});

beforeAll(() => install());
beforeEach(() => {
  terrainClock.now = () => 0;
  counts.buildSprite = 0;
});
afterEach(() => {
  pixel.rt = null;
  surfaceArt.on = null;
  vi.restoreAllMocks();
});

const noIo: StoreIo = { fetch: () => Promise.reject(new Error('no io')), decode: () => Promise.reject(new Error('no io')), now: () => 0 };

function runtime(frameSet: 'full' | 'coarse' = 'coarse'): AppRuntime {
  return new AppRuntime(new PictureStore(noIo, 64 * 1024 * 1024), createStats(frameSet, 'phone'), null);
}

/** A sprite on a fake sheet. */
function sheetSprite(w = 4, h = 6): Sprite {
  return { image: make(64, 64) as unknown as CanvasImageSource, w, h, ox: 1, oy: 2, scale: 0.5, sx: 5, sy: 7 };
}

const W = 412;
const H = 915;
const DPR = 2.625;

/** A small park: a carousel, a stall, guests on a path. */
function park(): World {
  const world = createWorld({ seed: 5, parkName: 'Frame Park', mapSize: 32 });
  const map = world.state.map;
  for (let x = 4; x <= 20; x++) placeFootpath(world, x, 16);
  for (let k = 0; k < 20; k++) addGuestDirect(world, tileIndex(map, 4 + (k % 16), 16));
  expect(executeCommand(world, { type: 'placeRide', defId: 'carousel', x: 8, y: 10, rotation: 2 }).ok).toBe(true);
  expect(executeCommand(world, { type: 'placeStall', defId: 'snack_shack', x: 14, y: 15, rotation: 2 }).ok).toBe(true);
  runTicks(world, 50);
  return world;
}

function cam(zoom = 8 / 7, rotation: Camera['rotation'] = 0): Camera {
  return { centerX: 0, centerY: 32 * 16 - 64, zoom, rotation };
}

function renderer(): { c: FakeCanvas & { style: Record<string, string> }; r: ReturnType<typeof createCanvasRenderer> } {
  const c = Object.assign(make(W, H), { style: {} as Record<string, string> });
  const r = createCanvasRenderer(c as unknown as HTMLCanvasElement);
  r.resize(W, H, DPR);
  return { c, r };
}

describe('stage 0b Pixel frame', () => {
  it('plan: Pixel 7 profile k 3, tablet k 2, canvas sizes', () => {
    const rt = runtime();
    const p = rt.plan(412, 915, 2.625);
    expect(p).toMatchObject({ stretch: 3, canvasW: 361, canvasH: 801, device: 'phone', coarse: true, budgetBytes: 64 * 1024 * 1024 });
    expect(p.boxW).toBeCloseTo((361 * 3) / 2.625, 12);
    expect(p.homeZoom).toBeCloseTo(8 / 7, 12);
    const t = runtime('full').plan(1024, 1366, 2);
    expect(t).toMatchObject({ stretch: 2, canvasW: 1024, canvasH: 1366, boxW: 1024, boxH: 1366, device: 'tablet', coarse: false, homeZoom: 1 });
  });

  it('plan refuses a canvas at the iPhone limit', () => expect(() => runtime().plan(5000, 5000, 1)).toThrow());

  it('with pixel.rt bank builders call picture and never buildSprite', () => {
    const world = park();
    const rt = runtime();
    const sp = sheetSprite();
    const picture = vi.spyOn(rt, 'picture').mockImplementation(() => sp);
    pixel.rt = rt;
    const { c, r } = renderer();
    for (let f = 0; f < 2; f++) r.draw(world, cam(), defaultToolState(), 0);
    expect(counts.buildSprite).toBe(0);
    const rides = picture.mock.calls.filter((a) => a[0] === K_RIDE);
    expect(rides.length).toBeGreaterThan(0);
    // `spriteKey('carousel', view rotation, frame, 0.5)`: bucket bits 0, the def hash on top.
    for (const [, key] of rides) {
      expect(key % 4).toBe(0);
      expect(Math.floor(key / 4 / 4096 / 4)).toBe(defHash('carousel'));
    }
    expect(picture.mock.calls.some((a) => a[0] === K_STALL)).toBe(true);
    expect(c.dataset.art).toBe('pixel');
    expect(c.dataset.stretch).toBe('3');
    expect(Number(c.dataset.homeZoom)).toBeCloseTo(8 / 7, 12);
    expect(c.dataset.artScale).toBe('2');
    expect(c.width).toBe(361);
    expect(c.height).toBe(801);
  });

  it('a ride keeps its last picture while its new sheet decodes', () => {
    const world = park();
    const rt = runtime();
    const a = sheetSprite(40, 40);
    let have = true;
    // Every picture (ground pieces and shadows too, since Task 12) comes from the store; a missing ride picture goes
    // through the real (empty) store, which counts the miss.
    const get = rt.store.get.bind(rt.store);
    vi.spyOn(rt.store, 'get').mockImplementation((kind, key, swap) => (kind === K_RIDE && !have ? get(kind, key, swap) : a));
    // A is not a real store picture; its sheet counts as still decoded (the store test covers `keep` itself).
    vi.spyOn(rt.store, 'keep').mockImplementation((sp) => sp);
    const cols = vi.spyOn(rt, 'blitColumn');
    pixel.rt = rt;
    const { c, r } = renderer();
    r.draw(world, cam(), defaultToolState(), 0);
    expect(rt.stats.incompleteFrames).toBe(0);
    expect(c.dataset.artComplete).toBe('1');
    const first = cols.mock.calls.length;
    expect(first).toBeGreaterThan(0);
    have = false;
    // The ride's frame changes (it turns), its new picture is missing: the column copies still use A.
    r.draw(world, cam(), defaultToolState(), 0.5);
    const second = cols.mock.calls.slice(first);
    expect(second.length).toBeGreaterThan(0);
    expect(second.every((call) => call[1] === a)).toBe(true);
    expect(rt.stats.incompleteFrames).toBe(1);
  });

  it('blits copy whole art pixels from the sheet rectangle', () => {
    const rt = runtime();
    rt.plan(412, 915, 2.625);
    const f = rt.beginFrame(cam(8 / 7), createWorld({ seed: 1, parkName: 'Blit' }), 412, 915, 2.625, 0);
    expect(f.n).toBe(2);
    const calls: unknown[][] = [];
    const ctx = { drawImage: (...a: unknown[]) => calls.push(a) } as unknown as CanvasRenderingContext2D;
    const sp = sheetSprite(4, 6);
    rt.blit(ctx, sp, 10, 20);
    const [img, sx, sy, sw, sh, dx, dy, dw, dh] = calls[0] as [unknown, number, number, number, number, number, number, number, number];
    expect(img).toBe(sp.image);
    expect([sx, sy, sw, sh]).toEqual([5, 7, 4, 6]);
    expect([dx, dy].every(Number.isInteger)).toBe(true);
    expect([dw, dh]).toEqual([4 * 2, 6 * 2]);
    expect(dx).toBe(f.offX + 10 - 1 * 2);
    // A column copy starts at the sheet rectangle too.
    rt.blitColumn(ctx, sp, 10, 20, 8, 12, 0);
    const col = calls[1] as number[];
    expect(col[1]).toBe(5 + (1 + (8 - 10) * 0.5));
    expect(col[2]).toBe(7);
  });

  it('a view turn counts incomplete frames until the first complete one', () => {
    const rt = runtime();
    const world = createWorld({ seed: 1, parkName: 'Turn' });
    rt.beginFrame(cam(1, 0), world, W, H, DPR, 0);
    expect(rt.endFrame(0, 0)).toBe(true);
    for (let k = 0; k < 3; k++) {
      rt.beginFrame(cam(1, 1), world, W, H, DPR, 0);
      expect(rt.store.get(K_RIDE, 12345, -1)).toBeNull();
      rt.endFrame(0, 0);
    }
    // Fix round 1 (I1): the running count, so a turn that never completes is still in the max.
    expect(rt.stats.incompleteAfterTurnMax).toBe(3);
    rt.beginFrame(cam(1, 1), world, W, H, DPR, 0);
    rt.endFrame(0, 0);
    expect(rt.stats.incompleteAfterTurnMax).toBe(3);
    expect(rt.stats.incompleteFrames).toBe(3);
    // A turn, 5 incomplete frames, then a turn again: the open count is kept (max 5).
    rt.stats.reset();
    rt.beginFrame(cam(1, 2), world, W, H, DPR, 0);
    rt.store.get(K_RIDE, 12345, -1);
    rt.endFrame(0, 0);
    for (let k = 0; k < 4; k++) {
      rt.beginFrame(cam(1, 2), world, W, H, DPR, 0);
      rt.store.get(K_RIDE, 12345, -1);
      rt.endFrame(0, 0);
    }
    rt.beginFrame(cam(1, 3), world, W, H, DPR, 0);
    rt.endFrame(0, 0);
    expect(rt.stats.incompleteAfterTurnMax).toBe(5);
    // A new world starts B5 again.
    rt.beginFrame(cam(1, 1), createWorld({ seed: 2, parkName: 'New' }), W, H, DPR, 0);
    expect(rt.stats.firstCompleteMs).toBe(-1);
  });

  it('placeholder ground with no missing picture is not a complete frame (fix round 1, I2)', () => {
    const rt = runtime();
    const world = createWorld({ seed: 1, parkName: 'Ground' });
    rt.beginFrame(cam(1, 0), world, W, H, DPR, 0);
    expect(rt.endFrame(0, 0, false)).toBe(false);
    expect(rt.stats.incompleteFrames).toBe(1);
    expect(rt.stats.firstCompleteMs).toBe(-1);
    // In the renderer: a chunk that cannot be assembled draws a placeholder, and the frame is not complete.
    const r2 = runtime();
    const sp = sheetSprite();
    vi.spyOn(r2.store, 'get').mockImplementation(() => sp);
    vi.spyOn(r2, 'chunk').mockImplementation(() => null);
    pixel.rt = r2;
    const { c, r } = renderer();
    r.draw(park(), cam(), defaultToolState(), 0);
    expect(r2.store.missing).toBe(0);
    expect(c.dataset.artComplete).toBe('0');
    expect(r2.stats.incompleteFrames).toBe(1);
  });

  it('the budget counts the rest of the sprite memory, at its peak before eviction (fix round 1, M1)', () => {
    const rt = runtime();
    rt.beginFrame(cam(1, 0), createWorld({ seed: 1, parkName: 'Budget' }), W, H, DPR, 0);
    rt.endFrame(1024 * 1024, 2 * 1024 * 1024, true, 3 * 1024 * 1024);
    expect(rt.stats.otherMb).toBe(3);
    expect(rt.stats.budgetMb).toBe(6);
    expect(rt.stats.budgetMb).toBeCloseTo(rt.stats.sheetMb + rt.stats.swapMb + rt.stats.chunkMb + rt.stats.staticMb + rt.stats.otherMb, 12);
  });
});
