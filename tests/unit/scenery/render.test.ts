/**
 * Scenery rendering (Phase 4 §4.5, §4.8): stable sprite cache keys, view placement under all 4 rotations, and the
 * layer's depth-sorted draw list (1 × 1 at the tile centre, multi-tile items in columns, arches split around the
 * path, edge items at their edge midpoint, off-screen items culled).
 */
import { describe, expect, it } from 'vitest';
import { getSceneryDef, SCENERY } from '../../../src/data/catalog';
import { Layer, packDepth } from '../../../src/render/depth';
import { LAYER_KIND, type LayerFrame } from '../../../src/render/layers';
import { createSceneryLayer } from '../../../src/render/scenery/layer';
import { itemView, newItemView } from '../../../src/render/scenery/place';
import { sceneryGhostOf, setSceneryGhost } from '../../../src/render/scenery/ghost';
import { artOpts, sceneryFrame, scenerySpriteKey, SCENERY_FRAME, viewExtent } from '../../../src/render/scenery/sprites';
import { defaultToolState } from '../../../src/render/types';
import { mapToView, mapToViewContinuous } from '../../../src/render/view';
import { Content, tileIndex, type Dir } from '../../../src/sim/map';
import type { Scenery } from '../../../src/sim/scenery/types';
import { placeOk, sceneryWorld } from './helpers';

const R: Dir[] = [0, 1, 2, 3];

describe('sprite cache keys', () => {
  it('are stable numbers (golden values) built from defId, sprite rotation, frame, and zoom bucket', () => {
    expect(scenerySpriteKey('oak_round', 0, 0, 1)).toBe(37380883283969);
    expect(scenerySpriteKey('tent_red', 3, 1, 2)).toBe(33322299604998);
    expect(scenerySpriteKey('ticket_arch', 1, 4, 0.5)).toBe(53532241051664);
    expect(scenerySpriteKey('hedge_low', 2, 0, 1)).toBe(157416251949057);
  });

  it('differ for every item, rotation, variant, and bucket', () => {
    const keys = new Set<number>();
    let n = 0;
    for (const d of SCENERY) {
      for (const r of R) {
        for (const frame of [0, SCENERY_FRAME.wilted, SCENERY_FRAME.archBack, SCENERY_FRAME.archFront, SCENERY_FRAME.ghostValid, SCENERY_FRAME.ghostInvalid]) {
          for (const b of [0.5, 1, 2] as const) {
            keys.add(scenerySpriteKey(d.id, r, frame, b));
            n++;
          }
        }
      }
    }
    expect(keys.size).toBe(n);
  });

  it('frame bits round-trip into art options', () => {
    const tent = getSceneryDef('rope_bridge_decor')!;
    expect(artOpts(tent, 1, sceneryFrame(false, 0, null))).toEqual({ facing: 1, ex: 1, ey: 2, wilted: false, part: 0, edge: -1 });
    const bed = getSceneryDef('bed_mixed')!;
    expect(artOpts(bed, 2, sceneryFrame(true, 0, 'valid'))).toMatchObject({ wilted: true, part: 0 });
    const arch = getSceneryDef('neon_arch')!;
    expect(artOpts(arch, 3, sceneryFrame(false, 2, null)).part).toBe(2);
    expect(artOpts(getSceneryDef('wall_hull')!, 3, 0)).toMatchObject({ edge: 3, ex: 1, ey: 1 });
    expect(viewExtent(getSceneryDef('tent_red')!, 1)).toEqual({ ex: 2, ey: 2 });
  });
});

describe('view placement (Phase 4 §4.8)', () => {
  const W = 64;
  const H = 48;
  const item = (patch: Partial<Scenery>): Scenery => ({ id: 1, defId: 'oak_round', x: 10, y: 5, z: 8, rotation: 0, edge: -1, waterLevel: 255, ...patch });

  it('a 1 × 1 item sits on mapToView of its tile and sorts at u + v + 1; sprites turn by (rotation + r) mod 4', () => {
    const oak = getSceneryDef('oak_round')!;
    for (const r of R) {
      for (const rot of R) {
        const v = itemView(newItemView(), item({ rotation: rot }), oak, r, W, H);
        const p = mapToView(10, 5, r, W, H);
        expect([v.u0, v.v0, v.depth, v.f]).toEqual([p.u, p.v, p.u + p.v + 1, (rot + r) % 4]);
      }
    }
  });

  it('a multi-tile item\'s view origin is the minimum view tile of its footprint, with sides swapped at odd r', () => {
    const bridge = getSceneryDef('rope_bridge_decor')!;
    for (const r of R) {
      for (const rot of R) {
        const v = itemView(newItemView(), item({ defId: 'rope_bridge_decor', rotation: rot }), bridge, r, W, H);
        const mx = rot % 2 ? 1 : 2;
        const my = rot % 2 ? 2 : 1;
        const tiles: Array<{ u: number; v: number }> = [];
        for (let dy = 0; dy < my; dy++) for (let dx = 0; dx < mx; dx++) tiles.push(mapToView(10 + dx, 5 + dy, r, W, H));
        expect(v.u0).toBe(Math.min(...tiles.map((t) => t.u)));
        expect(v.v0).toBe(Math.min(...tiles.map((t) => t.v)));
        expect(v.ex * v.ey).toBe(2);
        expect(viewExtent(bridge, v.f)).toEqual({ ex: v.ex, ey: v.ey });
      }
    }
  });

  it('an edge item turns its edge with the view and sorts at the edge midpoint', () => {
    const hedge = getSceneryDef('hedge_low')!;
    for (const r of R) {
      for (const e of R) {
        const v = itemView(newItemView(), item({ defId: 'hedge_low', edge: e }), hedge, r, W, H);
        expect(v.f).toBe((e + r) % 4);
        const mid = [
          [10.5, 5],
          [11, 5.5],
          [10.5, 6],
          [10, 5.5],
        ][e]!;
        const p = mapToViewContinuous(mid[0]!, mid[1]!, r, W, H);
        expect(v.depth).toBeCloseTo(p.u + p.v, 9);
      }
    }
  });
});

function frame(rotation: Dir, view = { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 }): LayerFrame {
  return { scale: 1, offX: 0, offY: 0, dpr: 1, bucket: 1, view, rotation, alpha: 0, width: 800, height: 600 };
}

interface Push {
  kind: number;
  ref: number;
  sub: number;
  depth: number;
  z: number;
  layer: number;
  skey: number;
}

function collect(world: ReturnType<typeof sceneryWorld>, r: Dir, view?: LayerFrame['view']): Push[] {
  const out: Push[] = [];
  const layer = createSceneryLayer();
  layer.collect!(world, { push: (kind, ref, sub, _ax, _ay, skey, depth, z, l) => void out.push({ kind, ref, sub, depth, z, layer: l, skey }) }, defaultToolState(), frame(r, view));
  return out;
}

describe('scenery layer draw list', () => {
  it('pushes 1 × 1 items, multi-tile columns, both arch halves, and edge items with their depths', () => {
    const w = sceneryWorld();
    const map = w.state.map;
    map.content[tileIndex(map, 20, 20)] = Content.Footpath;
    placeOk(w, 'oak_round', 10, 10);
    placeOk(w, 'tent_red', 14, 10);
    placeOk(w, 'ticket_arch', 20, 20);
    placeOk(w, 'hedge_low', 30, 30, 0, 2);
    const items = collect(w, 0);
    expect(items.filter((p) => p.ref === 0)).toEqual([expect.objectContaining({ kind: LAYER_KIND.scenery, sub: -1, depth: 21, z: 8, layer: Layer.Object })]);
    const tent = items.filter((p) => p.ref === 1);
    expect(tent.map((p) => p.sub)).toEqual([0, 1, 2, 3]);
    expect(tent.map((p) => p.depth)).toEqual([26, 27, 27, 26]);
    const arch = items.filter((p) => p.ref === 2);
    expect(arch.map((p) => [p.sub, p.depth])).toEqual([
      [-2, 40.6],
      [-3, 41.4],
    ]);
    expect(arch[0]!.skey).not.toBe(arch[1]!.skey);
    expect(items.filter((p) => p.ref === 3)).toEqual([expect.objectContaining({ kind: LAYER_KIND.sceneryEdge, depth: 61.5 })]);
    // Guests on the arch tile (depth 41) sort between the two halves at the same height.
    expect(packDepth(40.6, 8, Layer.Object)).toBeLessThan(packDepth(41, 8, Layer.Guest));
    expect(packDepth(41, 8, Layer.Guest)).toBeLessThan(packDepth(41.4, 8, Layer.Object));
  });

  it('uses the wilted variant for a wilted garden', () => {
    const w = sceneryWorld();
    placeOk(w, 'bed_mixed', 10, 10);
    const fresh = collect(w, 0)[0]!.skey;
    w.state.scenery[0]!.waterLevel = 10;
    expect(collect(w, 0)[0]!.skey).toBe(scenerySpriteKey('bed_mixed', 0, SCENERY_FRAME.wilted, 1));
    expect(fresh).toBe(scenerySpriteKey('bed_mixed', 0, 0, 1));
  });

  it('draws every item in all 4 rotations with the rotated sprite key', () => {
    const w = sceneryWorld();
    placeOk(w, 'statue_robot', 10, 10, 1);
    for (const r of R) expect(collect(w, r)[0]!.skey).toBe(scenerySpriteKey('statue_robot', ((1 + r) % 4) as Dir, 0, 1));
  });

  it('culls items outside the visible rectangle', () => {
    const w = sceneryWorld();
    placeOk(w, 'oak_round', 10, 10);
    placeOk(w, 'oak_round', 50, 50);
    // Tile (10, 10) anchors at world (0, 320); (50, 50) at (0, 1600).
    const near = collect(w, 0, { x0: -200, y0: 200, x1: 200, y1: 500 });
    expect(near.map((p) => p.ref)).toEqual([0]);
  });
});

describe('ghost store', () => {
  it('keeps one ghost per tool state', () => {
    const a = defaultToolState();
    const b = defaultToolState();
    expect(sceneryGhostOf(a)).toBeNull();
    const g = { mode: 'place' as const, defId: 'oak_round', x: 1, y: 2, rotation: 0 as Dir, edge: -1 as const, tiles: [5], valid: true, reason: null, cost: 4000, targetId: -1 };
    setSceneryGhost(a, g);
    expect(sceneryGhostOf(a)).toBe(g);
    expect(sceneryGhostOf(b)).toBeNull();
    setSceneryGhost(a, null);
    expect(sceneryGhostOf(a)).toBeNull();
  });
});
