/** Phase 4 §4.7 rendering: the light pass and the Light overlay, with a recording fake canvas. Owner: W3-F. */
import { describe, expect, it } from 'vitest';
import { MAX_LIGHT_SPRITES } from '../../../src/data/tuning/night';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../../src/data/tuning/core';
import { createLightingLayer } from '../../../src/render/lighting/layer';
import { lightLegend, lightBand, lightValueLabel } from '../../../src/render/lighting/legend';
import type { CanvasLike, Ctx2D } from '../../../src/render/lighting/sprites';
import type { LayerFrame } from '../../../src/render/layers';
import { defaultToolState, type ToolState } from '../../../src/render/types';
import { PathItem } from '../../../src/sim/map';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, placeFootpath, placeRideDirect } from '../../helpers/world';

interface Call {
  op: string;
  args: unknown[];
  gco: string;
  alpha: number;
}

class FakeCtx {
  calls: Call[] = [];
  globalCompositeOperation = 'source-over';
  globalAlpha = 1;
  fillStyle: unknown = '#000';
  strokeStyle: unknown = '#000';
  lineWidth = 1;
  imageSmoothingEnabled = true;
  constructor(readonly canvas: FakeCanvas | null) {}
  private rec(op: string, args: unknown[]): void {
    this.calls.push({ op, args, gco: this.globalCompositeOperation, alpha: this.globalAlpha });
  }
  createRadialGradient(): { addColorStop(): void } {
    return { addColorStop() {} };
  }
  createPattern(): object {
    return { pattern: true };
  }
  fillRect(...a: unknown[]): void {
    this.rec('fillRect', [...a, this.fillStyle]);
  }
  drawImage(...a: unknown[]): void {
    this.rec('drawImage', a);
  }
  beginPath(): void {
    this.rec('beginPath', []);
  }
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
  stroke(): void {
    this.rec('stroke', []);
  }
  save(): void {}
  restore(): void {}
  setTransform(...a: unknown[]): void {
    this.rec('setTransform', a);
  }
  fill(path?: unknown): void {
    this.rec('fill', [this.fillStyle, path]);
  }
  ops(name: string): Call[] {
    return this.calls.filter((c) => c.op === name);
  }
}

class FakePath {
  ops = 0;
  parts: FakePath[] = [];
  moveTo(): void {
    this.ops++;
  }
  lineTo(): void {
    this.ops++;
  }
  closePath(): void {}
  addPath(p: FakePath): void {
    this.parts.push(p);
  }
}

class FakeCanvas implements CanvasLike {
  readonly ctx: FakeCtx;
  constructor(
    public width: number,
    public height: number,
  ) {
    this.ctx = new FakeCtx(this);
  }
  getContext(): Ctx2D {
    return this.ctx as unknown as Ctx2D;
  }
}

function setup(): { layer: ReturnType<typeof createLightingLayer>; made: FakeCanvas[] } {
  const made: FakeCanvas[] = [];
  const layer = createLightingLayer({
    createCanvas: (w, h) => {
      const c = new FakeCanvas(w, h);
      made.push(c);
      return c;
    },
    createPath: () => new FakePath(),
  });
  return { layer, made };
}

/** The whole 64 × 64 map on a 1200 × 600 device canvas at scale 0.25. */
function frame(patch: Partial<LayerFrame> = {}): LayerFrame {
  return {
    scale: 0.25,
    offX: 600,
    offY: 40,
    dpr: 1,
    bucket: 0.5,
    view: { x0: -2400, y0: -160, x1: 2400, y1: 2240 },
    rotation: 0,
    alpha: 0,
    width: 1200,
    height: 600,
    ...patch,
  };
}

const at = (hour: number): number => TICKS_PER_DAY + hour * TICKS_PER_HOUR;
const tool = (): ToolState => defaultToolState();

function lightCanvas(made: FakeCanvas[]): FakeCanvas {
  const c = made.find((m) => m.width === 300 && m.height === 150);
  if (!c) throw new Error('no light canvas');
  return c;
}

function nightWorld(): World {
  const w = makeTestWorld();
  w.state.tick = at(22);
  return w;
}

describe('light pass (drawAfterObjects)', () => {
  it('draws nothing by day or with After Dark off', () => {
    const { layer } = setup();
    const w = makeTestWorld();
    w.state.tick = at(12);
    const main = new FakeCanvas(1200, 600);
    layer.drawAfterObjects!(main.ctx as unknown as CanvasRenderingContext2D, w, tool(), frame());
    w.state.tick = at(22);
    w.state.park.afterDark = false;
    layer.drawAfterObjects!(main.ctx as unknown as CanvasRenderingContext2D, w, tool(), frame());
    expect(main.ctx.calls).toEqual([]);
  });

  it('fills a 1/4-resolution light canvas with the ambient colour, adds lights with lighter, and multiplies it over the frame', () => {
    const { layer, made } = setup();
    const w = nightWorld();
    const main = new FakeCanvas(1200, 600);
    layer.drawAfterObjects!(main.ctx as unknown as CanvasRenderingContext2D, w, tool(), frame());
    const lc = lightCanvas(made);
    const fill = lc.ctx.ops('fillRect')[0]!;
    expect(fill.args).toEqual([0, 0, 300, 150, 'rgb(70, 80, 130)']);
    expect(fill.gco).toBe('source-over');
    const glows = lc.ctx.ops('drawImage');
    expect(glows.length).toBe(1); // the park entrance
    expect(glows.every((c) => c.gco === 'lighter')).toBe(true);
    const mul = main.ctx.ops('drawImage').find((c) => c.args[0] === lc)!;
    expect(mul.gco).toBe('multiply');
    expect(mul.args).toEqual([lc, 0, 0, 300, 150, 0, 0, 1200, 600]);
    expect(main.ctx.globalCompositeOperation).toBe('source-over');
    expect(main.ctx.globalAlpha).toBe(1);
  });

  it('draws emissive bulbs after the multiply, with lighter', () => {
    const { layer, made } = setup();
    const w = nightWorld();
    const i = placeFootpath(w, 31, 56);
    w.state.map.pathItem[i] = PathItem.Lamp;
    const main = new FakeCanvas(1200, 600);
    // Zoom 1 on (31, 58): world point (−864, 1424) at the canvas centre.
    const f = frame({ scale: 1, offX: 600 + 864, offY: 300 - 1424, view: { x0: -1464, y0: 1124, x1: -264, y1: 1724 }, bucket: 1 });
    layer.drawAfterObjects!(main.ctx as unknown as CanvasRenderingContext2D, w, tool(), f);
    const lc = lightCanvas(made);
    const draws = main.ctx.ops('drawImage');
    const mulAt = draws.findIndex((c) => c.args[0] === lc);
    const bulbs = draws.slice(mulAt + 1);
    expect(bulbs.length).toBe(5); // the lamp head and the entrance pillar caps and emblems
    expect(bulbs.every((c) => c.gco === 'lighter')).toBe(true);
    expect(layer.stats().bulbs).toBe(5);
  });

  it('skips the emissive bulbs when zoomed far out (they would be a few pixels)', () => {
    const { layer } = setup();
    const w = nightWorld();
    w.state.map.pathItem[placeFootpath(w, 31, 56)] = PathItem.Lamp;
    const main = new FakeCanvas(1200, 600);
    layer.drawAfterObjects!(main.ctx as unknown as CanvasRenderingContext2D, w, tool(), frame({ scale: 0.25 }));
    expect(layer.stats().bulbs).toBe(0);
    expect(main.ctx.ops('drawImage')).toHaveLength(1);
  });

  it('reuses the light canvas while lights, camera, size, and darkness stay the same', () => {
    const { layer, made } = setup();
    const w = nightWorld();
    const main = new FakeCanvas(1200, 600);
    const draw = (f: LayerFrame = frame()): void => layer.drawAfterObjects!(main.ctx as unknown as CanvasRenderingContext2D, w, tool(), f);
    draw();
    const lc = lightCanvas(made);
    const fills = (): number => lc.ctx.ops('fillRect').length;
    expect(fills()).toBe(1);
    draw();
    expect(fills()).toBe(1);
    expect(main.ctx.ops('drawImage').filter((c) => c.args[0] === lc)).toHaveLength(2);
    draw(frame({ offX: 610 }));
    expect(fills()).toBe(2);
    const i = placeFootpath(w, 10, 10);
    w.state.map.pathItem[i] = PathItem.Lamp;
    draw(frame({ offX: 610 }));
    expect(fills()).toBe(3);
    w.state.tick = at(20);
    draw(frame({ offX: 610 }));
    expect(fills()).toBe(4);
    expect(lc.ctx.ops('fillRect')[3]!.args[4]).toBe('rgb(163, 168, 193)');
  });

  it('culls light sources outside the viewport', () => {
    const { layer, made } = setup();
    const w = nightWorld();
    for (const [x, y] of [[5, 5], [10, 30], [50, 50]] as const) w.state.map.pathItem[placeFootpath(w, x, y)] = PathItem.Lamp;
    const main = new FakeCanvas(1200, 600);
    // Zoomed in on (5, 5): scale 2, the tile's world point (0, 160) at the canvas centre.
    const f = frame({ scale: 2, offX: 600, offY: 300 - 160 * 2, view: { x0: -300, y0: 10, x1: 300, y1: 310 } });
    layer.drawAfterObjects!(main.ctx as unknown as CanvasRenderingContext2D, w, tool(), f);
    expect(lightCanvas(made).ctx.ops('drawImage')).toHaveLength(1);
  });

  it(`draws at most ${MAX_LIGHT_SPRITES} light sprites a frame`, () => {
    const { layer, made } = setup();
    const w = nightWorld();
    for (let y = 2; y < 60; y++) for (let x = 2; x < 14; x++) w.state.map.pathItem[placeFootpath(w, x, y)] = PathItem.Lamp;
    const main = new FakeCanvas(1200, 600);
    layer.drawAfterObjects!(main.ctx as unknown as CanvasRenderingContext2D, w, tool(), frame());
    expect(lightCanvas(made).ctx.ops('drawImage')).toHaveLength(MAX_LIGHT_SPRITES);
    expect(layer.stats().sprites).toBe(MAX_LIGHT_SPRITES);
  });

  it('lights open rides and not closed ones', () => {
    const { layer, made } = setup();
    const w = nightWorld();
    const ride = placeRideDirect(w, 'carousel', 20, 20, 0);
    const main = new FakeCanvas(1200, 600);
    const draw = (): void => layer.drawAfterObjects!(main.ctx as unknown as CanvasRenderingContext2D, w, tool(), frame());
    draw();
    expect(lightCanvas(made).ctx.ops('drawImage')).toHaveLength(1);
    ride.status = 'open';
    draw();
    // Calls add up: the first frame drew the entrance; the second redraws the entrance and one pool for the carousel.
    expect(lightCanvas(made).ctx.ops('drawImage')).toHaveLength(3);
  });
});

describe('Light overlay (drawGround)', () => {
  function overlayWorld(): World {
    const w = makeTestWorld();
    w.state.tick = at(12);
    placeFootpath(w, 10, 10);
    w.state.map.pathItem[placeFootpath(w, 30, 30)] = PathItem.Lamp;
    return w;
  }

  it('tints path and lit tiles by band with a hatch, only when the Light overlay is on', () => {
    const { layer } = setup();
    const w = overlayWorld();
    const main = new FakeCanvas(1200, 600);
    const t = tool();
    layer.drawGround!(main.ctx as unknown as CanvasRenderingContext2D, w, t, frame());
    expect(main.ctx.calls).toEqual([]);
    t.overlay = 'light';
    layer.drawGround!(main.ctx as unknown as CanvasRenderingContext2D, w, t, frame());
    const fills = main.ctx.ops('fill');
    const colours = fills.map((c) => c.args[0]);
    expect(colours).toContain('rgba(36, 40, 104, 0.6)');
    expect(colours).toContain('rgba(255, 200, 87, 0.42)');
    expect(colours).toContain('rgba(255, 243, 190, 0.6)');
    // Dense hatch over the dark path, sparse hatch over the lit tiles.
    expect(fills.filter((c) => typeof c.args[0] === 'object').length).toBeGreaterThanOrEqual(2);
    // Cached tile paths filled under the camera transform, then the transform is reset.
    expect(fills.every((c) => c.args[1] instanceof FakePath)).toBe(true);
    const tf = main.ctx.ops('setTransform');
    expect(tf[0]!.args).toEqual([0.25, 0, 0, 0.25, 600, 40]);
    expect(tf[tf.length - 1]!.args).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('rebuilds only chunks whose tiles changed; panning reuses the cached paths', () => {
    const { layer } = setup();
    const w = overlayWorld();
    const main = new FakeCanvas(1200, 600);
    const t = tool();
    t.overlay = 'light';
    const draw = (f: LayerFrame = frame()): void => layer.drawGround!(main.ctx as unknown as CanvasRenderingContext2D, w, t, f);
    draw();
    expect(layer.overlayRebuilt()).toBe(16); // every 16 × 16 chunk of the 64 × 64 map, once
    expect(layer.overlayRejoined()).toBe(true);
    const fillsBefore = main.ctx.ops('fill').length;
    draw(frame({ offX: 650, view: { x0: -2600, y0: -160, x1: 2200, y1: 2240 } }));
    expect(layer.overlayRebuilt()).toBe(0);
    expect(layer.overlayRejoined()).toBe(false);
    // One colour fill per band plus the two hatches.
    expect(main.ctx.ops('fill').length - fillsBefore).toBe(5);
    w.state.map.pathItem[placeFootpath(w, 50, 10)] = PathItem.Lamp;
    draw();
    expect(layer.overlayRebuilt()).toBe(1);
    draw(frame({ rotation: 1 }));
    expect(layer.overlayRebuilt()).toBe(16);
  });
});

describe('Light legend data (for the overlay legend, W3-E)', () => {
  it('names 3 bands with their thresholds', () => {
    expect(lightLegend()).toMatchObject({
      title: 'Light',
      bands: [
        { id: 'dark', label: 'Dark', range: '0–95' },
        { id: 'lit', label: 'Lit', range: '96–191' },
        { id: 'bright', label: 'Bright', range: '192–255' },
      ],
    });
    expect([0, 95, 96, 191, 192, 255].map(lightBand)).toEqual(['dark', 'dark', 'lit', 'lit', 'bright', 'bright']);
    expect(lightValueLabel(164)).toBe('Light 164');
  });

  it('every night string has no final period (master R4)', async () => {
    const { nightStrings } = await import('../../../src/data/strings/night');
    for (const [k, v] of Object.entries(nightStrings)) {
      expect(k.startsWith('night.'), k).toBe(true);
      expect(/\.$/.test(v), `${k}: "${v}"`).toBe(false);
    }
  });
});
