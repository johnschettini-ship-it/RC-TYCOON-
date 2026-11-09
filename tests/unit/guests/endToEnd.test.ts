/**
 * Guests against the real merged systems (no mocks): W1-C pathing, W1-E rides, stalls, economy and
 * arrivals, W1-I weather and campaign hooks, W1-F state validation. Runs whole ticks with `stepTick`.
 */
import { describe, expect, it } from 'vitest';
import { markNetworkDirty, isWalkable } from '../../../src/sim/pathing';
import { stepTick } from '../../../src/sim/tick';
import { executeCommand } from '../../../src/sim/commands';
import { Content } from '../../../src/sim/map';
import { validateState } from '../../../src/save/codec';
import { TICKS_PER_DAY, TICKS_PER_MONTH } from '../../../src/data/tuning/core';
import { makeTestWorld, stateHash } from '../../helpers/world';
import { buildPark } from './park';
import type { World } from '../../../src/sim/types';

function run(w: World, n: number, check?: (w: World) => void): void {
  for (let i = 0; i < n; i++) {
    stepTick(w);
    if (check && w.state.tick % 100 === 0) check(w);
  }
}

function newPark(seed: number): { w: World; p: ReturnType<typeof buildPark> } {
  const w = makeTestWorld(seed);
  const p = buildPark(w);
  markNetworkDirty(w);
  return { w, p };
}

/** Invariants that hold at every check: valid state, nobody stranded, nobody stuck. */
function invariants(w: World): void {
  expect(validateState(w.state)).toBeNull();
  for (const g of w.state.guests) {
    if (g.state !== 'riding') {
      const ok =
        g.tile === w.state.map.entranceTile ||
        isWalkable(w, g.tile, 'guest') ||
        w.state.map.content[g.tile] === Content.Queue;
      expect(ok, `guest ${g.id} (${g.state}) on tile ${g.tile}`).toBe(true);
    }
    expect(g.stateTicks, `guest ${g.id} stuck in ${g.state}`).toBeLessThanOrEqual(2 * TICKS_PER_DAY);
  }
}

describe('guests in the full simulation', () => {
  it('arrive, ride, buy, and leave over one game month with every invariant holding', () => {
    const { w, p } = newPark(31337);
    run(w, TICKS_PER_MONTH, invariants);
    const s = w.state;
    expect(s.park.guestsArrivedTotal).toBeGreaterThan(20);
    expect(p.carousel.totals.riders + p.swing.totals.riders).toBeGreaterThan(10);
    expect(p.swing.totals.riders).toBeGreaterThan(0);
    expect(p.carousel.totals.riders).toBeGreaterThan(0);
    expect(p.snack.totals.sales + p.fizz.totals.sales + p.restrooms.totals.sales).toBeGreaterThan(0);
    expect(s.park.recentLeavers.length).toBeGreaterThan(0);
    const thoughts = new Set(s.guests.flatMap((g) => g.thoughts.map((t) => t.id)));
    expect(thoughts.size).toBeGreaterThan(1);
  });

  it('is deterministic: same seed, same state hash', () => {
    const a = newPark(9);
    const b = newPark(9);
    run(a.w, 2000);
    run(b.w, 2000);
    expect(stateHash(a.w)).toBe(stateHash(b.w));
  });

  it('demolish commands mid-game: busy ride, its queue, a stall, and paths under guests (Review Focus 1)', () => {
    const { w, p } = newPark(5);
    run(w, 1500);
    const id = p.swing.id;
    const involved = w.state.guests.filter((g) => g.target === `ride:${id}` || g.activityId === id);
    expect(involved.length).toBeGreaterThan(0);
    const demolish = (x: number, y: number): void => {
      expect(executeCommand(w, { type: 'demolish', x, y }).ok).toBe(true);
    };
    demolish(35, 55); // the ride: riders finish, the queue empties, guests forget it
    for (const g of w.state.guests) {
      expect(g.target).not.toBe(`ride:${id}`);
      expect(g.activityId).not.toBe(id);
    }
    for (let y = 57; y <= 59; y++) demolish(35, y); // its queue line
    demolish(30, 59); // the Snack Shack
    const crowded = [33, 34, 36].map((x) => p.main(x)); // main path tiles that may hold guests
    for (const t of crowded) demolish(t % 64, Math.floor(t / 64));
    expect(validateState(w.state)).toBeNull();
    run(w, 1);
    invariants(w); // one tick later nobody stands on a removed tile
    run(w, 1200, invariants);
    expect(w.state.guests.some((g) => g.target === `ride:${id}` || g.target === `stall:${p.snack.id}`)).toBe(false);
  });
});
