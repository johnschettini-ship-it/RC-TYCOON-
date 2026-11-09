/** Colour is never the only signal (Phase 6 §4.7): safe colours, check / cross icons, hatching, full vs notched rings. */
import { afterEach, describe, expect, it } from 'vitest';
import { drawGhostIcon, drawGuestArt, ringNotched, RING_NOTCHES } from '../../../src/render/sprites/props';
import { GHOST_INVALID, GHOST_VALID, TINT_STEPS, temperamentTint } from '../../../src/render/palette';
import { SAFE_PALETTE } from '../../../src/data/tuning/a11y';
import { createA11yLayer, invalidTiles } from '../../../src/render/a11y/layer';
import { makeTestWorld } from '../../helpers/world';
import { defaultToolState } from '../../../src/render/types';
import { mapCursor, resetMapCursor } from '../../../src/a11y/cursor';
import type { LayerFrame } from '../../../src/render/layers';

/** A canvas context that records calls (enough for the sprite and layer code). */
function fakeCtx(): { ctx: CanvasRenderingContext2D; calls: Array<{ name: string; args: unknown[]; fill?: unknown; stroke?: unknown; dash?: number[] }> } {
  const calls: Array<{ name: string; args: unknown[]; fill?: unknown; stroke?: unknown; dash?: number[] }> = [];
  let dash: number[] = [];
  const state: Record<string, unknown> = { fillStyle: '', strokeStyle: '', lineWidth: 1 };
  const ctx = new Proxy(state, {
    get(t, p: string) {
      if (p in t) return t[p];
      if (p === 'setLineDash') return (d: number[]) => (dash = d);
      return (...args: unknown[]) => calls.push({ name: p, args, fill: t.fillStyle, stroke: t.strokeStyle, dash });
    },
    set(t, p: string, v) {
      t[p] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const frame: LayerFrame = { scale: 1, offX: 400, offY: 100, dpr: 1, bucket: 1, view: { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 }, rotation: 0, alpha: 0, width: 800, height: 600 };

afterEach(() => resetMapCursor());

describe('safe colours', () => {
  it('ghost icons use the safe blue and vermillion; the temperament tint runs blue to orange', () => {
    expect(GHOST_VALID).toBe(SAFE_PALETTE[0]);
    expect(GHOST_INVALID).toBe(SAFE_PALETTE[3]);
    const chill = temperamentTint(0);
    const thrill = temperamentTint(100);
    expect(chill).toEqual([0x56, 0xb4, 0xe9]);
    expect(thrill).toEqual([0xe6, 0x9f, 0x00]);
  });

  it('a valid ghost icon is a blue check, an invalid one a vermillion cross', () => {
    const a = fakeCtx();
    drawGhostIcon(a.ctx, 10, 10, true, 10);
    const b = fakeCtx();
    drawGhostIcon(b.ctx, 10, 10, false, 10);
    expect(a.calls.find((c) => c.name === 'fill')?.fill).toBe(GHOST_VALID);
    expect(b.calls.find((c) => c.name === 'fill')?.fill).toBe(GHOST_INVALID);
    // Check: one stroke of 3 points; cross: two separate strokes (2 moveTo calls after the circle).
    const moves = (calls: typeof a.calls): number => calls.filter((c) => c.name === 'moveTo').length;
    expect(moves(a.calls)).toBe(1);
    expect(moves(b.calls)).toBe(2);
  });
});

describe('temperament rings', () => {
  it('Thrill guests (last tint step) get a notched ring, Chill and Family a full one', () => {
    expect(ringNotched(TINT_STEPS - 1)).toBe(true);
    expect(ringNotched(0)).toBe(false);
    expect(ringNotched((TINT_STEPS - 1) / 2)).toBe(false);
    expect(ringNotched(-1)).toBe(false);
    expect(ringNotched(undefined)).toBe(false);
  });

  it('a notched ring is drawn as separate arcs, a full ring as one ellipse', () => {
    const look = { shirt: '#ffffff', skin: '#c08060', hair: '#302010', facing: 2 as const, walk: 0, ring: '#e69f00' };
    const thrill = fakeCtx();
    drawGuestArt(thrill.ctx, { ...look, ringStep: TINT_STEPS - 1 });
    const chill = fakeCtx();
    drawGuestArt(chill.ctx, { ...look, ringStep: 0 });
    const ringArcs = (calls: typeof thrill.calls): number => calls.filter((c) => c.name === 'ellipse' && c.args[2] === 6.2).length;
    expect(ringArcs(thrill.calls)).toBe(RING_NOTCHES);
    expect(ringArcs(chill.calls)).toBe(1);
  });
});

describe('a11y layer', () => {
  it('lists the footprint of an invalid ghost and of a refused path line, nothing for valid ones', () => {
    const w = makeTestWorld();
    const tool = defaultToolState();
    expect(invalidTiles(w, tool)).toEqual([]);
    tool.ghost = { kind: 'ride', defId: 'carousel', tile: 10 * 64 + 10, rotation: 0, valid: false, reason: 'x', cost: 0 };
    expect(invalidTiles(w, tool)).toHaveLength(9);
    tool.ghost.valid = true;
    expect(invalidTiles(w, tool)).toEqual([]);
    tool.ghost = null;
    tool.tool = 'footpath';
    tool.drag = { startTile: 5, endTile: 7, tiles: [5, 6, 7], cost: 0, reason: 'Not enough cash' };
    expect(invalidTiles(w, tool)).toEqual([5, 6, 7]);
    tool.drag.reason = null;
    expect(invalidTiles(w, tool)).toEqual([]);
  });

  it('draws the hatch only for invalid placements and a dashed diamond for the cursor', () => {
    const w = makeTestWorld();
    const layer = createA11yLayer();
    const tool = defaultToolState();
    const quiet = fakeCtx();
    layer.drawOverlay?.(quiet.ctx, w, tool, frame);
    expect(quiet.calls.filter((c) => c.name === 'stroke')).toHaveLength(0);
    tool.ghost = { kind: 'stall', defId: 'snack_shack', tile: 300, rotation: 0, valid: false, reason: 'x', cost: 0 };
    const hatch = fakeCtx();
    layer.drawOverlay?.(hatch.ctx, w, tool, frame);
    expect(hatch.calls.some((c) => c.name === 'clip')).toBe(true);
    expect(hatch.calls.some((c) => c.name === 'stroke' && c.stroke === GHOST_INVALID)).toBe(true);
    tool.ghost = null;
    mapCursor.on = true;
    mapCursor.tile = 200;
    const cursor = fakeCtx();
    layer.drawOverlay?.(cursor.ctx, w, tool, frame);
    expect(cursor.calls.some((c) => c.name === 'stroke' && (c.dash?.length ?? 0) > 0)).toBe(true);
  });
});
