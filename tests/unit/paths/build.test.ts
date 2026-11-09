import { describe, expect, it } from 'vitest';
import { TERRAIN_ERR } from '../../../src/data/strings/terrain';
import { PATH_ERR } from '../../../src/data/strings/paths';
import { executeCommand } from '../../../src/sim/commands';
import { previewPathCommand } from '../../../src/sim/commands/build';
import { Content, Owned } from '../../../src/sim/map';
import { elevatedPathsOn } from '../../../src/sim/paths/api';
import { RAMP_MASK } from '../../../src/sim/paths/nodes';
import { stateHash } from '../../helpers/world';
import { makeTestWorld, placeRideDirect } from '../../helpers/world';
import { T, elevated, groundPath, must, reason, setLand, setWater } from './helpers';

describe('ground paths on slopes (Phase 4 §4.2)', () => {
  it('accepts flat land and the 4 ramp masks; rejects the other 11 masks', () => {
    const allowed: number[] = [];
    const rejected: number[] = [];
    for (let mask = 1; mask < 16; mask++) {
      const w = makeTestWorld();
      setLand(w, 20, 20, 8, mask);
      const r = executeCommand(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath' });
      if (r.ok) allowed.push(mask);
      else {
        expect(r.reason).toBe('Paths need flat land or an even slope');
        rejected.push(mask);
      }
    }
    expect(allowed).toEqual([0b0011, 0b0110, 0b1001, 0b1100]);
    expect(allowed.slice().sort((a, b) => a - b)).toEqual(RAMP_MASK.slice().sort((a, b) => a - b));
    expect(rejected).toHaveLength(11);
    const w = makeTestWorld();
    expect(executeCommand(w, { type: 'buildPath', x: 20, y: 20, kind: 'queue' }).ok).toBe(true);
  });

  it('a wet tile fails with "Paths cannot go in water"', () => {
    const w = makeTestWorld();
    setLand(w, 20, 20, 6);
    setWater(w, 20, 20, 8);
    expect(reason(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath' })).toBe('Paths cannot go in water');
    // Water at the land surface is dry (wet means surface > lowest corner).
    setWater(w, 20, 20, 6);
    expect(reason(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath' })).toBeNull();
  });

  it('a ground path needs 3 m of headroom under an elevated path', () => {
    const w = makeTestWorld();
    elevated(w, 20, 20, 10);
    expect(reason(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath' })).toBe('Not enough clearance under an object');
    const w2 = makeTestWorld();
    elevated(w2, 20, 20, 11);
    expect(reason(w2, { type: 'buildPath', x: 20, y: 20, kind: 'footpath' })).toBeNull();
  });

  it('a line is atomic: one bad tile fails it all and the state stays the same', () => {
    const w = makeTestWorld();
    setLand(w, 22, 20, 8, 0b0101);
    const before = stateHash(w);
    expect(reason(w, { type: 'buildPathLine', x0: 18, y0: 20, x1: 24, y1: 20, kind: 'footpath' })).toBe(TERRAIN_ERR.pathSlope);
    expect(stateHash(w)).toBe(before);
  });

  it('Build 1 path commands keep their Build 1 results on flat land', () => {
    const w = makeTestWorld();
    expect(reason(w, { type: 'buildPath', x: 0, y: 0, kind: 'footpath' })).toBe('You do not own this land');
    placeRideDirect(w, 'carousel', 20, 20, 0);
    expect(reason(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath' })).toBe('Something is in the way');
    const r = must(w, { type: 'buildPathLine', x0: 10, y0: 10, x1: 14, y1: 10, kind: 'footpath' });
    expect(r.cost).toBe(5 * 1_000);
  });
});

describe('elevated paths (Phase 4 §4.2)', () => {
  it('z must be at least the highest corner + 1: "The path is below the land"', () => {
    const w = makeTestWorld();
    expect(reason(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 8 })).toBe('The path is below the land');
    expect(reason(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 9 })).toBeNull();
    setLand(w, 21, 20, 8, 0b0011);
    expect(reason(w, { type: 'buildPath', x: 21, y: 20, kind: 'footpath', z: 9 })).toBe('The path is below the land');
    expect(reason(w, { type: 'buildPath', x: 21, y: 20, kind: 'footpath', z: 10 })).toBeNull();
  });

  it('may go at most 20 m above the ground', () => {
    const w = makeTestWorld();
    expect(reason(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 29 })).toBe(PATH_ERR.tooHigh);
    expect(reason(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 28 })).toBeNull();
  });

  it('each path occupies [z, z + 3): overlaps fail with "Not enough clearance under an object"', () => {
    const w = makeTestWorld();
    must(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 9 });
    expect(reason(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 11 })).toBe('Not enough clearance under an object');
    expect(reason(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 12 })).toBeNull();
    // Over a ground path: [8, 11) is the ground path's.
    groundPath(w, 22, 20);
    expect(reason(w, { type: 'buildPath', x: 22, y: 20, kind: 'footpath', z: 10 })).toBe('Not enough clearance under an object');
    expect(reason(w, { type: 'buildPath', x: 22, y: 20, kind: 'footpath', z: 11 })).toBeNull();
    // A ramp's surface ends 1 step higher, so it keeps 3 m of headroom at its high edge: [z, z + 4).
    must(w, { type: 'buildPath', x: 24, y: 20, kind: 'footpath', z: 9, rampDir: 1 });
    expect(reason(w, { type: 'buildPath', x: 24, y: 20, kind: 'footpath', z: 12 })).toBe('Not enough clearance under an object');
    expect(reason(w, { type: 'buildPath', x: 24, y: 20, kind: 'footpath', z: 13 })).toBeNull();
  });

  it('cannot go over a ride, a stall, or the park entrance', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 20, 20, 0);
    expect(reason(w, { type: 'buildPath', x: ride.x, y: ride.y, kind: 'footpath', z: 15 })).toBe('A ride or stall is in the way');
    const e = w.state.map.entranceTile;
    expect(reason(w, { type: 'buildPath', x: e % 64, y: Math.floor(e / 64), kind: 'footpath', z: 15 })).toBe('The park entrance is in the way');
  });

  it('a bridge over water: not below the surface', () => {
    const w = makeTestWorld();
    setLand(w, 20, 20, 6);
    setWater(w, 20, 20, 10);
    expect(reason(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 9 })).toBe('Paths cannot go in water');
    expect(reason(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 10 })).toBeNull();
  });

  it('land ownership: owned, or construction rights with z ≥ ground + 3', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    map.owned[T(w, 20, 20)] = Owned.RightsOwned;
    map.owned[T(w, 21, 20)] = Owned.NotOwned;
    map.owned[T(w, 22, 20)] = Owned.LandForSale;
    expect(reason(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 10 })).toBe('You only have construction rights here');
    expect(reason(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 11 })).toBeNull();
    expect(reason(w, { type: 'buildPath', x: 21, y: 20, kind: 'footpath', z: 15 })).toBe('Outside the park');
    expect(reason(w, { type: 'buildPath', x: 22, y: 20, kind: 'footpath', z: 15 })).toBe('Outside the park');
    expect(reason(w, { type: 'buildPath', x: -1, y: 20, kind: 'footpath', z: 15 })).toBe('Outside the park');
    // Ground paths still need owned land (Build 1 text).
    expect(reason(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath' })).toBe('You do not own this land');
  });

  it('costs the path kind plus $2 per m of support, exact to the cent and atomic for cash', () => {
    const w = makeTestWorld();
    const cash = w.state.park.cash;
    expect(must(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 12 }).cost).toBe(1_000 + 4 * 200);
    expect(must(w, { type: 'buildPath', x: 21, y: 20, kind: 'queue', z: 9 }).cost).toBe(1_200 + 200);
    expect(w.state.park.cash).toBe(cash - 1_800 - 1_400);
    // Exactly enough cash builds; one cent less fails and changes nothing.
    w.state.park.cash = 1_000 + 2 * 200;
    expect(must(w, { type: 'buildPath', x: 22, y: 20, kind: 'footpath', z: 10 }).cost).toBe(1_400);
    expect(w.state.park.cash).toBe(0);
    w.state.park.cash = 1_399;
    const before = stateHash(w);
    expect(reason(w, { type: 'buildPath', x: 23, y: 20, kind: 'footpath', z: 10 })).toBe('Not enough cash');
    expect(stateHash(w)).toBe(before);
  });

  it('the same path again costs nothing; another kind costs that kind only', () => {
    const w = makeTestWorld();
    must(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 12 });
    expect(must(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 12 }).cost).toBe(0);
    expect(must(w, { type: 'buildPath', x: 20, y: 20, kind: 'queue', z: 12 }).cost).toBe(1_200);
    expect(w.state.elevatedPaths).toHaveLength(1);
    expect(w.state.elevatedPaths[0]).toMatchObject({ x: 20, y: 20, z: 12, kind: 'queue', rampDir: -1 });
  });

  it('a line with a ramp rises or falls one step per tile along the drag; its start edge is at z', () => {
    const w = makeTestWorld();
    must(w, { type: 'buildPathLine', x0: 10, y0: 10, x1: 14, y1: 10, kind: 'footpath', z: 9, ramp: 'up' });
    expect(w.state.elevatedPaths.map((p) => [p.x, p.z, p.rampDir])).toEqual([
      [10, 9, 1],
      [11, 10, 1],
      [12, 11, 1],
      [13, 12, 1],
      [14, 13, 1],
    ]);
    const w2 = makeTestWorld();
    must(w2, { type: 'buildPathLine', x0: 10, y0: 14, x1: 10, y1: 12, kind: 'footpath', z: 12, ramp: 'down' });
    // Dragged north (−y): each tile rises toward the start (south, Dir 2).
    expect(w2.state.elevatedPaths.map((p) => [p.y, p.z, p.rampDir])).toEqual([
      [14, 11, 2],
      [13, 10, 2],
      [12, 9, 2],
    ]);
    const w3 = makeTestWorld();
    must(w3, { type: 'buildPathLine', x0: 10, y0: 10, x1: 12, y1: 10, kind: 'queue', z: 15, ramp: 'flat' });
    expect(w3.state.elevatedPaths.every((p) => p.z === 15 && p.rampDir === -1 && p.kind === 'queue')).toBe(true);
    // A tap with a ramp has no drag direction: flat.
    must(w3, { type: 'buildPathLine', x0: 20, y0: 20, x1: 20, y1: 20, kind: 'footpath', z: 9, ramp: 'up' });
    expect(elevatedPathsOn(w3, T(w3, 20, 20))[0]).toMatchObject({ z: 9, rampDir: -1 });
  });

  it('a falling line that reaches the land fails at that tile, atomically', () => {
    const w = makeTestWorld();
    const before = stateHash(w);
    expect(reason(w, { type: 'buildPathLine', x0: 10, y0: 10, x1: 14, y1: 10, kind: 'footpath', z: 12, ramp: 'down' })).toBe('The path is below the land');
    expect(stateHash(w)).toBe(before);
  });

  it('previewPathCommand gives the command result without changing the state', () => {
    const w = makeTestWorld();
    const before = stateHash(w);
    const cmd = { type: 'buildPathLine', x0: 10, y0: 10, x1: 14, y1: 10, kind: 'footpath', z: 9, ramp: 'up' } as const;
    const preview = previewPathCommand(w, cmd);
    expect(stateHash(w)).toBe(before);
    expect(preview).toEqual(executeCommand(w, cmd));
    expect(previewPathCommand(w, { type: 'buildPath', x: 30, y: 30, kind: 'queue' })).toEqual({ ok: true, cost: 1_200, warnings: [] });
    expect(previewPathCommand(w, { type: 'buildPath', x: 10, y: 10, kind: 'footpath', z: 9, rampDir: 1 })).toEqual({ ok: true, cost: 0, warnings: [] });
    expect(previewPathCommand(w, { type: 'buildPath', x: 10, y: 10, kind: 'footpath', z: 9 })).toEqual({ ok: false, reason: 'Not enough clearance under an object' });
    expect(previewPathCommand(w, { type: 'buildPath', x: 10, y: 10, kind: 'footpath', z: 8 })).toEqual({ ok: false, reason: 'The path is below the land' });
  });

  it('rejects bad heights and ramps from a caller', () => {
    const w = makeTestWorld();
    expect(reason(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 9.5 })).toBe(PATH_ERR.badHeight);
    expect(reason(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 9, rampDir: 7 as never })).toBe(PATH_ERR.badHeight);
  });
});

describe('demolish with z (Phase 4 §6)', () => {
  it('removes the elevated path at that height, refunds nothing, and keeps the ground path', () => {
    const w = makeTestWorld();
    groundPath(w, 20, 20);
    must(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 12 });
    const cash = w.state.park.cash;
    expect(reason(w, { type: 'demolish', x: 20, y: 20, z: 13 })).toBe('Nothing to remove');
    expect(must(w, { type: 'demolish', x: 20, y: 20, z: 12 }).cost).toBe(0);
    expect(w.state.elevatedPaths).toHaveLength(0);
    expect(w.state.map.content[T(w, 20, 20)]).toBe(Content.Footpath);
    expect(w.state.park.cash).toBe(cash);
    // z = the ground path height removes the ground path.
    must(w, { type: 'demolish', x: 20, y: 20, z: 8 });
    expect(w.state.map.content[T(w, 20, 20)]).toBe(Content.Empty);
  });

  it('without z: the ground content first (Build 1), else the top elevated path', () => {
    const w = makeTestWorld();
    groundPath(w, 20, 20);
    must(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 12 });
    must(w, { type: 'buildPath', x: 20, y: 20, kind: 'footpath', z: 16 });
    must(w, { type: 'demolish', x: 20, y: 20 });
    expect(w.state.map.content[T(w, 20, 20)]).toBe(Content.Empty);
    must(w, { type: 'demolish', x: 20, y: 20 });
    expect(w.state.elevatedPaths.map((p) => p.z)).toEqual([12]);
    must(w, { type: 'demolish', x: 20, y: 20 });
    expect(w.state.elevatedPaths).toHaveLength(0);
    expect(reason(w, { type: 'demolish', x: 20, y: 20 })).toBe('Nothing to remove');
  });
});

describe('flat rides and stalls need flat, dry land (Phase 4 §4.2)', () => {
  it('"The land must be flat here" on a slope, a step, or water', () => {
    const w = makeTestWorld();
    setLand(w, 21, 21, 8, 0b0011);
    expect(reason(w, { type: 'placeRide', defId: 'carousel', x: 20, y: 20, rotation: 0 })).toBe('The land must be flat here');
    setLand(w, 21, 21, 9, 0);
    expect(reason(w, { type: 'placeRide', defId: 'carousel', x: 20, y: 20, rotation: 0 })).toBe('The land must be flat here');
    for (let y = 20; y < 23; y++) for (let x = 20; x < 23; x++) setLand(w, x, y, 7, 0);
    expect(reason(w, { type: 'placeRide', defId: 'carousel', x: 20, y: 20, rotation: 0 })).toBeNull();
    must(w, { type: 'demolish', x: 20, y: 20 });
    setWater(w, 21, 21, 8);
    expect(reason(w, { type: 'placeRide', defId: 'carousel', x: 20, y: 20, rotation: 0 })).toBe('The land must be flat here');
    setLand(w, 30, 30, 8, 0b1000);
    expect(reason(w, { type: 'placeStall', defId: 'snack_shack', x: 30, y: 30, rotation: 0 })).toBe('The land must be flat here');
    // A raised, flat site is fine.
    for (let y = 40; y < 43; y++) for (let x = 40; x < 43; x++) setLand(w, x, y, 12, 0);
    expect(reason(w, { type: 'placeRide', defId: 'carousel', x: 40, y: 40, rotation: 0 })).toBeNull();
  });

  it('not under an elevated path', () => {
    const w = makeTestWorld();
    elevated(w, 30, 30, 20);
    expect(reason(w, { type: 'placeStall', defId: 'snack_shack', x: 30, y: 30, rotation: 0 })).toBe('Not enough clearance under an object');
  });
});
