/**
 * New rides batch C, today's look (docs/superpowers/specs/2026-11-17-new-rides-design.md): the five new car shapes stay
 * in the car sprite bounds at any yaw, pitch and roll and look different from each other and the old shapes; the
 * hanging ones (flying, gondola) reach up to their rail or rope; riders sit inside the gondola and under the prone shell.
 */
import { describe, expect, it } from 'vitest';
import { getTrackTypeDef } from '../../../../src/data/track';
import { buildRideSlices, paintSlice } from '../../../../src/render/track/layer';
import { CAR_BOUNDS, carDims, HANG_M, lookFor, paintCar, riderHeightM, type CarShape } from '../../../../src/render/track/paint';
import { drawTrackPreview } from '../../../../src/render/track/preview';
import { PX_Z, viewFrame } from '../../../../src/render/track/project';
import { executeCommand } from '../../../../src/sim/commands';
import { makeTestWorld } from '../../../helpers/world';
import type { PieceSpec } from '../../track/helpers';
import { buildCircuit, FLYING_COASTER, LAUNCH_COASTER, MINE_TRAIN, SKY_RIDE, WATER_COASTER } from '../../track/ridesCCircuits';

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

/** Each batch C type's test circuit (tests/unit/track/ridesC.test.ts) and where its station goes. */
export const CIRCUITS: ReadonlyArray<readonly [string, number, number, readonly PieceSpec[]]> = [
  ['mine_train', 6, 4, MINE_TRAIN],
  ['launch_coaster', 6, 4, LAUNCH_COASTER],
  ['water_coaster', 6, 4, WATER_COASTER],
  ['flying_coaster', 4, 2, FLYING_COASTER],
  ['sky_ride', 6, 4, SKY_RIDE],
];

describe('batch C rides in today\'s look', () => {
  it('each test circuit paints inside its slice bounds at every view rotation', () => {
    for (const [typeId, x, y, pieces] of CIRCUITS) {
      const w = makeTestWorld();
      const id = buildCircuit(w, typeId, x, y, pieces);
      for (const rot of [0, 1, 2, 3]) {
        const f = viewFrame(rot, w.state.map.width, w.state.map.height);
        const slices = buildRideSlices(w, id, f);
        expect(slices.length, typeId).toBeGreaterThan(0);
        for (const sl of slices) {
          const r = recorder();
          paintSlice(r.ctx, sl, f);
          expect(r.pts.length, typeId).toBeGreaterThan(0);
          within(r.pts, sl.bounds);
        }
      }
    }
  });

  it('the three colour rows change the track, the supports and the cars', () => {
    for (const [typeId, x, y, pieces] of CIRCUITS) {
      const w = makeTestWorld();
      const id = buildCircuit(w, typeId, x, y, pieces);
      const f = viewFrame(0, w.state.map.width, w.state.map.height);
      const paint = (): string => buildRideSlices(w, id, f).map((sl) => {
        const r = recorder();
        paintSlice(r.ctx, sl, f);
        return r.ops.join(';');
      }).join('|');
      const base = paint();
      const d = getTrackTypeDef(typeId)!.render.colours;
      expect(executeCommand(w, { type: 'setTrackColours', rideId: id, track: (d.track + 3) % 12, supports: d.supports, cars: d.cars }).ok).toBe(true);
      const track = paint();
      expect(track, `${typeId} track`).not.toBe(base);
      expect(executeCommand(w, { type: 'setTrackColours', rideId: id, track: (d.track + 3) % 12, supports: (d.supports + 3) % 12, cars: d.cars }).ok).toBe(true);
      expect(paint(), `${typeId} supports`).not.toBe(track);
    }
  });

  it('each type has its own card picture', () => {
    const logs = new Set<string>();
    for (const id of ['steel_coaster', 'junior_coaster', 'wooden_coaster', 'inverted_coaster', 'monorail', ...CIRCUITS.map((c) => c[0])]) {
      const r = recorder();
      drawTrackPreview(r.ctx, id, 112, 80);
      expect(r.pts.length, id).toBeGreaterThan(0);
      logs.add(r.ops.join(';'));
    }
    expect(logs.size).toBe(5 + CIRCUITS.length);
  });

  it('Launch Coaster: the launch paints motor plates, unlike a plain straight', () => {
    const w = makeTestWorld();
    const id = buildCircuit(w, 'launch_coaster', 6, 4, LAUNCH_COASTER);
    const f = viewFrame(0, w.state.map.width, w.state.map.height);
    const slices = buildRideSlices(w, id, f);
    const opsOf = (special: string | null): string[] => slices.filter((sl) => sl.special === special).map((sl) => {
      const r = recorder();
      paintSlice(r.ctx, sl, f);
      return r.ops.join(';');
    });
    const launches = opsOf('launch');
    expect(launches).toHaveLength(7);
    for (const l of launches) expect(l).toContain('strokeStyle=#5ec8ff');
    for (const o of opsOf(null)) expect(o).not.toContain('#5ec8ff');
  });

  it('Water Coaster: the splashdown and channel straight paint as a water channel with ripples; the rest as rails', () => {
    const w = makeTestWorld();
    const id = buildCircuit(w, 'water_coaster', 6, 4, WATER_COASTER);
    const f = viewFrame(0, w.state.map.width, w.state.map.height);
    const slices = buildRideSlices(w, id, f);
    const water = slices.filter((sl) => sl.water);
    // 2 splashdown tiles and 1 channel straight tile.
    expect(water).toHaveLength(3);
    for (const sl of water) expect(sl.look.channel).toBeGreaterThan(0);
    for (const sl of slices.filter((x) => !x.water)) expect(sl.look).toBe(lookFor(getTrackTypeDef('water_coaster')!));
  });

  it('Sky Ride: a rope 2.4 m over the riders\' line, no rails, towers on every third tile only, reaching the rope', () => {
    const t = getTrackTypeDef('sky_ride')!;
    const look = lookFor(t);
    expect([look.cable, look.lift, look.railPx, look.tiePx]).toEqual([true, HANG_M, 0, 0]);
    const w = makeTestWorld();
    const id = buildCircuit(w, 'sky_ride', 6, 4, SKY_RIDE);
    const f = viewFrame(0, w.state.map.width, w.state.map.height);
    const slices = buildRideSlices(w, id, f);
    const towers = slices.filter((sl) => sl.support);
    expect(towers.length).toBeGreaterThan(5);
    expect(towers.length).toBeLessThan(slices.length / 2);
    for (const sl of towers) {
      expect((sl.x + sl.y) % 3).toBe(0);
      // The tower stands at one sample of the tile: its top is the rope there, over the tile's lowest rail point.
      let zMin = Infinity;
      for (let k = sl.runs[0] as number; k <= (sl.runs[sl.runs.length - 1] as number); k++) zMin = Math.min(zMin, sl.samples.z[k] as number);
      expect(sl.support!.top).toBeGreaterThanOrEqual(zMin + HANG_M);
    }
  });

  it('Mine Train: dark rails on wooden sleepers, wooden trestles, ore carts', () => {
    const t = getTrackTypeDef('mine_train')!;
    const look = lookFor(t);
    expect([look.tieColour, look.spine, t.render.supports, t.render.car]).toEqual(['#7a5634', false, 'lattice', 'ore']);
    expect(look).not.toEqual(lookFor(getTrackTypeDef('wooden_coaster')!));
  });
});
