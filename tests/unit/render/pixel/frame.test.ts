/** Phase 8 stage 0 prototype (never merged): the Pixel frame: whole copies, snapped anchors, dots, attributes (§5.5, §7.7). */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeCanvas, install, make } from '../fakeCanvas';
import { createCanvasRenderer } from '../../../../src/render/renderer';
import { terrainClock } from '../../../../src/render/terrain';
import { defaultToolState, type Camera } from '../../../../src/render/types';
import { DECAL_MESS, SpriteBank } from '../../../../src/render/sprites/bank';
import type { Sprite } from '../../../../src/render/spriteCache';
import { walkerSlope } from '../../../../src/render/pixel/grid';
import { SLOT_RGBA } from '../../../../src/render/pixel/palette';
import { setArtStyle } from '../../../../src/render/pixel/style';
import { executeCommand } from '../../../../src/sim/commands';
import { createWorld } from '../../../../src/sim/world';
import { tileIndex } from '../../../../src/sim/map';
import type { World } from '../../../../src/sim/types';
import { addGuestDirect, placeFootpath, runTicks } from '../../../helpers/world';

beforeAll(() => install());
beforeEach(() => {
  terrainClock.now = () => 0;
});
afterEach(() => {
  setArtStyle('classic');
  vi.restoreAllMocks();
});

const W = 800;
const H = 600;

/** The park of `staticLayer.test.ts` with a carousel, an oak, litter, mess and a bench. */
function park(): World {
  const world = createWorld({ seed: 5, parkName: 'Frame Park', mapSize: 32 });
  const map = world.state.map;
  for (let x = 4; x <= 20; x++) placeFootpath(world, x, 16);
  for (let k = 0; k < 30; k++) addGuestDirect(world, tileIndex(map, 4 + (k % 16), 16));
  expect(executeCommand(world, { type: 'placeRide', defId: 'carousel', x: 8, y: 10, rotation: 2 }).ok).toBe(true);
  expect(executeCommand(world, { type: 'placeScenery', defId: 'oak_round', x: 12, y: 12, rotation: 2, edge: -1 }).ok).toBe(true);
  map.litter[tileIndex(map, 10, 16)] = 3;
  map.mess[tileIndex(map, 14, 16)] = 1;
  expect(executeCommand(world, { type: 'buildPathItem', x: 12, y: 16, itemType: 'bench' }).ok).toBe(true);
  runTicks(world, 200);
  return world;
}

function cam(zoom = 1): Camera {
  return { centerX: 0, centerY: 32 * 16 - 64, zoom, rotation: 0 };
}

function canvasWithStyle(): FakeCanvas & { style: Record<string, string> } {
  return Object.assign(make(W, H), { style: {} as Record<string, string> });
}

function smoothing(c: FakeCanvas): unknown {
  return (c.getContext() as { imageSmoothingEnabled?: unknown }).imageSmoothingEnabled;
}

const mod = (a: number, m: number): number => ((a % m) + m) % m;

/** Draws 3 Pixel frames at `zoom` and checks every sprite copy against the art grid of modulus `n`. */
function checkCopies(zoom: number, n: number): void {
  setArtStyle('pixel');
  const world = park();
  const pathSpy = vi.spyOn(SpriteBank.prototype, 'pathItem');
  const decalSpy = vi.spyOn(SpriteBank.prototype, 'decal');
  const c = canvasWithStyle();
  const r = createCanvasRenderer(c as unknown as HTMLCanvasElement);
  r.resize(W, H, 1);
  const tool = defaultToolState();
  const k = cam(zoom);
  for (let f = 0; f < 3; f++) r.draw(world, k, tool, 0);
  const offX = Math.round(W / 2 - k.centerX * zoom);
  const offY = Math.round(H / 2 - k.centerY * zoom);
  const checked = c.draws.filter((d) => d.w < c.width);
  expect(checked.length).toBeGreaterThan(0);
  for (const d of checked) {
    expect([d.x, d.y, d.w, d.h].every(Number.isInteger), `whole copy ${JSON.stringify([d.x, d.y, d.w, d.h])}`).toBe(true);
    expect(mod(d.w, n)).toBe(0);
    expect(mod(d.h, n)).toBe(0);
    expect(mod(d.x - offX, n), `x ${d.x} on the grid`).toBe(0);
    expect(mod(d.y - offY, n), `y ${d.y} on the grid`).toBe(0);
  }
  const images = new Set(checked.map((d) => d.image));
  const hit = (results: Array<{ value: unknown }>): boolean => results.some((res) => images.has((res.value as Sprite).image as unknown as FakeCanvas));
  expect(hit(pathSpy.mock.results), 'the bench copy is checked').toBe(true);
  const mess = decalSpy.mock.results.filter((_, i) => (decalSpy.mock.calls[i]![1] as number) >= DECAL_MESS);
  const litter = decalSpy.mock.results.filter((_, i) => (decalSpy.mock.calls[i]![1] as number) < DECAL_MESS);
  expect(hit(mess), 'the mess copy is checked').toBe(true);
  expect(hit(litter), 'the litter copy is checked').toBe(true);
  expect(c.dataset.art).toBe('pixel');
  expect(c.dataset.artScale).toBe(String(n));
  expect(c.dataset.complete).toBe('1');
  expect(smoothing(c)).toBe(false);
}

describe('Pixel frame (§5.5 stage 1b, §7.7)', () => {
  it('every sprite copy in Pixel is whole and on the art grid of the frame', () => {
    checkCopies(1, 2);
  });

  it('at n = 3 (zoom 1.5) the same holds with modulus 3', () => {
    checkCopies(1.5, 3);
  });

  it('the walker slope comes from motion, not from the frame', () => {
    expect(walkerSlope(true, true, 1)).toBe(0); // sits
    expect(walkerSlope(false, false, 1)).toBe(0); // stands
    expect(walkerSlope(false, true, 1)).toBe(0.5); // moves along u
    expect(walkerSlope(false, true, 3)).toBe(0.5);
    expect(walkerSlope(false, true, 0)).toBe(-0.5); // moves along v
    expect(walkerSlope(false, true, 2)).toBe(-0.5);
  });

  it('guest dots in Pixel are one art pixel on the grid', () => {
    setArtStyle('pixel');
    const world = park();
    const c = canvasWithStyle();
    const r = createCanvasRenderer(c as unknown as HTMLCanvasElement);
    r.resize(W, H, 2);
    const k = cam(0.5);
    for (let f = 0; f < 3; f++) r.draw(world, k, defaultToolState(), 0);
    expect(c.dataset.artScale).toBe('2');
    const offX = Math.round((W * 2) / 2 - k.centerX * 1);
    const offY = Math.round((H * 2) / 2 - k.centerY * 1);
    const slotCss = new Set(Array.from(SLOT_RGBA.slice(1), (v) => '#' + [v & 255, (v >>> 8) & 255, (v >>> 16) & 255].map((b) => b.toString(16).padStart(2, '0')).join('')));
    expect(c.rects.length).toBeGreaterThan(0);
    for (const d of c.rects) {
      expect(d.w).toBe(2);
      expect(d.h).toBe(2);
      expect(mod(d.x - offX, 2)).toBe(0);
      expect(mod(d.y - offY, 2)).toBe(0);
      expect(slotCss.has(d.fill), `dot fill ${d.fill} is a slot colour`).toBe(true);
    }
  });

  it('Classic frames do not change', () => {
    const world = park();
    const c = canvasWithStyle();
    const r = createCanvasRenderer(c as unknown as HTMLCanvasElement);
    r.resize(W, H, 1);
    for (let f = 0; f < 3; f++) r.draw(world, cam(1), defaultToolState(), 0);
    expect(c.dataset.art).toBe('classic');
    expect(c.dataset.artScale).toBeUndefined();
    expect(smoothing(c)).toBe(true);
    expect(c.dataset.complete).toBe('1');
  });
});
