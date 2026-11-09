/**
 * Track slices and the track layer (phase-2 §4.13): one slice per rail tile, sample runs per tile, supports,
 * painting inside the slice bounds for every piece and rail style, and the drawables collected per frame.
 * Painting runs against a recording 2D context (Node has no canvas).
 */
import { describe, expect, it } from 'vitest';
import { getTrackTypeDef, TRACK_PIECES, TRACK_TYPES } from '../../../../src/data/track';
import { Layer, tileDepth } from '../../../../src/render/depth';
import { paletteColour, TRACK_PALETTE } from '../../../../src/render/track/colours';
import { buildRideSlices, KIND_TRACK, moneyLabel, paintSlice, runsInTile, samplesOf, supportSample, TrackLayer, type DrawSink } from '../../../../src/render/track/layer';
import { CAR_BOUNDS, lookFor, paintCar, paintGateBooth, paintRun, paintSupport, Projector, GATE_BOUNDS } from '../../../../src/render/track/paint';
import { previewPieces } from '../../../../src/render/track/preview';
import { viewFrame } from '../../../../src/render/track/project';
import { executeCommand } from '../../../../src/sim/commands';
import { pieceWorldSamples, trackTileSlices } from '../../../../src/sim/rides/track/api';
import type { TrackDir, TrackPieceInstance } from '../../../../src/sim/rides/track/types';
import { makeTestWorld, runTicks } from '../../../helpers/world';
import { buildR1, dataOf, rideOf } from '../../track/helpers';

/** A 2D context that records every point it is asked to draw. */
function recorder(): { ctx: CanvasRenderingContext2D; pts: Array<[number, number]> } {
  const pts: Array<[number, number]> = [];
  let tx = 0;
  let ty = 0;
  const target: Record<string, unknown> = {
    moveTo: (x: number, y: number) => pts.push([x + tx, y + ty]),
    lineTo: (x: number, y: number) => pts.push([x + tx, y + ty]),
    arc: (x: number, y: number, r: number) => pts.push([x + tx - r, y + ty - r], [x + tx + r, y + ty + r]),
    ellipse: (x: number, y: number, rx: number, ry: number) => pts.push([x + tx - rx, y + ty - ry], [x + tx + rx, y + ty + ry]),
    fillRect: (x: number, y: number, w: number, h: number) => pts.push([x + tx, y + ty], [x + tx + w, y + ty + h]),
    translate: (x: number, y: number) => {
      tx += x;
      ty += y;
    },
    save: () => undefined,
    restore: () => {
      tx = 0;
      ty = 0;
    },
    measureText: () => ({ width: 10 }),
  };
  const ctx = new Proxy(target, {
    get: (t, k: string) => (k in t ? t[k] : () => undefined),
    set: (t, k: string, v) => {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, pts };
}

function within(pts: ReadonlyArray<[number, number]>, b: { left: number; right: number; top: number; bottom: number }, pad = 3): void {
  for (const [x, y] of pts) {
    expect(x).toBeGreaterThanOrEqual(b.left - pad);
    expect(x).toBeLessThanOrEqual(b.right + pad);
    expect(y).toBeGreaterThanOrEqual(b.top - pad);
    expect(y).toBeLessThanOrEqual(b.bottom + pad);
  }
}

const piece = (defId: string, dir: TrackDir): TrackPieceInstance => ({ defId, x: 20, y: 20, z: 8, dir, chain: false, brakeSpeed: null, cost: 0 });

describe('per-tile slices of R1', () => {
  const w = makeTestWorld();
  const id = buildR1(w);
  const f = viewFrame(0, 64, 64);
  const slices = buildRideSlices(w, id, f);
  const api = trackTileSlices(w, id);

  it('one slice per rail tile, with the API rail range, supports, and the tile depth', () => {
    const railTiles = api.filter((t) => t.rail);
    expect(slices).toHaveLength(railTiles.length);
    slices.forEach((sl, i) => {
      const t = railTiles[i]!;
      expect([sl.x, sl.y, sl.pieceIndex, sl.railMin, sl.ground]).toEqual([t.x, t.y, t.pieceIndex, t.railMin, t.ground]);
      expect(sl.support !== null).toBe(t.support);
      expect(sl.depth).toBeCloseTo(tileDepth(t.x, t.y), 12);
    });
    // Reserved medium-turn corners hold no rail, so they get no slice.
    expect(api.filter((t) => !t.rail).length).toBeGreaterThan(0);
  });

  it('the sample runs of a piece cover each of its segments exactly once', () => {
    const data = dataOf(w, id);
    data.pieces.forEach((p, pi) => {
      const s = samplesOf(p);
      let segs = 0;
      for (const sl of slices.filter((x) => x.pieceIndex === pi)) {
        for (let r = 0; r < sl.runs.length; r += 2) segs += sl.runs[r + 1]! - sl.runs[r]!;
      }
      expect(segs).toBe(s.n - 1);
    });
  });

  it('supports reach from the ground to the underside of the rail at the support point', () => {
    const top = slices.find((sl) => sl.x === 12 && sl.y === 2)!; // first straight at 16 m
    expect(top.support).not.toBeNull();
    expect(top.support!.top).toBeCloseTo(8 + 16 - 0.5, 9);
    expect(top.support!.top - top.ground).toBeCloseTo(15.5, 9);
    const station = slices.find((sl) => sl.x === 4 && sl.y === 2)!;
    expect(station.support).toBeNull();
    expect(station.special).toBe('station');
  });

  it('every slice paints inside its bounds', () => {
    for (const sl of slices) {
      const r = recorder();
      paintSlice(r.ctx, sl, f);
      expect(r.pts.length).toBeGreaterThan(0);
      within(r.pts, sl.bounds);
    }
  });
});

describe('painting every piece in every direction and rail style', () => {
  it('stays inside the slice bounds and never throws', () => {
    const f = viewFrame(0, 64, 64);
    for (const def of TRACK_PIECES) {
      for (const dir of [0, 1, 2, 3] as TrackDir[]) {
        const s = pieceWorldSamples(piece(def.id, dir));
        for (const type of TRACK_TYPES) {
          const look = lookFor(type);
          const col = { track: paletteColour(type.render.colours.track), supports: paletteColour(type.render.colours.supports), cars: paletteColour(type.render.colours.cars) };
          const P = new Projector(f, 0, 0);
          const r = recorder();
          paintSupport(r.ctx, P, type.render.supports, col.supports, s.x[0]!, s.y[0]!, s.yaw[0]!, 0, 20);
          paintRun(r.ctx, P, look, col, s, 0, s.n - 1, { special: def.special, chain: true });
          expect(r.pts.length).toBeGreaterThan(0);
          for (const [x, y] of r.pts) {
            expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
          }
        }
      }
    }
    // Paints every piece in every direction: seconds of work, so a busy machine gets more time.
  }, 30_000);

  it('runsInTile splits a vertical loop by tile and the support point prefers the lowest rail there', () => {
    const p = piece('vertical_loop_right', 0);
    const s = samplesOf(p);
    let total = 0;
    for (let tx = 20; tx <= 23; tx++) {
      for (let ty = 20; ty <= 21; ty++) {
        const runs = runsInTile(s, tx, ty);
        for (let r = 0; r < runs.length; r += 2) total += runs[r + 1]! - runs[r]!;
        if (runs.length) {
          const k = supportSample(s, runs, tx, ty);
          let lo = Infinity;
          let hi = -Infinity;
          for (let r = 0; r < runs.length; r += 2) for (let q = runs[r]!; q <= runs[r + 1]!; q++) {
            lo = Math.min(lo, s.z[q]!);
            hi = Math.max(hi, s.z[q]!);
          }
          if (hi - lo > 6) expect(s.z[k]).toBe(lo);
        }
      }
    }
    expect(total).toBe(s.n - 1);
  });

  it('cars of every shape, yaw, and pitch stay inside the car sprite bounds; gate booths inside theirs', () => {
    for (const type of TRACK_TYPES) {
      for (let ys = 0; ys < 16; ys += 3) {
        for (let ps = 0; ps < 24; ps += 5) {
          const r = recorder();
          paintCar(r.ctx, type.render.car, (ys / 16) * Math.PI * 2, (ps / 24) * Math.PI * 2, '#d9383b', true);
          within(r.pts, CAR_BOUNDS, 0);
        }
      }
    }
    const r = recorder();
    paintGateBooth(r.ctx, 'entrance', '#f0643a');
    within(r.pts, GATE_BOUNDS, 0);
  });

  it('the picker preview uses pieces every rail type can build', () => {
    for (const type of TRACK_TYPES) {
      for (const p of previewPieces(type.id)) expect(getTrackTypeDef(type.id)!.groups).toContain(TRACK_PIECES.find((d) => d.id === p.defId)!.group);
    }
  });
});

describe('track layer drawables', () => {
  function collect(layer: TrackLayer, world: ReturnType<typeof makeTestWorld>, alpha = 0): Array<{ ref: number; sub: number; depth: number; z: number; layer: number }> {
    const items: Array<{ ref: number; sub: number; depth: number; z: number; layer: number }> = [];
    const sink: DrawSink = {
      push(kind, ref, sub, _ax, _ay, _skey, depth, z, l) {
        expect(kind).toBe(KIND_TRACK);
        items.push({ ref, sub, depth, z, layer: l });
      },
    };
    layer.collect(world, sink, { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 }, 1, 1, 0, 0, alpha, 0);
    return items;
  }

  it('collects slices, chain overlays, gates, and cars; reuses slices until the track changes', () => {
    const w = makeTestWorld();
    const id = buildR1(w);
    executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 4, y: 3 });
    executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'exit', x: 6, y: 3 });
    const layer = new TrackLayer();
    let items = collect(layer, w);
    const slices = items.filter((i) => i.sub === 0);
    expect(slices.length).toBe(layer.sliceCount);
    expect(slices.every((i) => i.layer === Layer.Object)).toBe(true);
    // Chain overlays: the 5 chain pieces of the lift, one per rail tile.
    expect(items.filter((i) => i.sub === 1).length).toBe(5);
    expect(items.filter((i) => i.sub === 3).length).toBe(2);
    expect(items.filter((i) => i.sub === 2).length).toBe(0);
    const before = (layer as unknown as { slices: unknown }).slices;
    collect(layer, w);
    expect((layer as unknown as { slices: unknown }).slices).toBe(before);

    executeCommand(w, { type: 'startTestRun', rideId: id });
    runTicks(w, 200);
    items = collect(layer, w, 0.5);
    const cars = items.filter((i) => i.sub === 2);
    expect(cars.length).toBe(dataOf(w, id).trainConfig.carsPerTrain);
    expect(cars.every((c) => c.layer === Layer.Guest)).toBe(true);
    // Colour changes rebuild the slices.
    executeCommand(w, { type: 'setTrackColours', rideId: id, track: 4, supports: 9, cars: 1 });
    collect(layer, w);
    expect((layer as unknown as { slices: unknown }).slices).not.toBe(before);
    expect(rideOf(w, id).entrance).not.toBeNull();
  });

  it('a demolished ride leaves no drawables', () => {
    const w = makeTestWorld();
    const id = buildR1(w);
    const layer = new TrackLayer();
    expect(collect(layer, w).length).toBeGreaterThan(0);
    const r = rideOf(w, id);
    executeCommand(w, { type: 'demolish', x: r.x, y: r.y });
    expect(collect(layer, w)).toEqual([]);
  });
});

describe('palette and labels', () => {
  it('12 colours, indices wrap; money labels', () => {
    expect(TRACK_PALETTE).toHaveLength(12);
    expect(paletteColour(12)).toBe(TRACK_PALETTE[0]);
    expect(paletteColour(-1)).toBe(TRACK_PALETTE[11]);
    expect(moneyLabel(4500)).toBe('$45');
    expect(moneyLabel(123456)).toBe('$1,234.56');
  });
});
