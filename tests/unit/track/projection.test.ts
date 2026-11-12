/**
 * R5 (owner 2026-11-12): the section projection (plan ride-work-1 Task 4). The builder's meter, the build-time safety
 * rule and Auto-finish simulate the test train over the open track plus one candidate piece with the test lap's
 * physics; the run over the existing track is cached per track change.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/research/api', () => ({ isUnlocked: () => true }));

import { getTrackTypeDef, type TrackTypeDef } from '../../../src/data/track';
import { executeCommand } from '../../../src/sim/commands';
import { buildLayout, sampleAt, wrapMm } from '../../../src/sim/rides/track/layout';
import { newTrain, stepTrain, type StepContext } from '../../../src/sim/rides/track/physics';
import { continueProjection, dispatchSnapshot, projectPrefix, projectSection } from '../../../src/sim/rides/track/projection';
import { runTestLap, runTestLapDetailed } from '../../../src/sim/rides/track/testRun';
import type { TrackPieceInstance, TrackRideData } from '../../../src/sim/rides/track/types';
import { makeTestWorld, stateHash } from '../../helpers/world';
import {
  add,
  addAll,
  buildR1,
  dataOf,
  EAST,
  expectOk,
  HILLS_300,
  layPieces,
  place,
  R1_PIECES,
  UNSAFE_DROP_PIECES,
  writePieces,
  type PieceSpec,
} from './helpers';

const steel = getTrackTypeDef('steel_coaster') as TrackTypeDef;

/** A ride data object with the first `n` pieces of `d` (the track as it stood before piece `n` was added). */
function prefixOf(d: TrackRideData, n: number): TrackRideData {
  return { ...d, pieces: d.pieces.slice(0, n), circuitClosed: false, test: null };
}

function hills(cars: number): TrackRideData {
  const w = makeTestWorld();
  const id = place(w, 'steel_coaster', 4, 2, EAST);
  const d = dataOf(w, id);
  return { ...d, pieces: layPieces(HILLS_300, 4, 2, d.pieces[0]!.z), trainConfig: { trains: 1, carsPerTrain: cars } };
}

describe('open layouts (R5)', () => {
  it('an open layout does not wrap and runs out straight with no curvature', () => {
    const pieces = layPieces(['station', 'straight', 'flat_to_gentle_down', 'gentle_to_steep_down', 'steep_down']);
    const L = buildLayout(pieces, true);
    expect(L.open).toBe(true);
    expect(wrapMm(L, L.lengthMm + 500)).toBe(L.lengthMm + 500);
    expect(wrapMm(L, -500)).toBe(-500);
    const sp = sampleAt(L, L.lengthMm + 3000);
    expect([sp.kv, sp.kh]).toEqual([0, 0]);
    expect(sp.sinT).toBeCloseTo(sampleAt(L, L.lengthMm - 1).sinT, 6);
    // Before the start: the first sample's pitch (the station is flat), never the far end's steep slope (review M-6).
    expect(sampleAt(L, -3000).sinT).toBeCloseTo(0, 9);
    expect(buildLayout(pieces).open).toBe(false);
  });

  it('a car behind the start of an open layout never feels the far end’s chain (review M-6)', () => {
    // A 4-car train (10 m) whose centre is 3 m into a one-piece station, moving on after a lap: its rear car is behind
    // the start. On the closed layout of the same pieces that car wraps onto the chained lift at the far end and is pulled.
    const pieces = layPieces(['station', 'straight', 'straight', { id: 'flat_to_gentle_up', chain: true }]);
    const run = (open: boolean): number => {
      const layout = buildLayout(pieces, open);
      const ctx: StepContext = {
        layout, type: steel, pieces, trainLenMm: 10_000, cars: 4, carLenMm: 2500, laps: Number.POSITIVE_INFINITY,
        holdFrontMm: null, leader: null, slowFactor: 1,
      };
      const t = newTrain(1, 3000, 4, 4);
      t.state = 'running';
      t.v = 1000;
      t.dist = 100_000;
      stepTrain(ctx, t);
      return t.v;
    };
    expect(run(false)).toBeGreaterThan(1000);
    expect(run(true)).toBeLessThan(1000);
  });
});

describe('section projection (R5, owner 2026-11-12)', () => {
  it('continuing from the cached prefix equals projecting from scratch, for every piece of R1', () => {
    const w = makeTestWorld();
    const d = dataOf(w, buildR1(w));
    for (let i = 1; i < d.pieces.length; i++) {
      const before = prefixOf(d, i);
      const candidate = d.pieces[i]!;
      const all = d.pieces.slice(0, i + 1);
      const cached = projectSection(before, steel, candidate);
      const fresh = continueProjection(all, steel, 4, dispatchSnapshot(all, steel, 4)).projection;
      expect(cached, `piece ${i + 1} (${candidate.defId})`).toEqual(fresh);
    }
  });

  it('the prefix is computed once per track change', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 4, 2, EAST);
    addAll(w, id, ['station', 'station', 'straight']);
    const d = dataOf(w, id);
    const before = projectPrefix(d, steel);
    expect(projectPrefix(d, steel)).toBe(before);
    expectOk(add(w, id, 'straight'));
    expect(projectPrefix(d, steel)).not.toBe(before);
    // The car count is part of the key.
    const again = projectPrefix(d, steel);
    expectOk(executeCommand(w, { type: 'setTrainConfig', rideId: id, trains: 1, carsPerTrain: 6 }, { setup: true }));
    expect(projectPrefix(d, steel)).not.toBe(again);
  });

  it('the valley at the bottom of R1’s drop shows the same peak G as the test lap', () => {
    const w = makeTestWorld();
    const d = dataOf(w, buildR1(w));
    // R6 (owner 2026-11-12): with the forces averaged over 4 cars (10 m) the valley's peak comes when the train's centre
    // reaches gentle_down_to_flat (piece 16), the bottom of the valley; on steep_to_gentle_down (piece 15) only the front
    // cars have curved up yet (1.44 G average, 2.06 G strongest car). The plan's test projected piece 15.
    expect(d.pieces.slice(14, 16).map((p) => p.defId)).toEqual(['steep_to_gentle_down', 'gentle_down_to_flat']);
    const proj = projectSection(prefixOf(d, 15), steel, d.pieces[15]!);
    expect(proj.reached).toBe(true);
    const lap = runTestLapDetailed(w.state.map, d, steel);
    expect(Math.abs(proj.avg.posGMax - runTestLap(w.state.map, d, steel).posGMax)).toBeLessThanOrEqual(10);
    expect(Math.abs(proj.posGMax - lap.worst.posGMax)).toBeLessThanOrEqual(10);
    expect(proj.breach).toBeNull();
    expect(projectSection(prefixOf(d, 14), steel, d.pieces[14]!).avg.posGMax).toBeLessThan(proj.avg.posGMax);
  });

  it('the strongest car is each car’s own window, the same value the test lap refuses to open with (review I-2)', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 4, 2, EAST);
    writePieces(w, id, UNSAFE_DROP_PIECES); // Task 5: Build refuses its piece 32, so the circuit is written, not built
    const d = dataOf(w, id);
    const lap = runTestLapDetailed(w.state.map, d, steel);
    const k = lap.breachPiece!;
    const proj = projectSection(prefixOf(d, k), steel, d.pieces[k]!);
    expect(proj.breach).toEqual(lap.breach);
    expect(proj.posGMax).toBe(lap.worst.posGMax);
    // The average (ratings) stays within the limit.
    expect(proj.avg.posGMax).toBeLessThanOrEqual(600);
  });

  it('a lift without a chain: the projection stops on the lift piece', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 4, 2, EAST);
    addAll(w, id, ['station', 'station']);
    const d = dataOf(w, id);
    const lift = layPieces(['station', 'station', 'station', 'flat_to_gentle_up'], 4, 2, d.pieces[0]!.z)[3]!;
    expect(projectSection(d, steel, lift)).toMatchObject({ reached: false, stallPiece: 3, stallKind: 'stop' });
  });

  it('an earlier stall is reported for every later candidate', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 4, 2, EAST);
    const specs: PieceSpec[] = ['station', 'station', 'flat_to_gentle_up', 'gentle_up_to_flat'];
    addAll(w, id, specs);
    const d = dataOf(w, id);
    const z = d.pieces[0]!.z;
    const next = (ids: PieceSpec[]): TrackPieceInstance => layPieces(['station', ...specs, ...ids], 4, 2, z).at(-1)!;
    for (const c of [next(['straight']), next(['turn_medium_right'])]) {
      expect(projectSection(d, steel, c)).toMatchObject({ reached: false, stallPiece: 3, stallKind: 'stop', breach: null });
    }
  });

  it('projecting changes nothing in the world', () => {
    const w = makeTestWorld();
    const d = dataOf(w, buildR1(w));
    const before = prefixOf(d, 20);
    const json = JSON.stringify(before);
    const h0 = stateHash(w);
    projectSection(before, steel, d.pieces[20]!);
    projectSection(before, steel, d.pieces[20]!);
    expect(stateHash(w)).toBe(h0);
    expect(JSON.stringify(before)).toBe(json);
  });

  it('one straight on a 300-piece track costs at most 200 continuation ticks (4 and 7 cars)', () => {
    for (const cars of [4, 7]) {
      const d = hills(cars);
      expect(d.pieces.length).toBe(300);
      const prefix = projectPrefix(d, steel);
      expect(prefix.stall).toBeNull();
      const straight = layPieces([...HILLS_300, 'straight'], 4, 2, d.pieces[0]!.z).at(-1)!;
      const r = continueProjection([...d.pieces, straight], steel, cars, prefix);
      expect(r.projection.reached).toBe(true);
      expect(r.next.ticks - prefix.ticks).toBeLessThanOrEqual(200);
    }
  });
});
