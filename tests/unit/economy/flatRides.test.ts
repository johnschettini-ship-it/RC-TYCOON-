import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/guests/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/sim/guests/api')>();
  return { ...real, boardRide: vi.fn(), finishRide: vi.fn(), leaveQueue: vi.fn(), forgetDestination: vi.fn() };
});
vi.mock('../../../src/sim/breakdowns/api', () => ({ onRideDispatch: vi.fn(), reliabilityScore: vi.fn(() => 1) }));

import { boardRide, finishRide, leaveQueue } from '../../../src/sim/guests/api';
import { onRideDispatch } from '../../../src/sim/breakdowns/api';
import { updateFlatRides } from '../../../src/sim/rides/flat/update';
import { stopRide } from '../../../src/sim/rides/flat/api';
import { executeCommand } from '../../../src/sim/commands';
import { FLAT_RIDES, getFlatRideDef } from '../../../src/data/catalog';
import {
  LOAD_MAX_WAIT,
  SLOW_RUNNING_BREAKDOWN,
  SLOW_RUNNING_CYCLE_FACTOR,
  UNLOAD_TICKS,
} from '../../../src/data/tuning/economy';
import { addGuestDirect, makeTestWorld, placeRideDirect } from '../../helpers/world';
import type { World } from '../../../src/sim/types';
import type { Ride } from '../../../src/sim/rides/types';

const board = vi.mocked(boardRide);
const finish = vi.mocked(finishRide);
const leave = vi.mocked(leaveQueue);
const dispatch = vi.mocked(onRideDispatch);

function setup(defId = 'carousel'): { world: World; ride: Ride } {
  const world = makeTestWorld();
  const ride = placeRideDirect(world, defId, 10, 10);
  ride.status = 'open';
  return { world, ride };
}

function queueGuests(world: World, ride: Ride, n: number): number[] {
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const g = addGuestDirect(world, ride.entrance?.outside ?? 0, { state: 'queueing', activityId: ride.id });
    ride.queue.push(g.id);
    ids.push(g.id);
  }
  return ids;
}

function update(world: World, n = 1): void {
  for (let i = 0; i < n; i++) {
    updateFlatRides(world);
    world.state.tick++;
  }
}

/** Phase after each update, run-length encoded: [phase, updates]. */
function phaseRuns(world: World, ride: Ride, updates: number): [string, number][] {
  const runs: [string, number][] = [];
  for (let i = 0; i < updates; i++) {
    update(world);
    const last = runs[runs.length - 1];
    if (last && last[0] === ride.cycle.phase) last[1]++;
    else runs.push([ride.cycle.phase, 1]);
  }
  return runs;
}

beforeEach(() => {
  board.mockReset().mockImplementation((_w, g) => {
    g.state = 'riding';
    return true;
  });
  finish.mockReset().mockImplementation((_w, g) => {
    g.state = 'walking';
  });
  leave.mockReset().mockImplementation((_w, g) => {
    g.state = 'walking';
  });
  dispatch.mockReset().mockReturnValue(false);
});

describe('flat ride cycle timings (Phase 1 §4.4)', () => {
  it.each(FLAT_RIDES.map((d) => [d.id, d.capacity, d.cycleTicks] as const))(
    '%s: full load dispatches at once, runs its cycle time, unloads in 40 ticks',
    (defId, capacity, cycleTicks) => {
      const { world, ride } = setup(defId);
      const ids = queueGuests(world, ride, capacity);
      const runs = phaseRuns(world, ride, cycleTicks + UNLOAD_TICKS + 5);
      expect(runs).toEqual([
        ['running', cycleTicks],
        ['unloading', UNLOAD_TICKS],
        ['waiting', 5],
      ]);
      expect(finish.mock.calls.map((c) => c[1].id)).toEqual(ids);
      expect(ride.riders).toEqual([]);
      expect(dispatch).toHaveBeenCalledTimes(1);
    },
  );

  it('riders finish only after the unloading ticks, in boarding order', () => {
    const { world, ride } = setup('big_wheel');
    const def = getFlatRideDef('big_wheel')!;
    const ids = queueGuests(world, ride, def.capacity);
    update(world, def.cycleTicks + UNLOAD_TICKS);
    expect(finish).not.toHaveBeenCalled();
    expect(ride.riders).toEqual(ids);
    update(world);
    expect(finish.mock.calls.map((c) => c[1].id)).toEqual(ids);
    expect(finish.mock.calls.every((c) => c[2] === ride)).toBe(true);
  });

  it('counts riders and income on the ride when guests board', () => {
    const { world, ride } = setup();
    ride.price = 250;
    queueGuests(world, ride, 3);
    update(world);
    expect(ride.totals).toEqual({ riders: 3, income: 750, ridersThisMonth: 3, incomeThisMonth: 750 });
  });
});

describe('loading rules (Phase 1 §4.4)', () => {
  it('an empty queue stays waiting', () => {
    const { world, ride } = setup();
    expect(phaseRuns(world, ride, LOAD_MAX_WAIT * 3)).toEqual([['waiting', LOAD_MAX_WAIT * 3]]);
    expect(dispatch).not.toHaveBeenCalled();
    expect(board).not.toHaveBeenCalled();
  });

  it('loading pops guests from the queue front and stops at capacity', () => {
    const { world, ride } = setup();
    const cap = getFlatRideDef('carousel')!.capacity;
    const ids = queueGuests(world, ride, cap + 3);
    update(world);
    expect(ride.riders).toEqual(ids.slice(0, cap));
    expect(ride.queue).toEqual(ids.slice(cap));
    expect(ride.cycle.phase).toBe('running');
  });

  it('with 1 rider, loading ends after 200 ticks', () => {
    const { world, ride } = setup();
    queueGuests(world, ride, 1);
    const runs = phaseRuns(world, ride, LOAD_MAX_WAIT + 1);
    expect(runs).toEqual([
      ['loading', LOAD_MAX_WAIT],
      ['running', 1],
    ]);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(world, ride);
  });

  it('guests who join during loading board, and the 200-tick limit still counts from the start', () => {
    const { world, ride } = setup();
    queueGuests(world, ride, 1);
    update(world, 100);
    queueGuests(world, ride, 2);
    update(world);
    expect(ride.riders).toHaveLength(3);
    expect(ride.cycle.phase).toBe('loading');
    update(world, LOAD_MAX_WAIT - 101);
    expect(ride.cycle.phase).toBe('loading');
    update(world);
    expect(ride.cycle.phase).toBe('running');
  });

  it('the ride dispatches as soon as it is full during loading', () => {
    const { world, ride } = setup();
    const cap = getFlatRideDef('carousel')!.capacity;
    queueGuests(world, ride, 1);
    update(world, 50);
    expect(ride.cycle.phase).toBe('loading');
    queueGuests(world, ride, cap - 1);
    update(world);
    expect(ride.cycle.phase).toBe('running');
    expect(ride.riders).toHaveLength(cap);
  });

  it('a guest who cannot board leaves the queue and the empty ride goes back to waiting', () => {
    const { world, ride } = setup();
    board.mockReturnValue(false);
    const [id] = queueGuests(world, ride, 1);
    update(world);
    expect(leave).toHaveBeenCalledTimes(1);
    expect(leave.mock.calls[0]?.[1].id).toBe(id);
    expect(leave.mock.calls[0]?.[3]).toBeNull();
    expect(ride.queue).toEqual([]);
    expect(ride.riders).toEqual([]);
    update(world);
    expect(ride.cycle.phase).toBe('waiting');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('removes a queue id whose guest no longer exists', () => {
    const { world, ride } = setup();
    ride.queue.push(9999);
    const [id] = queueGuests(world, ride, 1);
    update(world);
    expect(ride.queue).toEqual([]);
    expect(ride.riders).toEqual([id]);
  });

  it('a guest who cannot board and re-joins at once is tried only once per tick', () => {
    const { world, ride } = setup();
    board.mockReturnValue(false);
    leave.mockImplementation((_w, g, r) => {
      r.queue.push(g.id);
    });
    const [id] = queueGuests(world, ride, 1);
    update(world);
    expect(board).toHaveBeenCalledTimes(1);
    expect(ride.queue).toEqual([id]);
  });

  it('does not double-remove when boardRide or leaveQueue already removed the guest from the queue', () => {
    const { world, ride } = setup();
    board.mockImplementation((_w, g, r) => {
      r.queue.splice(r.queue.indexOf(g.id), 1);
      g.state = 'riding';
      return true;
    });
    const ids = queueGuests(world, ride, 3);
    update(world);
    expect(ride.riders).toEqual(ids);
    expect(ride.queue).toEqual([]);
  });

  it('ignores track rides', () => {
    const { world, ride } = setup();
    ride.kind = 'track';
    queueGuests(world, ride, 3);
    update(world, 10);
    expect(ride.cycle.phase).toBe('waiting');
    expect(board).not.toHaveBeenCalled();
  });
});

describe('breakdowns at dispatch (Phase 3 §4.5)', () => {
  it('when onRideDispatch reports a breakdown the ride does not run', () => {
    const { world, ride } = setup();
    const cap = getFlatRideDef('carousel')!.capacity;
    dispatch.mockImplementation((_w, r) => {
      r.status = 'broken';
      r.breakdownType = 'stopped';
      return true;
    });
    const ids = queueGuests(world, ride, cap);
    update(world, 2_000);
    expect(ride.cycle.phase).toBe('loading');
    expect(ride.riders).toEqual(ids);
    expect(finish).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledTimes(1);

    // Fixed: the breakdown system restores the status; the cycle continues.
    ride.status = 'open';
    ride.breakdownType = null;
    dispatch.mockReturnValue(false);
    const def = getFlatRideDef('carousel')!;
    const runs = phaseRuns(world, ride, def.cycleTicks + UNLOAD_TICKS + 1);
    expect(runs[0]).toEqual(['running', def.cycleTicks]);
    expect(finish.mock.calls.map((c) => c[1].id)).toEqual(ids);
  });

  it('a broken ride lets no one board', () => {
    const { world, ride } = setup();
    ride.status = 'broken';
    ride.breakdownType = 'stopped';
    queueGuests(world, ride, 4);
    update(world, 300);
    expect(board).not.toHaveBeenCalled();
    expect(ride.cycle.phase).toBe('waiting');
    expect(ride.queue).toHaveLength(4);
  });

  it('slow running keeps the cycle going at 1.5 × the cycle time without a new breakdown roll', () => {
    const { world, ride } = setup('swing_tower');
    const def = getFlatRideDef('swing_tower')!;
    ride.status = 'broken';
    ride.breakdownType = SLOW_RUNNING_BREAKDOWN;
    queueGuests(world, ride, def.capacity);
    const slow = Math.ceil(def.cycleTicks * SLOW_RUNNING_CYCLE_FACTOR);
    const runs = phaseRuns(world, ride, slow + UNLOAD_TICKS);
    expect(runs).toEqual([
      ['running', slow],
      ['unloading', UNLOAD_TICKS],
    ]);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('closing and stopping', () => {
  it('closing empties the queue through leaveQueue and riders finish the current cycle', () => {
    const { world, ride } = setup();
    const def = getFlatRideDef('carousel')!;
    const ids = queueGuests(world, ride, def.capacity + 4);
    update(world, 10);
    const r = executeCommand(world, { type: 'setRideOpen', rideId: ride.id, open: false });
    expect(r.ok).toBe(true);
    expect(ride.status).toBe('closed');
    expect(ride.queue).toEqual([]);
    expect(leave.mock.calls.map((c) => c[1].id)).toEqual(ids.slice(def.capacity));
    expect(ride.cycle.phase).toBe('running');
    update(world, def.cycleTicks + UNLOAD_TICKS + 1 - 10);
    expect(finish.mock.calls.map((c) => c[1].id)).toEqual(ids.slice(0, def.capacity));
    update(world, 500);
    expect(ride.cycle.phase).toBe('waiting');
    expect(board).toHaveBeenCalledTimes(def.capacity);
  });

  it('closing during loading runs the riders already on board', () => {
    const { world, ride } = setup();
    const def = getFlatRideDef('carousel')!;
    const ids = queueGuests(world, ride, 2);
    update(world, 5);
    executeCommand(world, { type: 'setRideOpen', rideId: ride.id, open: false });
    update(world);
    expect(ride.cycle.phase).toBe('running');
    update(world, def.cycleTicks + UNLOAD_TICKS);
    expect(finish.mock.calls.map((c) => c[1].id)).toEqual(ids);
    expect(ride.cycle.phase).toBe('waiting');
  });

  it('closing during loading with nobody on board returns to waiting', () => {
    const { world, ride } = setup();
    board.mockReturnValue(false);
    ride.cycle = { phase: 'loading', ticks: 3 };
    ride.status = 'closed';
    update(world);
    expect(ride.cycle).toEqual({ phase: 'waiting', ticks: 0 });
  });

  it('storm hold finishes the current cycle, starts no new one, and keeps the queue', () => {
    const { world, ride } = setup('big_wheel');
    const def = getFlatRideDef('big_wheel')!;
    const ids = queueGuests(world, ride, def.capacity + 2);
    update(world);
    ride.status = 'stormHold';
    update(world, def.cycleTicks + UNLOAD_TICKS + 100);
    expect(finish).toHaveBeenCalledTimes(def.capacity);
    expect(ride.cycle.phase).toBe('waiting');
    expect(ride.queue).toEqual(ids.slice(def.capacity));
    expect(leave).not.toHaveBeenCalled();
  });

  it('stopRide unloads every rider at once, empties the queue, and resets the cycle', () => {
    const { world, ride } = setup();
    const def = getFlatRideDef('carousel')!;
    const ids = queueGuests(world, ride, def.capacity + 3);
    update(world, 20);
    expect(ride.cycle.phase).toBe('running');
    stopRide(world, ride);
    expect(finish.mock.calls.map((c) => c[1].id)).toEqual(ids.slice(0, def.capacity));
    expect(leave.mock.calls.map((c) => c[1].id)).toEqual(ids.slice(def.capacity));
    expect(leave.mock.calls.every((c) => c[3] === null)).toBe(true);
    expect(ride.riders).toEqual([]);
    expect(ride.queue).toEqual([]);
    expect(ride.cycle).toEqual({ phase: 'waiting', ticks: 0 });
    // Finishing riders happens before the queue empties.
    const lastFinish = Math.max(...finish.mock.invocationCallOrder);
    const firstLeave = Math.min(...leave.mock.invocationCallOrder);
    expect(lastFinish).toBeLessThan(firstLeave);
  });

  it('stopRide works when leaveQueue removes the guest itself', () => {
    const { world, ride } = setup();
    leave.mockImplementation((_w, g, r) => {
      r.queue.splice(r.queue.indexOf(g.id), 1);
    });
    ride.status = 'closed';
    const ids = queueGuests(world, ride, 5);
    stopRide(world, ride);
    expect(leave.mock.calls.map((c) => c[1].id)).toEqual(ids);
    expect(ride.queue).toEqual([]);
  });
});
