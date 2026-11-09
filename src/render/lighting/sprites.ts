/**
 * Cached light-pass sprites (Phase 4 §4.7): the warm radial light pool, the emissive bulb glow, and the hatch
 * patterns of the Light overlay bands. Built once per layer through a canvas factory, so tests can inject one.
 * Owner: W3-F.
 */

/** The part of a 2D context the light pass uses (HTML or offscreen canvas). */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): Ctx2D | null;
}

export type CanvasFactory = (w: number, h: number) => CanvasLike | null;

/** A canvas in the browser (DOM or offscreen); null where there is none (unit tests in Node). */
export const defaultCanvasFactory: CanvasFactory = (w, h) => {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c as unknown as CanvasLike;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h) as unknown as CanvasLike;
  return null;
};

export const GLOW_SIZE = 128;
export const BULB_SIZE = 32;

/** Warm light pool: drawn with `lighter` on the ambient fill, so its centre reaches white. */
export function makeGlowSprite(make: CanvasFactory): CanvasLike | null {
  const c = make(GLOW_SIZE, GLOW_SIZE);
  const g = c?.getContext('2d');
  if (!c || !g) return null;
  const r = GLOW_SIZE / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255, 214, 150, 1)');
  grad.addColorStop(0.35, 'rgba(255, 196, 120, 0.78)');
  grad.addColorStop(0.7, 'rgba(255, 176, 96, 0.3)');
  grad.addColorStop(1, 'rgba(255, 160, 80, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
  return c;
}

/** Emissive bulb: a white-hot core with a warm halo, drawn after the multiply so it glows. */
export function makeBulbSprite(make: CanvasFactory): CanvasLike | null {
  const c = make(BULB_SIZE, BULB_SIZE);
  const g = c?.getContext('2d');
  if (!c || !g) return null;
  const r = BULB_SIZE / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255, 252, 236, 1)');
  grad.addColorStop(0.18, 'rgba(255, 240, 190, 0.95)');
  grad.addColorStop(0.45, 'rgba(255, 196, 110, 0.4)');
  grad.addColorStop(1, 'rgba(255, 170, 80, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, BULB_SIZE, BULB_SIZE);
  return c;
}

/** Hatch tile for an overlay band: dense diagonal lines (Dark), sparse dots (Lit). */
export function makeHatchTile(make: CanvasFactory, kind: 'dense' | 'sparse'): CanvasLike | null {
  const size = kind === 'dense' ? 6 : 8;
  const c = make(size, size);
  const g = c?.getContext('2d');
  if (!c || !g) return null;
  if (kind === 'dense') {
    g.strokeStyle = 'rgba(200, 210, 255, 0.55)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, size);
    g.lineTo(size, 0);
    g.moveTo(-1, 1);
    g.lineTo(1, -1);
    g.moveTo(size - 1, size + 1);
    g.lineTo(size + 1, size - 1);
    g.stroke();
  } else {
    g.fillStyle = 'rgba(120, 72, 0, 0.45)';
    g.fillRect(3, 3, 2, 2);
  }
  return c;
}
