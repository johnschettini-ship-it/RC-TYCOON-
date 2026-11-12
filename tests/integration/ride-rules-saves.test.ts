/**
 * Ride work 1, Task 9 (owner decisions R1, R2, R5–R8 of 2026-11-12; plan decision 8): existing parks under the new ride
 * rules. Save schema 3 is unchanged and no load step was added, so a saved park loads as it was: an open ride keeps
 * running under the car-averaged physics (R6) with its stored ratings until its next test.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getTrackTypeDef, type TrackTypeDef } from '../../src/data/track';
import { deserialize, SCHEMA_VERSION, serialize } from '../../src/save';
import { drainEvents } from '../../src/sim/events';
import { climbAboveStationM } from '../../src/sim/rides/track/placement';
import { heightIntensityStep } from '../../src/sim/rides/track/ratings';
import { runTestLapDetailed } from '../../src/sim/rides/track/testRun';
import { stepTick } from '../../src/sim/tick';
import type { World } from '../../src/sim/types';
import { runTicks, stateHash } from '../helpers/world';

const FIXTURES = ['save-v1.tcsave.json', 'save-v1-new.tcsave.json', 'save-v1-rich.tcsave.json', 'save-v2.tcsave.json'];

function load(name: string): World {
  const r = deserialize(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
  if (!r.ok) throw new Error(`${name}: ${r.error}`);
  return r.world;
}

describe('existing parks under the ride rules of ride work 1', () => {
  it('the Build 1 park’s open Steel Coaster (36 pieces, 4 cars) keeps running with its stored ratings', () => {
    const w = load('save-v1.tcsave.json');
    const ride = w.state.rides.find((r) => r.id === 13)!;
    const data = w.state.track.rides['13']!;
    expect([ride.status, data.pieces.length, data.trainConfig.carsPerTrain]).toEqual(['open', 36, 4]);
    const before = structuredClone(data.test);
    const stats = structuredClone(ride.stats);
    let faults = 0;
    for (let i = 0; i < 5_000; i++) {
      stepTick(w);
      for (const e of drainEvents(w)) if (e.type === 'message' && e.textId === 'track.fault') faults++;
    }
    expect(faults).toBe(0);
    expect(ride.status).toBe('open');
    // Plan decision 8: ratings are recomputed only at the ride's next test.
    expect(w.state.track.rides['13']!.test).toEqual(before);
    expect(ride.stats).toEqual(stats);
  });

  for (const name of FIXTURES) {
    it(`${name} loads, saves as schema ${SCHEMA_VERSION}, and runs 2,000 ticks twice to the same hash`, () => {
      expect(SCHEMA_VERSION).toBe(3);
      const a = load(name);
      const b = load(name);
      expect(JSON.parse(serialize(a, 'test', '2026-11-12T00:00:00.000Z')).schemaVersion).toBe(3);
      runTicks(a, 2_000);
      runTicks(b, 2_000);
      expect(stateHash(a)).toBe(stateHash(b));
    });
  }

  it('a new test of the loaded coaster gives car-averaged values, a safe pass, and no intensity step', () => {
    const w = load('save-v1.tcsave.json');
    const data = w.state.track.rides['13']!;
    const type = getTrackTypeDef(data.typeId) as TrackTypeDef;
    const lap = runTestLapDetailed(w.state.map, data, type);
    expect(lap.result.passed).toBe(true);
    // R7: its strongest car stays within the hard limits, so it may open again after the test.
    expect(lap.breach).toBeNull();
    // R6: the ratings use the average over the 4 cars; safety uses the strongest car, never below the average.
    expect(lap.worst.posGMax).toBeGreaterThanOrEqual(lap.result.posGMax);
    expect(lap.worst.latMax).toBeGreaterThanOrEqual(lap.result.latMax);
    const oneCar = runTestLapDetailed(w.state.map, { ...data, trainConfig: { ...data.trainConfig, carsPerTrain: 1 } }, type);
    expect(oneCar.result.posGMax).not.toBe(lap.result.posGMax);
    // R2: the saved coaster climbs less than its old limit, so the intensity step adds nothing.
    expect(climbAboveStationM(data.pieces)).toBeLessThanOrEqual(type.intensityHeightM);
    expect(heightIntensityStep(climbAboveStationM(data.pieces), type)).toBe(0);
  });
});
