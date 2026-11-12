/** Phase 8b stage 0b test (never merged): the stage 0 Pixel track slice (cut rule), moved out of `track/layer.ts`. */
import type { SliceRec } from '../../track/layer';
import { paintRun, paintSupport, Projector, type WorldSamples } from '../../track/paint';
import type { ViewFrame } from '../../track/project';
import type { PixelSurface } from '../surface';

/** Pixel: each run [k0, k1] widened to [k0 − 1, k1 + 1] on its cut sides (a side where the piece goes on). */
export function widenRuns(s: WorldSamples, runs: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < runs.length; i += 2) {
    const k0 = runs[i] as number;
    const k1 = runs[i + 1] as number;
    out.push(k0 > 0 ? k0 - 1 : k0, k1 < s.n - 1 ? k1 + 1 : k1);
  }
  return out;
}

/** Pixel slice: the runs as today, then the extra samples [k0 − 1, k0] and [k1, k1 + 1] with `cut(true)`. */
export function paintSlicePixel(ctx: PixelSurface, sl: SliceRec, f: ViewFrame, extras: boolean): void {
  const c = ctx as unknown as CanvasRenderingContext2D;
  const P = new Projector(f, sl.ax, sl.ay);
  if (sl.support) paintSupport(c, P, sl.supportStyle, sl.colours.supports, sl.support.wx, sl.support.wy, sl.support.yaw, sl.ground, sl.support.top);
  const opt = { special: sl.special, chain: false, conveyor: sl.conveyor };
  const n = sl.samples.n;
  for (let i = 0; i < sl.runs.length; i += 2) {
    const k0 = sl.runs[i] as number;
    const k1 = sl.runs[i + 1] as number;
    paintRun(c, P, sl.look, sl.colours, sl.samples, k0, k1, opt);
    if (!extras) continue;
    // The extra samples share their points with the next slice (rule 3), so two slices give the same pixels there.
    ctx.cut(true);
    if (k0 > 0) paintRun(c, P, sl.look, sl.colours, sl.samples, k0 - 1, k0, opt);
    if (k1 < n - 1) paintRun(c, P, sl.look, sl.colours, sl.samples, k1, k1 + 1, opt);
    ctx.cut(false);
  }
}
