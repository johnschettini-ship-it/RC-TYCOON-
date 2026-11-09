/**
 * Findings from the W2-D integration games, kept as executable checks.
 * `it.fails` marks a known problem: the test states the wanted behaviour and fails today.
 * When the fix lands, the `it.fails` turns red; change it to `it` then.
 */
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '../../src/data/tuning/core';
import { breakDown } from '../../src/sim/breakdowns/api';
import { makeTestWorld, runTicks } from '../helpers/world';
import { buildPhase1Park } from './scenario';

describe('finding: a broken ride in a park without a Mechanic', { timeout: 60_000 }, () => {
  /**
   * KNOWN GAP (Phase 1 §9 vs Phase 3 §4.5). Riders of a `stopped` or `gate_stuck` flat ride stay on board until a
   * Mechanic fixes it. A park with no Mechanic (every Phase 1-style park) never fixes it, so the riders stay in
   * `riding` forever and break the Phase 1 rule "no guest stuck in one state for > 2 game days". It happens in
   * about 1 in 5 three-month Phase 1 games (for example seed 777 of the Phase 1 integration park).
   *
   * Suggested fix (W1-H, `src/sim/breakdowns/update.ts`): when a flat ride has been `broken` (not `slow_running`)
   * for `EVACUATE_TICKS` (new constant in `src/data/tuning/staff.ts`, suggested 400 = 8 game hours) and no
   * Mechanic is assigned to it, let the riders off safely — call `unloadRiders(world, ride)` from
   * `src/sim/rides/flat/api.ts` (it runs `finishRide`, which places each guest on the exit path) and keep the ride
   * `broken`. Riders keep the "We are stuck!" happiness loss they already had. Track rides would need the same
   * rule at their station (W1-G).
   */
  it.fails('riders get off within 2 game days even when nobody can fix the ride', () => {
    const w = makeTestWorld(12345);
    const park = buildPhase1Park(w);
    const ride = w.state.rides.find((r) => r.id === park.carousel);
    if (!ride) throw new Error('no carousel');
    for (let k = 0; k < 4_000 && !(ride.cycle.phase === 'running' && ride.riders.length > 0); k++) runTicks(w, 1);
    expect(ride.riders.length).toBeGreaterThan(0);
    const riders = [...ride.riders];
    breakDown(w, ride, 'stopped');
    expect(w.state.staff.members).toHaveLength(0);
    runTicks(w, 2 * TICKS_PER_DAY + 1);
    const stillRiding = riders.filter((id) => w.state.guests.find((g) => g.id === id)?.state === 'riding');
    expect(stillRiding).toEqual([]);
  });
});
