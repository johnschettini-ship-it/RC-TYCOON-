import { beforeAll, describe, expect, it } from 'vitest';
import { FakeCanvas, install } from '../fakeCanvas';
import { groundScale, groundTerrain, groundVariant, RealGround, type RealGroundOptions } from '../../../../src/render/real/ground';
import type { Sprite } from '../../../../src/render/spriteCache';
import { chunkBounds, chunkViewRect, FIRST_BUILD_BUDGET_MS, terrainClock } from '../../../../src/render/terrain';
import { createWorld } from '../../../../src/sim/world';
import { Content, tileIndex } from '../../../../src/sim/map';
import { SetManager } from '../../../../src/render/real/setManager';

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
    // Screen scale 1.375 builds chunks at 1.5, under 0.6 of the bytes at 2 (above 2 no chunk is made: round 3 item 3).
    const t = setupWith(() => 2);
    t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 1.375, 0, 0, 0, 1);
    const at15 = t.made.reduce((n, c) => n + c.width * c.height, 0);
    const t2 = setupWith(() => 2);
    t2.ground.draw(t2.ctx, world.state.map, VIEW_ALL, 2, 0, 0, 0, 1);
    const at2 = t2.made.reduce((n, c) => n + c.width * c.height, 0);
    expect(at15 / at2).toBeLessThan(0.6);
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
    expect(t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 2, 0, 0, 0, 1)).toBe(0);
    expect(t.ground.complete).toBe(false);
    expect(t.made).toHaveLength(0);
    // Chunks are made at screen scale 2 at most (density 2 either way), so their density-4 size is the same.
    expect(asks[0]![1]).toBe(asks[0]![0]);
    room = Number.POSITIVE_INFINITY;
    t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 2, 0, 0, 0, 1);
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

describe('RealGround at high zoom: tiles straight into the target, no chunk (round 3 item 3)', () => {
  it('above screen scale 2 draws each tile in the view from the sheet rectangle, makes and holds nothing', () => {
    terrainClock.now = () => 0;
    const world = createWorld({ seed: 3, parkName: 'G', mapSize: 16 });
    const holds: number[] = [];
    const t = setupWith(() => 4, { hold: (_id, b) => holds.push(b) }, () => ({ image: new FakeCanvas(1, 1) as unknown as CanvasImageSource, sx: 8, sy: 4, w: 256, h: 128, ox: 128, oy: 0, scale: 4 }));
    t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 4, 0, 0, 0, 1);
    expect(t.made).toHaveLength(0);
    expect(t.ground.heldBytes()).toBe(0);
    expect(holds.every((b) => b === 0)).toBe(true);
    expect(t.ground.complete).toBe(true);
    expect(t.ground.tilesDrawn).toBe(16 * 16);
    expect(t.asked).toHaveLength(16 * 16);
    // Every frame draws again (nothing is kept), and only the tiles inside the view.
    t.asked.length = 0;
    t.ground.draw(t.ctx, world.state.map, { x0: -40, y0: -40, x1: 40, y1: 40 }, 4, 0, 0, 0, 1);
    expect(t.ground.tilesDrawn).toBeGreaterThan(0);
    expect(t.ground.tilesDrawn).toBeLessThan(32);
  });

  it('draws at the screen scale: a density-4 piece 1:1 at scale 4, a density-2 piece (density capped) scaled up 2×', () => {
    terrainClock.now = () => 0;
    const world = createWorld({ seed: 3, parkName: 'G', mapSize: 8 });
    for (const [d, w] of [[4, 256], [2, 128]] as const) {
      const sheet = new FakeCanvas(512, 512);
      const t = setupWith(() => d, {}, () => ({ image: sheet as unknown as CanvasImageSource, sx: 8, sy: 4, w, h: w / 2, ox: w / 2, oy: 0, scale: d }));
      const target = new FakeCanvas(4000, 4000);
      t.ground.draw(target.getContext() as CanvasRenderingContext2D, world.state.map, VIEW_ALL, 4, 0, 0, 0, 1);
      const first = target.draws[0]!;
      expect(first.src).toEqual({ x: 8, y: 4, w, h: w / 2 });
      expect([first.w, first.h]).toEqual([256, 128]);
    }
  });

  it('a piece not decoded yet leaves the ground incomplete (the old chunk shows there); switching from chunks frees them once every tile drew', () => {
    terrainClock.now = () => 0;
    const world = createWorld({ seed: 3, parkName: 'G', mapSize: 16 });
    let ready = true;
    const t = setupWith(() => 2, {}, () => (ready ? piece() : null));
    t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 2, 0, 0, 0, 1);
    expect(t.made).toHaveLength(4);
    ready = false;
    t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 4, 0, 0, 0, 1);
    // The chunks stay under the tiles as stand-ins while the pieces decode (Task 3 fix round 1).
    expect(t.made.every((c) => c.width > 0)).toBe(true);
    expect(t.ground.complete).toBe(false);
    ready = true;
    t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 4, 0, 0, 0, 1);
    expect(t.made.every((c) => c.width === 0)).toBe(true);
    expect(t.ground.heldBytes()).toBe(0);
    expect(t.ground.complete).toBe(true);
  });

  it('path joins are asked in view terms at every turn (cached in map terms)', () => {
    terrainClock.now = () => 0;
    const world = createWorld({ seed: 3, parkName: 'G', mapSize: 16 });
    const map = world.state.map;
    map.content[tileIndex(map, 5, 5)] = Content.Footpath;
    map.content[tileIndex(map, 6, 5)] = Content.Footpath;
    const joinsAt = (rot: 0 | 1) => {
      const t = setupWith(() => 4);
      t.ground.draw(t.ctx, map, VIEW_ALL, 4, 0, 0, rot, 1, { rides: [], stalls: [] });
      return t.asked.filter((a) => a.startsWith('path')).sort();
    };
    const t = setupWith(() => 4);
    t.ground.draw(t.ctx, map, VIEW_ALL, 4, 0, 0, 0, 1, { rides: [], stalls: [] });
    t.asked.length = 0;
    t.ground.draw(t.ctx, map, VIEW_ALL, 4, 0, 0, 1, 1, { rides: [], stalls: [] });
    expect(t.asked.filter((a) => a.startsWith('path')).sort()).toEqual(joinsAt(1));
    expect(joinsAt(1)).not.toEqual(joinsAt(0));
  });
});

describe('RealGround covers: today\'s terrain left out under realistic chunks (round 3 fix 2)', () => {
  it('chunks: covered once built with every tile from a piece; a tile without a piece keeps today\'s terrain under its chunk', () => {
    terrainClock.now = () => 0;
    const world = createWorld({ seed: 3, parkName: 'G', mapSize: 16 });
    const map = world.state.map;
    map.water[tileIndex(map, 12, 12)] = 200; // one water tile, in chunk (1, 1): the fake has no water piece
    const t = setupWith(() => 2, {}, (terrain) => (terrain === 'water' ? undefined : piece()));
    t.ground.beginCover(map, 1, 0, 1);
    expect([0, 1, 2, 3].map((c) => t.ground.covers(c))).toEqual([false, false, false, false]); // nothing built yet
    t.ground.draw(t.ctx, map, VIEW_ALL, 1, 0, 0, 0, 1);
    t.ground.beginCover(map, 1, 0, 1);
    expect([0, 1, 2, 3].map((c) => t.ground.covers(c))).toEqual([true, true, true, false]);
    // Another rotation, another scale, or a terrain change that left the chunk's tiles alone: still covered (Task 3:
    // a smaller old chunk, the tiles, the other density or a placeholder stands in, never nothing).
    t.ground.beginCover(map, 1, 1, 1);
    expect(t.ground.covers(0)).toBe(true);
    expect(t.ground.covers(3)).toBe(false);
    t.ground.beginCover(map, 2, 0, 1);
    expect(t.ground.covers(0)).toBe(true);
    t.ground.beginCover(map, 1, 0, 2);
    expect(t.ground.covers(0)).toBe(true);
  });

  /** A direct-mode ground; `ready` false answers null (not decoded), `baked` false answers undefined (not in the bake). */
  function directSetup(state: { ready: boolean; density: 2 | 4; baked?: boolean }) {
    const asked: string[] = [];
    const look = {
      density: () => state.density,
      groundPiece(terrain: string) { asked.push(terrain); return state.baked === false ? undefined : state.ready ? piece() : null; },
    };
    const ground = new RealGround(look, { makeCanvas: (w, h) => new FakeCanvas(w, h) as never });
    const ctx = new FakeCanvas(800, 600).getContext() as CanvasRenderingContext2D;
    return { ground, ctx, asked };
  }

  it('direct tiles: covered when every tile in view had a piece at the last draw; tiles out of view are never asked', () => {
    terrainClock.now = () => 0;
    const world = createWorld({ seed: 3, parkName: 'G', mapSize: 16 });
    const map = world.state.map;
    const st = { ready: true, density: 4 as 2 | 4, baked: true };
    const t = directSetup(st);
    t.ground.beginCover(map, 4, 0, 1);
    expect(t.ground.covers(0)).toBe(false);
    // Only a corner of the map in view: its tiles are drawn (asked), the chunk's other tiles are not asked.
    t.ground.draw(t.ctx, map, { x0: -40, y0: -40, x1: 40, y1: 40 }, 4, 0, 0, 0, 1);
    expect(t.asked.length).toBe(t.ground.tilesDrawn);
    expect(t.asked.length).toBeLessThan(64);
    t.ground.beginCover(map, 4, 0, 1);
    expect(t.ground.covers(0)).toBe(true);
    // A piece not decoded: still covered, the tile draws a placeholder (Task 3); the chunks not known yet are not
    // covered (today's terrain under them): nothing is drawn there.
    st.ready = false;
    t.ground.draw(t.ctx, map, VIEW_ALL, 4, 0, 0, 0, 1);
    expect(t.ground.placeholders).toBe(64);
    t.ground.beginCover(map, 4, 0, 1);
    expect(t.ground.covers(0)).toBe(true);
    // A piece the bake lacks: a placeholder this frame, then today's terrain (not covered).
    st.baked = false;
    t.ground.draw(t.ctx, map, VIEW_ALL, 4, 0, 0, 0, 1);
    expect(t.ground.placeholders).toBe(16 * 16);
    // ...and that frame is not complete, so the static layer is not kept with the placeholders (fix round 1).
    expect(t.ground.complete).toBe(false);
    t.ground.beginCover(map, 4, 0, 1);
    expect(t.ground.covers(0)).toBe(false);
  });

  it('direct tiles: a density change (cap or lift) keeps every chunk covered (Task 3: the other density stands in)', () => {
    terrainClock.now = () => 0;
    const world = createWorld({ seed: 3, parkName: 'G', mapSize: 16 });
    const map = world.state.map;
    const st = { ready: true, density: 4 as 2 | 4 };
    const t = directSetup(st);
    t.ground.draw(t.ctx, map, VIEW_ALL, 4, 0, 0, 0, 1);
    t.ground.beginCover(map, 4, 0, 1);
    expect(t.ground.covers(0)).toBe(true);
    st.density = 2;
    t.ground.beginCover(map, 4, 0, 1);
    expect([0, 1, 2, 3].map((c) => t.ground.covers(c))).toEqual([true, true, true, true]);
  });

  it('a draw that throws covers nothing until a draw completes (fix round 2, 4)', () => {
    terrainClock.now = () => 0;
    const world = createWorld({ seed: 3, parkName: 'G', mapSize: 16 });
    const map = world.state.map;
    const st = { ready: true, density: 4 as 2 | 4 };
    const t = directSetup(st);
    t.ground.draw(t.ctx, map, VIEW_ALL, 4, 0, 0, 0, 1);
    const bad = { drawImage() { throw new Error('boom'); } } as unknown as CanvasRenderingContext2D;
    t.ground.draw(bad, map, VIEW_ALL, 4, 0, 0, 0, 1);
    t.ground.beginCover(map, 4, 0, 1);
    expect(t.ground.covers(0)).toBe(false);
    t.ground.draw(t.ctx, map, VIEW_ALL, 4, 0, 0, 0, 1);
    t.ground.beginCover(map, 4, 0, 1);
    expect(t.ground.covers(0)).toBe(true);
  });
});

describe('RealGround join cache (round 3 fix 5)', () => {
  it('is allocated only while tiles are drawn directly', () => {
    terrainClock.now = () => 0;
    const world = createWorld({ seed: 3, parkName: 'G', mapSize: 16 });
    const t = setupWith(() => 2);
    const joins = () => (t.ground as unknown as { joins: Int16Array }).joins.length;
    t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 2, 0, 0, 0, 1);
    expect(joins()).toBe(0);
    t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 4, 0, 0, 0, 1);
    expect(joins()).toBe(16 * 16);
    t.ground.draw(t.ctx, world.state.map, VIEW_ALL, 1, 0, 0, 0, 1);
    expect(joins()).toBe(0);
  });
});


describe('RealGround never leaves an empty tile (Task 3: today\'s terrain is freed under it)', () => {
  /** A ground whose fake look answers density-4 pieces only when `d4`, and a density-2 stand-in only when `d2`. */
  function twinSetup(st: { density: 2 | 4; d4: boolean; d2: boolean }) {
    const d2 = { image: new FakeCanvas(1, 1) as unknown as CanvasImageSource, w: 4, h: 4, ox: 2, oy: 0, scale: 2 };
    const d4 = { image: new FakeCanvas(1, 1) as unknown as CanvasImageSource, w: 8, h: 8, ox: 4, oy: 0, scale: 4 };
    const look = {
      density: () => st.density,
      groundPiece: () => (st.density === 2 ? (st.d2 ? d2 : null) : st.d4 ? d4 : null),
      groundStandIn: () => (st.density === 4 && st.d2 ? d2 : null),
    };
    const ground = new RealGround(look, { makeCanvas: (w, h) => new FakeCanvas(w, h) as never });
    const screen = new FakeCanvas(800, 600);
    return { ground, screen, ctx: screen.getContext() as CanvasRenderingContext2D, d2, d4 };
  }
  const frame = (t: ReturnType<typeof twinSetup>, map: ReturnType<typeof createWorld>['state']['map'], scale: number, version = 1) => {
    t.ground.beginCover(map, scale, 0, version);
    const covered = [0, 1, 2, 3].map((c) => t.ground.covers(c));
    t.screen.reset();
    t.ground.draw(t.ctx, map, VIEW_ALL, scale, 0, 0, 0, version);
    t.ground.endFrame();
    return covered;
  };

  it('no empty tile on a zoom step', () => {
    terrainClock.now = () => 0;
    const map = createWorld({ seed: 3, parkName: 'G', mapSize: 16 }).state.map;
    const st = { density: 2 as 2 | 4, d4: false, d2: true };
    const t = twinSetup(st);
    frame(t, map, 2);
    expect(frame(t, map, 2)).toEqual([true, true, true, true]);
    // Zoom 1 → 2 on a phone drawing at render ratio 2: screen scale 2 → 4, density 4, its pieces not decoded yet.
    st.density = 4;
    // Still covered (today's terrain stays freed), and every chunk draws its old density-2 chunk, scaled, in that
    // same frame; the density-2 set may be freed meanwhile (the stand-in does not pin it).
    st.d2 = false;
    expect(frame(t, map, 4)).toEqual([true, true, true, true]);
    expect(t.screen.draws).toHaveLength(4);
    expect(t.ground.placeholders).toBe(0);
    expect(t.ground.complete).toBe(false); // soft: sharpens when density 4 lands
    expect(frame(t, map, 4)).toEqual([true, true, true, true]);
    expect(t.screen.draws).toHaveLength(4);
    // Density 4 lands: every tile from its own piece, complete again, the old chunks freed.
    st.d4 = true;
    frame(t, map, 4);
    expect(t.screen.draws.filter((d) => (d.image as unknown) === t.d4.image)).toHaveLength(16 * 16);
    expect(t.ground.complete).toBe(true);
    expect(t.ground.heldBytes()).toBe(0);
  });

  it('direct tiles with no old chunk: the other density\'s piece, else a placeholder per tile, never nothing', () => {
    terrainClock.now = () => 0;
    const map = createWorld({ seed: 3, parkName: 'G', mapSize: 16 }).state.map;
    const st = { density: 4 as 2 | 4, d4: true, d2: true };
    const t = twinSetup(st);
    frame(t, map, 4);
    st.d4 = false;
    expect(frame(t, map, 4)).toEqual([true, true, true, true]);
    expect(t.screen.draws.filter((d) => (d.image as unknown) === t.d2.image)).toHaveLength(16 * 16);
    st.d2 = false;
    expect(frame(t, map, 4)).toEqual([true, true, true, true]);
    expect(t.ground.tilesDrawn).toBe(0);
    expect(t.ground.placeholders).toBe(16 * 16);
    expect(t.screen.count('fill')).toBe(16 * 16);
    expect(t.ground.complete).toBe(false);
  });

  it('a zoom out keeps the larger old chunks as stand-ins until each is replaced', () => {
    let now = 0;
    terrainClock.now = () => 0;
    const map = createWorld({ seed: 3, parkName: 'G', mapSize: 16 }).state.map;
    const t = twinSetup({ density: 2, d4: false, d2: true });
    frame(t, map, 2);
    const held = t.ground.heldBytes();
    // Scale 2 → 1 with time for one new chunk only: the other three draw their scale-2 chunk, scaled down.
    terrainClock.now = () => (now += FIRST_BUILD_BUDGET_MS);
    expect(frame(t, map, 1)).toEqual([true, true, true, true]);
    expect(t.ground.builds).toBe(1);
    expect(t.screen.draws).toHaveLength(4);
    expect(t.ground.placeholders).toBe(0);
    expect(t.ground.heldBytes()).toBeLessThan(held);
    terrainClock.now = () => 0;
    frame(t, map, 1);
    expect(t.ground.complete).toBe(true);
    expect(t.ground.heldBytes()).toBeLessThan(held / 2);
  });

  it('a covered chunk whose bake lacks one tile\'s frame never shows an empty tile across still frames', () => {
    terrainClock.now = () => 0;
    const map = createWorld({ seed: 3, parkName: 'G', mapSize: 16 }).state.map;
    const lacking = tileIndex(map, 3, 3);
    map.slope[lacking] = 1; // the bake has no frame for this slope
    const look = {
      density: () => 2 as const,
      groundPiece: (_t: string, slope: number) => (slope === 0 ? piece() : undefined),
      groundBaked: () => true,
    };
    const ground = new RealGround(look, { makeCanvas: (w, h) => new FakeCanvas(w, h) as never });
    const screen = new FakeCanvas(800, 600);
    const ctx = screen.getContext() as CanvasRenderingContext2D;
    // Frame 1: covered (every terrain is baked), so today's terrain is left out: the lacking tile is a placeholder,
    // the other 63 tiles of its chunk are drawn, and the frame is not complete (the static layer is not kept).
    ground.beginCover(map, 1, 0, 1);
    expect(ground.covers(0)).toBe(true);
    ground.draw(ctx, map, VIEW_ALL, 1, 0, 0, 0, 1);
    expect(ground.placeholders).toBe(1);
    expect(ground.tilesDrawn).toBe(63);
    expect(ground.complete).toBe(false);
    ground.endFrame();
    // Frame 2, view still: not covered any more, so today's terrain draws that chunk under the realistic one.
    ground.beginCover(map, 1, 0, 1);
    expect(ground.covers(0)).toBe(false);
    expect([1, 2, 3].map((c) => ground.covers(c))).toEqual([true, true, true]);
    ground.draw(ctx, map, VIEW_ALL, 1, 0, 0, 0, 1);
    expect(ground.complete).toBe(true);
  });

  it('no hole when demotions lift', () => {
    terrainClock.now = () => 0;
    const map = createWorld({ seed: 3, parkName: 'G', mapSize: 16 }).state.map;
    // Density 4 at scale 4 throughout; the ground's density-4 set demoted, so its pieces come from density 2.
    const st = { density: 4 as 2 | 4, d4: true, d2: true };
    const t = twinSetup(st);
    frame(t, map, 4);
    expect(frame(t, map, 4)).toEqual([true, true, true, true]);
    // The demotion lifts at the same density: the density-4 set is wanted again and not decoded yet.
    st.d4 = false;
    expect(frame(t, map, 4)).toEqual([true, true, true, true]);
    expect(t.ground.tilesDrawn + t.ground.placeholders).toBe(16 * 16);
    expect(t.ground.tilesDrawn).toBe(16 * 16);
  });

  it('a zoom step between chunk scales draws the old chunk scaled until the new one is built', () => {
    let now = 0;
    terrainClock.now = () => 0;
    const map = createWorld({ seed: 3, parkName: 'G', mapSize: 16 }).state.map;
    const st = { density: 2 as 2 | 4, d4: false, d2: true };
    const t = twinSetup(st);
    frame(t, map, 1);
    // Scale 1 → 2 with time for one new chunk only: the other three draw their scale-1 chunk, scaled.
    terrainClock.now = () => (now += FIRST_BUILD_BUDGET_MS);
    expect(frame(t, map, 2)).toEqual([true, true, true, true]);
    expect(t.ground.builds).toBe(1);
    expect(t.screen.draws).toHaveLength(4);
    terrainClock.now = () => 0;
    frame(t, map, 2);
    expect(t.ground.complete).toBe(true);
    expect(t.screen.draws).toHaveLength(4);
  });

  it('a covered chunk with no picture draws its tiles directly while the frame\'s budget lasts, then a flat placeholder', () => {
    let now = 0;
    terrainClock.now = () => 0;
    const map = createWorld({ seed: 3, parkName: 'G', mapSize: 16 }).state.map;
    let room = true;
    const d2 = piece();
    const look = { density: () => 2 as const, groundPiece: () => d2 };
    const ground = new RealGround(look, { makeCanvas: (w, h) => new FakeCanvas(w, h) as never, admit: () => room });
    const screen = new FakeCanvas(800, 600);
    const ctx = screen.getContext() as CanvasRenderingContext2D;
    ground.draw(ctx, map, VIEW_ALL, 1, 0, 0, 0, 1);
    ground.endFrame();
    // A view turn: no chunk of the new turn yet, and no room to make one: every tile straight into the target.
    room = false;
    ground.beginCover(map, 1, 1, 1);
    expect([0, 1, 2, 3].map((c) => ground.covers(c))).toEqual([true, true, true, true]);
    ground.draw(ctx, map, VIEW_ALL, 1, 0, 0, 1, 1);
    expect(ground.tilesDrawn).toBe(16 * 16);
    expect(ground.complete).toBe(false);
    // Room again but no time: one chunk built, then one flat placeholder for each of the other three.
    room = true;
    terrainClock.now = () => (now += FIRST_BUILD_BUDGET_MS);
    screen.reset();
    ground.draw(ctx, map, VIEW_ALL, 1, 0, 0, 1, 1);
    expect(ground.builds).toBe(1);
    expect(ground.tilesDrawn).toBe(0);
    expect(ground.placeholders).toBe(3 * 64);
    expect(screen.count('fill')).toBe(3);
    terrainClock.now = () => 0;
  });

  it('a chunk not drawn yet is covered when the bake has a ground set for every tile\'s terrain (groundBaked)', () => {
    terrainClock.now = () => 0;
    const map = createWorld({ seed: 3, parkName: 'G', mapSize: 16 }).state.map;
    map.water[tileIndex(map, 12, 12)] = 200; // chunk 3 has a water tile; this bake has no water set
    const asked: string[] = [];
    const look = { density: () => 2 as const, groundPiece: () => null, groundBaked: (t: string, rot: number) => (asked.push(`${t}:${rot}`), t !== 'water') };
    const ground = new RealGround(look, { makeCanvas: (w, h) => new FakeCanvas(w, h) as never });
    const screen = new FakeCanvas(800, 600);
    // A new park, nothing drawn, no piece decoded yet: today's terrain is left out where the bake will lay the ground.
    ground.beginCover(map, 1, 2, 1);
    expect([0, 1, 2, 3].map((c) => ground.covers(c))).toEqual([true, true, true, false]);
    expect(asked).toContain('grass:2');
    // Asked once per terrain and chunk, then remembered.
    const n = asked.length;
    ground.covers(0);
    expect(asked.length).toBe(n);
    // The draw keeps that promise: placeholders until the pieces decode, never nothing.
    ground.draw(screen.getContext() as CanvasRenderingContext2D, map, VIEW_ALL, 1, 0, 0, 2, 1);
    expect(ground.placeholders).toBe(3 * 64);
  });

  it('a terrain change uncovers only the chunk whose tiles changed', () => {
    terrainClock.now = () => 0;
    const map = createWorld({ seed: 3, parkName: 'G', mapSize: 16 }).state.map;
    const t = twinSetup({ density: 2, d4: false, d2: true });
    frame(t, map, 1);
    map.content[tileIndex(map, 2, 2)] = Content.Footpath;
    t.ground.beginCover(map, 1, 0, 2);
    expect([0, 1, 2, 3].map((c) => t.ground.covers(c))).toEqual([false, true, true, true]);
  });
});

describe('stand-ins give their memory back first (Task 3 fix round 2)', () => {
  it('reclaim frees old-scale stand-ins, even ones drawn this frame (none off screen to free first)', () => {
    terrainClock.now = () => 0;
    const map = createWorld({ seed: 3, parkName: 'G', mapSize: 16 }).state.map;
    let density: 2 | 4 = 2;
    const look = { density: () => density, groundPiece: () => (density === 2 ? piece() : null) };
    const ground = new RealGround(look, { makeCanvas: (w, h) => new FakeCanvas(w, h) as never });
    const ctx = new FakeCanvas(800, 600).getContext() as CanvasRenderingContext2D;
    ground.draw(ctx, map, VIEW_ALL, 2, 0, 0, 0, 1);
    ground.endFrame();
    const held = ground.heldBytes();
    // Into direct tiles with density 4 not decoded: the four chunks stand in, drawn this frame.
    density = 4;
    ground.draw(ctx, map, VIEW_ALL, 4, 0, 0, 0, 1);
    ground.endFrame();
    expect(ground.heldBytes()).toBe(held);
    expect(ground.reclaim(1)).toBeGreaterThan(0);
    expect(ground.heldBytes()).toBeLessThan(held);
    ground.reclaim(Number.POSITIVE_INFINITY);
    expect(ground.heldBytes()).toBe(0);
    // The next frame: placeholders where the stand-ins were, never nothing.
    ground.beginCover(map, 4, 0, 1);
    ground.draw(ctx, map, VIEW_ALL, 4, 0, 0, 0, 1);
    expect(ground.placeholders).toBe(16 * 16);
  });

  it('reclaim frees chunks off screen before stand-ins on screen: no flash on a zoom (final review I3)', () => {
    let now = 0;
    terrainClock.now = () => 0;
    const map = createWorld({ seed: 3, parkName: 'G', mapSize: 32 }).state.map;
    const made: FakeCanvas[] = [];
    const look = { density: () => 2 as const, groundPiece: () => piece() };
    const ground = new RealGround(look, { makeCanvas: (w, h) => { const c = new FakeCanvas(w, h); made.push(c); return c as never; } });
    const ctx = new FakeCanvas(800, 600).getContext() as CanvasRenderingContext2D;
    // Scale 1: all 16 chunks built in one frame, in back-to-front order.
    ground.draw(ctx, map, VIEW_ALL, 1, 0, 0, 0, 1);
    ground.endFrame();
    const scale1 = [...made];
    expect(scale1.length).toBe(16);
    const keys = [...Array(16).keys()].map((c) => { const r = chunkViewRect(map, c % 4, Math.floor(c / 4), 0); return r.v0 * 65536 + r.u0; });
    const order = [...Array(16).keys()].sort((x, y) => keys[x]! - keys[y]!);
    // From here one chunk build a frame (every clock read is a whole first-build budget on).
    terrainClock.now = () => (now += FIRST_BUILD_BUDGET_MS);
    // A zoom step to scale 2: the first chunk is built, the other 15 stand in.
    ground.draw(ctx, map, VIEW_ALL, 2, 0, 0, 0, 1);
    ground.endFrame();
    expect(made.length).toBe(17);
    const built = made[16]!;
    expect(scale1[0]!.width).toBe(0);
    // Pan down so the built chunk is off screen: one more is built, the rest in view stand in.
    const top = chunkBounds(map, order[0]! % 4, Math.floor(order[0]! / 4), 0);
    ground.draw(ctx, map, { ...VIEW_ALL, y0: top.bottom + 1 }, 2, 0, 0, 0, 1);
    ground.endFrame();
    expect(built.width).toBeGreaterThan(0);
    const standIns = scale1.filter((c) => c.width > 0).length;
    expect(standIns).toBeGreaterThan(0);
    // A little pressure: the off-screen chunk goes first; every stand-in on screen stays.
    const builtBytes = built.width * built.height * 4;
    expect(ground.reclaim(1)).toBe(builtBytes);
    expect(built.width).toBe(0);
    expect(scale1.filter((c) => c.width > 0).length).toBe(standIns);
    // More pressure: then the stand-ins.
    ground.reclaim(Number.POSITIVE_INFINITY);
    expect(scale1.filter((c) => c.width > 0).length).toBe(0);
    terrainClock.now = () => 0;
  });

  it('with the real set manager: pressure while stand-ins are held frees them before any demotion or cap', () => {
    terrainClock.now = () => 0;
    const map = createWorld({ seed: 3, parkName: 'G', mapSize: 16 }).state.map;
    const index = { format: 'real/1', pxPerMetreZoom1: 11.31, stepPxPerMetre: 9.8, densities: [2, 4], sets: [], bytes: { compressed: 0, decodedByDensity: { '2': 0, '4': 0 } } } as const;
    const io = { read: () => Promise.reject(new Error('none')), decode: () => Promise.reject(new Error('none')) };
    let density: 2 | 4 = 2;
    const look = { density: () => density, groundPiece: () => (density === 2 ? piece() : null) };
    let sets: SetManager;
    const ground = new RealGround(look, {
      makeCanvas: (w, h) => new FakeCanvas(w, h) as never,
      hold: (id, b, up) => sets.hold(id, b, up),
      admit: (id, b, up) => sets.admit(id, b, up),
    });
    const ctx = new FakeCanvas(800, 600).getContext() as CanvasRenderingContext2D;
    let n = 0;
    const frame = (scale: number, other = 0) => {
      sets.beginFrame(++n);
      ground.draw(ctx, map, VIEW_ALL, scale, 0, 0, 0, 1);
      sets.hold('other', other);
      ground.endFrame();
      sets.endFrame();
    };
    // Budget: the scale-2 chunks plus a little.
    sets = new SetManager(index as never, io, 1, () => undefined);
    const probe = new RealGround(look, { makeCanvas: (w, h) => new FakeCanvas(w, h) as never });
    probe.draw(ctx, map, VIEW_ALL, 2, 0, 0, 0, 1);
    const chunks = probe.heldBytes();
    sets = new SetManager(index as never, io, chunks + 1000, () => undefined);
    sets.addReclaimer((need) => ground.reclaim(need));
    frame(2);
    expect(ground.heldBytes()).toBe(chunks);
    // Zoom into direct tiles, density 4 not decoded: the chunks stand in. Then something else needs 2000 B.
    density = 4;
    frame(4);
    frame(4, 2000);
    expect(ground.heldBytes()).toBeLessThan(chunks);
    expect(sets.capEvents()).toEqual([]);
    expect(sets.densityCap()).toBe(4);
    expect(sets.snapshot().demoted).toEqual([]);
  });
});
