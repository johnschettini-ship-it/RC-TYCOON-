/** Queue clarity (spec 2026-11-18 §2–3): the tapped queue's highlight, unlinked queue markers; no entrance sign (path clarity). */
import { describe, expect, it } from 'vitest';
import { createQueueLayer } from '../../../src/render/queues/layer';
import { queueKey } from '../../../src/sim/pathing/queues';
import type { LayerFrame } from '../../../src/render/layers';
import { defaultToolState, type ToolState } from '../../../src/render/types';
import { markNetworkDirty } from '../../../src/sim/pathing';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, placeFootpath, placeQueue, placeRideDirect } from '../../helpers/world';

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

describe('path clarity marks (spec 2026-11-18 §3–4)', () => {
  /** Ride A at (10,10) with no queue; ride B at (16,10) with a queue that reaches nothing; a lone footpath at (30,30). */
  function chainPark(): { world: World; lone: number } {
    const world = makeTestWorld();
    placeRideDirect(world, 'carousel', 10, 10, 0);
    placeRideDirect(world, 'carousel', 16, 10, 0);
    placeQueue(world, 17, 13);
    placeQueue(world, 17, 14);
    const lone = placeFootpath(world, 30, 30);
    markNetworkDirty(world);
    return { world, lone };
  }
  const GLOW = 'rgba(57,208,255';
  const DIM = 'rgba(20,24,40';

  it('no glows or dimming with the inspect tool', () => {
    const { world } = chainPark();
    const layer = createQueueLayer(() => 0);
    const g = recordingCtx();
    layer.drawGround!(g.ctx, world, defaultToolState(), frame());
    const o = recordingCtx(g.canvas);
    layer.drawOverlay!(o.ctx, world, defaultToolState(), frame());
    expect([...g.calls, ...o.calls].some((c) => c.op === 'fill' && (c.fill?.startsWith(GLOW) || c.fill?.startsWith(DIM)))).toBe(false);
    expect(o.canvas.dataset.pathGlows).toBe('0');
    expect(o.canvas.dataset.pathDimmed).toBe('0');
  });

  for (const toolId of ['footpath', 'queue'] as const) {
    it(`the ${toolId} tool: the unqueued entrance and the unreached queue end glow, the cut-off footpath dims`, () => {
      const { world } = chainPark();
      const tool: ToolState = { ...defaultToolState(), tool: toolId };
      const layer = createQueueLayer(() => 0);
      const g = recordingCtx();
      layer.drawGround!(g.ctx, world, tool, frame());
      // The park's own entrance stub reaches the park: only the lone footpath dims.
      expect(g.calls.filter((c) => c.op === 'fill' && c.fill?.startsWith(DIM)).length).toBe(1);
      const o = recordingCtx(g.canvas);
      layer.drawOverlay!(o.ctx, world, tool, frame());
      expect(o.calls.filter((c) => c.op === 'fill' && c.fill?.startsWith(GLOW)).length).toBe(2);
      expect(o.canvas.dataset.pathGlows).toBe('2');
      expect(o.canvas.dataset.pathDimmed).toBe('1');
    });
  }

  it('glow at deck height: an elevated queue end glows on its deck, not the ground', () => {
    const tool: ToolState = { ...defaultToolState(), tool: 'queue' };
    const glowTops = (deck: boolean): number => {
      const world = makeTestWorld();
      const ride = placeRideDirect(world, 'carousel', 10, 10, 0);
      const h = world.state.map.heights[ride.entrance!.gate] as number;
      if (deck) {
        // A ramp from the gate up to a deck one step high: the queue's open end is the deck.
        world.state.elevatedPaths.push({ id: 900, x: 11, y: 13, z: h, kind: 'queue', rampDir: 2 });
        world.state.elevatedPaths.push({ id: 901, x: 11, y: 14, z: h + 1, kind: 'queue', rampDir: -1 });
      } else {
        placeQueue(world, 11, 13);
        placeQueue(world, 11, 14);
      }
      markNetworkDirty(world);
      const o = recordingCtx();
      createQueueLayer(() => 0).drawOverlay!(o.ctx, world, tool, frame());
      const ys = o.calls.filter((c) => (c.op === 'moveTo' || c.op === 'lineTo') && c.fill?.startsWith(GLOW)).map((c) => c.args[1] as number);
      expect(ys.length).toBeGreaterThan(0);
      return Math.min(...ys);
    };
    expect(glowTops(true)).toBeLessThan(glowTops(false));
  });

  it('Show me: the focus pulses until its time, then stops; a bad tile draws nothing', () => {
    const { world } = chainPark();
    let now = 1000;
    const layer = createQueueLayer(() => now);
    const tool: ToolState = { ...defaultToolState(), pathFocus: { tile: world.state.map.width * 13 + 11, z: 0, until: 4000 } };
    const PULSE = '#ffd23f';
    const a = recordingCtx();
    layer.drawOverlay!(a.ctx, world, tool, frame());
    expect(a.calls.some((c) => c.op === 'stroke' && c.stroke === PULSE)).toBe(true);
    expect(a.canvas.dataset.pathFocus).toBe(String(world.state.map.width * 13 + 11));
    now = 4001;
    const b = recordingCtx(a.canvas);
    layer.drawOverlay!(b.ctx, world, tool, frame());
    expect(b.calls.some((c) => c.stroke === PULSE)).toBe(false);
    expect(b.canvas.dataset.pathFocus).toBe('');
    now = 1000;
    tool.pathFocus = { tile: -5, z: 0, until: 4000 };
    const c2 = recordingCtx();
    layer.drawOverlay!(c2.ctx, world, tool, frame());
    expect(c2.calls.some((c) => c.stroke === PULSE)).toBe(false);
  });
});
