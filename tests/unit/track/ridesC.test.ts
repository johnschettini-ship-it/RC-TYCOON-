/**
 * New rides batch C (docs/superpowers/specs/2026-11-17-new-rides-design.md): the five track ride types end to end. Each
 * type's catalogue row, its track type, and a small valid circuit built through the real build commands
 * (`placeStation`, `addTrackPiece`) that passes a test lap with ratings in the type's expected band. Building runs in
 * setup mode (research types are locked in a new park).
 */
import { describe, expect, it } from 'vitest';
import { getTrackRideDef } from '../../../src/data/catalog/trackRides';
import { getTrackTypeDef } from '../../../src/data/track';
import { isUnlocked } from '../../../src/sim/research/api';
import { checkTrackRideForLoad, nextTrackPieces } from '../../../src/sim/rides/track/api';
import type { TestResult } from '../../../src/sim/rides/track/types';
import type { World } from '../../../src/sim/types';
import { deserialize, serialize, validateState } from '../../../src/save';
import { makeTestWorld } from '../../helpers/world';
import { addAll, dataOf, EAST, place, rideOf } from './helpers';
import { buildCircuit, LAUNCH_COASTER, MINE_TRAIN, testLap } from './ridesCCircuits';
import { LAUNCH_ACCEL } from '../../../src/data/tuning/track';
import { add } from './helpers';

/** The checks every batch C circuit passes: the test lap passed, the stats copied, the save sound and round-tripped. */
function expectSound(w: World, id: number, t: TestResult): void {
  expect(t.passed, `${t.failKind} on piece ${t.failPiece}`).toBe(true);
  expect(t.penalty).toBe(false);
  expect(rideOf(w, id).stats).toEqual({ excitement: t.excitement, intensity: t.intensity, nausea: t.nausea });
  expect(checkTrackRideForLoad(dataOf(w, id), w.state)).toBeNull();
  expect(validateState(w.state)).toBeNull();
  const back = deserialize(serialize(w, '4.0.0', '2026-11-17T22:00:00.000Z'));
  if (!back.ok) throw new Error(back.error);
  expect(back.world.state).toStrictEqual(w.state);
}

describe('Mine Train (family, start)', () => {
  it('catalogue row and track type: a family gravity coaster beside the Junior Coaster and the Spinning Mouse', () => {
    expect(getTrackRideDef('mine_train')).toMatchObject({ phase: 2, unlock: 'start', tag: 'family', drive: 'gravity', seatsPerCar: 4, carsMin: 2, carsMax: 6, maxTrains: 2, maxHeightM: 24, intensityHeightM: 16, defaultPrice: 400 });
    const t = getTrackTypeDef('mine_train')!;
    expect(t).toMatchObject({ medium: 'rail', pieceSet: 'rail', chain: true, alsoPieces: [] });
    expect(t.render).toEqual({ rail: 'wood', supports: 'lattice', car: 'ore', colours: { track: 10, supports: 11, cars: 1 } });
    // Low drops: no steep slopes, loops or corkscrews.
    for (const g of ['X', 'L', 'Cs', 'Ln', 'W']) expect(t.groups, g).not.toContain(g);
    expect(t.ratings.extra).toBe('smallTurns');
    const junior = getTrackTypeDef('junior_coaster')!;
    const bobsled = getTrackTypeDef('bobsled_run')!;
    expect(t.costs.base).toBeGreaterThan(junior.costs.base);
    expect(t.costs.base).toBeLessThan(bobsled.costs.base);
  });

  it('is unlocked in a new park', () => {
    expect(isUnlocked(makeTestWorld(), 'mine_train')).toBe(true);
  });

  it('a small circuit of low drops and many turns builds with commands and rates as a family coaster', () => {
    const w = makeTestWorld();
    const id = buildCircuit(w, 'mine_train', 6, 4, MINE_TRAIN);
    const t = testLap(w, id);
    expectSound(w, id, t);
    expect(t.inversions).toBe(0);
    expect(t.highestM).toBeLessThanOrEqual(8);
    expect(t.smallTurns).toBeGreaterThanOrEqual(8);
    expect(t.excitement).toBeGreaterThan(300);
    expect(t.excitement).toBeLessThan(650);
    expect(t.intensity).toBeGreaterThan(100);
    expect(t.intensity).toBeLessThan(400);
    expect(t.nausea).toBeLessThan(400);
  });

  it('cannot build a steep slope or a launch', () => {
    const w = makeTestWorld();
    const id = place(w, 'mine_train', 6, 4, EAST);
    addAll(w, id, ['station', 'straight']);
    const ids = nextTrackPieces(w, id).map((p) => p.id);
    expect(ids).toContain('flat_to_gentle_up');
    expect(ids).not.toContain('launch');
    expect(ids).not.toContain('vertical_loop_right');
  });
});

describe('Launch Coaster (thrill, research)', () => {
  it('catalogue row and track type: beside the Inverted Coaster, launched at 22 m/s with no chain lift', () => {
    expect(getTrackRideDef('launch_coaster')).toMatchObject({ phase: 6, unlock: 'coasters', tag: 'thrill', drive: 'gravity', seatsPerCar: 4, carsMin: 2, carsMax: 6, maxTrains: 3, maxHeightM: 70, intensityHeightM: 45, defaultPrice: 600 });
    const t = getTrackTypeDef('launch_coaster')!;
    expect(t).toMatchObject({ chain: false, alsoPieces: [] });
    expect(t.physics.launchSpeedMms).toBe(22_000);
    expect(t.groups).toContain('Ln');
    expect(t.render).toEqual({ rail: 'steel', supports: 'round', car: 'launch', colours: { track: 10, supports: 9, cars: 2 } });
    expect(t.costs.base).toBeGreaterThan(getTrackTypeDef('inverted_coaster')!.costs.base);
  });

  it('is a research item, locked in a new park', () => {
    expect(isUnlocked(makeTestWorld(), 'launch_coaster')).toBe(false);
  });

  it('a launched circuit builds with commands and rates as a big thrill coaster', () => {
    const w = makeTestWorld();
    const id = buildCircuit(w, 'launch_coaster', 6, 4, LAUNCH_COASTER);
    const t = testLap(w, id);
    expectSound(w, id, t);
    // The launch reaches its speed: the only power on the circuit.
    expect(t.vMaxMms).toBe(22_000);
    expect(t.inversions).toBe(1);
    expect(t.highestM).toBe(16);
    expect(t.excitement).toBeGreaterThan(550);
    expect(t.excitement).toBeLessThan(800);
    expect(t.intensity).toBeGreaterThan(500);
    expect(t.intensity).toBeLessThan(850);
    expect(t.nausea).toBeLessThan(700);
  });

  it('without the launch the train cannot climb the hill: the same circuit with straights fails its test', () => {
    const w = makeTestWorld();
    const pieces = LAUNCH_COASTER.map((p) => (p === 'launch' ? 'straight' : p));
    const id = buildCircuit(w, 'launch_coaster', 6, 4, pieces);
    expect(testLap(w, id).passed).toBe(false);
  });

  it('the launch accelerates at LAUNCH_ACCEL: 5 pieces take the train from 2 m/s to 22 m/s, and 2 pieces do not', () => {
    // v² = 2² + 2·a·d over the 20 m of five launch pieces with a train 10 m long (4 cars) gives just over 22 m/s.
    expect(Math.sqrt(4 + 2 * LAUNCH_ACCEL * (20 + 3.75))).toBeGreaterThan(22);
    const w = makeTestWorld();
    const pieces = LAUNCH_COASTER.map((p, i) => (p === 'launch' && i >= 4 ? 'straight' : p));
    const id = buildCircuit(w, 'launch_coaster', 6, 4, pieces);
    const t = testLap(w, id);
    expect(t.passed).toBe(false);
  });

  it('cannot take a chain lift; other coasters cannot build the launch', () => {
    const w = makeTestWorld();
    const id = place(w, 'launch_coaster', 6, 4, EAST);
    addAll(w, id, ['station']);
    expect(add(w, id, { id: 'straight', chain: true }).ok).toBe(false);
    expect(nextTrackPieces(w, id).map((p) => p.id)).toContain('launch');
    const s = place(w, 'steel_coaster', 6, 12, EAST);
    addAll(w, s, ['station']);
    expect(nextTrackPieces(w, s).map((p) => p.id)).not.toContain('launch');
    expect(add(w, s, 'launch').ok).toBe(false);
  });
});
