/**
 * Batch 5 Task 5 (owner decision D5): chain lifts in the realistic look. A chained piece draws its rail, then its baked
 * chain trough (untinted, frame [piece, t<i>, chain]), then today's moving dashes, restyled darker and thinner and at
 * the realistic rail line's height (CHAIN_LINE_M, the trough's chain). An unchained piece draws its rail only.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { install } from '../fakeCanvas';
import { TrackLayer } from '../../../../src/render/track/layer';
import { projectX, projectY, trackFrame, viewFrame } from '../../../../src/render/track/project';
import { CHAIN_LINE_M } from '../../../../src/render/real/trackChain';
import { setStepPx } from '../../../../src/render/heightStep';
import { REAL_STEP_PX } from '../../../../src/render/artStyle';
import { buildPerfScene } from '../../../perf/scenes';
import type { RealLook } from '../../../../src/render/real/look';

beforeAll(() => {
  install();
  vi.stubEnv('VITE_ART', 'real');
  setStepPx(REAL_STEP_PX);
});
afterAll(() => {
  vi.unstubAllEnvs();
  setStepPx(8);
});

/** A context that logs every call in order (drawImage by its image's name). */
function logCtx(names: Map<unknown, string>) {
  const log: { op: string; args: unknown[]; lineWidth: number; dash: number; stroke: string }[] = [];
  const st = { lineWidth: 1, strokeStyle: '#000', dash: 0 };
  const ctx = new Proxy(st as Record<string, unknown>, {
    get(t, p: string) {
      if (p in t) return t[p];
      return (...a: unknown[]) => {
        if (p === 'setLineDash') st.dash = (a[0] as number[]).length;
        log.push({ op: p === 'drawImage' ? `draw:${names.get(a[0]) ?? '?'}` : p, args: a, lineWidth: st.lineWidth, dash: st.dash, stroke: String(st.strokeStyle) });
      };
    },
    set(t, p: string, v) { t[p] = v; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}

describe('chain lifts (realistic, Task 5)', () => {
  const world = buildPerfScene('coaster');
  const rideId = world.state.rides.find((r) => r.kind === 'track')!.id;
  const data = world.state.track.rides[String(rideId)]!;
  const img = (n: string) => ({ image: { n }, w: 4, h: 4, ox: 2, oy: 2, scale: 2, sx: 0, sy: 0 });
  const rail = img('rail'), trough = img('trough'), sup = img('support');
  const names = new Map<unknown, string>([[rail.image, 'rail'], [trough.image, 'trough'], [sup.image, 'support']]);
  const parts: string[] = [];
  const look = {
    rail: () => rail, support: () => sup, car: () => undefined,
    railPart: (_t: string, _p: string, _i: number, _h: number, part: string) => (parts.push(part), part === 'chain' ? trough : undefined),
  } as unknown as RealLook;
  const collect = () => {
    const layer = new TrackLayer();
    const items: { sub: number; ref: number }[] = [];
    layer.collect(world, { push: (_k, ref, sub) => items.push({ ref, sub }) }, { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 }, 1, 1, 0, 0, 0, 0);
    return { layer, items, slices: (layer as unknown as { slices: { pieceIndex: number; samples: { x: number[]; y: number[]; z: number[]; yaw: number[]; pitch: number[]; bankSin: number[]; bankCos: number[] }; runs: number[] }[] }).slices };
  };

  it('a chained piece draws rail, trough, dashes in that order; an unchained one the rail only', () => {
    const { layer, items, slices } = collect();
    let chained = 0, plain = 0;
    items.forEach((it, n) => {
      if (it.sub !== 0) return;
      const sl = slices[it.ref]!;
      const chain = !!data.pieces[sl.pieceIndex]!.chain;
      const { ctx, log } = logCtx(names);
      parts.length = 0;
      layer.drawItem(ctx, it.ref, 0, look);
      const draws = log.filter((l) => l.op.startsWith('draw:')).map((l) => l.op.slice(5)).filter((x) => x !== 'support');
      if (chain) {
        expect(draws).toEqual(['rail', 'trough']);
        expect(parts).toEqual(['chain']);
        // the dashes are the next drawable of this slice (pushed right after it, same sort key)
        expect(items[n + 1]).toEqual({ ref: it.ref, sub: 1 });
        const d = logCtx(names);
        layer.drawItem(d.ctx, it.ref, 1, look);
        expect(d.log.filter((l) => l.op === 'stroke').length).toBe(2);
        chained++;
      } else {
        expect(draws).toEqual(['rail']);
        expect(parts).toEqual([]);
        expect(items.some((x) => x.ref === it.ref && x.sub === 1)).toBe(false);
        plain++;
      }
    });
    expect(chained).toBeGreaterThan(5);
    expect(plain).toBeGreaterThan(5);
  });

  it('the dashes run at the realistic rail line (the trough\'s chain), darker and thinner than today\'s', () => {
    const { layer, items, slices } = collect();
    const it = items.find((x) => x.sub === 1)!;
    const sl = slices[it.ref]!;
    const real = logCtx(names);
    layer.drawItem(real.ctx, it.ref, 1, look);
    const today = logCtx(names);
    layer.drawItem(today.ctx, it.ref, 1, undefined);
    const f = viewFrame(0, world.state.map.width, world.state.map.height);
    const k = sl.runs[0]!;
    const fr = trackFrame(sl.samples.yaw[k]!, sl.samples.pitch[k]!, sl.samples.bankSin[k]!, sl.samples.bankCos[k]!, new Float64Array(9));
    const wx = sl.samples.x[k]! + fr[6]! * CHAIN_LINE_M, wy = sl.samples.y[k]! + fr[7]! * CHAIN_LINE_M, wz = sl.samples.z[k]! + fr[8]! * CHAIN_LINE_M;
    const move = real.log.find((l) => l.op === 'moveTo')!;
    expect(move.args[0]).toBeCloseTo(projectX(wx, wy, f), 6);
    expect(move.args[1]).toBeCloseTo(projectY(wx, wy, wz, f), 6);
    const strokes = (l: typeof real.log) => l.filter((x) => x.op === 'stroke');
    const [rBase, rDash] = strokes(real.log), [tBase, tDash] = strokes(today.log);
    expect(rBase!.lineWidth).toBeLessThan(tBase!.lineWidth);
    expect(rDash!.lineWidth).toBeLessThan(tDash!.lineWidth);
    expect(rDash!.dash).toBe(2);
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    expect(lum(rDash!.stroke)).toBeLessThan(lum(tDash!.stroke));
    expect(lum(rBase!.stroke)).toBeLessThanOrEqual(lum(tBase!.stroke));
  });
});
