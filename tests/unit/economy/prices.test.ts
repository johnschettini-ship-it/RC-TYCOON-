import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/guests/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/sim/guests/api')>();
  return { ...real, boardRide: vi.fn(), finishRide: vi.fn(), leaveQueue: vi.fn(), forgetDestination: vi.fn() };
});
vi.mock('../../../src/sim/rides/track/api', () => ({ canOpenTrackRide: vi.fn(), demolishTrackRide: vi.fn() }));

import { forgetDestination, leaveQueue } from '../../../src/sim/guests/api';
import { canOpenTrackRide } from '../../../src/sim/rides/track/api';
import { executeCommand } from '../../../src/sim/commands';
import { PRICE_ERRORS } from '../../../src/sim/commands/prices';
import {
  ENTRANCE_FEE_MAX,
  ENTRANCE_FEE_STEP,
  PARK_NAME_MAX,
  PRICE_MAX,
  PRICE_STEP,
} from '../../../src/data/tuning/economy';
import { addGuestDirect, makeTestWorld, placeRideDirect, placeStallDirect, stateHash } from '../../helpers/world';
import type { World } from '../../../src/sim/types';

const canOpen = vi.mocked(canOpenTrackRide);
const leave = vi.mocked(leaveQueue);
const forget = vi.mocked(forgetDestination);

beforeEach(() => {
  canOpen.mockReset().mockReturnValue(null);
  leave.mockReset();
  forget.mockReset();
});

/** A failed command returns the reason and leaves the state unchanged. */
function expectFail(world: World, cmd: Parameters<typeof executeCommand>[1], reason: string): void {
  const before = stateHash(world);
  expect(executeCommand(world, cmd)).toEqual({ ok: false, reason });
  expect(stateHash(world)).toBe(before);
}

describe('error strings (master R4)', () => {
  it('have no final period', () => {
    for (const s of Object.values(PRICE_ERRORS)) expect(s.endsWith('.')).toBe(false);
  });
});

describe('setRidePrice and setStallPrice ($0–$20 in $0.10 steps)', () => {
  it('accept $0, $20, and every $0.10 step', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10);
    const stall = placeStallDirect(w, 'snack_shack', 20, 20);
    for (const price of [0, PRICE_STEP, 150, 990, PRICE_MAX]) {
      expect(executeCommand(w, { type: 'setRidePrice', rideId: ride.id, price })).toEqual({ ok: true, cost: 0, warnings: [] });
      expect(ride.price).toBe(price);
      expect(executeCommand(w, { type: 'setStallPrice', stallId: stall.id, price }).ok).toBe(true);
      expect(stall.price).toBe(price);
    }
  });

  it('reject prices outside $0–$20', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10);
    const stall = placeStallDirect(w, 'snack_shack', 20, 20);
    for (const price of [-10, PRICE_MAX + PRICE_STEP, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectFail(w, { type: 'setRidePrice', rideId: ride.id, price }, 'Price must be between $0 and $20');
      expectFail(w, { type: 'setStallPrice', stallId: stall.id, price }, 'Price must be between $0 and $20');
    }
  });

  it('reject prices that are not multiples of $0.10', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10);
    const stall = placeStallDirect(w, 'snack_shack', 20, 20);
    for (const price of [1, 155, 1999, 10.5]) {
      expectFail(w, { type: 'setRidePrice', rideId: ride.id, price }, 'Price must be in steps of $0.10');
      expectFail(w, { type: 'setStallPrice', stallId: stall.id, price }, 'Price must be in steps of $0.10');
    }
  });

  it('reject unknown ids', () => {
    const w = makeTestWorld();
    const stall = placeStallDirect(w, 'snack_shack', 20, 20);
    expectFail(w, { type: 'setRidePrice', rideId: stall.id, price: 100 }, 'Ride not found');
    expectFail(w, { type: 'setStallPrice', stallId: 999, price: 100 }, 'Stall not found');
  });
});

describe('setEntranceFee ($0–$50 in $1 steps)', () => {
  it('accepts $0, $50, and whole dollars', () => {
    const w = makeTestWorld();
    for (const fee of [0, ENTRANCE_FEE_STEP, 2_500, ENTRANCE_FEE_MAX]) {
      expect(executeCommand(w, { type: 'setEntranceFee', fee }).ok).toBe(true);
      expect(w.state.park.entranceFee).toBe(fee);
    }
  });

  it('rejects fees outside $0–$50', () => {
    const w = makeTestWorld();
    for (const fee of [-100, ENTRANCE_FEE_MAX + ENTRANCE_FEE_STEP, Number.NaN]) {
      expectFail(w, { type: 'setEntranceFee', fee }, 'Entrance fee must be between $0 and $50');
    }
  });

  it('rejects fees that are not whole dollars', () => {
    const w = makeTestWorld();
    for (const fee of [50, 1_010, 4_999]) {
      expectFail(w, { type: 'setEntranceFee', fee }, 'Entrance fee must be in whole dollars');
    }
  });
});

describe('setRideOpen', () => {
  it('opens and closes a flat ride', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10);
    expect(executeCommand(w, { type: 'setRideOpen', rideId: ride.id, open: true }).ok).toBe(true);
    expect(ride.status).toBe('open');
    expect(executeCommand(w, { type: 'setRideOpen', rideId: ride.id, open: false }).ok).toBe(true);
    expect(ride.status).toBe('closed');
    expect(forget).toHaveBeenCalledWith(w, `ride:${ride.id}`);
  });

  it('closing empties the queue through leaveQueue, front first', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10);
    ride.status = 'open';
    const ids = [1, 2, 3].map(() => {
      const g = addGuestDirect(w, 0, { state: 'queueing', activityId: ride.id });
      ride.queue.push(g.id);
      return g.id;
    });
    executeCommand(w, { type: 'setRideOpen', rideId: ride.id, open: false });
    expect(leave.mock.calls.map((c) => [c[1].id, c[2], c[3]])).toEqual(ids.map((id) => [id, ride, null]));
    expect(ride.queue).toEqual([]);
  });

  it('a broken ride keeps its status and opens or stays closed after the fix', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10);
    ride.status = 'broken';
    ride.statusBeforeBreakdown = 'open';
    expect(executeCommand(w, { type: 'setRideOpen', rideId: ride.id, open: false }).ok).toBe(true);
    expect(ride.status).toBe('broken');
    expect(ride.statusBeforeBreakdown).toBe('closed');
    expect(executeCommand(w, { type: 'setRideOpen', rideId: ride.id, open: true }).ok).toBe(true);
    expect(ride.status).toBe('broken');
    expect(ride.statusBeforeBreakdown).toBe('open');
  });

  it('a track ride opens only when canOpenTrackRide allows it', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10);
    ride.kind = 'track';
    ride.status = 'building';
    canOpen.mockReturnValue('The track is not a complete circuit');
    expectFail(w, { type: 'setRideOpen', rideId: ride.id, open: true }, 'The track is not a complete circuit');
    expect(canOpen).toHaveBeenCalledWith(w, ride);
    canOpen.mockReturnValue(null);
    expect(executeCommand(w, { type: 'setRideOpen', rideId: ride.id, open: true }).ok).toBe(true);
    expect(ride.status).toBe('open');
    expect(executeCommand(w, { type: 'setRideOpen', rideId: ride.id, open: false }).ok).toBe(true);
    expect(ride.status).toBe('closed');
  });

  it('rejects an unknown ride', () => {
    const w = makeTestWorld();
    expectFail(w, { type: 'setRideOpen', rideId: 42, open: true }, 'Ride not found');
  });
});

describe('setParkOpen', () => {
  it('opens and closes the park', () => {
    const w = makeTestWorld();
    expect(w.state.park.open).toBe(false);
    expect(executeCommand(w, { type: 'setParkOpen', open: true })).toEqual({ ok: true, cost: 0, warnings: [] });
    expect(w.state.park.open).toBe(true);
    expect(executeCommand(w, { type: 'setParkOpen', open: false }).ok).toBe(true);
    expect(w.state.park.open).toBe(false);
  });
});

describe('renamePark (1–32 characters after trim)', () => {
  it('stores the trimmed name', () => {
    const w = makeTestWorld();
    expect(executeCommand(w, { type: 'renamePark', name: '  Frost Peaks  ' }).ok).toBe(true);
    expect(w.state.park.name).toBe('Frost Peaks');
    expect(executeCommand(w, { type: 'renamePark', name: 'A' }).ok).toBe(true);
    expect(executeCommand(w, { type: 'renamePark', name: 'x'.repeat(PARK_NAME_MAX) }).ok).toBe(true);
    expect(w.state.park.name).toHaveLength(32);
  });

  it('rejects empty, blank, and too-long names', () => {
    const w = makeTestWorld();
    for (const name of ['', '   ', 'x'.repeat(PARK_NAME_MAX + 1), ` ${'y'.repeat(33)} `]) {
      expectFail(w, { type: 'renamePark', name }, 'Park name must be 1 to 32 characters');
    }
  });
});
