/** Phase 8 stage 0 prototype (never merged): the renderer's Pixel frame order and walker list (spec §8.4 item 4). */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { install, make } from '../fakeCanvas';
import type { LayerFrame } from '../../../../src/render/layers';
import { createCanvasRenderer } from '../../../../src/render/renderer';
import { terrainClock } from '../../../../src/render/terrain';
import { defaultToolState, type Camera } from '../../../../src/render/types';
import { setArtStyle } from '../../../../src/render/pixel/style';
import { executeCommand } from '../../../../src/sim/commands';
import { createWorld } from '../../../../src/sim/world';
import { tileIndex } from '../../../../src/sim/map';
import type { World } from '../../../../src/sim/types';
import { addGuestDirect, placeFootpath, runTicks } from '../../../helpers/world';

const seen = vi.hoisted(() => [] as Array<{ count: number; pairs: number[]; frame: LayerFrame }>);

vi.mock('../../../../src/render/worldLayers', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../../src/render/worldLayers')>();
  return {
    ...mod,
    createWorldLayers: () =>
      mod.createWorldLayers().map((l) =>
        l.name !== 'pixelShadow'
          ? l
          : {
              ...l,
              drawGround: (ctx: CanvasRenderingContext2D, world: World, tool: Parameters<NonNullable<typeof l.drawGround>>[2], f: LayerFrame) => {
                const n = f.art?.walkerCount ?? 0;
                seen.push({ count: n, pairs: Array.from(f.art?.walkers?.subarray(0, 2 * n) ?? []), frame: f });
                l.drawGround!(ctx, world, tool, f);
              },
            },
      ),
  };
});

beforeAll(() => install());
beforeEach(() => {
  terrainClock.now = () => 0;
  seen.length = 0;
});
afterEach(() => setArtStyle('classic'));

const W = 800;
const H = 600;

/** The park of `frame.test.ts` (Task 8). */
function park(): World {
  const world = createWorld({ seed: 5, parkName: 'Frame Park', mapSize: 32 });
  const map = world.state.map;
  for (let x = 4; x <= 20; x++) placeFootpath(world, x, 16);
  for (let k = 0; k < 30; k++) addGuestDirect(world, tileIndex(map, 4 + (k % 16), 16));
  expect(executeCommand(world, { type: 'placeRide', defId: 'carousel', x: 8, y: 10, rotation: 2 }).ok).toBe(true);
  expect(executeCommand(world, { type: 'placeScenery', defId: 'oak_round', x: 12, y: 12, rotation: 2, edge: -1 }).ok).toBe(true);
  expect(executeCommand(world, { type: 'buildPathItem', x: 12, y: 16, itemType: 'bench' }).ok).toBe(true);
  runTicks(world, 200);
  return world;
}

function cam(zoom = 1): Camera {
  return { centerX: 0, centerY: 32 * 16 - 64, zoom, rotation: 0 };
}

describe('Pixel frame order (§8.4 item 4)', () => {
  it('the walker list of a frame is filled before the shadow layer draws', () => {
    setArtStyle('pixel');
    const world = park();
    const c = Object.assign(make(W, H), { style: {} as Record<string, string> });
    const r = createCanvasRenderer(c as unknown as HTMLCanvasElement);
    r.resize(W, H, 1);
    const tool = defaultToolState();
    const k = cam(1);
    r.draw(world, k, tool, 0);
    runTicks(world, 20);
    r.draw(world, k, tool, 0);
    const f2 = seen[1]!.frame;
    const countAfter2 = f2.art!.walkerCount!;
    const pairsAfter2 = Array.from(f2.art!.walkers!.subarray(0, 2 * countAfter2));
    r.draw(world, k, tool, 0);
    expect(seen.length).toBe(3);
    const [s1, s2, s3] = seen as [(typeof seen)[0], (typeof seen)[0], (typeof seen)[0]];
    expect(s2.count).toBeGreaterThan(0);
    expect(s2.count).toBe(countAfter2); // the count at drawGround is the count of the finished frame 2
    expect(s2.pairs).toEqual(pairsAfter2); // the same anchors, not those of frame 1
    expect(s2.pairs).not.toEqual(s1.pairs); // frame 1 and frame 2 differ, so the check above can see a late block
    expect(s3.count).toBe(s2.count); // the count is set to 0 before the block of each frame (frame 3 = frame 2)
    expect(s2.count).toBeLessThanOrEqual(world.state.guests.length);
    // snapped anchors (snapWalker gives even world pixels); `Math.abs`: `v % 2` of a negative even `v` is −0
    for (const v of s2.pairs) expect(Math.abs(v % 2)).toBe(0);
  });
});
