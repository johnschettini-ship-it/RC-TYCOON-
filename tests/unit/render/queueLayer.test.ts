/** Queue clarity (spec 2026-11-18 §1–3): entrance signs, the tapped queue's highlight, unlinked queue markers. */
import { describe, expect, it } from 'vitest';
import { createQueueLayer } from '../../../src/render/queues/layer';
import { fitSignText, signBoxes, type SignBox } from '../../../src/render/queues/sign';
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

describe('fitSignText', () => {
  it('keeps a short name, cuts a long one with an ellipsis, leaves empty empty', () => {
    expect(fitSignText(measure, 'Carousel', 120)).toBe('Carousel');
    const cut = fitSignText(measure, 'The Extremely Long Ride Name Of Doom', 60);
    expect(cut.endsWith('…')).toBe(true);
    expect(measure(cut)).toBeLessThanOrEqual(60);
    expect(cut.length).toBe(10);
    expect(fitSignText(measure, '', 60)).toBe('');
  });
});

describe('signBoxes', () => {
  it('one box per ride with an entrance, text = ride.name; a renamed ride shows its new name', () => {
    const { world, a, b } = park();
    const out: SignBox[] = [];
    signBoxes(world, frame(), measure, out);
    expect(out.map((s) => [s.rideId, s.text])).toEqual([
      [a, 'Carousel 1'],
      [b, 'Carousel 2'],
    ]);
    world.state.rides[0]!.name = 'Merry Spin';
    signBoxes(world, frame(), measure, out);
    expect(out[0]?.text).toBe('Merry Spin');
    for (const s of out) expect(s.w).toBeGreaterThan(measure(s.text));
  });

  it('none at the farthest zoom (guests as dots)', () => {
    const { world } = park();
    expect(signBoxes(world, frame(0.5), measure, [])).toEqual([]);
    expect(signBoxes(world, frame(0.4, 2), measure, [])).toEqual([]);
    expect(signBoxes(world, frame(0.75), measure, []).length).toBe(2);
  });

  it('the sign sits above its entrance', () => {
    const { world } = park();
    const [s1, s2] = signBoxes(world, frame(), measure, []);
    expect(s2!.x).toBeGreaterThan(s1!.x);
  });
});

describe('queue layer', () => {
  it('draws the ride names and records them on the canvas', () => {
    const { world } = park();
    const { ctx, calls, canvas } = recordingCtx();
    createQueueLayer().drawOverlay!(ctx, world, defaultToolState(), frame());
    expect(calls.filter((c) => c.op === 'fillText').map((c) => c.args[0])).toEqual(['Carousel 1', 'Carousel 2']);
    expect(canvas.dataset.queueSigns).toBe('Carousel 1|Carousel 2');
  });

  it('highlights the tapped queue only while one is selected', () => {
    const { world } = park();
    const tool: ToolState = defaultToolState();
    const layer = createQueueLayer();
    const r1 = recordingCtx();
    layer.drawOverlay!(r1.ctx, world, tool, frame());
    expect(r1.calls.some((c) => c.op === 'fill' && c.fill?.startsWith('rgba(57,208,255'))).toBe(false);
    tool.selectedEntity = { kind: 'queue', id: world.state.map.width * 14 + 11 };
    const r2 = recordingCtx();
    layer.drawOverlay!(r2.ctx, world, tool, frame());
    expect(r2.calls.filter((c) => c.op === 'fill' && c.fill?.startsWith('rgba(57,208,255')).length).toBe(2);
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
