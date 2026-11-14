import { beforeAll, describe, expect, it } from 'vitest';
import { FakeCanvas, install } from '../fakeCanvas';
import { groundScale, groundTerrain, groundVariant, RealGround, type RealGroundOptions } from '../../../../src/render/real/ground';
import type { Sprite } from '../../../../src/render/spriteCache';
import { FIRST_BUILD_BUDGET_MS, terrainClock } from '../../../../src/render/terrain';
import { createWorld } from '../../../../src/sim/world';
import { Content, tileIndex } from '../../../../src/sim/map';

beforeAll(() => install());

const VIEW_ALL = { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 };

function setup(answer: (terrain: string) => Sprite | null | undefined) {
  const sheet = new FakeCanvas(256, 256);
  const asked: string[] = [];
  const look = {
    density: () => 2 as const,
    groundPiece(terrain: string, slope: number, variant: number) {
      asked.push(`${terrain}:${slope}:${variant}`);
      return answer(terrain);
    },
  };
  const made: FakeCanvas[] = [];
  const holds: number[] = [];
  const ground = new RealGround(look, {
    makeCanvas: (w, h) => {
      const c = new FakeCanvas(w, h);
      made.push(c);
      return c as never;
    },
    hold: (_id, b) => holds.push(b),
  });
  const screen = new FakeCanvas(800, 600);
  const ctx = screen.getContext() as CanvasRenderingContext2D;
  return { sheet, asked, ground, made, holds, screen, ctx };
}

describe('RealGround', () => {
  it('lays one piece per tile into 8 × 8 chunk canvases from the sheet rectangle', () => {
    terrainClock.now = () => 0;
    const world = createWorld({ seed: 3, parkName: 'G', mapSize: 16 });
    const t = setup(() => ({ image: new FakeCanvas(1, 1) as unknown as CanvasImageSource, sx: 64, sy: 32, w: 128, h: 64, ox: 64, oy: 0, scale: 2 }));
    const drawn = t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 1, 0, 0, 0, 1);
    expect(drawn).toBe(4);
    expect(t.ground.complete).toBe(true);
    expect(t.made.length).toBe(4);
    expect(t.asked.length).toBe(16 * 16);
    for (const c of t.made) {
      expect(c.draws.length).toBe(64);
      expect(c.draws[0]!.src).toEqual({ x: 64, y: 32, w: 128, h: 64 });
    }
    expect(t.holds.at(-1)).toBe(t.made.reduce((n, c) => n + c.width * c.height * 4, 0));
    // Kept: the next frame only copies the 4 chunk images.
    t.asked.length = 0;
    t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 1, 0, 0, 0, 1);
    expect(t.asked.length).toBe(0);
    expect(t.screen.draws.length).toBe(8);
  });

  it('a piece not decoded yet leaves the chunk unbuilt and the ground incomplete', () => {
    terrainClock.now = () => 0;
    const world = createWorld({ seed: 3, parkName: 'G', mapSize: 16 });
    const t = setup(() => null);
    expect(t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 1, 0, 0, 0, 1)).toBe(0);
    expect(t.ground.complete).toBe(false);
  });

  it('builds new chunks only within the first-build budget (at least one per frame)', () => {
    let now = 0;
    terrainClock.now = () => (now += FIRST_BUILD_BUDGET_MS);
    const world = createWorld({ seed: 3, parkName: 'G', mapSize: 16 });
    const t = setup(() => ({ image: new FakeCanvas(1, 1) as unknown as CanvasImageSource, w: 4, h: 4, ox: 2, oy: 0, scale: 2 }));
    t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 1, 0, 0, 0, 1);
    expect(t.ground.builds).toBe(1);
    expect(t.ground.complete).toBe(false);
    terrainClock.now = () => 0;
  });

  it('a terrain change rebuilds only the chunk whose tiles changed', () => {
    terrainClock.now = () => 0;
    const world = createWorld({ seed: 3, parkName: 'G', mapSize: 16 });
    const map = world.state.map;
    const t = setup(() => ({ image: new FakeCanvas(1, 1) as unknown as CanvasImageSource, w: 4, h: 4, ox: 2, oy: 0, scale: 2 }));
    t.ground.draw(t.ctx, map, VIEW_ALL, 1, 0, 0, 0, 1);
    map.content[tileIndex(map, 2, 2)] = Content.Footpath;
    t.ground.draw(t.ctx, map, VIEW_ALL, 1, 0, 0, 0, 2);
    expect(t.ground.builds).toBe(1);
    expect(groundTerrain(map, tileIndex(map, 2, 2))).toBe('path');
  });

  it('variants are 0–3 and fixed per tile', () => {
    const seen = new Set<number>();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) seen.add(groundVariant(x, y));
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
    expect(groundVariant(5, 9)).toBe(groundVariant(5, 9));
  });
});

const piece = (): Sprite => ({ image: new FakeCanvas(1, 1) as unknown as CanvasImageSource, w: 4, h: 4, ox: 2, oy: 0, scale: 2 });

/** A ground with a set density and options; `asked` logs every piece asked for, with its join. */
function setupWith(density: () => 2 | 4, opts: RealGroundOptions = {}, answer: (terrain: string) => Sprite | null | undefined = piece) {
  const asked: string[] = [];
  const made: FakeCanvas[] = [];
  const holds: [number, number | undefined][] = [];
  const look = {
    density,
    groundPiece(terrain: string, slope: number, variant: number, _rot: number, join?: number) {
      asked.push(`${terrain}:${slope}:${variant}:${join ?? '-'}`);
      return answer(terrain);
    },
  };
  const ground = new RealGround(look, {
    makeCanvas: (w, h) => {
      const c = new FakeCanvas(w, h);
      made.push(c);
      return c as never;
    },
    hold: (_id, b, up) => holds.push([b, up]),
    ...opts,
  });
  const screen = new FakeCanvas(800, 600);
  return { ground, asked, made, holds, ctx: screen.getContext() as CanvasRenderingContext2D };
}

describe('RealGround memory (final review C1, I6, M1)', () => {
  it('builds chunks at the screen scale rounded up to a step, never above the density (C1 d)', () => {
    expect(groundScale(0.5, 2)).toBe(1);
    expect(groundScale(1, 2)).toBe(1);
    expect(groundScale(1.375, 2)).toBe(1.5);
    expect(groundScale(2, 2)).toBe(2);
    expect(groundScale(2.75, 4)).toBe(3);
    expect(groundScale(2.75, 2)).toBe(2);
    expect(groundScale(5.5, 4)).toBe(4);
    terrainClock.now = () => 0;
    const world = createWorld({ seed: 3, parkName: 'G', mapSize: 16 });
    // Phone: zoom 1 at DPR 2.75 is density 4, but chunks are built at 3.
    const t = setupWith(() => 4);
    t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 2.75, 0, 0, 0, 1);
    const at3 = t.made.reduce((n, c) => n + c.width * c.height, 0);
    const t4 = setupWith(() => 4);
    t4.ground.draw(t4.ctx, world.state.map, VIEW_ALL, 4, 0, 0, 0, 1);
    const at4 = t4.made.reduce((n, c) => n + c.width * c.height, 0);
    expect(at3 / at4).toBeLessThan(0.6);
  });

  it('chunks of another rotation or scale are freed as soon as the ground draws at a new one (C1 a)', () => {
    terrainClock.now = () => 0;
    const world = createWorld({ seed: 3, parkName: 'G', mapSize: 16 });
    let d: 2 | 4 = 2;
    const t = setupWith(() => d);
    t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 2, 0, 0, 0, 1);
    const first = [...t.made];
    expect(first).toHaveLength(4);
    t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 2, 0, 0, 1, 1);
    expect(first.every((c) => c.width === 0)).toBe(true);
    expect(t.ground.heldBytes()).toBe(t.made.slice(4).reduce((n, c) => n + c.width * c.height * 4, 0));
    const second = t.made.slice(4);
    d = 4;
    t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 4, 0, 0, 1, 1);
    expect(second.every((c) => c.width === 0)).toBe(true);
  });

  it('endFrame evicts chunks off screen for 120 frames even when the ground is not drawn, and keeps the ones the static layer shows', () => {
    terrainClock.now = () => 0;
    const world = createWorld({ seed: 3, parkName: 'G', mapSize: 32 });
    const t = setupWith(() => 2);
    t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 1, 0, 0, 0, 1);
    t.ground.endFrame();
    const all = [...t.made];
    expect(all).toHaveLength(16);
    // Frame 2: the view narrows to one corner; the others are off screen from now on.
    t.ground.draw(t.ctx, world.state.map, { x0: -10, y0: -10, x1: 10, y1: 10 }, 1, 0, 0, 0, 1);
    t.ground.endFrame();
    const onScreen = all.filter((c) => c.width > 0).length;
    // Static layer reused for 200 frames: no draw at all.
    for (let i = 0; i < 200; i++) t.ground.endFrame();
    const kept = all.filter((c) => c.width > 0).length;
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(16);
    expect(onScreen).toBe(16);
    expect(t.ground.heldBytes()).toBe(all.filter((c) => c.width > 0).reduce((n, c) => n + c.width * c.height * 4, 0));
    expect(t.holds.at(-1)![0]).toBe(t.ground.heldBytes());
  });

  it('reclaim frees chunks off screen at once, oldest first, and never one on screen', () => {
    terrainClock.now = () => 0;
    const world = createWorld({ seed: 3, parkName: 'G', mapSize: 32 });
    const t = setupWith(() => 2);
    t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 1, 0, 0, 0, 1);
    t.ground.endFrame();
    t.ground.draw(t.ctx, world.state.map, { x0: -10, y0: -10, x1: 10, y1: 10 }, 1, 0, 0, 0, 1);
    t.ground.endFrame();
    const before = t.ground.heldBytes();
    const freed = t.ground.reclaim(Number.POSITIVE_INFINITY);
    expect(freed).toBeGreaterThan(0);
    expect(t.ground.heldBytes()).toBe(before - freed);
    expect(t.ground.heldBytes()).toBeGreaterThan(0); // the chunks of the last frame stay
    expect(t.ground.reclaim(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('a chunk is admitted before it is made: no room leaves it unbuilt and the ground incomplete', () => {
    terrainClock.now = () => 0;
    const world = createWorld({ seed: 3, parkName: 'G', mapSize: 16 });
    let room = 0;
    const asks: [number, number | undefined][] = [];
    const t = setupWith(() => 2, { admit: (_id, b, up) => { asks.push([b, up]); return b <= room; } });
    expect(t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 2.75, 0, 0, 0, 1)).toBe(0);
    expect(t.ground.complete).toBe(false);
    expect(t.made).toHaveLength(0);
    // Scale 2.75 with the density capped to 2: chunks at 2; uncapped they would be at 3, (3 / 2)^2 as big.
    expect(asks[0]![1]).toBe(Math.round(asks[0]![0] * 2.25));
    room = Number.POSITIVE_INFINITY;
    t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 2.75, 0, 0, 0, 1);
    expect(t.ground.complete).toBe(true);
  });

  it('a canvas with no 2D context or one that cannot be made leaves the ground incomplete and never throws (I6)', () => {
    terrainClock.now = () => 0;
    const world = createWorld({ seed: 3, parkName: 'G', mapSize: 16 });
    const errors: unknown[] = [];
    const noCtx = setupWith(() => 2, { makeCanvas: () => ({ width: 10, height: 10, getContext: () => null }) as never, onError: (e) => errors.push(e) });
    expect(() => noCtx.ground.draw(noCtx.ctx, world.state.map, VIEW_ALL, 1, 0, 0, 0, 1)).not.toThrow();
    expect(noCtx.ground.complete).toBe(false);
    expect(noCtx.ground.heldBytes()).toBe(0);
    const throws = setupWith(() => 2, { makeCanvas: () => { throw new Error('too big'); }, onError: (e) => errors.push(e) });
    expect(() => throws.ground.draw(throws.ctx, world.state.map, VIEW_ALL, 1, 0, 0, 0, 1)).not.toThrow();
    expect(throws.ground.complete).toBe(false);
    // Reported once per message, not once per chunk or frame.
    throws.ground.draw(throws.ctx, world.state.map, VIEW_ALL, 1, 0, 0, 0, 1);
    expect(errors.map((e) => (e as Error).message)).toEqual(['no 2D context for a ground chunk canvas', 'too big']);
  });

  it('path and queue tiles ask for their join mask in view terms (kerbs), as today\'s paths (M1)', () => {
    terrainClock.now = () => 0;
    const world = createWorld({ seed: 3, parkName: 'G', mapSize: 16 });
    const map = world.state.map;
    // A path running east-west through (4, 4): joins E (2) and W (8) = 10.
    for (const x of [3, 4, 5]) map.content[tileIndex(map, x, 4)] = Content.Footpath;
    const t = setupWith(() => 2);
    t.ground.draw(t.ctx, map, VIEW_ALL, 1, 0, 0, 0, 1, { rides: [], stalls: [] });
    expect(t.asked).toContain('path:0:' + groundVariant(4, 4) + ':10');
    expect(t.asked.filter((a) => a.startsWith('grass')).every((a) => a.endsWith(':-'))).toBe(true);
    // Turned once: E-W in the map is N-S in the view (bits 1 and 4 = 5).
    const t1 = setupWith(() => 2);
    t1.ground.draw(t1.ctx, map, VIEW_ALL, 1, 0, 0, 1, 1, { rides: [], stalls: [] });
    expect(t1.asked).toContain('path:0:' + groundVariant(4, 4) + ':5');
  });

  it('a path change next to a chunk rebuilds it (its joins changed)', () => {
    terrainClock.now = () => 0;
    const world = createWorld({ seed: 3, parkName: 'G', mapSize: 16 });
    const map = world.state.map;
    map.content[tileIndex(map, 7, 2)] = Content.Footpath;
    const t = setupWith(() => 2);
    t.ground.draw(t.ctx, map, VIEW_ALL, 1, 0, 0, 0, 1, { rides: [], stalls: [] });
    map.content[tileIndex(map, 8, 2)] = Content.Footpath; // in the next chunk
    t.ground.draw(t.ctx, map, VIEW_ALL, 1, 0, 0, 0, 2, { rides: [], stalls: [] });
    expect(t.ground.builds).toBe(2);
  });
});
