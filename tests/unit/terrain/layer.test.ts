import { describe, expect, it } from 'vitest';
import { createTerrainToolLayer, moneyLabel, terrainGhostColours, viewPoint } from '../../../src/render/terrainTools/layer';
import { formatMoney } from '../../../src/ui/format';
import type { LayerFrame } from '../../../src/render/layers';
import { defaultToolState } from '../../../src/render/types';
import { mapToViewContinuous } from '../../../src/render/view';
import { tileIndex } from '../../../src/sim/map';
import { makeTestWorld } from '../../helpers/world';
import type { Dir } from '../../../src/sim/map';

/** A 2D context that records what is drawn. */
function fakeCtx() {
  const calls: string[] = [];
  const texts: string[] = [];
  const fills: string[] = [];
  const ctx = {
    calls,
    texts,
    fills,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    beginPath: () => calls.push('beginPath'),
    moveTo: () => calls.push('moveTo'),
    lineTo: () => calls.push('lineTo'),
    closePath: () => calls.push('closePath'),
    arc: () => calls.push('arc'),
    fill() {
      fills.push(String(this.fillStyle));
      calls.push('fill');
    },
    stroke: () => calls.push('stroke'),
    fillRect: () => calls.push('fillRect'),
    strokeRect: () => calls.push('strokeRect'),
    fillText: (t: string) => texts.push(t),
    measureText: (t: string) => ({ width: t.length * 7 }),
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    setTransform: () => calls.push('setTransform'),
  };
  return ctx;
}

function frame(rotation: Dir = 0): LayerFrame {
  return { scale: 1, offX: 400, offY: 300, dpr: 1, bucket: 1, view: { x0: -2000, y0: -2000, x1: 2000, y1: 2000 }, rotation, alpha: 0, width: 800, height: 600 };
}

describe('terrain tool layer (Phase 4 §7 ghosts)', () => {
  it('draws nothing unless the Land or Water tool has a brush ghost', () => {
    const world = makeTestWorld();
    const layer = createTerrainToolLayer();
    expect(layer.kinds).toEqual([]);
    const tool = defaultToolState();
    const ctx = fakeCtx();
    layer.drawOverlay?.(ctx as unknown as CanvasRenderingContext2D, world, tool, frame());
    tool.tool = 'land';
    layer.drawOverlay?.(ctx as unknown as CanvasRenderingContext2D, world, tool, frame());
    expect(ctx.calls).toEqual([]);
  });

  it('outlines every brush tile, marks the corner, and labels the cost', () => {
    const world = makeTestWorld();
    const map = world.state.map;
    const layer = createTerrainToolLayer();
    const tool = defaultToolState();
    tool.tool = 'land';
    const tiles = [tileIndex(map, 10, 10), tileIndex(map, 11, 10), tileIndex(map, 10, 11), tileIndex(map, 11, 11)];
    tool.brush = { tiles, cost: 400000, valid: true, reason: null, corner: { x: 11, y: 11 } };
    const ctx = fakeCtx();
    layer.drawOverlay?.(ctx as unknown as CanvasRenderingContext2D, world, tool, frame());
    expect(ctx.calls.filter((c) => c === 'closePath')).toHaveLength(4);
    expect(ctx.calls).toContain('arc');
    expect(ctx.texts).toEqual(['$4,000']);
    expect(ctx.fills[0]).toBe(terrainGhostColours('land', true).fill);
    // Invalid ghosts use the red colours.
    tool.brush = { ...tool.brush, valid: false, reason: 'A path is in the way' };
    const bad = fakeCtx();
    layer.drawOverlay?.(bad as unknown as CanvasRenderingContext2D, world, tool, frame());
    expect(bad.fills[0]).toBe(terrainGhostColours('land', false).fill);
    expect(terrainGhostColours('water', true).fill).not.toBe(terrainGhostColours('land', true).fill);
  });

  it('the cost label uses the HUD money format', () => {
    for (const c of [0, 200, 2800, 25_200, 123_456_700, 250, -1_200]) expect(moneyLabel(c)).toBe(formatMoney(c));
  });

  it('projects map points through the view rotation like mapToViewContinuous', () => {
    const map = makeTestWorld().state.map;
    for (const r of [0, 1, 2, 3] as Dir[]) {
      for (const [fx, fy] of [
        [0, 0],
        [10.5, 3.25],
        [64, 64],
        [7, 50],
      ] as const) {
        const want = mapToViewContinuous(fx, fy, r, map.width, map.height);
        const got = viewPoint(fx, fy, r, map.width, map.height);
        expect(got.u).toBeCloseTo(want.u, 9);
        expect(got.v).toBeCloseTo(want.v, 9);
      }
    }
  });
});
