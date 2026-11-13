/**
 * A fake canvas for running the whole renderer in Node (not a test file). Every context call is counted;
 * `drawImage` and `rect` destinations are kept so tests can check them. `install()` puts the class in
 * `globalThis.OffscreenCanvas` (sprite and chunk images), `make()` gives the on-screen canvas.
 */

export interface DrawCall {
  image: FakeCanvas;
  /** Destination rectangle in device px. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Source rectangle of a 9-argument call (absent for the 5-argument form). */
  src?: { x: number; y: number; w: number; h: number };
}

export class FakeCanvas {
  static created = 0;
  readonly id: number;
  width: number;
  height: number;
  readonly dataset: Record<string, string> = {};
  readonly calls = new Map<string, number>();
  readonly draws: DrawCall[] = [];
  readonly rects: Array<{ x: number; y: number; w: number; h: number; fill: string }> = [];
  nonFinite = 0;
  private readonly state: Record<string, unknown> = { fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, lineWidth: 1 };

  constructor(w = 300, h = 150) {
    this.width = w;
    this.height = h;
    this.id = ++FakeCanvas.created;
  }

  reset(): void {
    this.calls.clear();
    this.draws.length = 0;
    this.rects.length = 0;
    this.nonFinite = 0;
  }

  count(name: string): number {
    return this.calls.get(name) ?? 0;
  }

  getContext(): unknown {
    const self = this;
    const state = this.state;
    const check = (args: unknown[]): void => {
      for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) self.nonFinite++;
    };
    return new Proxy(state, {
      get(target, prop: string) {
        if (prop === 'canvas') return self;
        if (prop in target) return target[prop];
        return (...args: unknown[]) => {
          self.calls.set(prop, (self.calls.get(prop) ?? 0) + 1);
          check(args);
          if (prop === 'drawImage') {
            const n = args.length;
            const img = args[0] as FakeCanvas;
            const [x, y, w, h] = (n === 9 ? args.slice(5, 9) : args.slice(1, 5)) as number[];
            const d: DrawCall = { image: img, x: x as number, y: y as number, w: w as number, h: h as number };
            if (n === 9) {
              const [sx, sy, sw, sh] = args.slice(1, 5) as number[];
              d.src = { x: sx as number, y: sy as number, w: sw as number, h: sh as number };
            }
            self.draws.push(d);
          } else if (prop === 'rect') {
            const [x, y, w, h] = args as number[];
            self.rects.push({ x: x as number, y: y as number, w: w as number, h: h as number, fill: String(state.fillStyle) });
          } else if (prop === 'measureText') {
            return { width: 0 };
          } else if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') {
            return { addColorStop: () => undefined, setTransform: () => undefined };
          } else if (prop === 'getImageData') {
            return { data: new Uint8ClampedArray(4) };
          }
          return undefined;
        };
      },
      set(target, prop: string, value: unknown) {
        target[prop] = value;
        return true;
      },
    });
  }
}

export function install(): void {
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = FakeCanvas;
}

export function make(w: number, h: number): FakeCanvas {
  return new FakeCanvas(w, h);
}
