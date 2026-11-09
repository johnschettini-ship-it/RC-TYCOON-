import { describe, expect, it } from 'vitest';
import { executeCommand } from '../../src/sim/commands';
import { validateState } from '../../src/save';
import { makeTestWorld, placeRideDirect, placeStallDirect } from '../helpers/world';

describe('demolish clears references across workstreams (integration)', () => {
  it('ends a Ride Spotlight on the removed ride and keeps the state loadable', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 20, 20);
    w.state.management.campaigns.push({ type: 'ride_spotlight', targetId: ride.id, endTick: w.state.tick + 3600 });
    const r = executeCommand(w, { type: 'demolish', x: 21, y: 21 });
    expect(r.ok).toBe(true);
    expect(w.state.rides).toHaveLength(0);
    expect(w.state.management.campaigns).toHaveLength(0);
    expect(validateState(w.state)).toBeNull();
  });

  it('ends a Snack Deal on the removed stall', () => {
    const w = makeTestWorld();
    const stall = placeStallDirect(w, 'snack_shack', 10, 10, 2);
    w.state.management.campaigns.push({ type: 'snack_deal', targetId: stall.id, endTick: w.state.tick + 3600 });
    expect(executeCommand(w, { type: 'demolish', x: 10, y: 10 }).ok).toBe(true);
    expect(w.state.management.campaigns).toHaveLength(0);
    expect(validateState(w.state)).toBeNull();
  });
});
