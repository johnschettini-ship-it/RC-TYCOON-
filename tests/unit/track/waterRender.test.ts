/**
 * Water ride art (phase-2 §4.14, Phase 4 §4.4): channel slices, boats, the rippling surface overlay, spray, and the
 * picker preview. Painting runs against a recording 2D context (Node has no canvas). Owner: W3-C.
 */
import { describe, expect, it } from 'vitest';
import { getTrackPieceDef, getTrackTypeDef, WATER_PIECES, WATER_TRACK_TYPES } from '../../../src/data/track';
import { buildRideSlices, KIND_TRACK, paintSlice, TrackLayer, type DrawSink } from '../../../src/render/track/layer';
import { CAR_BOUNDS, carDims, LOOKS, lookFor, paintCar, paintRun, Projector } from '../../../src/render/track/paint';
import { previewPieces } from '../../../src/render/track/preview';
import { viewFrame } from '../../../src/render/track/project';
import { executeCommand } from '../../../src/sim/commands';
import { pieceWorldSamples } from '../../../src/sim/rides/track/api';
import { jointsEqual, pieceEntryJoint, pieceExitJoint } from '../../../src/sim/rides/track/geometry';
import type { TrackDir, TrackPieceInstance } from '../../../src/sim/rides/track/types';
import { makeTestWorld, runTicks } from '../../helpers/world';
import { addAll, dataOf, EAST, expectOk, place } from './helpers';

/** A 2D context that records every point it is asked to draw and every call by name. */
function recorder(): { ctx: CanvasRenderingContext2D; pts: Array<[number, number]>; calls: string[] } {
  const pts: Array<[number, number]> = [];
  const calls: string[] = [];
  const target: Record<string, unknown> = {
    moveTo: (x: number, y: number) => pts.push([x, y]),
    lineTo: (x: number, y: number) => pts.push([x, y]),
    arc: (x: number, y: number, r: number) => pts.push([x - r, y - r], [x + r, y + r]),
    ellipse: (x: number, y: number, rx: number, ry: number) => pts.push([x - rx, y - ry], [x + rx, y + ry]),
    fillRect: (x: number, y: number, w: number, h: number) => pts.push([x, y], [x + w, y + h]),
  };
  const ctx = new Proxy(target, {
    get: (t, k: string) => {
      if (k in t) return t[k];
      return () => {
        calls.push(k);
      };
    },
    set: (t, k: string, v) => {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, pts, calls };
}

function within(pts: ReadonlyArray<[number, number]>, b: { left: number; right: number; top: number; bottom: number }, pad = 3): void {
  for (const [x, y] of pts) {
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    expect(x).toBeGreaterThanOrEqual(b.left - pad);
    expect(x).toBeLessThanOrEqual(b.right + pad);
    expect(y).toBeGreaterThanOrEqual(b.top - pad);
    expect(y).toBeLessThanOrEqual(b.bottom + pad);
  }
}

const piece = (defId: string, dir: TrackDir, z = 14): TrackPieceInstance => ({ defId, x: 20, y: 20, z, dir, chain: false, brakeSpeed: null, cost: 0 });

describe('water channel painting', () => {
  it('flume and rapids looks are channels; rail looks are not', () => {
    expect(LOOKS.flume.channel).toBeGreaterThan(0);
    expect(LOOKS.rapids.channel).toBeGreaterThan(LOOKS.flume.channel);
    for (const k of ['steel', 'wood', 'narrow', 'tunnel', 'kart'] as const) expect(LOOKS[k].channel).toBe(0);
    expect(lookFor(getTrackTypeDef('log_flume')!)).toBe(LOOKS.flume);
    expect(lookFor(getTrackTypeDef('rapids_raft')!)).toBe(LOOKS.rapids);
  });

  it('every water piece paints a finite channel in 4 directions and 4 view rotations', () => {
    for (const def of WATER_PIECES) {
      const type = getTrackTypeDef(def.set === 'flume' ? 'log_flume' : 'rapids_raft')!;
      const col = { track: '#9a6b3f', supports: '#9a6b3f', cars: '#9a6b3f' };
      for (const dir of [0, 1, 2, 3] as TrackDir[]) {
        const s = pieceWorldSamples(piece(def.id, dir));
        for (const rot of [0, 1, 2, 3]) {
          const r = recorder();
          paintRun(r.ctx, new Projector(viewFrame(rot, 64, 64), 0, 0), lookFor(type), col, s, 0, s.n - 1, { special: def.special, chain: false, conveyor: def.water?.drive === 'conveyor' });
          expect(r.pts.length).toBeGreaterThan(8);
          for (const [x, y] of r.pts) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        }
      }
    }
  });

  it('a built flume slices into channel tiles that paint inside their bounds; lifts carry conveyor cleats', () => {
    const w = makeTestWorld();
    const id = place(w, 'log_flume', 10, 10, EAST);
    addAll(w, id, ['flume_station', 'flume_lift', 'flume_lift', 'flume_lift', 'flume_straight', 'flume_turn_small_r', 'flume_drop', 'flume_splashdown']);
    const f = viewFrame(0, 64, 64);
    const slices = buildRideSlices(w, id, f);
    expect(slices.length).toBe(10);
    expect(slices.every((sl) => sl.water)).toBe(true);
    expect(slices.filter((sl) => sl.conveyor).map((sl) => sl.x)).toEqual([12, 13, 14]);
    expect(slices.filter((sl) => sl.special === 'splashdown')).toHaveLength(2);
    for (const sl of slices) {
      const r = recorder();
      paintSlice(r.ctx, sl, f);
      expect(r.pts.length).toBeGreaterThan(0);
      within(r.pts, sl.bounds);
    }
  });
});

describe('boats', () => {
  it('logs and rafts stay inside the car sprite bounds for every yaw and pitch', () => {
    for (const shape of ['log', 'raft'] as const) {
      expect(carDims(shape, true).a).toBeGreaterThan(1);
      for (let ys = 0; ys < 16; ys++) {
        for (let ps = 0; ps < 24; ps += 3) {
          const r = recorder();
          paintCar(r.ctx, shape, (ys / 16) * Math.PI * 2, (ps / 24) * Math.PI * 2, '#9a6b3f', true);
          expect(r.pts.length).toBeGreaterThan(0);
          within(r.pts, CAR_BOUNDS, 0);
        }
      }
    }
    expect(WATER_TRACK_TYPES.map((t) => t.render.car)).toEqual(['log', 'raft']);
  });
});

describe('track layer: water overlay and spray', () => {
  function collect(layer: TrackLayer, world: ReturnType<typeof makeTestWorld>): Array<{ ref: number; sub: number; layer: number }> {
    const items: Array<{ ref: number; sub: number; layer: number }> = [];
    const sink: DrawSink = {
      push(kind, ref, sub, _ax, _ay, _skey, _depth, _z, l) {
        expect(kind).toBe(KIND_TRACK);
        items.push({ ref, sub, layer: l });
      },
    };
    layer.collect(world, sink, { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 }, 1, 1, 0, 0, 0, 0);
    return items;
  }

  it('each water slice gets a ripple overlay that animates by tick and draws without allocating dash arrays', () => {
    const w = makeTestWorld();
    const id = place(w, 'rapids_raft', 10, 10, EAST);
    addAll(w, id, ['rapids_straight', 'rapids_rough', 'rapids_whirlpool']);
    const layer = new TrackLayer();
    const items = collect(layer, w);
    const slices = items.filter((i) => i.sub === 0);
    const water = items.filter((i) => i.sub === 4);
    expect(slices).toHaveLength(4);
    expect(water.map((i) => i.ref)).toEqual(slices.map((i) => i.ref));
    const offsets: number[] = [];
    let dash: unknown = null;
    for (let t = 0; t < 2; t++) {
      const r = recorder();
      const seen: number[] = [];
      const ctx = new Proxy(r.ctx as unknown as Record<string, unknown>, {
        set: (o, k: string, v) => {
          if (k === 'lineDashOffset' && v !== 0) seen.push(v as number);
          o[k] = v;
          return true;
        },
        get: (o, k: string) => {
          if (k === 'setLineDash') {
            return (d: unknown) => {
              if (Array.isArray(d) && d.length === 2) {
                if (dash === null) dash = d;
                expect(d).toBe(dash);
              }
            };
          }
          return o[k];
        },
      }) as unknown as CanvasRenderingContext2D;
      layer.drawItem(ctx, water[0]!.ref, 4);
      expect(r.pts.length).toBeGreaterThan(0);
      offsets.push(seen[0]!);
      runTicks(w, 3);
      collect(layer, w);
    }
    expect(offsets[0]).not.toBe(offsets[1]);
  });

  it('a boat on the splashdown at speed throws spray; a boat in the station does not', () => {
    const w = makeTestWorld();
    const id = place(w, 'log_flume', 10, 10, EAST);
    addAll(w, id, ['flume_station', 'flume_lift', 'flume_lift', 'flume_lift', 'flume_straight', 'flume_turn_small_r', 'flume_drop', 'flume_splashdown', 'flume_turn_small_r', ...Array(6).fill('flume_straight'), 'flume_turn_small_r', 'flume_straight', 'flume_straight', 'flume_straight', 'flume_turn_small_r']);
    expect(dataOf(w, id).circuitClosed).toBe(true);
    expectOk(executeCommand(w, { type: 'startTestRun', rideId: id }));
    const layer = new TrackLayer();
    const cars = (layer as unknown as { cars: { n: number; spray: Uint8Array } }).cars;
    collect(layer, w);
    expect(cars.n).toBe(1);
    expect(cars.spray[0]).toBe(0);
    let sprayed = false;
    for (let k = 0; k < 2000 && !sprayed; k++) {
      runTicks(w, 1);
      collect(layer, w);
      if (cars.n === 1 && cars.spray[0] === 1) sprayed = true;
    }
    expect(sprayed).toBe(true);
  });
});

describe('picker preview', () => {
  it('water previews use pieces of the type set that join end to end', () => {
    for (const t of WATER_TRACK_TYPES) {
      const pieces = previewPieces(t.id);
      expect(pieces.length).toBeGreaterThan(4);
      for (const p of pieces) expect(getTrackPieceDef(p.defId)?.set).toBe(t.pieceSet);
      for (let i = 1; i < pieces.length; i++) expect(jointsEqual(pieceExitJoint(pieces[i - 1]!), pieceEntryJoint(pieces[i]!))).toBe(true);
    }
  });
});
