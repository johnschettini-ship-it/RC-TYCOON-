/**
 * Save round-trip under load (W2-D, master §8, Phase 3 §9.3–9.4): a busy park with 500+ guests in every state,
 * staff at work, broken rides, running campaigns, a loan, litter, and messages is saved mid-game and loaded.
 * The loaded game continues for 1,000 ticks and must end with the same state hash as the game that never
 * left memory. This catches derived data (distance fields, staff fields, spatial index) that behaves
 * differently after a rebuild, and any field the save drops or changes.
 */
import { describe, expect, it } from 'vitest';
import { deserialize, GAME_VERSION, serialize, validateState } from '../../src/save';
import { breakDown } from '../../src/sim/breakdowns/api';
import { executeCommand } from '../../src/sim/commands';
import { spawnGuests } from '../../src/sim/guests/arrivals';
import type { World } from '../../src/sim/types';
import { makeTestWorld, runTicks, stateHash } from '../helpers/world';
import { buildPhase3Park, must, totalLitter } from './scenario';

const SEED = 8080;

function busyPark(): World {
  const world = makeTestWorld(SEED, 'Busy Park');
  const park = buildPhase3Park(world);
  must(world, { type: 'borrow', amount: 300_000 });
  runTicks(world, 2_000);
  // A crowd: spawn at the gate (fee checks apply) until 520 guests are in, then let them spread out.
  must(world, { type: 'setEntranceFee', fee: 0 });
  while (world.state.guests.length < 520) spawnGuests(world, 20);
  runTicks(world, 300);
  while (world.state.guests.length < 520) spawnGuests(world, 20);
  must(world, { type: 'startCampaign', campaignType: 'radio_jingle' });
  must(world, { type: 'startCampaign', campaignType: 'ride_spotlight', targetId: park.swingTower });
  must(world, { type: 'startCampaign', campaignType: 'snack_deal', targetId: park.snack });
  // Two rides break down with riders on board or in the queue; the Mechanic can fix only one at a time.
  for (const id of [park.carousel, park.teacups]) {
    const ride = world.state.rides.find((r) => r.id === id);
    if (!ride) throw new Error('ride missing');
    breakDown(world, ride, 'stopped');
  }
  runTicks(world, 37);
  return world;
}

describe('save round-trip under load', () => {
  it('a busy park saves, loads, and continues 1,000 ticks to the same state hash', () => {
    const live = busyPark();
    const s = live.state;
    // The scene really is busy.
    expect(s.guests.length).toBeGreaterThanOrEqual(500);
    const states = new Set(s.guests.map((g) => g.state));
    for (const st of ['walking', 'queueing', 'riding'] as const) expect(states.has(st), st).toBe(true);
    expect(s.staff.members.length).toBe(5);
    expect(s.rides.filter((r) => r.status === 'broken').length).toBeGreaterThanOrEqual(1);
    expect(s.management.campaigns.length).toBe(3);
    expect(s.management.loan.balance).toBe(300_000);
    expect(s.management.messages.length).toBeGreaterThan(0);
    expect(totalLitter(live) + s.map.binFill.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(validateState(s)).toBeNull();

    const json = serialize(live, GAME_VERSION, '2026-11-09T12:00:00.000Z');
    const loaded = deserialize(json);
    if (!loaded.ok) throw new Error(loaded.error);
    expect(stateHash(loaded.world)).toBe(stateHash(live));

    for (let step = 0; step < 10; step++) {
      runTicks(live, 100);
      runTicks(loaded.world, 100);
      expect(stateHash(loaded.world), `after ${(step + 1) * 100} ticks`).toBe(stateHash(live));
    }
    expect(validateState(loaded.world.state)).toBeNull();
  }, 60_000);

  it('a save of the loaded game is byte-identical to a save of the live game', () => {
    const live = busyPark();
    const first = serialize(live, GAME_VERSION, 'fixed');
    const loaded = deserialize(first);
    if (!loaded.ok) throw new Error(loaded.error);
    expect(serialize(loaded.world, GAME_VERSION, 'fixed')).toBe(first);
    // Commands work on the loaded world (derived data is rebuilt on demand).
    const r = executeCommand(loaded.world, { type: 'buildPath', x: 20, y: 20, kind: 'footpath' });
    expect(r.ok).toBe(true);
  }, 60_000);
});
