/**
 * Phase 6 track art (phase-6-polish.md §4.5): the corkscrew and the helix paint in every direction, view rotation, and
 * rail style; the Inverted Coaster draws its rail above the hanging cars on arm supports; the Bobsled Run is a dry ice
 * trough (no water overlay); the Monorail runs on a beam; the new car shapes stay in the car sprite bounds at any
 * yaw, pitch, and roll; cars roll with the track; the picker previews use buildable pieces.
 */
import { describe, expect, it } from 'vitest';
import { ALL_TRACK_TYPES, EXTRA_PIECES, getTrackPieceDef, getTrackTypeDef } from '../../../../src/data/track';
import { paletteColour } from '../../../../src/render/track/colours';
import { buildRideSlices, paintSlice, TrackLayer, type DrawSink } from '../../../../src/render/track/layer';
import { CAR_BOUNDS, HANG_M, lookFor, paintCar, paintRun, paintSupport, Projector } from '../../../../src/render/track/paint';
import { drawTrackPreview, previewPieces } from '../../../../src/render/track/preview';
import { PX_Z, projectY, rollStep, viewFrame } from '../../../../src/render/track/project';
import { pieceWorldSamples } from '../../../../src/sim/rides/track/api';
import type { TrackDir, TrackPieceInstance } from '../../../../src/sim/rides/track/types';
import { makeTestWorld, runTicks } from '../../../helpers/world';
import { addAll, dataOf, EAST, place, type PieceSpec } from '../../track/helpers';
import { INVERTED, MONORAIL } from '../../track/phase6Rides.test';
import { executeCommand } from '../../../../src/sim/commands';

function recorder(): { ctx: CanvasRenderingContext2D; pts: Array<[number, number]>; ops: string[] } {
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

function within(pts: ReadonlyArray<[number, number]>, b: { left: number; right: number; top: number; bottom: number }, pad = 3): void {
  for (const [x, y] of pts) {
    expect(x).toBeGreaterThanOrEqual(b.left - pad);
    expect(x).toBeLessThanOrEqual(b.right + pad);
    expect(y).toBeGreaterThanOrEqual(b.top - pad);
    expect(y).toBeLessThanOrEqual(b.bottom + pad);
  }
}

const piece = (defId: string, dir: TrackDir, z = 10): TrackPieceInstance => ({ defId, x: 20, y: 20, z, dir, chain: false, brakeSpeed: null, cost: 0 });
const RAIL_TYPES = ALL_TRACK_TYPES.filter((t) => t.pieceSet === 'rail');

describe('painting the Phase 6 pieces', () => {
  it('every piece, direction, view rotation, and rail style paints finite points', () => {
    for (const def of EXTRA_PIECES) {
      for (const dir of [0, 1, 2, 3] as TrackDir[]) {
        const s = pieceWorldSamples(piece(def.id, dir));
        for (const rot of [0, 1, 2, 3]) {
          const P = new Projector(viewFrame(rot, 64, 64), 0, 0);
          for (const type of RAIL_TYPES) {
            const col = { track: paletteColour(type.render.colours.track), supports: paletteColour(type.render.colours.supports), cars: paletteColour(type.render.colours.cars) };
            const r = recorder();
            paintSupport(r.ctx, P, type.render.supports, col.supports, s.x[0]!, s.y[0]!, s.yaw[0]!, 0, 20);
            paintRun(r.ctx, P, lookFor(type), col, s, 0, s.n - 1, { special: def.special, chain: false });
            expect(r.pts.length).toBeGreaterThan(0);
            for (const [x, y] of r.pts) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
          }
        }
      }
    }
  }, 30_000);

  it('the corkscrew rail spirals: the drawn rails rise over the riders and come back down', () => {
    const s = pieceWorldSamples(piece('corkscrew_right', 0, 0));
    const mid = Math.floor(s.n / 2);
    expect(s.z[mid]).toBeGreaterThan(3.5);
    expect(s.bankCos[mid]).toBeLessThan(-0.99);
  });
});

describe('Phase 6 rail styles', () => {
  it('Inverted Coaster: rails and spine run 2.4 m above the riders, held by arm supports', () => {
    const type = getTrackTypeDef('inverted_coaster')!;
    const look = lookFor(type);
    expect([type.render.rail, type.render.supports, type.render.car]).toEqual(['inverted', 'arm', 'inverted']);
    expect(look.lift).toBe(HANG_M);
    const f = viewFrame(0, 64, 64);
    const P = new Projector(f, 0, 0);
    const s = pieceWorldSamples(piece('straight', 0));
    const r = recorder();
    paintRun(r.ctx, P, look, { track: '#d9383b', supports: '#888888', cars: '#3d9be0' }, s, 0, s.n - 1, { special: null, chain: false });
    // Every rail point lies well above the sample line (smaller screen y than its lowest projected point).
    const last = s.n - 1;
    const sampleY = projectY(s.x[last]!, s.y[last]!, s.z[last]!, f);
    for (const [, y] of r.pts) expect(y).toBeLessThan(sampleY - (HANG_M - 1) * PX_Z);
    // The arm support's post stands beside the track and its arm reaches the rail.
    const a = recorder();
    paintSupport(a.ctx, P, 'arm', '#888888', 82, 82, 0, 8, 20);
    const xs = a.pts.map(([x]) => x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(10);
  });

  it('Bobsled Run: an ice trough with no water ripples; Monorail: a beam, no rails', () => {
    const w = makeTestWorld();
    const bob = place(w, 'bobsled_run', 6, 4, EAST);
    addAll(w, bob, ['station', 'straight', 'straight'] as PieceSpec[]);
    const mono = place(w, 'monorail', 6, 20, EAST);
    addAll(w, mono, ['station', 'straight'] as PieceSpec[]);
    const f = viewFrame(0, w.state.map.width, w.state.map.height);
    const bs = buildRideSlices(w, bob, f);
    expect(bs.length).toBeGreaterThan(0);
    for (const sl of bs) expect(sl.water).toBe(false);
    expect(lookFor(getTrackTypeDef('bobsled_run')!).trough).toBeDefined();
    const ms = buildRideSlices(w, mono, f);
    for (const sl of ms) {
      const r = recorder();
      paintSlice(r.ctx, sl, f);
      within(r.pts, sl.bounds);
    }
    expect(lookFor(getTrackTypeDef('monorail')!).beam).toBeGreaterThan(0);
  });

  it('a whole Inverted Coaster and Monorail paint inside their slice bounds', () => {
    for (const [typeId, x, y, pieces] of [['inverted_coaster', 4, 2, INVERTED], ['monorail', 4, 2, MONORAIL]] as const) {
      const w = makeTestWorld();
      const id = place(w, typeId, x, y, EAST);
      addAll(w, id, pieces as PieceSpec[]);
      for (const rot of [0, 1, 2, 3]) {
        const f = viewFrame(rot, w.state.map.width, w.state.map.height);
        for (const sl of buildRideSlices(w, id, f)) {
          const r = recorder();
          paintSlice(r.ctx, sl, f);
          within(r.pts, sl.bounds);
        }
      }
    }
  });
});

describe('Phase 6 cars', () => {
  it('every new shape stays inside the car sprite bounds at any yaw, pitch, and roll', () => {
    for (const shape of ['inverted', 'bobsled', 'monorail'] as const) {
      for (let ys = 0; ys < 16; ys += 3) {
        for (let ps = 0; ps < 24; ps += 5) {
          for (let rs = 0; rs < 16; rs += 4) {
            for (const front of [true, false]) {
              const r = recorder();
              const roll = (rs / 16) * Math.PI * 2;
              paintCar(r.ctx, shape, (ys / 16) * Math.PI * 2, (ps / 24) * Math.PI * 2, '#d9383b', front, Math.sin(roll), Math.cos(roll));
              within(r.pts, CAR_BOUNDS, 0);
            }
          }
        }
      }
    }
  });

  it('the hanging car reaches up to its rail; the shapes look different', () => {
    const logs = ['inverted', 'bobsled', 'monorail', 'coaster'].map((shape) => {
      const r = recorder();
      paintCar(r.ctx, shape as 'coaster', 0.4, 0, '#d9383b', true);
      return { ops: r.ops.join(';'), top: Math.min(...r.pts.map(([, y]) => y)) };
    });
    expect(new Set(logs.map((l) => l.ops)).size).toBe(4);
    expect(logs[0]!.top).toBeLessThan(-(HANG_M - 0.3) * PX_Z);
  });

  it('cars roll with the track: a rolled car paints differently; roll steps are 16 per turn', () => {
    const a = recorder();
    const b = recorder();
    paintCar(a.ctx, 'coaster', 0.3, 0, '#d9383b', true);
    paintCar(b.ctx, 'coaster', 0.3, 0, '#d9383b', true, Math.sin(Math.PI), Math.cos(Math.PI));
    expect(a.ops.join(';')).not.toBe(b.ops.join(';'));
    expect(rollStep(0, 1)).toBe(0);
    expect(rollStep(1, 0)).toBe(4);
    expect(rollStep(0, -1)).toBe(8);
    expect(rollStep(-1, 0)).toBe(12);
  });

  it('the track layer draws the trains of an Inverted Coaster in its corkscrew', () => {
    const w = makeTestWorld();
    const id = place(w, 'inverted_coaster', 4, 2, EAST);
    addAll(w, id, INVERTED);
    executeCommand(w, { type: 'startTestRun', rideId: id });
    const layer = new TrackLayer();
    let cars = 0;
    for (let k = 0; k < 900; k += 30) {
      runTicks(w, 30);
      const sink: DrawSink = { push: (_k, _r, sub) => { if (sub === 2) cars++; } };
      layer.collect(w, sink, { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 }, 1, 1, 0, 0, 0, 0);
    }
    expect(cars).toBeGreaterThan(0);
    expect(dataOf(w, id).testRun).not.toBeNull();
  });
});

describe('picker previews', () => {
  it('every rail type previews with pieces it can build; the preview draws without throwing', () => {
    for (const type of RAIL_TYPES) {
      for (const p of previewPieces(type.id)) {
        const def = getTrackPieceDef(p.defId)!;
        expect(type.groups, `${type.id} ${p.defId}`).toContain(def.group);
        expect(type.excludePieces).not.toContain(p.defId);
      }
      const r = recorder();
      drawTrackPreview(r.ctx, type.id, 112, 80);
      expect(r.pts.length).toBeGreaterThan(0);
    }
    expect(previewPieces('inverted_coaster').map((p) => p.defId)).toContain('corkscrew_right');
  });
});
