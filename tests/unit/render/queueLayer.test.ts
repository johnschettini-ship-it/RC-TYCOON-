/** Queue clarity (spec 2026-11-18 §2–3): the tapped queue's highlight, unlinked queue markers; no entrance sign (path clarity). */
import { describe, expect, it } from 'vitest';
import { createQueueLayer } from '../../../src/render/queues/layer';
import { queueKey } from '../../../src/sim/pathing/queues';
import type { LayerFrame } from '../../../src/render/layers';
import { defaultToolState, type ToolState } from '../../../src/render/types';
import { markNetworkDirty } from '../../../src/sim/pathing';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, placeQueue, placeRideDirect } from '../../helpers/world';

const measure = (s: string): number => s.length * 6;
function frame(zoom = 1, dpr = 1): LayerFrame {
  // Camera centred near tile (12, 12) at the given zoom.
  const scale = zoom * dpr;
  return { scale, offX: 400 - (12 - 12) * 32 * scale, offY: 300 - 25 * 16 * scale, dpr, bucket: 1, view: { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 }, rotation: 0, alpha: 0, width: 800, height: 600 };
}

interface Call {
  op: string;
  args: unknown[];
  fill?: string;
  stroke?: string;
}

function recordingCtx(canvas: { dataset: Record<string, string> } = { dataset: {} }): { ctx: CanvasRenderingContext2D; calls: Call[]; canvas: { dataset: Record<string, string> } } {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { fillStyle: '#000', strokeStyle: '#000', font: '', lineWidth: 1, globalAlpha: 1, textAlign: 'start', textBaseline: 'alphabetic' };
  const ctx = new Proxy(state, {
    get(t, p: string) {
      if (p === 'canvas') return canvas;
      if (p in t) return t[p];
      if (p === 'measureText') return (s: string) => ({ width: measure(s) });
      return (...args: unknown[]) => calls.push({ op: p, args, fill: String(t.fillStyle), stroke: String(t.strokeStyle) });
    },
    set(t, p: string, v) {
      t[p] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, canvas };
}

function park(): { world: World; a: number; b: number } {
  const world = makeTestWorld();
  const a = placeRideDirect(world, 'carousel', 10, 10, 0);
  const b = placeRideDirect(world, 'carousel', 16, 10, 0);
  a.name = 'Carousel 1';
  b.name = 'Carousel 2';
  placeQueue(world, 11, 13);
  placeQueue(world, 11, 14);
  placeQueue(world, 17, 13);
  markNetworkDirty(world);
  return { world, a: a.id, b: b.id };
}

describe('queue layer', () => {
  it('draws no ride name over an entrance (path clarity removed the sign)', () => {
    const { world } = park();
    const { ctx, calls, canvas } = recordingCtx();
    createQueueLayer().drawOverlay!(ctx, world, defaultToolState(), frame());
    const texts = calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    expect(texts).not.toContain('Carousel 1');
    expect(texts).not.toContain('Carousel 2');
    expect(canvas.dataset.queueSigns).toBeUndefined();
  });

  it('highlights the tapped queue on the ground (under the guests) only while one is selected', () => {
    const { world } = park();
    const tool: ToolState = defaultToolState();
    const layer = createQueueLayer();
    const r1 = recordingCtx();
    layer.drawGround!(r1.ctx, world, tool, frame());
    expect(r1.calls.some((c) => c.op === 'fill' && c.fill?.startsWith('rgba(57,208,255'))).toBe(false);
    tool.selectedEntity = { kind: 'queue', id: queueKey(world, world.state.map.width * 14 + 11) };
    const r2 = recordingCtx();
    layer.drawGround!(r2.ctx, world, tool, frame());
    expect(r2.calls.filter((c) => c.op === 'fill' && c.fill?.startsWith('rgba(57,208,255')).length).toBe(2);
    const r3 = recordingCtx();
    layer.drawOverlay!(r3.ctx, world, tool, frame());
    expect(r3.calls.some((c) => c.op === 'fill' && c.fill?.startsWith('rgba(57,208,255'))).toBe(false);
  });

  it('marks queues that reach no ride only while a path tool is on', () => {
    const { world } = park();
    placeQueue(world, 30, 30);
    placeQueue(world, 31, 30);
    placeQueue(world, 40, 40);
    markNetworkDirty(world);
    const tool: ToolState = defaultToolState();
    const layer = createQueueLayer();
    const off = recordingCtx();
    layer.drawOverlay!(off.ctx, world, tool, frame());
    expect(off.canvas.dataset.queueWarnings).toBe('0');
    expect(off.calls.some((c) => c.op === 'fillText' && c.args[0] === '!')).toBe(false);
    tool.tool = 'queue';
    const on = recordingCtx();
    layer.drawOverlay!(on.ctx, world, tool, frame());
    expect(on.canvas.dataset.queueWarnings).toBe('2');
    expect(on.calls.filter((c) => c.op === 'fillText' && c.args[0] === '!').length).toBe(2);
  });
});
