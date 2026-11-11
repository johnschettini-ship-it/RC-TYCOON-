/** Phase 8 stage 0 prototype (never merged): the ground shadow layer alone (spec §8.4). */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FakeCanvas, install } from '../fakeCanvas';
import {
  casterMask,
  casterOf,
  createPixelShadowLayer,
  GUEST_SHADOW,
  SHADOW_MULTIPLY,
} from '../../../../src/render/pixel/shadows';
import type { ArtFrame } from '../../../../src/render/pixel/grid';
import type { LayerFrame } from '../../../../src/render/layers';
import { setArtStyle } from '../../../../src/render/pixel/style';
import { defaultToolState } from '../../../../src/render/types';
import { executeCommand } from '../../../../src/sim/commands';
import { createWorld } from '../../../../src/sim/world';
import type { World } from '../../../../src/sim/types';
import { placeStallDirect } from '../../../helpers/world';

beforeAll(() => install());
afterEach(() => setArtStyle('classic'));

const W = 800;
const H = 600;

/** A frame context stub: records `globalCompositeOperation` and the image at each `drawImage`. */
function frameStub(): { ctx: CanvasRenderingContext2D; draws: Array<{ op: unknown; image: FakeCanvas; args: number[] }> } {
  const draws: Array<{ op: unknown; image: FakeCanvas; args: number[] }> = [];
  const stub = {
    globalCompositeOperation: 'source-over' as string,
    imageSmoothingEnabled: false,
    drawImage(image: FakeCanvas, ...args: number[]) {
      draws.push({ op: stub.globalCompositeOperation, image, args });
    },
  };
  return { ctx: stub as unknown as CanvasRenderingContext2D, draws };
}

function frameOf(art: ArtFrame | null): LayerFrame {
  return {
    scale: art?.scale ?? 1,
    offX: art?.offX ?? 0,
    offY: art?.offY ?? 0,
    dpr: 1,
    bucket: 0.5,
    view: { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 },
    rotation: 0,
    alpha: 0,
    width: W,
    height: H,
    art,
  };
}

function emptyWorld(): World {
  return createWorld({ seed: 5, parkName: 'Shadow Park', mapSize: 32 });
}

/** A world with a carousel, a stall and an oak. */
function fullWorld(): World {
  const world = emptyWorld();
  expect(executeCommand(world, { type: 'placeRide', defId: 'carousel', x: 8, y: 10, rotation: 2 }).ok).toBe(true);
  placeStallDirect(world, 'snack_shack', 14, 9);
  expect(executeCommand(world, { type: 'placeScenery', defId: 'oak_round', x: 12, y: 12, rotation: 2, edge: -1 }).ok).toBe(true);
  return world;
}

function art(n: number, offX: number, offY: number, walkers: number[]): ArtFrame {
  return { n, scale: n / 2, offX, offY, walkers: Float64Array.from(walkers), walkerCount: walkers.length / 2 };
}

/** Draws one shadow frame; returns the frame stub draws and the shadow canvas (the image of the multiply copy). */
function run(world: World, a: ArtFrame | null): { draws: Array<{ op: unknown; image: FakeCanvas; args: number[] }>; shadow: FakeCanvas | null } {
  const layer = createPixelShadowLayer();
  const { ctx, draws } = frameStub();
  layer.drawGround!(ctx, world, defaultToolState(), frameOf(a));
  return { draws, shadow: draws[0]?.image ?? null };
}

const mod = (a: number, m: number): number => ((a % m) + m) % m;

describe('ground shadows (§8.4)', () => {
  it('casters (§8.4 item 1)', () => {
    expect(casterOf('ride', 'carousel', 0)?.heightPx).toBe(100);
    expect(casterOf('stall', 'snack_shack', 0)?.heightPx).toBe(66);
    expect(casterOf('scenery', 'oak_round', 0)).toEqual({ shape: 'ellipse', w: 27, d: 9, heightPx: 0, shift: 10 });
    expect(casterOf('scenery', 'pine_tall', 0)).toEqual({ shape: 'ellipse', w: 25, d: 9, heightPx: 0, shift: 10 });
    expect(casterOf('scenery', 'birch_silver', 0)).toEqual({ shape: 'ellipse', w: 19, d: 7, heightPx: 0, shift: 6 });
    expect(casterOf('scenery', 'shrub_round', 0)).toEqual({ shape: 'ellipse', w: 19, d: 7, heightPx: 0, shift: 6 });
    expect(casterOf('scenery', 'bed_mixed', 0)).toBeNull();
    expect(casterOf('scenery', 'fountain_garden', 0)).toEqual({ shape: 'box', w: 1, d: 1, heightPx: 16, shift: 0 });
    expect(casterOf('guest', 'guest', 0)).toEqual(GUEST_SHADOW);
    expect(SHADOW_MULTIPLY).toBe('#c9c0cb');
  });

  it('the guest mask covers the columns cx - 3 to cx + 4', () => {
    const m = casterMask(GUEST_SHADOW, 0);
    const cols = new Set<number>();
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.bits[y * m.w + x]) cols.add(x - m.cx);
    expect(Math.min(...cols)).toBe(-3);
    expect(Math.max(...cols)).toBe(4);
  });

  it('a box shadow grows to the screen right with the height', () => {
    // (40 / SHADOW_TZ × SHADOW_LEN × 64 = 48 world pixels = 24 art pixels, §8.4 item 2)
    const low = casterMask({ shape: 'box', w: 1, d: 1, heightPx: 0, shift: 0 }, 0);
    const high = casterMask({ shape: 'box', w: 1, d: 1, heightPx: 40, shift: 0 }, 0);
    const right = (m: typeof low): number => {
      let r = -Infinity;
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.bits[y * m.w + x]) r = Math.max(r, x - m.cx);
      return r;
    };
    expect(right(high) - right(low)).toBe(24);
  });

  it('masks go into the shadow canvas on the art grid (n = 2 and n = 3)', () => {
    const world = fullWorld();
    for (const n of [2, 3]) {
      const { shadow } = run(world, art(n, 101, 57, [40, 20, 80, 60]));
      expect(shadow).not.toBeNull();
      const draws = shadow!.draws;
      expect(draws.length).toBe(5);
      for (const d of draws) {
        expect([d.x, d.y, d.w, d.h].every(Number.isInteger), JSON.stringify(d)).toBe(true);
        expect(mod(d.w, n)).toBe(0);
        expect(mod(d.h, n)).toBe(0);
        expect(mod(d.x - 101, n)).toBe(0);
        expect(mod(d.y - 57, n)).toBe(0);
      }
    }
  });

  it('one multiply copy per frame; nothing with f.art null', () => {
    const world = fullWorld();
    const a = run(world, art(2, 0, 0, [40, 20, 80, 60]));
    expect(a.draws.length).toBe(1);
    expect(a.draws[0]!.op).toBe('multiply');
    const b = run(world, null);
    expect(b.draws.length).toBe(0);
    const c = run(world, art(0, 0, 0, [40, 20, 80, 60]));
    expect(c.draws.length).toBe(0);
  });

  it('walker masks only at the anchors of frame.art.walkers', () => {
    const { shadow } = run(emptyWorld(), art(2, 0, 0, [40, 20, 80, 60]));
    const m = casterMask(GUEST_SHADOW, 0);
    expect(shadow!.draws.map((d) => [d.x, d.y])).toEqual([
      [(40 / 2 - m.cx) * 2, (20 / 2 - m.cy) * 2],
      [(80 / 2 - m.cx) * 2, (60 / 2 - m.cy) * 2],
    ]);
  });

  it('two overlapping shadows do not darken twice', () => {
    const { draws, shadow } = run(emptyWorld(), art(2, 0, 0, [40, 20, 42, 20]));
    expect(shadow!.draws.length).toBe(2);
    const sctx = shadow!.getContext() as { globalCompositeOperation: unknown; imageSmoothingEnabled: unknown };
    const op = sctx.globalCompositeOperation;
    expect(typeof op !== 'string' || op === 'source-over').toBe(true);
    expect(shadow!.count('fill')).toBe(0);
    expect(shadow!.count('fillRect')).toBe(0);
    expect(shadow!.count('clearRect')).toBe(1);
    for (const d of shadow!.draws) {
      const mctx = d.image.getContext() as { fillStyle: unknown };
      expect(mctx.fillStyle).toBe(SHADOW_MULTIPLY);
      expect(d.image.count('fillRect')).toBeGreaterThan(0);
      expect(d.image.count('fill')).toBe(0);
      expect(d.image.count('drawImage')).toBe(0);
    }
    expect(draws.length).toBe(1);
    expect(draws[0]!.op).toBe('multiply');
    expect(sctx.imageSmoothingEnabled).toBe(false);
  });

  it('a ride shadow lies under its footprint (anchor rule)', () => {
    const world = emptyWorld();
    expect(executeCommand(world, { type: 'placeRide', defId: 'carousel', x: 8, y: 10, rotation: 2 }).ok).toBe(true);
    const map = world.state.map;
    const { shadow } = run(world, { n: 2, scale: 1, offX: 0, offY: 0, walkers: new Float64Array(0), walkerCount: 0 });
    expect(shadow!.draws.length).toBe(1);
    const d = shadow!.draws[0]!;
    const m = casterMask(casterOf('ride', 'carousel', 2)!, 0);
    const z = map.heights[10 * map.width + 8] as number;
    const bit = (X: number, Y: number): number => {
      const x = X - d.x / 2;
      const y = Y - d.y / 2;
      if (x < 0 || y < 0 || x >= m.w || y >= m.h) return 0;
      return m.bits[y * m.w + x] as number;
    };
    // footprint (u0 8, v0 10, 3 × 3): front corner at art (−32, 192 − 4z), left corner at art (−80, 168 − 4z)
    expect(bit(-32, 190 - 4 * z)).toBe(1); // 2 art pixels inside the front corner
    expect(bit(-76, 168 - 4 * z)).toBe(1); // 4 art pixels inside the left corner
    expect(bit(-32, 194 - 4 * z)).toBe(0); // 2 art pixels outside the front corner
  });

  it('a round tree shadow centres on the tile centre, moved by its shift (ellipse anchor rule)', () => {
    const world = emptyWorld();
    expect(executeCommand(world, { type: 'placeScenery', defId: 'oak_round', x: 12, y: 12, rotation: 2, edge: -1 }).ok).toBe(true);
    const item = world.state.scenery[0]!;
    const { shadow } = run(world, { n: 2, scale: 1, offX: 0, offY: 0, walkers: new Float64Array(0), walkerCount: 0 });
    expect(shadow!.draws.length).toBe(1);
    const d = shadow!.draws[0]!;
    const m = casterMask(casterOf('scenery', 'oak_round', 2)!, 0);
    const rows: number[] = [];
    const cols: number[] = [];
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (!m.bits[y * m.w + x]) continue;
        rows.push(y);
        cols.push(x);
      }
    }
    const ax = 0;
    const ay = 24 * 16 - item.z * 8;
    expect(d.y / 2 + (Math.min(...rows) + Math.max(...rows)) / 2).toBe(ay / 2 + 8); // the middle row: the tile centre
    expect(d.x / 2 + (Math.min(...cols) + Math.max(...cols)) / 2).toBe(ax / 2 + 10); // the middle column: ax / 2 + shift
    expect(Math.max(...rows) - Math.min(...rows) + 1).toBe(9); // d of oak_round
  });
});
