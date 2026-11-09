import { beforeAll, describe, expect, it } from 'vitest';
import { FakeCanvas, install, make } from './fakeCanvas';
import { createCanvasRenderer, GUEST_LOD_ZOOM } from '../../../src/render/renderer';
import { defaultToolState, type Camera } from '../../../src/render/types';
import { mapToViewContinuous, type ViewRotation } from '../../../src/render/view';
import { createWorld } from '../../../src/sim/world';
import { Owned, PathItem, tileIndex } from '../../../src/sim/map';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, placeFootpath, placeQueue, placeRideDirect, placeStallDirect, runTicks, stateHash } from '../../helpers/world';
import { canvasPixelRatio, isPhoneScreen, PHONE_MAX_PIXEL_RATIO } from '../../../src/render/canvas';
import { chunkCacheBudgetPixels } from '../../../src/render/terrain';
import { SpriteBank } from '../../../src/render/sprites/bank';

beforeAll(() => install());

const ROTS: readonly ViewRotation[] = [0, 1, 2, 3];
const W = 1600;
const H = 1000;

/** A 24 × 24 park with the Build 1 object kinds: fence, entrance, a flat ride with a queue, a stall, paths, guests, path items, litter. */
function scene(): World {
  const world = createWorld({ seed: 99, parkName: 'Turn Park', mapSize: 24 });
  const s = world.state;
  const map = s.map;
  for (let x = 6; x <= 16; x++) placeFootpath(world, x, 14);
  for (let y = 15; y <= 21; y++) placeFootpath(world, 11, y);
  const ride = placeRideDirect(world, 'carousel', 6, 8, 1);
  expect(ride.entrance).toBeDefined();
  const q = ride.entrance!.outside;
  if (map.content[q] !== 2) placeQueue(world, q % map.width, Math.floor(q / map.width));
  placeStallDirect(world, 'snack_shack', 14, 12, 2);
  map.pathItem[tileIndex(map, 9, 14)] = PathItem.Bench;
  map.pathItem[tileIndex(map, 13, 14)] = PathItem.Bin;
  map.litter[tileIndex(map, 10, 14)] = 3;
  map.mess[tileIndex(map, 12, 14)] = 1;
  for (let k = 0; k < 40; k++) addGuestDirect(world, tileIndex(map, 6 + (k % 11), 14), { items: { map: false, umbrella: false, balloon: k % 5 === 0, photo: false } });
  // Some land for sale (ownership tints).
  for (let x = 0; x < 24; x++) map.owned[tileIndex(map, x, 0)] = Owned.LandForSale;
  return world;
}

function cameraAtMapCentre(world: World, r: ViewRotation, zoom: number): Camera {
  const map = world.state.map;
  const p = mapToViewContinuous(map.width / 2, map.height / 2, r, map.width, map.height);
  return { centerX: (p.u - p.v) * 32, centerY: (p.u + p.v) * 16 - 64, zoom, rotation: r };
}

describe('renderer under view rotation (Phase 4 §4.8)', () => {
  it('draws every Build 1 object in all 4 rotations with finite coordinates and the same draw counts', () => {
    const world = scene();
    const canvas = make(W, H);
    const renderer = createCanvasRenderer(canvas as unknown as HTMLCanvasElement);
    renderer.resize(W, H, 1);
    const tool = defaultToolState();
    const counts: number[] = [];
    for (const r of ROTS) {
      // Two frames: the first builds the chunk images of this rotation.
      renderer.draw(world, cameraAtMapCentre(world, r, 0.6), tool, 0);
      canvas.reset();
      renderer.draw(world, cameraAtMapCentre(world, r, 0.6), tool, 0.5);
      expect(canvas.nonFinite).toBe(0);
      expect(canvas.dataset.rotation).toBe(String(r));
      counts.push(canvas.count('drawImage'));
    }
    // The whole map is in view in every rotation, so every object (and every ride column slice) draws once.
    expect(counts[0]).toBeGreaterThan(60);
    expect(new Set(counts).size).toBe(1);
  });

  it('turning the view draws objects at their view positions (the stall moves to its turned tile)', () => {
    const world = scene();
    const canvas = make(W, H);
    const renderer = createCanvasRenderer(canvas as unknown as HTMLCanvasElement);
    renderer.resize(W, H, 1);
    const tool = defaultToolState();
    // Only the stall: compare where the stall sprite lands against the view table.
    const s = world.state;
    s.guests.length = 0;
    const stall = s.stalls[0]!;
    for (const r of ROTS) {
      const cam: Camera = { centerX: 0, centerY: 300, zoom: 1, rotation: r };
      renderer.draw(world, cam, tool, 0);
      canvas.reset();
      renderer.draw(world, cam, tool, 0);
      // The stall sprite is anchored at the top corner of its view tile.
      const map = s.map;
      const p = mapToViewContinuous(stall.x, stall.y, r, map.width, map.height);
      // Top corner of the view tile: the view position of the map corner nearest the viewer's back.
      const corners = [
        mapToViewContinuous(stall.x, stall.y, r, map.width, map.height),
        mapToViewContinuous(stall.x + 1, stall.y, r, map.width, map.height),
        mapToViewContinuous(stall.x, stall.y + 1, r, map.width, map.height),
        mapToViewContinuous(stall.x + 1, stall.y + 1, r, map.width, map.height),
      ];
      const u = Math.min(...corners.map((c) => c.u));
      const v = Math.min(...corners.map((c) => c.v));
      expect(p).toBeDefined();
      const ax = (u - v) * 32 * cam.zoom + W / 2 - cam.centerX * cam.zoom;
      const ay = ((u + v) * 16 - 8 * 8) * cam.zoom + H / 2 - cam.centerY * cam.zoom;
      // Stall art spans [-32, 32] around the anchor horizontally: a draw centred on ax at about that size.
      const hit = canvas.draws.some((d) => d.w > 50 && d.w < 90 && Math.abs(d.x + d.w / 2 - ax) <= 3 && d.y < ay && d.y + d.h > ay);
      expect(hit).toBe(true);
    }
  });

  it('far zoom (≤ 0.5) draws guests as 2 × 3 px rectangles grouped by colour', () => {
    const world = scene();
    const canvas = make(W, H);
    const renderer = createCanvasRenderer(canvas as unknown as HTMLCanvasElement);
    renderer.resize(W, H, 1);
    const tool = defaultToolState();
    renderer.draw(world, cameraAtMapCentre(world, 0, GUEST_LOD_ZOOM), tool, 0);
    canvas.reset();
    renderer.draw(world, cameraAtMapCentre(world, 0, GUEST_LOD_ZOOM), tool, 0);
    const guests = world.state.guests.length;
    const dots = canvas.rects.filter((r) => r.w === 2 && r.h === 3);
    expect(dots.length).toBe(guests);
    // One fill per colour group, not per guest.
    const colours = new Set(dots.map((d) => d.fill));
    expect(colours.size).toBeGreaterThan(1);
    expect(colours.size).toBeLessThan(guests);
    // Closer than the LOD zoom: sprites again, no dots.
    canvas.reset();
    renderer.draw(world, cameraAtMapCentre(world, 0, 0.6), tool, 0);
    expect(canvas.rects.filter((r) => r.w === 2 && r.h === 3).length).toBe(0);
  });

  it('the Buy Land tool tints land for sale', () => {
    const world = scene();
    const canvas = make(W, H);
    const renderer = createCanvasRenderer(canvas as unknown as HTMLCanvasElement);
    renderer.resize(W, H, 1);
    const tool = defaultToolState();
    renderer.draw(world, cameraAtMapCentre(world, 0, 0.6), tool, 0);
    canvas.reset();
    renderer.draw(world, cameraAtMapCentre(world, 0, 0.6), tool, 0);
    const before = canvas.count('fill');
    tool.tool = 'buyLand';
    canvas.reset();
    renderer.draw(world, cameraAtMapCentre(world, 0, 0.6), tool, 0);
    expect(canvas.count('fill')).toBeGreaterThan(before);
  });

  it('rendering in turned views between ticks never changes the state (Phase 4 §9.3)', () => {
    const a = scene();
    const b = scene();
    const canvas = make(800, 600);
    const renderer = createCanvasRenderer(canvas as unknown as HTMLCanvasElement);
    renderer.resize(800, 600, 1);
    const tool = defaultToolState();
    for (let k = 0; k < 12; k++) {
      runTicks(a, 30);
      runTicks(b, 30);
      renderer.draw(b, cameraAtMapCentre(b, (k % 4) as ViewRotation, k % 2 ? 0.4 : 1), tool, 0.3);
    }
    expect(stateHash(b)).toBe(stateHash(a));
  });
});

describe('canvas pixel ratio (phone frame-rate finding)', () => {
  it('caps the ratio on phone-sized screens only', () => {
    expect(isPhoneScreen(412, 915)).toBe(true);
    expect(isPhoneScreen(915, 412)).toBe(true);
    expect(isPhoneScreen(1280, 800)).toBe(false);
    expect(canvasPixelRatio(412, 915, 2.625)).toBe(PHONE_MAX_PIXEL_RATIO);
    expect(canvasPixelRatio(412, 915, 1.5)).toBe(1.5);
    expect(canvasPixelRatio(1280, 800, 3)).toBe(3);
    expect(canvasPixelRatio(1280, 800, 0)).toBe(1);
  });

  it('phone-sized screens get the 32 MB chunk cache, others 64 MB (Phase 4 §4.10, §11); sprites 96 MB', () => {
    expect(chunkCacheBudgetPixels(412, 915) * 4).toBe(32 * 1024 * 1024);
    expect(chunkCacheBudgetPixels(1280, 800) * 4).toBe(64 * 1024 * 1024);
    expect(new SpriteBank().cache.budgetPixels * 4).toBe(96 * 1024 * 1024);
  });

  it('the renderer sizes its canvas with the capped ratio', () => {
    const canvas = make(10, 10);
    const renderer = createCanvasRenderer(canvas as unknown as HTMLCanvasElement);
    renderer.resize(412, 915, 2.625);
    expect(canvas.width).toBe(Math.round(412 * PHONE_MAX_PIXEL_RATIO));
    expect(canvas.height).toBe(Math.round(915 * PHONE_MAX_PIXEL_RATIO));
    renderer.resize(1280, 800, 2);
    expect(canvas.width).toBe(2560);
    expect(FakeCanvas.created).toBeGreaterThan(0);
  });
});
