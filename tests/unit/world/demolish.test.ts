import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/rides/flat/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/sim/rides/flat/api')>()),
  stopRide: vi.fn(),
}));
vi.mock('../../../src/sim/guests/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/sim/guests/api')>()),
  forgetDestination: vi.fn(),
}));
vi.mock('../../../src/sim/rides/track/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/sim/rides/track/api')>()),
  demolishTrackRide: vi.fn(),
}));

import { executeCommand } from '../../../src/sim/commands';
import { stopRide } from '../../../src/sim/rides/flat/api';
import { forgetDestination } from '../../../src/sim/guests/api';
import { demolishTrackRide } from '../../../src/sim/rides/track/api';
import { Content, PathItem, tileIndex } from '../../../src/sim/map';
import { currentLedger } from '../../../src/sim/economy/ledger';
import { distanceTo, queueOwner } from '../../../src/sim/pathing';
import { getFlatRideDef, getStallDef } from '../../../src/data/catalog';
import { DEMOLISH_REFUND_PERCENT } from '../../../src/data/tuning/world';
import type { World } from '../../../src/sim/types';
import type { Ride } from '../../../src/sim/rides/types';
import type { Staff } from '../../../src/sim/staff/types';
import {
  addGuestDirect,
  makeTestWorld,
  placeFootpath,
  placeQueue,
  placeRideDirect,
  placeStallDirect,
  stateHash,
} from '../../helpers/world';

const T = (w: World, x: number, y: number): number => tileIndex(w.state.map, x, y);

beforeEach(() => {
  vi.mocked(stopRide).mockReset();
  vi.mocked(forgetDestination).mockReset();
  vi.mocked(demolishTrackRide).mockReset();
});

function expectBlocked(w: World, x: number, y: number, reason: string): void {
  const before = stateHash(w);
  expect(executeCommand(w, { type: 'demolish', x, y })).toEqual({ ok: false, reason });
  expect(stateHash(w)).toBe(before);
}

describe('demolish paths (Phase 1 §4.1, master R15)', () => {
  it('removes a footpath or queue with no refund', () => {
    const w = makeTestWorld();
    const f = placeFootpath(w, 10, 10);
    const q = placeQueue(w, 11, 10);
    const cash = w.state.park.cash;
    const ledger = JSON.stringify(currentLedger(w));
    expect(executeCommand(w, { type: 'demolish', x: 10, y: 10 })).toEqual({ ok: true, cost: 0, warnings: [] });
    expect(executeCommand(w, { type: 'demolish', x: 11, y: 10 })).toEqual({ ok: true, cost: 0, warnings: [] });
    expect(w.state.map.content[f]).toBe(Content.Empty);
    expect(w.state.map.content[q]).toBe(Content.Empty);
    expect(w.state.park.cash).toBe(cash);
    expect(JSON.stringify(currentLedger(w))).toBe(ledger);
  });

  it('clears path items, litter, and mess with the path', () => {
    const w = makeTestWorld();
    const f = placeFootpath(w, 10, 10);
    const m = w.state.map;
    m.pathItem[f] = PathItem.Bench;
    m.pathItemFlags[f] = 1;
    m.binFill[f] = 3;
    m.litter[f] = 4;
    m.mess[f] = 2;
    executeCommand(w, { type: 'demolish', x: 10, y: 10 });
    expect([m.pathItem[f], m.pathItemFlags[f], m.binFill[f], m.litter[f], m.mess[f]]).toEqual([0, 0, 0, 0, 0]);
  });

  it('updates the network', () => {
    const w = makeTestWorld();
    expect(distanceTo(w, T(w, 31, 60), 'exit')).toBe(3);
    executeCommand(w, { type: 'demolish', x: 31, y: 61 });
    expect(distanceTo(w, T(w, 31, 60), 'exit')).toBeNull();
  });

  it('cannot remove the park entrance', () => {
    const w = makeTestWorld();
    expectBlocked(w, 31, 63, 'You cannot remove the park entrance');
  });

  it('fails on an empty tile or outside the map and changes nothing', () => {
    const w = makeTestWorld();
    expectBlocked(w, 10, 10, 'Nothing to remove');
    expectBlocked(w, -1, 10, 'Nothing to remove');
    expectBlocked(w, 10, 64, 'Nothing to remove');
  });
});

describe('demolish a flat ride', () => {
  function rideWithQueue(w: World): Ride {
    const ride = placeRideDirect(w, 'carousel', 30, 50, 0); // entrance outside (31, 53), exit outside (31, 49)
    for (let y = 53; y <= 59; y++) placeQueue(w, 31, y);
    placeFootpath(w, 31, 49);
    const g1 = addGuestDirect(w, T(w, 31, 53), { state: 'queueing', target: `ride:${ride.id}`, activityId: ride.id });
    const g2 = addGuestDirect(w, T(w, 31, 54), { state: 'queueing', target: `ride:${ride.id}`, activityId: ride.id });
    ride.queue = [g1.id, g2.id];
    return ride;
  }

  it('stops the ride, makes guests re-plan, clears tiles, refunds 50%, and removes the record', () => {
    const w = makeTestWorld();
    const ride = rideWithQueue(w);
    const id = ride.id;
    expect(queueOwner(w, T(w, 31, 55))).toBe(id);
    const def = getFlatRideDef('carousel')!;
    const refund = (def.buildCost * DEMOLISH_REFUND_PERCENT) / 100;
    const cash = w.state.park.cash;
    const seen: { stop: boolean[]; forget: boolean[] } = { stop: [], forget: [] };
    vi.mocked(stopRide).mockImplementation((world, r) => {
      seen.stop.push(world.state.rides.includes(r));
    });
    vi.mocked(forgetDestination).mockImplementation((world) => {
      seen.forget.push(world.state.rides.some((r) => r.id === id));
    });

    const r = executeCommand(w, { type: 'demolish', x: 32, y: 52 }); // any footprint tile
    expect(r).toEqual({ ok: true, cost: -refund, warnings: [] });

    expect(stopRide).toHaveBeenCalledTimes(1);
    expect(vi.mocked(stopRide).mock.calls[0]?.[0]).toBe(w);
    expect(vi.mocked(stopRide).mock.calls[0]?.[1]).toBe(ride);
    expect(seen.stop).toEqual([true]); // stopped while the ride still exists
    expect(forgetDestination).toHaveBeenCalledWith(w, `ride:${id}`);
    expect(seen.forget).toEqual([false]); // guests re-plan after the ride is gone
    expect(w.state.rides).toEqual([]);
    for (let y = 50; y <= 52; y++) {
      for (let x = 30; x <= 32; x++) {
        expect(w.state.map.content[T(w, x, y)]).toBe(Content.Empty);
        expect(w.state.map.contentRef[T(w, x, y)]).toBe(-1);
      }
    }
    expect(w.state.park.cash).toBe(cash + refund);
    expect(currentLedger(w).lines.demolitionRefunds).toBe(refund);
    // Queue paths stay, but no longer belong to a ride.
    expect(w.state.map.content[T(w, 31, 55)]).toBe(Content.Queue);
    expect(queueOwner(w, T(w, 31, 55))).toBeNull();
  });

  it('refunds whole cents (rounded down)', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 30, 30, 0);
    ride.totalBuildCost = 12_345;
    const cash = w.state.park.cash;
    expect(executeCommand(w, { type: 'demolish', x: 30, y: 30 })).toEqual({ ok: true, cost: -6_172, warnings: [] });
    expect(w.state.park.cash).toBe(cash + 6_172);
  });

  it('setup mode removes without a refund line', () => {
    const w = makeTestWorld();
    rideWithQueue(w);
    const cash = w.state.park.cash;
    const r = executeCommand(w, { type: 'demolish', x: 30, y: 50 }, { setup: true });
    expect(r.ok).toBe(true);
    expect(w.state.rides).toEqual([]);
    expect(w.state.park.cash).toBe(cash);
    expect(currentLedger(w).lines.demolitionRefunds).toBe(0);
  });

  it('clears staff and message references to the ride', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 30, 30, 0);
    const other = placeRideDirect(w, 'carousel', 40, 30, 0);
    const mech: Staff = {
      id: 900, type: 'mechanic', name: 'Mo', tile: T(w, 31, 60), nextTile: -1, progress: 0, dir: 0,
      state: 'fixing', stateTicks: 12, targetTile: T(w, 31, 29), targetRideId: ride.id, patrol: null, costume: null,
      hiredTick: 0, hoursThisMonth: 0, task: 'fix', route: [], prevTile: -1, nextRecheckTick: 0,
      fixRideId: ride.id, savedRideStatus: null, walkTicksLeft: 0,
    };
    w.state.staff.members.push(mech);
    w.state.staff.pendingBreakdowns = [ride.id, other.id];
    w.state.management.messages.push({ id: 1, tick: 0, category: 'breakdown', textId: 'x', tile: T(w, 31, 31), entityId: ride.id });
    executeCommand(w, { type: 'demolish', x: 31, y: 31 });
    expect(w.state.staff.pendingBreakdowns).toEqual([other.id]);
    expect(mech).toMatchObject({ targetRideId: -1, targetTile: -1, state: 'walking', stateTicks: 0 });
    expect(w.state.management.messages[0]?.entityId).toBe(-1);
  });
});

describe('demolish a stall', () => {
  it('makes guests re-plan, clears the tile, refunds 50%, and removes the record', () => {
    const w = makeTestWorld();
    placeFootpath(w, 20, 19);
    const stall = placeStallDirect(w, 'fizz_stand', 20, 20, 0);
    const def = getStallDef('fizz_stand')!;
    const refund = (def.buildCost * DEMOLISH_REFUND_PERCENT) / 100;
    const cash = w.state.park.cash;
    let stillThere = true;
    vi.mocked(forgetDestination).mockImplementation((world) => {
      stillThere = world.state.stalls.some((s) => s.id === stall.id);
    });
    expect(distanceTo(w, T(w, 20, 19), `stall:${stall.id}`)).toBe(0);
    expect(executeCommand(w, { type: 'demolish', x: 20, y: 20 })).toEqual({ ok: true, cost: -refund, warnings: [] });
    expect(forgetDestination).toHaveBeenCalledWith(w, `stall:${stall.id}`);
    expect(stillThere).toBe(false);
    expect(stopRide).not.toHaveBeenCalled();
    expect(w.state.stalls).toEqual([]);
    expect(w.state.map.content[T(w, 20, 20)]).toBe(Content.Empty);
    expect(w.state.map.contentRef[T(w, 20, 20)]).toBe(-1);
    expect(w.state.park.cash).toBe(cash + refund);
    expect(currentLedger(w).lines.demolitionRefunds).toBe(refund);
    expect(distanceTo(w, T(w, 20, 19), `stall:${stall.id}`)).toBeNull();
  });
});

describe('demolish a track ride', () => {
  function trackRide(w: World): Ride {
    const ride = placeRideDirect(w, 'carousel', 30, 30, 0);
    ride.kind = 'track';
    ride.defId = 'steel_coaster';
    const t = T(w, 40, 40);
    w.state.map.content[t] = Content.Track;
    w.state.map.contentRef[t] = ride.id;
    return ride;
  }

  it('delegates to demolishTrackRide from a track tile or a station building tile', () => {
    const w = makeTestWorld();
    const ride = trackRide(w);
    vi.mocked(demolishTrackRide).mockReturnValue({ ok: true, cost: -100, warnings: [] });
    expect(executeCommand(w, { type: 'demolish', x: 40, y: 40 })).toEqual({ ok: true, cost: -100, warnings: [] });
    expect(demolishTrackRide).toHaveBeenCalledWith(w, ride, { setup: false });
    expect(executeCommand(w, { type: 'demolish', x: 30, y: 30 }, { setup: true }).ok).toBe(true);
    expect(demolishTrackRide).toHaveBeenLastCalledWith(w, ride, { setup: true });
    expect(stopRide).not.toHaveBeenCalled();
  });

  it('passes a failure through unchanged', () => {
    const w = makeTestWorld();
    trackRide(w);
    vi.mocked(demolishTrackRide).mockReturnValue({ ok: false, reason: 'Not implemented yet' });
    expectBlocked(w, 40, 40, 'Not implemented yet');
  });
});
