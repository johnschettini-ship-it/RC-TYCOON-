import { describe, expect, it } from 'vitest';
import {
  UNREACHABLE,
  distanceField,
  distanceTo,
  isWalkable,
  markNetworkDirty,
  nextStep,
  queueOwner,
  staffDistanceTo,
  staffNextStep,
} from '../../../src/sim/pathing';
import { Content, tileIndex } from '../../../src/sim/map';
import { STAFF_FIELD_CACHE_MAX } from '../../../src/data/tuning/world';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, placeFootpath, placeQueue, placeRideDirect, placeStallDirect } from '../../helpers/world';

const T = (w: World, x: number, y: number): number => tileIndex(w.state.map, x, y);

function footRow(w: World, y: number, x0: number, x1: number): void {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) placeFootpath(w, x, y);
}
function footCol(w: World, x: number, y0: number, y1: number): void {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) placeFootpath(w, x, y);
}

describe('isWalkable (Phase 1 §4.2)', () => {
  it('guests walk on footpaths and the park entrance; staff also on queues', () => {
    const w = makeTestWorld();
    const foot = placeFootpath(w, 10, 10);
    const queue = placeQueue(w, 11, 10);
    const ride = placeRideDirect(w, 'carousel', 20, 20, 0);
    markNetworkDirty(w);
    const entrance = w.state.map.entranceTile;
    const building = T(w, ride.x, ride.y);
    expect(isWalkable(w, foot, 'guest')).toBe(true);
    expect(isWalkable(w, entrance, 'guest')).toBe(true);
    expect(isWalkable(w, queue, 'guest')).toBe(false);
    expect(isWalkable(w, foot, 'staff')).toBe(true);
    expect(isWalkable(w, queue, 'staff')).toBe(true);
    expect(isWalkable(w, entrance, 'staff')).toBe(true);
    for (const mode of ['guest', 'staff'] as const) {
      expect(isWalkable(w, building, mode)).toBe(false);
      expect(isWalkable(w, T(w, 5, 5), mode)).toBe(false);
      expect(isWalkable(w, -1, mode)).toBe(false);
      expect(isWalkable(w, 64 * 64, mode)).toBe(false);
    }
  });
});

describe('queue ownership flood fill (Phase 1 §4.2)', () => {
  it('connected queue tiles that touch the entrance outside tile belong to that ride', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10, 0); // entrance outside (11, 13)
    expect(ride.entrance?.outside).toBe(T(w, 11, 13));
    const q = [placeQueue(w, 11, 13), placeQueue(w, 11, 14), placeQueue(w, 12, 14), placeQueue(w, 13, 14), placeQueue(w, 13, 15)];
    // Separated by a footpath: not part of the queue.
    placeFootpath(w, 11, 15);
    const cut = placeQueue(w, 11, 16);
    const lone = placeQueue(w, 30, 30);
    const foot = placeFootpath(w, 10, 14);
    markNetworkDirty(w);
    for (const i of q) expect(queueOwner(w, i)).toBe(ride.id);
    expect(queueOwner(w, cut)).toBeNull();
    expect(queueOwner(w, lone)).toBeNull();
    expect(queueOwner(w, foot)).toBeNull();
    expect(queueOwner(w, -1)).toBeNull();
  });

  it('a queue that touches two entrances belongs to the lower ride id', () => {
    const w = makeTestWorld();
    const a = placeRideDirect(w, 'carousel', 10, 10, 0); // entrance outside (11, 13)
    const b = placeRideDirect(w, 'carousel', 13, 14, 1); // front faces W: entrance gate (13, 15), outside (12, 15)
    expect(b.entrance?.outside).toBe(T(w, 12, 15));
    placeQueue(w, 11, 13);
    placeQueue(w, 11, 14);
    placeQueue(w, 11, 15);
    placeQueue(w, 12, 15);
    markNetworkDirty(w);
    expect(queueOwner(w, T(w, 12, 15))).toBe(a.id);
    expect(distanceTo(w, T(w, 12, 15), `ride:${b.id}`)).toBeNull();
  });

  it('ownership follows network changes after markNetworkDirty', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 10, 10, 0);
    placeQueue(w, 11, 13);
    const far = placeQueue(w, 11, 15);
    markNetworkDirty(w);
    expect(queueOwner(w, far)).toBeNull();
    placeQueue(w, 11, 14);
    markNetworkDirty(w);
    expect(queueOwner(w, far)).toBe(ride.id);
  });
});

describe('distance fields (Phase 1 §4.2)', () => {
  it('exit distance counts path tiles to the park entrance', () => {
    const w = makeTestWorld();
    markNetworkDirty(w);
    const e = w.state.map.entranceTile;
    expect(distanceTo(w, T(w, 31, 60), 'exit')).toBe(3);
    expect(nextStep(w, T(w, 31, 60), 'exit')).toBe(T(w, 31, 61));
    expect(distanceTo(w, e, 'exit')).toBe(0);
    expect(nextStep(w, e, 'exit')).toBeNull();
  });

  it('queue tiles are excluded from stall and exit fields', () => {
    const w = makeTestWorld();
    // Loop above the stub: the short way goes through a queue tile, the long way is all footpath.
    footRow(w, 59, 28, 31); // (28..31, 59)
    placeQueue(w, 31, 58); // short cut
    footCol(w, 28, 55, 58);
    footRow(w, 55, 28, 31);
    footCol(w, 31, 56, 57);
    const stall = placeStallDirect(w, 'snack_shack', 32, 56, 3); // service side W → (31, 56)
    expect(stall.serviceTile).toBe(T(w, 31, 56));
    markNetworkDirty(w);
    const exitField = distanceField(w, 'exit');
    const stallField = distanceField(w, `stall:${stall.id}`);
    expect(exitField?.[T(w, 31, 58)]).toBe(UNREACHABLE);
    expect(stallField?.[T(w, 31, 58)]).toBe(UNREACHABLE);
    // From (31, 59) the stall is 3 steps through the queue but 11 steps around it.
    expect(distanceTo(w, T(w, 31, 59), `stall:${stall.id}`)).toBe(11);
    expect(nextStep(w, T(w, 31, 59), `stall:${stall.id}`)).toBe(T(w, 30, 59));
    expect(distanceTo(w, T(w, 31, 57), 'exit')).toBe(16);
    expect(nextStep(w, T(w, 31, 57), 'exit')).toBe(T(w, 31, 56));
  });

  it('a ride field covers footpaths and only its own queue', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 30, 50, 0); // entrance outside (31, 53)
    footCol(w, 31, 56, 59);
    placeQueue(w, 31, 53);
    placeQueue(w, 31, 54);
    placeQueue(w, 31, 55);
    markNetworkDirty(w);
    const key = `ride:${ride.id}` as const;
    expect(distanceTo(w, T(w, 31, 53), key)).toBe(0);
    expect(distanceTo(w, T(w, 31, 55), key)).toBe(2);
    expect(distanceTo(w, w.state.map.entranceTile, key)).toBe(10);
    expect(nextStep(w, T(w, 31, 56), key)).toBe(T(w, 31, 55));
    expect(nextStep(w, T(w, 31, 53), key)).toBeNull();
  });

  it('a guest of another ride cannot route through a queue', () => {
    const w = makeTestWorld();
    const a = placeRideDirect(w, 'carousel', 30, 50, 0); // entrance outside (31, 53)
    const b = placeRideDirect(w, 'carousel', 36, 50, 0); // entrance outside (37, 53)
    // South part: the entrance stub up to (31, 57). Ride A's queue (31, 53)–(31, 56) links it to the north part.
    footCol(w, 31, 57, 59);
    for (let y = 53; y <= 56; y++) placeQueue(w, 31, y);
    // North part: a row beside A's queue that leads to ride B's queue.
    footRow(w, 54, 32, 40);
    placeQueue(w, 37, 53);
    markNetworkDirty(w);
    const entrance = w.state.map.entranceTile;
    expect(queueOwner(w, T(w, 31, 55))).toBe(a.id);
    expect(queueOwner(w, T(w, 37, 53))).toBe(b.id);
    expect(distanceTo(w, entrance, `ride:${a.id}`)).toBe(10);
    expect(distanceTo(w, entrance, `ride:${b.id}`)).toBeNull();
    expect(nextStep(w, T(w, 31, 57), `ride:${b.id}`)).toBeNull();
    expect(distanceField(w, `ride:${b.id}`)?.[T(w, 31, 54)]).toBe(UNREACHABLE);
    // Ride B is reachable from the north part.
    expect(distanceTo(w, T(w, 32, 54), `ride:${b.id}`)).toBe(6);
  });

  it('breaks ties in the order N, E, S, W', () => {
    const w = makeTestWorld();
    for (let y = 20; y <= 30; y++) footRow(w, y, 20, 30);
    const south = placeStallDirect(w, 'snack_shack', 25, 31, 0); // service (25, 30)
    const north = placeStallDirect(w, 'fizz_stand', 25, 19, 2); // service (25, 20)
    markNetworkDirty(w);
    const S = `stall:${south.id}` as const;
    const N = `stall:${north.id}` as const;
    // Target to the south-east: E and S tie → E.
    expect(nextStep(w, T(w, 23, 28), S)).toBe(T(w, 24, 28));
    // Target to the south-west: S and W tie → S.
    expect(nextStep(w, T(w, 27, 28), S)).toBe(T(w, 27, 29));
    // Target to the north-east: N and E tie → N.
    expect(nextStep(w, T(w, 23, 22), N)).toBe(T(w, 23, 21));
    // Target to the north-west: N and W tie → N.
    expect(nextStep(w, T(w, 27, 22), N)).toBe(T(w, 27, 21));
  });
});

describe('unreachable destinations (Review Focus 2)', () => {
  it('return null for islands, missing queues, missing entities, and bad tiles', () => {
    const w = makeTestWorld();
    // Island with a stall and a ride, not connected to the entrance stub.
    footRow(w, 30, 10, 14);
    const stall = placeStallDirect(w, 'snack_shack', 12, 31, 0); // service (12, 30)
    const ride = placeRideDirect(w, 'carousel', 11, 26, 0); // entrance outside (12, 29)
    placeQueue(w, 12, 29);
    // A ride with no queue at its entrance.
    const noQueue = placeRideDirect(w, 'big_wheel', 40, 40, 0);
    placeFootpath(w, 41, 43);
    // A stall that faces grass.
    const facingGrass = placeStallDirect(w, 'restrooms', 45, 45, 0);
    markNetworkDirty(w);
    const entrance = w.state.map.entranceTile;
    expect(distanceTo(w, entrance, `stall:${stall.id}`)).toBeNull();
    expect(nextStep(w, entrance, `stall:${stall.id}`)).toBeNull();
    expect(nextStep(w, entrance, `ride:${ride.id}`)).toBeNull();
    expect(distanceTo(w, T(w, 10, 30), 'exit')).toBeNull();
    expect(nextStep(w, T(w, 10, 30), 'exit')).toBeNull();
    expect(nextStep(w, T(w, 41, 43), `ride:${noQueue.id}`)).toBeNull();
    expect(distanceField(w, `ride:${noQueue.id}`)).toBeNull();
    expect(distanceField(w, `stall:${facingGrass.id}`)).toBeNull();
    expect(nextStep(w, entrance, 'ride:9999')).toBeNull();
    expect(distanceTo(w, entrance, 'stall:9999')).toBeNull();
    expect(nextStep(w, -1, 'exit')).toBeNull();
    expect(distanceTo(w, 64 * 64, 'exit')).toBeNull();
    // Inside the island everything works.
    expect(distanceTo(w, T(w, 10, 30), `stall:${stall.id}`)).toBe(2);
    expect(distanceTo(w, T(w, 10, 30), `ride:${ride.id}`)).toBe(3);
  });

  it('the exit is unreachable when the park entrance tile is cut off', () => {
    const w = makeTestWorld();
    w.state.map.content[T(w, 31, 62)] = Content.Empty;
    markNetworkDirty(w);
    expect(distanceTo(w, T(w, 31, 60), 'exit')).toBeNull();
    expect(nextStep(w, T(w, 31, 60), 'exit')).toBeNull();
  });
});

describe('starting off the field', () => {
  it('a guest on a tile outside the field steps to the best in-field neighbour', () => {
    const w = makeTestWorld();
    footRow(w, 59, 28, 31);
    markNetworkDirty(w);
    // (30, 60) is grass (path removed under the guest): neighbours (30, 59) d=5 and (31, 60) d=3.
    expect(distanceTo(w, T(w, 30, 60), 'exit')).toBe(4);
    expect(nextStep(w, T(w, 30, 60), 'exit')).toBe(T(w, 31, 60));
    // Grass far from any path: no route.
    expect(nextStep(w, T(w, 10, 10), 'exit')).toBeNull();
  });

  it('a guest inside a queue walks out along that queue', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 30, 50, 0); // entrance outside (31, 53)
    placeQueue(w, 31, 53);
    placeQueue(w, 31, 54);
    placeQueue(w, 31, 55);
    placeQueue(w, 31, 56);
    placeQueue(w, 31, 57);
    placeQueue(w, 31, 58);
    placeFootpath(w, 31, 59);
    markNetworkDirty(w);
    expect(queueOwner(w, T(w, 31, 53))).toBe(ride.id);
    // From the queue front, the exit is 6 queue steps + 4 path steps away.
    expect(nextStep(w, T(w, 31, 53), 'exit')).toBe(T(w, 31, 54));
    expect(distanceTo(w, T(w, 31, 53), 'exit')).toBe(10);
    expect(nextStep(w, T(w, 31, 58), 'exit')).toBe(T(w, 31, 59));
  });
});

describe('network changes', () => {
  it('fields rebuild lazily after markNetworkDirty', () => {
    const w = makeTestWorld();
    footRow(w, 59, 25, 31);
    const stall = placeStallDirect(w, 'snack_shack', 25, 58, 2); // service (25, 59)
    markNetworkDirty(w);
    expect(distanceTo(w, w.state.map.entranceTile, `stall:${stall.id}`)).toBe(10);
    // Cut the row, then rebuild.
    w.state.map.content[T(w, 28, 59)] = Content.Empty;
    markNetworkDirty(w);
    expect(distanceTo(w, w.state.map.entranceTile, `stall:${stall.id}`)).toBeNull();
    placeFootpath(w, 28, 59);
    markNetworkDirty(w);
    expect(distanceTo(w, w.state.map.entranceTile, `stall:${stall.id}`)).toBe(10);
  });

  it('a removed destination has no field', () => {
    const w = makeTestWorld();
    footRow(w, 59, 25, 31);
    const stall = placeStallDirect(w, 'snack_shack', 25, 58, 2);
    markNetworkDirty(w);
    expect(distanceTo(w, w.state.map.entranceTile, `stall:${stall.id}`)).toBe(10);
    w.state.stalls = [];
    w.state.map.content[T(w, 25, 58)] = Content.Empty;
    markNetworkDirty(w);
    expect(distanceTo(w, w.state.map.entranceTile, `stall:${stall.id}`)).toBeNull();
  });

  it('fields are not part of the saved state', () => {
    const w = makeTestWorld();
    const before = JSON.stringify(Object.keys(w.state));
    distanceTo(w, T(w, 31, 60), 'exit');
    expect(JSON.stringify(Object.keys(w.state))).toBe(before);
  });
});

describe('staff routes (Phase 3 §4.1)', () => {
  it('staff walk through any queue to reach a tile', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 30, 50, 0);
    placeQueue(w, 31, 53);
    placeQueue(w, 31, 54);
    placeQueue(w, 31, 55);
    placeQueue(w, 31, 56);
    placeQueue(w, 31, 57);
    placeQueue(w, 31, 58);
    placeQueue(w, 32, 53);
    placeFootpath(w, 31, 59);
    const target = placeFootpath(w, 33, 53);
    const stall = placeStallDirect(w, 'snack_shack', 34, 53, 3); // service (33, 53)
    placeQueue(w, 50, 50);
    markNetworkDirty(w);
    expect(queueOwner(w, T(w, 31, 56))).toBe(ride.id);
    const start = T(w, 31, 60);
    expect(staffDistanceTo(w, start, target)).toBe(9);
    expect(staffNextStep(w, start, target)).toBe(T(w, 31, 59));
    expect(staffNextStep(w, target, target)).toBeNull();
    expect(staffDistanceTo(w, start, T(w, 50, 50))).toBeNull();
    expect(staffNextStep(w, start, T(w, 5, 5))).toBeNull();
    // A guest cannot take that route.
    expect(distanceTo(w, start, `stall:${stall.id}`)).toBeNull();
  });
});

describe('staff field cache', () => {
  it('stays correct when more targets are used than the cache holds', () => {
    const w = makeTestWorld();
    for (let y = 10; y <= 50; y++) footRow(w, y, 10, 50);
    markNetworkDirty(w);
    const from = T(w, 10, 10);
    const targets: number[] = [];
    for (let k = 0; k < STAFF_FIELD_CACHE_MAX * 2 + 5; k++) targets.push(T(w, 10 + (k % 41), 10 + Math.floor(k / 41)));
    for (let pass = 0; pass < 2; pass++) {
      for (const t of targets) {
        const tx = t % 64;
        const ty = Math.floor(t / 64);
        expect(staffDistanceTo(w, from, t)).toBe(tx - 10 + (ty - 10));
      }
    }
  });
});
