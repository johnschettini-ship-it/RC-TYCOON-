import { describe, expect, it } from 'vitest';
import { createElevatedPathLayer, ELEVATED_COLOURS } from '../../../src/render/elevated/layer';
import { LAYER_KIND, type LayerFrame, type LayerSink } from '../../../src/render/layers';
import { Layer } from '../../../src/render/depth';
import { defaultToolState } from '../../../src/render/types';
import type { Dir } from '../../../src/sim/map';
import { makeTestWorld } from '../../helpers/world';
import { T, elevated } from './helpers';

function frame(rotation: Dir = 0): LayerFrame {
  return {
    scale: 1,
    offX: 0,
    offY: 0,
    dpr: 1,
    bucket: 1,
    view: { x0: -10_000, y0: -10_000, x1: 10_000, y1: 10_000 },
    rotation,
    alpha: 0,
    width: 800,
    height: 600,
  };
}

interface Pushed {
  kind: number;
  ref: number;
  ax: number;
  ay: number;
  depth: number;
  z: number;
  layer: number;
}

function collect(world: ReturnType<typeof makeTestWorld>, f: LayerFrame): Pushed[] {
  const out: Pushed[] = [];
  const sink: LayerSink = {
    push: (kind, ref, _sub, ax, ay, _skey, depth, z, layer) => out.push({ kind, ref, ax, ay, depth, z, layer }),
  };
  createElevatedPathLayer().collect!(world, sink, defaultToolState(), f);
  return out;
}

/** A Canvas 2D stand-in that records fills, posts, and every point. */
function recorder() {
  const points: [number, number][] = [];
  const rects: [number, number, number, number][] = [];
  const fills: string[] = [];
  let style = '';
  const ctx = {
    set fillStyle(v: string) {
      style = v;
    },
    get fillStyle() {
      return style;
    },
    strokeStyle: '',
    lineWidth: 1,
    beginPath() {},
    closePath() {},
    moveTo: (x: number, y: number) => points.push([x, y]),
    lineTo: (x: number, y: number) => points.push([x, y]),
    fill: () => fills.push(style),
    stroke() {},
    fillRect: (x: number, y: number, w: number, h: number) => rects.push([x, y, w, h]),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, points, rects, fills };
}

describe('elevated path layer (Phase 4 §4.2)', () => {
  it('collects one drawable per elevated path at its tile depth and height, in the path layer', () => {
    const w = makeTestWorld();
    elevated(w, 20, 10, 12);
    elevated(w, 21, 10, 12, 'queue');
    const items = collect(w, frame());
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ kind: LAYER_KIND.elevatedPath, ref: 0, ax: (20 - 10) * 32, ay: (20 + 10) * 16 - 12 * 8, depth: 30.5, z: 12, layer: Layer.Path });
    // Culling: outside the view nothing is pushed.
    const f = frame();
    f.view = { x0: 5_000, y0: 5_000, x1: 6_000, y1: 6_000 };
    expect(collect(w, f)).toEqual([]);
  });

  it('draws 4 supports down to the ground, two side faces, and the deck in the path colours', () => {
    const w = makeTestWorld();
    elevated(w, 20, 10, 12);
    const r = recorder();
    createElevatedPathLayer().drawItem!(r.ctx, w, LAYER_KIND.elevatedPath, 0, 0, 0, 0, 0, frame());
    expect(r.rects).toHaveLength(4);
    // Each post runs from under the deck (12 m) to the ground (8 m): 4 m = 32 px minus the 4 px slab.
    for (const [, , , h] of r.rects) expect(h).toBeCloseTo(32 - 4, 6);
    expect(r.fills.slice(-3)).toEqual([ELEVATED_COLOURS.footpath.left, ELEVATED_COLOURS.footpath.right, ELEVATED_COLOURS.footpath.top]);
  });

  it('a ramp deck is one step higher at its high edge, in every view rotation', () => {
    const w = makeTestWorld();
    elevated(w, 20, 10, 12, 'footpath', 1); // rises toward +x
    for (const rot of [0, 1, 2, 3] as Dir[]) {
      const r = recorder();
      createElevatedPathLayer().drawItem!(r.ctx, w, LAYER_KIND.elevatedPath, 0, 0, 0, 0, 0, frame(rot));
      const top = r.points.slice(-4);
      const flatY = (c: [number, number]): number => c[1];
      const ys = top.map(flatY);
      expect(ys.every(Number.isFinite)).toBe(true);
      // Exactly two deck corners are raised by 8 px compared with a flat deck at 12.
      const flat = recorder();
      const w2 = makeTestWorld();
      elevated(w2, 20, 10, 12);
      createElevatedPathLayer().drawItem!(flat.ctx, w2, LAYER_KIND.elevatedPath, 0, 0, 0, 0, 0, frame(rot));
      const fy = flat.points.slice(-4).map(flatY);
      const raised = ys.filter((y, k) => Math.abs((fy[k] as number) - y - 8) < 1e-6).length;
      expect(raised).toBe(2);
    }
  });

  it('the path tool ghost draws at the chosen height only when a height is set', () => {
    const w = makeTestWorld();
    const tool = defaultToolState();
    tool.tool = 'footpath';
    tool.hoverTile = T(w, 20, 10);
    const r = recorder();
    createElevatedPathLayer().drawOverlay!(r.ctx, w, tool, frame());
    expect(r.fills).toHaveLength(0);
    tool.pathHeight.z = 12;
    createElevatedPathLayer().drawOverlay!(r.ctx, w, tool, frame());
    expect(r.fills).toEqual([ELEVATED_COLOURS.ghostOk]);
    tool.drag = { startTile: T(w, 20, 10), endTile: T(w, 22, 10), tiles: [T(w, 20, 10), T(w, 21, 10), T(w, 22, 10)], cost: 0 };
    tool.pathHeight.ramp = 'up';
    const r2 = recorder();
    createElevatedPathLayer().drawOverlay!(r2.ctx, w, tool, frame());
    expect(r2.fills).toHaveLength(3);
  });
});
