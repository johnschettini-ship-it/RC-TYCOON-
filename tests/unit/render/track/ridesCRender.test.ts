/**
 * New rides batch C, today's look (docs/superpowers/specs/2026-11-17-new-rides-design.md): the five new car shapes stay
 * in the car sprite bounds at any yaw, pitch and roll and look different from each other and the old shapes; the
 * hanging ones (flying, gondola) reach up to their rail or rope; riders sit inside the gondola and under the prone shell.
 */
import { describe, expect, it } from 'vitest';
import { CAR_BOUNDS, carDims, HANG_M, paintCar, riderHeightM, type CarShape } from '../../../../src/render/track/paint';
import { PX_Z } from '../../../../src/render/track/project';

export function recorder(): { ctx: CanvasRenderingContext2D; pts: Array<[number, number]>; ops: string[] } {
  const pts: Array<[number, number]> = [];
  const ops: string[] = [];
  const target: Record<string, unknown> = {
    moveTo: (x: number, y: number) => pts.push([x, y]),
    lineTo: (x: number, y: number) => pts.push([x, y]),
    arc: (x: number, y: number, r: number) => pts.push([x - r, y - r], [x + r, y + r]),
    ellipse: (x: number, y: number, rx: number, ry: number) => pts.push([x - rx, y - ry], [x + rx, y + ry]),
    fillRect: (x: number, y: number, w: number, h: number) => pts.push([x, y], [x + w, y + h]),
    measureText: () => ({ width: 10 }),
  };
  const ctx = new Proxy(target, {
    get: (t, k: string) => (k in t ? (...a: unknown[]) => {
      ops.push(`${k}(${a.map((v) => (typeof v === 'number' ? v.toFixed(2) : String(v))).join(',')})`);
      return (t[k] as (...b: unknown[]) => unknown)(...a);
    } : () => {
      ops.push(k);
    }),
    set: (t, k: string, v) => {
      t[k] = v;
      ops.push(`${k}=${String(v)}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, pts, ops };
}

export function within(pts: ReadonlyArray<[number, number]>, b: { left: number; right: number; top: number; bottom: number }, pad = 3): void {
  for (const [x, y] of pts) {
    expect(x).toBeGreaterThanOrEqual(b.left - pad);
    expect(x).toBeLessThanOrEqual(b.right + pad);
    expect(y).toBeGreaterThanOrEqual(b.top - pad);
    expect(y).toBeLessThanOrEqual(b.bottom + pad);
  }
}

const NEW_SHAPES: readonly CarShape[] = ['launch', 'ore', 'boat', 'flying', 'gondola'];

describe('batch C cars', () => {
  it('every new shape stays inside the car sprite bounds at any yaw, pitch, and roll', () => {
    for (const shape of NEW_SHAPES) {
      for (let ys = 0; ys < 16; ys += 3) {
        for (let ps = 0; ps < 24; ps += 5) {
          for (let rs = 0; rs < 16; rs += 4) {
            for (const front of [true, false]) {
              const r = recorder();
              const roll = (rs / 16) * Math.PI * 2;
              paintCar(r.ctx, shape, (ys / 16) * Math.PI * 2, (ps / 24) * Math.PI * 2, '#d9383b', front, Math.sin(roll), Math.cos(roll));
              expect(r.pts.length, shape).toBeGreaterThan(0);
              within(r.pts, CAR_BOUNDS, 0);
            }
          }
        }
      }
    }
  });

  it('the new shapes look different from each other and from every old shape; the front car differs', () => {
    const shapes: CarShape[] = ['coaster', 'junior', 'loco', 'mouse', 'ghost', 'kart', 'log', 'raft', 'inverted', 'bobsled', 'monorail', ...NEW_SHAPES];
    const logs = shapes.map((shape) => {
      const r = recorder();
      paintCar(r.ctx, shape, 0.4, 0, '#d9383b', true);
      return r.ops.join(';');
    });
    expect(new Set(logs).size).toBe(shapes.length);
    for (const shape of NEW_SHAPES) {
      if (shape === 'gondola') continue;
      const a = recorder();
      const b = recorder();
      paintCar(a.ctx, shape, 0.4, 0, '#d9383b', true);
      paintCar(b.ctx, shape, 0.4, 0, '#d9383b', false);
      expect(a.ops.join(';'), shape).not.toBe(b.ops.join(';'));
    }
  });

  it('the car colour reaches the picture (the cars colour row works)', () => {
    for (const shape of NEW_SHAPES) {
      const a = recorder();
      const b = recorder();
      paintCar(a.ctx, shape, 0.4, 0, '#d9383b', true);
      paintCar(b.ctx, shape, 0.4, 0, '#3d9be0', true);
      expect(a.ops.join(';'), shape).not.toBe(b.ops.join(';'));
    }
  });

  it('flying cars and gondolas hang from a rail HANG_M above; riders sit in the cabin and under the shell', () => {
    for (const shape of ['flying', 'gondola'] as const) {
      const r = recorder();
      paintCar(r.ctx, shape, 0.4, 0, '#d9383b', true);
      expect(Math.min(...r.pts.map(([, y]) => y)), shape).toBeLessThan(-(HANG_M - 0.3) * PX_Z);
    }
    const g = carDims('gondola', true);
    expect(riderHeightM('gondola', g)).toBeGreaterThan(g.h0);
    expect(riderHeightM('gondola', g)).toBeLessThan(g.h1);
    const f = carDims('flying', true);
    expect(riderHeightM('flying', f)).toBeLessThan(f.h1);
    expect(riderHeightM('coaster', carDims('coaster', true))).toBe(carDims('coaster', true).h1 + 0.3);
  });
});
