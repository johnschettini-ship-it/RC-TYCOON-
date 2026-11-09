/**
 * Phase 2 §9.1 "Save": round trip with trains in motion and seated guests, in a real game.
 * R1 is built by commands, linked to the park entrance by paths, tested, and opened; real guests arrive and ride
 * through `stepTick`. Saving and loading mid-ride must not change the rest of the game.
 */
import { describe, expect, it } from 'vitest';
import { deserialize, serialize, validateState } from '../../src/save';
import type { TrackRideData } from '../../src/sim/rides/track/types';
import { runTicks, stateHash } from '../helpers/world';
import { buildCoasterPark } from './scenario';

const SAVED_AT = '2026-11-09T10:15:00.000Z';
/** Safety cap while waiting for real guests to walk in and board. */
const MAX_WAIT_TICKS = 40_000;

function riding(data: TrackRideData): boolean {
  return data.trains.some((t) => t.state === 'running' && t.v > 0 && t.seats.some((g) => g >= 0));
}

describe('track save round trip with moving trains (phase-2 §9.1)', () => {
  it('save → load mid-ride, then 1,000 more ticks: same state hash as the run without the save', () => {
    const { world, rideId } = buildCoasterPark();
    const data = world.state.track.rides[String(rideId)]!;
    let waited = 0;
    while (!riding(data) && waited < MAX_WAIT_TICKS) {
      runTicks(world, 1);
      waited++;
    }
    expect(riding(data)).toBe(true);
    // Let the train get well into its lap.
    runTicks(world, 200);
    expect(riding(data)).toBe(true);

    // The moving, loaded train and its seated guests.
    const train = data.trains.find((t) => t.v > 0 && t.seats.some((g) => g >= 0))!;
    const seated = train.seats.filter((g) => g >= 0);
    for (const gid of seated) {
      const g = world.state.guests.find((x) => x.id === gid)!;
      expect(g.state).toBe('riding');
      expect(g.seat).toMatchObject({ rideId, trainId: train.id });
    }
    expect(validateState(world.state)).toBeNull();

    const json = serialize(world, '0.1.0', SAVED_AT);
    const result = deserialize(json);
    if (!result.ok) throw new Error(`load failed: ${result.error}`);
    const loaded = result.world;
    expect(loaded.state).toStrictEqual(world.state);
    expect(stateHash(loaded)).toBe(stateHash(world));

    runTicks(world, 1_000);
    runTicks(loaded, 1_000);
    expect(stateHash(loaded)).toBe(stateHash(world));
    expect(loaded.state.track).toStrictEqual(world.state.track);
    expect(validateState(world.state)).toBeNull();
    expect(validateState(loaded.state)).toBeNull();

    // The game went on: the riders saved mid-ride got off, and guests kept riding.
    const ride = world.state.rides.find((r) => r.id === rideId)!;
    for (const gid of seated) expect(train.seats).not.toContain(gid);
    expect(ride.totals.riders).toBeGreaterThan(seated.length);
  });
});
