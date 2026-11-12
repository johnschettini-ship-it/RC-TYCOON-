/**
 * R6 (owner 2026-11-12): trains are simulated with their length. The along-track acceleration and the G a train
 * measures are averaged over its cars (ratings); the strongest car is reported too (owner change: safety checks use
 * the strongest car). A one-car train measures exactly as before.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/research/api', () => ({ isUnlocked: () => true }));

import { getTrackTypeDef, type TrackTypeDef } from '../../../src/data/track';
import { pieceExitJoint } from '../../../src/sim/rides/track/geometry';
import { buildLayout, getLayout, sampleAt } from '../../../src/sim/rides/track/layout';
import {
  carOffsetMm,
  gForces,
  newTrain,
  stepTrain,
  trainAccel,
  trainG,
  trainGAt,
  type StepContext,
} from '../../../src/sim/rides/track/physics';
import { dispatchedTestTrain, runTestLap } from '../../../src/sim/rides/track/testRun';
import type { TrackPieceInstance } from '../../../src/sim/rides/track/types';
import { makeTestWorld } from '../../helpers/world';
import { addAll, buildOneCar, buildR1, dataOf, EAST, ONE_CAR_CIRCUITS, place, R1_BLOCKS } from './helpers';
import baseline from './fixtures/one-car-baseline.json';

const steel = getTrackTypeDef('steel_coaster') as TrackTypeDef;

/** Lay pieces end to end from (10, 10), dir 0, z 8 (no world checks). */
function lay(ids: string[]): TrackPieceInstance[] {
  const out: TrackPieceInstance[] = [];
  let x = 10;
  let y = 10;
  let z = 8;
  let dir: 0 | 1 | 2 | 3 = 0;
  for (const id of ids) {
    const piece: TrackPieceInstance = { defId: id, x, y, z, dir, chain: false, brakeSpeed: null, cost: 0 };
    out.push(piece);
    const j = pieceExitJoint(piece);
    x = j.x;
    y = j.y;
    z = j.z;
    dir = j.dir;
  }
  return out;
}

/** Signed lateral G of one sample (gForces returns its absolute value). */
function signedLat(s: number, v: number, layout: ReturnType<typeof buildLayout>): number {
  const sm = sampleAt(layout, s);
  const v2 = v * v;
  return (v2 * sm.kh * sm.cosB - (9.81 * sm.cosT + v2 * sm.kv) * sm.sinB) / 9.81;
}

describe('trains simulated with their length (R6, owner 2026-11-12)', () => {
  it('a one-car train moves and measures exactly as before', () => {
    const base = baseline as Record<string, unknown>;
    expect(Object.keys(base).sort()).toEqual(ONE_CAR_CIRCUITS.map((c) => c.name).sort());
    for (const c of ONE_CAR_CIRCUITS) {
      const w = makeTestWorld();
      const id = buildOneCar(w, c);
      const d = dataOf(w, id);
      expect(d.trainConfig.carsPerTrain, c.name).toBe(1);
      expect(runTestLap(w.state.map, d, getTrackTypeDef(c.typeId) as TrackTypeDef), c.name).toEqual(base[c.name]);
    }
  });

  it('car offsets are the positions the renderer draws: car 0 at the front, symmetric about the centre', () => {
    expect([0, 1, 2].map((k) => carOffsetMm(k, 3, 2500))).toEqual([2500, 0, -2500]);
    expect(carOffsetMm(0, 1, 2500)).toBe(0);
    expect([0, 3].map((k) => carOffsetMm(k, 4, 2000))).toEqual([3000, -3000]);
  });

  it('the acceleration of a train is the mean over its cars', () => {
    const layout = buildLayout(lay(['station', 'straight', 'flat_to_gentle_up', 'gentle_up', 'gentle_up_to_flat', 'straight', 'flat_to_gentle_down', 'gentle_down', 'gentle_down_to_flat', 'straight']));
    const s = layout.startMm[4] as number;
    const a3 = trainAccel(steel, layout, s, 8, 3, 2500);
    const parts = [0, 1, 2].map((k) => trainAccel(steel, layout, s + carOffsetMm(k, 3, 2500), 8, 1, 2500) + steel.physics.cd * 64);
    expect(a3).toBeCloseTo(parts.reduce((x, y) => x + y) / 3 - steel.physics.cd * 64, 12);
    // Friction and drag act only when moving.
    const still = [0, 1, 2].map((k) => trainAccel(steel, layout, s + carOffsetMm(k, 3, 2500), 0, 1, 2500));
    expect(trainAccel(steel, layout, s, 0, 3, 2500)).toBeCloseTo(still.reduce((x, y) => x + y) / 3, 12);
  });

  it('a long train is pulled over a crest by its front cars', () => {
    const layout = buildLayout(lay(['station', 'straight', 'flat_to_gentle_up', 'gentle_up_to_flat', 'straight', 'flat_to_gentle_down', 'gentle_down_to_flat']));
    // Centre at the start of flat_to_gentle_down, v = 1 m/s.
    const crestMm = layout.startMm[5] as number;
    expect(trainAccel(steel, layout, crestMm, 1, 7, 2500)).toBeGreaterThan(0);
    expect(trainAccel(steel, layout, crestMm, 1, 1, 2500)).toBeLessThan(0);
  });

  it('guest load never changes motion: full and empty trains run the same 600 ticks', () => {
    const w = makeTestWorld();
    const id = buildR1(w);
    const d = dataOf(w, id);
    const layout = getLayout(d);
    const cars = d.trainConfig.carsPerTrain;
    const ctx: StepContext = {
      layout, type: steel, pieces: d.pieces, trainLenMm: cars * steel.vehicle.carLengthMm, laps: 1000,
      holdFrontMm: null, leader: null, slowFactor: 1, cars, carLenMm: steel.vehicle.carLengthMm,
    };
    const empty = newTrain(1, 3000, cars, steel.vehicle.seatsPerCar);
    const full = newTrain(2, 3000, cars, steel.vehicle.seatsPerCar);
    full.seats = full.seats.map((_, i) => 100 + i);
    for (const t of [empty, full]) {
      t.state = 'running';
      t.release = true;
    }
    for (let i = 0; i < 600; i++) {
      const a = stepTrain(ctx, empty);
      const b = stepTrain(ctx, full);
      expect([full.s, full.v, b.stall], `tick ${i}`).toEqual([empty.s, empty.v, a.stall]);
    }
    expect(empty.dist).toBeGreaterThan(0);
  });

  it('the chain never overrides a block brake: a 4-car train settles at station speed on every block brake (review I-1)', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 4, 2, EAST);
    addAll(w, id, R1_BLOCKS);
    const d = dataOf(w, id);
    expect(d.trainConfig.carsPerTrain).toBe(4);
    const layout = getLayout(d);
    const cars = 4;
    const ctx: StepContext = {
      layout, type: steel, pieces: d.pieces, trainLenMm: cars * steel.vehicle.carLengthMm, laps: 1,
      holdFrontMm: null, leader: null, slowFactor: 1, cars, carLenMm: steel.vehicle.carLengthMm,
    };
    const t = dispatchedTestTrain(layout, steel, cars);
    let onBrake = 0;
    let checked = 0;
    for (let i = 0; i < 6000; i++) {
      const r = stepTrain(ctx, t);
      expect(r.stall, `tick ${i}`).toBeNull();
      if (layout.statics[r.pieceIndex]?.def.special === 'blockBrake') {
        // Settled: after 20 ticks (1 s) on the block brake the train runs at station speed (2 m/s) or slower.
        if (++onBrake > 20) {
          expect(t.v, `tick ${i}, piece ${r.pieceIndex + 1}`).toBeLessThanOrEqual(2000);
          checked++;
        }
      } else {
        onBrake = 0;
      }
      if (r.arrived) break;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('G of a train is the mean over its cars', () => {
    const layout = buildLayout(lay(['station', 'straight', 'flat_to_gentle_down', 'gentle_down_to_flat', 'turn_small_right', 'straight', 'straight']));
    const v = 9;
    for (const s of [layout.startMm[3] as number, (layout.startMm[4] as number) + 1500]) {
      const g3 = trainGAt(layout, s, v, 3, 2500);
      const one = [0, 1, 2].map((k) => trainGAt(layout, s + carOffsetMm(k, 3, 2500), v, 1, 2500));
      expect(g3.gv).toBeCloseTo(one.reduce((x, g) => x + g.gv, 0) / 3, 12);
      const lat = [0, 1, 2].map((k) => signedLat(s + carOffsetMm(k, 3, 2500), v, layout));
      expect(g3.gl).toBeCloseTo(Math.abs(lat.reduce((x, y) => x + y) / 3), 12);
    }
  });

  it('a one-car train measures exactly what gForces gives at its centre', () => {
    const layout = buildLayout(lay(['station', 'straight', 'flat_to_gentle_down', 'gentle_down_to_flat', 'turn_small_right', 'straight']));
    for (const s of [500, layout.startMm[2] as number, (layout.startMm[3] as number) + 2000, (layout.startMm[4] as number) + 1000]) {
      const sm = sampleAt(layout, s);
      const g = gForces(sm.cosT, sm.sinB, sm.cosB, 8, sm.kv, sm.kh);
      const t = trainGAt(layout, s, 8, 1, 2500);
      expect([t.gv, t.gl, t.gvMax, t.gvMin, t.glMax]).toEqual([g.gv, g.gl, g.gv, g.gv, g.gl]);
    }
    const train = newTrain(1, 6000, 1, 4);
    train.v = 8000;
    const sm = sampleAt(layout, 6000);
    const want = gForces(sm.cosT, sm.sinB, sm.cosB, 8, sm.kv, sm.kh);
    expect(trainG(layout, train, 1, 2500)).toMatchObject(want);
  });

  // Owner change (2026-11-12): ratings use the average over the cars, safety checks the strongest car.
  it('the strongest car is reported beside the average: the rear car in a valley pulls more than the train', () => {
    const layout = buildLayout(lay(['station', 'straight', 'straight', 'flat_to_gentle_down', 'gentle_down_to_flat', 'straight', 'straight', 'straight', 'straight']));
    const cars = 7;
    const len = 2500;
    const v = 10;
    // The rear car (k = 6, 7.5 m behind the centre) sits in the middle of the valley piece; the others are on the flat.
    const valleyMid = (layout.startMm[4] as number) + 2000;
    const s = valleyMid - carOffsetMm(cars - 1, cars, len);
    const g = trainGAt(layout, s, v, cars, len);
    const each = Array.from({ length: cars }, (_, k) => trainGAt(layout, s + carOffsetMm(k, cars, len), v, 1, len));
    const rear = each[cars - 1]!;
    expect(rear.gv).toBe(Math.max(...each.map((e) => e.gv)));
    expect(g.gvMax).toBe(rear.gv);
    expect(g.gvMax).toBeGreaterThan(g.gv + 0.1);
    expect(g.gvMin).toBe(Math.min(...each.map((e) => e.gv)));
    expect(g.glMax).toBe(Math.max(...each.map((e) => e.gl)));
  });

  it('the strongest car is reported beside the average: the rear car on a crest and in a turn', () => {
    const cars = 7;
    const len = 2500;
    const v = 10;
    const crest = buildLayout(lay(['station', 'straight', 'straight', 'flat_to_gentle_up', 'gentle_up_to_flat', 'straight', 'straight', 'straight', 'straight']));
    const sCrest = (crest.startMm[4] as number) + 2000 - carOffsetMm(cars - 1, cars, len);
    const gc = trainGAt(crest, sCrest, v, cars, len);
    const eachC = Array.from({ length: cars }, (_, k) => trainGAt(crest, sCrest + carOffsetMm(k, cars, len), v, 1, len));
    expect(gc.gvMin).toBe(eachC[cars - 1]!.gv);
    expect(gc.gvMin).toBeLessThan(gc.gv - 0.1);

    const turn = buildLayout(lay(['station', 'straight', 'straight', 'turn_small_right', 'straight', 'straight', 'straight', 'straight', 'straight']));
    const sTurn = (turn.startMm[3] as number) + 1500 - carOffsetMm(cars - 1, cars, len);
    const gt = trainGAt(turn, sTurn, v, cars, len);
    const eachT = Array.from({ length: cars }, (_, k) => trainGAt(turn, sTurn + carOffsetMm(k, cars, len), v, 1, len));
    expect(gt.glMax).toBe(eachT[cars - 1]!.gl);
    expect(gt.glMax).toBeGreaterThan(gt.gl + 0.1);
  });
});
