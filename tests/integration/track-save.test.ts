/**
 * Phase 2 §9.1 "Save": round trip with trains in motion and seated guests, in a real game.
 * R1 is built by commands, linked to the park entrance by paths, tested, and opened; real guests arrive and ride
 * through `stepTick`. Saving and loading mid-ride must not change the rest of the game.
 */
import { describe, expect, it } from 'vitest';
import { deserialize, serialize, validateState } from '../../src/save';
import { executeCommand } from '../../src/sim/commands';
import type { Command, CommandResult } from '../../src/sim/commands/types';
import { canOpenTrackRide } from '../../src/sim/rides/track/api';
import type { TrackRideData } from '../../src/sim/rides/track/types';
import type { World } from '../../src/sim/types';
import { makeTestWorld, runTicks, stateHash } from '../helpers/world';
import { EAST, R1_PIECES, type PieceSpec } from '../unit/track/helpers';

const SAVED_AT = '2026-11-09T10:15:00.000Z';
/** Safety cap while waiting for real guests to walk in and board. */
const MAX_WAIT_TICKS = 40_000;

function run(world: World, cmd: Command): Extract<CommandResult, { ok: true }> {
  const r = executeCommand(world, cmd);
  if (!r.ok) throw new Error(`${cmd.type} failed: ${r.reason}`);
  return r;
}

function addPiece(world: World, rideId: number, spec: PieceSpec): void {
  const p = typeof spec === 'string' ? { id: spec } : spec;
  run(world, { type: 'addTrackPiece', rideId, defId: p.id, chain: p.chain, brakeSpeed: p.brakeSpeed });
}

function riding(data: TrackRideData): boolean {
  return data.trains.some((t) => t.state === 'running' && t.v > 0 && t.seats.some((g) => g >= 0));
}

/** R1 at (4, 2) heading +x, a queue and footpaths to the park entrance, tested and open; the park is open. */
function buildPark(): { world: World; rideId: number } {
  const world = makeTestWorld(2026, 'Coaster Park');
  // Paths first, so the drop at (16, 6) skips its support over the footpath (span rule, §4.5).
  run(world, { type: 'buildPathLine', x0: 31, y0: 59, x1: 31, y1: 6, kind: 'footpath' });
  run(world, { type: 'buildPathLine', x0: 30, y0: 6, x1: 5, y1: 6, kind: 'footpath' });
  run(world, { type: 'buildPathLine', x0: 6, y0: 4, x1: 6, y1: 5, kind: 'footpath' });
  run(world, { type: 'buildPathLine', x0: 4, y0: 4, x1: 4, y1: 6, kind: 'queue' });

  const placed = run(world, { type: 'placeStation', typeId: 'steel_coaster', x: 4, y: 2, dir: EAST });
  const rideId = placed.id as number;
  for (const spec of R1_PIECES) addPiece(world, rideId, spec);
  const data = world.state.track.rides[String(rideId)]!;
  expect(data.circuitClosed).toBe(true);

  expect(run(world, { type: 'placeTrackGate', rideId, kind: 'entrance', x: 4, y: 3 }).warnings).toEqual([]);
  expect(run(world, { type: 'placeTrackGate', rideId, kind: 'exit', x: 6, y: 3 }).warnings).toEqual([]);
  run(world, { type: 'startTestRun', rideId });
  runTicks(world, (data.testRun?.ticksLeft ?? 0) + 1);
  expect(data.test?.passed).toBe(true);
  const ride = world.state.rides.find((r) => r.id === rideId)!;
  expect(canOpenTrackRide(world, ride)).toBeNull();
  run(world, { type: 'setRideOpen', rideId, open: true });
  // $5: below every arriving guest's fee tolerance with one open ride ($7.50 × 0.8–1.2), so guests come in.
  run(world, { type: 'setEntranceFee', fee: 500 });
  run(world, { type: 'setParkOpen', open: true });
  expect(validateState(world.state)).toBeNull();
  return { world, rideId };
}

describe('track save round trip with moving trains (phase-2 §9.1)', () => {
  it('save → load mid-ride, then 1,000 more ticks: same state hash as the run without the save', () => {
    const { world, rideId } = buildPark();
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
