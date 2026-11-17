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
import { buildCircuit, MINE_TRAIN, testLap } from './ridesCCircuits';

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
