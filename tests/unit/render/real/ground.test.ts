import { beforeAll, describe, expect, it } from 'vitest';
import { FakeCanvas, install } from '../fakeCanvas';
import { groundTerrain, groundVariant, RealGround } from '../../../../src/render/real/ground';
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
