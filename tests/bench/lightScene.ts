/**
 * Shared After Dark bench scene (W3-F): a 128 × 128 park (Phase 4 §4.10 size) with a footpath grid, a lamp on
 * every fourth path tile, 30 open rides, 40 stalls, and 1,000 scenery items (a third of them lit), at 22:00.
 * Also a no-op 2D context and canvas factory, so the light pass's JavaScript cost can be timed in Node.
 */
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../../src/data/tuning/core';
import { allocId } from '../../src/sim/ids';
import { Content, generateMap, PathItem } from '../../src/sim/map';
import type { World } from '../../src/sim/types';
import type { LayerFrame } from '../../src/render/layers';
import type { CanvasLike, Ctx2D } from '../../src/render/lighting/sprites';
import { makeTestWorld, placeRideDirect, placeStallDirect } from '../helpers/world';

export const SIZE = 128;

export function buildLightScene(): World {
  const w = makeTestWorld(4321, 'Bench Night');
  w.state.map = generateMap({ width: SIZE, height: SIZE });
  const map = w.state.map;
  let lamp = 0;
  for (let y = 2; y < SIZE - 2; y++) {
    for (let x = 2; x < SIZE - 2; x++) {
      if (x % 8 !== 4 && y % 8 !== 4) continue;
      const i = y * SIZE + x;
      map.content[i] = Content.Footpath;
      if (lamp++ % 4 === 0) map.pathItem[i] = PathItem.Lamp;
    }
  }
  for (let k = 0; k < 30; k++) {
    const x = 5 + (k % 6) * 20;
    const y = 5 + Math.floor(k / 6) * 24;
    const r = placeRideDirect(w, 'carousel', x, y, 0);
    r.status = 'open';
  }
  for (let k = 0; k < 40; k++) placeStallDirect(w, 'snack_shack', 13 + (k % 8) * 15, 14 + Math.floor(k / 8) * 22, 2);
  const defs = ['lamp_globe', 'oak_round', 'shrub_round'];
  for (let k = 0; k < 1000; k++) {
    const x = 2 + ((k * 37) % (SIZE - 4));
    const y = 2 + ((k * 53) % (SIZE - 4));
    w.state.scenery.push({ id: allocId(w.state), defId: defs[k % 3] as string, x, y, z: 8, rotation: 0, edge: -1, waterLevel: 255 });
  }
  w.state.tick = TICKS_PER_DAY + 22 * TICKS_PER_HOUR;
  return w;
}

/** A 1920 × 1080 frame at `scale`, centred on the middle of the map. */
export function benchFrame(scale: number, panX = 0): LayerFrame {
  const width = 1920;
  const height = 1080;
  const cx = panX;
  const cy = SIZE * 16;
  const offX = width / 2 - cx * scale;
  const offY = height / 2 - cy * scale;
  return {
    scale,
    offX,
    offY,
    dpr: 1,
    bucket: scale < 0.75 ? 0.5 : scale < 1.5 ? 1 : 2,
    view: { x0: -offX / scale, y0: -offY / scale, x1: (width - offX) / scale, y1: (height - offY) / scale },
    rotation: 0,
    alpha: 0,
    width,
    height,
  };
}

const noop = (): void => {};

/** A 2D context whose calls do nothing (times the JavaScript side of a pass). */
export function noopContext(): Ctx2D {
  const ctx = {
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    imageSmoothingEnabled: true,
    canvas: null,
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
    fillRect: noop,
    drawImage: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    fill: noop,
    stroke: noop,
    setTransform: noop,
    save: noop,
    restore: noop,
  };
  return ctx as unknown as Ctx2D;
}

export function noopCanvas(w: number, h: number): CanvasLike {
  const ctx = noopContext();
  return { width: w, height: h, getContext: () => ctx };
}

export class NoopPath {
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
  addPath(): void {}
}
