/**
 * A fake Canvas 2D context that records every call and the extent of every point drawn (not a test file).
 * Art must not use transforms, so recorded points are art coordinates around the anchor.
 */
import type { Ctx } from '../../../../src/render/sprites/shapes';

export interface Extent {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export class Recorder {
  readonly ops: string[] = [];
  readonly extent: Extent = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  nonFinite = 0;
  transforms = 0;
  fills = 0;

  point(x: number, y: number, r = 0): void {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r)) {
      this.nonFinite++;
      return;
    }
    this.extent.left = Math.min(this.extent.left, x - r);
    this.extent.right = Math.max(this.extent.right, x + r);
    this.extent.top = Math.min(this.extent.top, y - r);
    this.extent.bottom = Math.max(this.extent.bottom, y + r);
  }

  /** A context whose drawing calls land in this recorder. */
  ctx(): Ctx {
    const rec = this;
    const r = (n: number): string => (Number.isFinite(n) ? n.toFixed(2) : String(n));
    const log = (name: string, args: unknown[]): void => {
      rec.ops.push(`${name}(${args.map((a) => (typeof a === 'number' ? r(a) : String(a))).join(',')})`);
    };
    const state: Record<string, unknown> = {};
    const methods: Record<string, (...a: number[]) => unknown> = {
      moveTo: (x, y) => rec.point(x as number, y as number),
      lineTo: (x, y) => rec.point(x as number, y as number),
      arc: (x, y, rad) => rec.point(x as number, y as number, rad as number),
      ellipse: (x, y, rx, ry, rot) => {
        // Bounding box of the (possibly rotated) ellipse.
        const a = (rot as number | undefined) ?? 0;
        const hw = Math.hypot((rx as number) * Math.cos(a), (ry as number) * Math.sin(a));
        const hh = Math.hypot((rx as number) * Math.sin(a), (ry as number) * Math.cos(a));
        rec.point((x as number) - hw, (y as number) - hh);
        rec.point((x as number) + hw, (y as number) + hh);
      },
      arcTo: (x1, y1, x2, y2) => {
        rec.point(x1 as number, y1 as number);
        rec.point(x2 as number, y2 as number);
      },
      quadraticCurveTo: (a, b, x, y) => {
        rec.point(a as number, b as number);
        rec.point(x as number, y as number);
      },
      bezierCurveTo: (a, b, c, d, x, y) => {
        rec.point(a as number, b as number);
        rec.point(c as number, d as number);
        rec.point(x as number, y as number);
      },
      rect: (x, y, w, h) => {
        rec.point(x as number, y as number);
        rec.point((x as number) + (w as number), (y as number) + (h as number));
      },
      fillRect: (x, y, w, h) => {
        rec.fills++;
        rec.point(x as number, y as number);
        rec.point((x as number) + (w as number), (y as number) + (h as number));
      },
      strokeRect: (x, y, w, h) => {
        rec.point(x as number, y as number);
        rec.point((x as number) + (w as number), (y as number) + (h as number));
      },
      fill: () => {
        rec.fills++;
      },
      translate: () => {
        rec.transforms++;
      },
      rotate: () => {
        rec.transforms++;
      },
      scale: () => {
        rec.transforms++;
      },
      transform: () => {
        rec.transforms++;
      },
      setTransform: () => {
        rec.transforms++;
      },
      createLinearGradient: () => ({ addColorStop: () => undefined }),
      createRadialGradient: () => ({ addColorStop: () => undefined }),
      measureText: () => ({ width: 0 }),
    };
    return new Proxy(state, {
      get(target, prop: string) {
        if (prop in methods) {
          return (...args: number[]) => {
            log(prop, args);
            return (methods[prop] as (...a: number[]) => unknown)(...args);
          };
        }
        if (prop in target) return target[prop];
        // Any other method (beginPath, closePath, stroke, save, restore, fillText, …): record only.
        return (...args: unknown[]) => log(prop, args);
      },
      set(target, prop: string, value: unknown) {
        target[prop] = value;
        rec.ops.push(`${prop}=${String(value)}`);
        return true;
      },
    }) as unknown as Ctx;
  }
}
