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
import { nodeZAfterStep, pathNodesAt, rampSpeedFactor } from '../../../src/sim/paths/api';
import { edgeHeight, gateNode, linkedNode, nodeIdAt, rampDirOfMask } from '../../../src/sim/paths/nodes';
import { rideWarnings, stallWarnings } from '../../../src/sim/commands/build/warnings';
import { makeTestWorld, placeRideDirect, placeStallDirect } from '../../helpers/world';
import { T, elevated, groundPath, setLand, setLandRect, setWater } from './helpers';

describe('path nodes and edges (Phase 4 §4.2)', () => {
  it('flat nodes connect on every edge at z; a ramp has a low edge at z and a high edge at z + 1', () => {
    for (let d = 0; d < 4; d++) expect(edgeHeight(8, -1, d)).toBe(8);
    // Rising toward E (Dir 1): E edge high, W edge low, N and S do not connect.
    expect(edgeHeight(8, 1, 1)).toBe(9);
    expect(edgeHeight(8, 1, 3)).toBe(8);
    expect(edgeHeight(8, 1, 0)).toBe(-1);
    expect(edgeHeight(8, 1, 2)).toBe(-1);
  });

  it('the 4 ramp masks rise toward −y, +x, +y, −x', () => {
    expect(rampDirOfMask(0)).toBe(-1);
    expect(rampDirOfMask(0b0011)).toBe(0);
    expect(rampDirOfMask(0b0110)).toBe(1);
    expect(rampDirOfMask(0b1100)).toBe(2);
    expect(rampDirOfMask(0b1001)).toBe(3);
    expect(rampDirOfMask(0b0101)).toBe(-2);
  });

  it('pathNodesAt lists the ground node and the elevated nodes, lowest first', () => {
    const w = makeTestWorld();
    const i = groundPath(w, 20, 20);
    elevated(w, 20, 20, 16);
    elevated(w, 20, 20, 12);
    expect(pathNodesAt(w, i)).toEqual([
      { tile: i, z: 8 },
      { tile: i, z: 12 },
      { tile: i, z: 16 },
    ]);
    expect(pathNodesAt(w, T(w, 5, 5))).toEqual([]);
  });
});

/** A ground path from (10, 10) east: flat at 8, a ramp up to 9, flat at 9, then a cliff up to 12. */
function rampWorld() {
  const w = makeTestWorld();
  setLand(w, 11, 10, 8, 0b0110); // rises toward +x
  setLandRect(w, 12, 10, 12, 10, 9);
  setLandRect(w, 13, 10, 13, 10, 12);
  for (let x = 10; x <= 13; x++) groundPath(w, x, 10);
  groundPath(w, 11, 9); // beside the ramp (a side edge)
  markNetworkDirty(w);
  return w;
}

describe('connectivity on ramps and across cliffs', () => {
  it('a ramp links its low and high neighbours; its side edges and a cliff do not link', () => {
    const w = rampWorld();
    const a = T(w, 10, 10);
    expect(staffDistanceTo(w, a, T(w, 12, 10))).toBe(2);
    expect(staffNextStep(w, a, T(w, 12, 10))).toBe(T(w, 11, 10));
    // Side edge of the ramp.
    expect(staffDistanceTo(w, a, T(w, 11, 9))).toBeNull();
    // Cliff: (12, 10) is at 9, (13, 10) at 12.
    expect(staffDistanceTo(w, a, T(w, 13, 10))).toBeNull();
    expect(linkedNode(w, T(w, 12, 10), 1)).toBe(-1);
  });

  it('a walker entering a node takes its height; ramp speed factors are 0.75 up and 1.10 down', () => {
    const w = rampWorld();
    expect(nodeZAfterStep(w, T(w, 10, 10), 8, T(w, 11, 10))).toBe(8);
    expect(nodeZAfterStep(w, T(w, 11, 10), 8, T(w, 12, 10))).toBe(9);
    expect(nodeZAfterStep(w, T(w, 12, 10), 9, T(w, 11, 10))).toBe(8);
    expect(rampSpeedFactor(w, T(w, 10, 10), 8, T(w, 11, 10))).toBe(0.75);
    expect(rampSpeedFactor(w, T(w, 11, 10), 8, T(w, 12, 10))).toBe(0.75);
    expect(rampSpeedFactor(w, T(w, 12, 10), 9, T(w, 11, 10))).toBe(1.1);
    expect(rampSpeedFactor(w, T(w, 11, 10), 8, T(w, 10, 10))).toBe(1.1);
    // Flat and across a cliff (no link): 1.
    groundPath(w, 9, 10);
    expect(rampSpeedFactor(w, T(w, 9, 10), 8, T(w, 10, 10))).toBe(1);
    expect(rampSpeedFactor(w, T(w, 12, 10), 9, T(w, 13, 10))).toBe(1);
  });

  it('a long ramp chain of elevated paths links step by step, and to ground paths at matching heights', () => {
    const w = makeTestWorld();
    setLandRect(w, 20, 18, 20, 18, 12); // a raised plateau tile at 12
    groundPath(w, 20, 18);
    // Ground path at (20, 22) on a slope rising north (0b0011) from 8 to 9.
    setLand(w, 20, 22, 8, 0b0011);
    groundPath(w, 20, 22);
    // Elevated ramps (20, 21) 9→10, (20, 20) 10→11, (20, 19) 11→12, all rising north.
    elevated(w, 20, 21, 9, 'footpath', 0);
    elevated(w, 20, 20, 10, 'footpath', 0);
    elevated(w, 20, 19, 11, 'footpath', 0);
    groundPath(w, 20, 23);
    expect(staffDistanceTo(w, T(w, 20, 23), T(w, 20, 18))).toBe(5);
    expect(staffDistanceTo(w, T(w, 20, 18), T(w, 20, 23))).toBe(5);
  });
});

/** Banks at (19, 20) and (23, 20) at height 8; a lake on (20..22, 20) with ground 6 and water 8; a bridge at z 8. */
function bridgeWorld(withBridge = true) {
  const w = makeTestWorld();
  for (let x = 20; x <= 22; x++) {
    setLand(w, x, 20, 6);
    setWater(w, x, 20, 8);
    if (withBridge) elevated(w, x, 20, 8);
  }
  groundPath(w, 19, 20);
  groundPath(w, 23, 20);
  return w;
}

describe('water and bridges (Phase 4 §4.2, §4.3)', () => {
  it('an elevated path over water is a bridge between the banks', () => {
    const w = bridgeWorld();
    expect(staffDistanceTo(w, T(w, 19, 20), T(w, 23, 20))).toBe(4);
    expect(isWalkable(w, T(w, 21, 20), 'guest')).toBe(true);
    expect(isWalkable(w, T(w, 21, 20), 'guest', 8)).toBe(true);
    expect(isWalkable(w, T(w, 21, 20), 'guest', 6)).toBe(false);
  });

  it('without the bridge the banks are apart; a ground path on a wet tile is no node', () => {
    const w = bridgeWorld(false);
    expect(staffDistanceTo(w, T(w, 19, 20), T(w, 23, 20))).toBeNull();
    // A ground path left on a tile that became wet (written by hand) is not walkable.
    groundPath(w, 21, 20);
    expect(isWalkable(w, T(w, 21, 20), 'guest')).toBe(false);
    expect(isWalkable(w, T(w, 21, 20), 'staff')).toBe(false);
    expect(nodeIdAt(w, T(w, 21, 20), 6)).toBe(-1);
  });
});

describe('guest fields over nodes', () => {
  it('a stall on a hill is reached over the ramp; the field is indexed by node, ground nodes by tile', () => {
    const w = makeTestWorld();
    // Entrance (31, 63), stub (31, 60..62) at 8. Path north to (31, 55); ramp (31, 54) rising north; hill at 9 from y ≤ 53.
    for (let y = 55; y <= 59; y++) groundPath(w, 31, y);
    setLand(w, 31, 54, 8, 0b0011);
    groundPath(w, 31, 54);
    setLandRect(w, 28, 48, 34, 53, 9);
    for (let y = 50; y <= 53; y++) groundPath(w, 31, y);
    const stall = placeStallDirect(w, 'snack_shack', 32, 50, 3); // service side W → (31, 50)
    markNetworkDirty(w);
    const key = `stall:${stall.id}` as const;
    const entrance = w.state.map.entranceTile;
    expect(distanceTo(w, entrance, key)).toBe(13);
    expect(distanceField(w, key)?.[T(w, 31, 54)]).toBe(4);
    expect(nextStep(w, T(w, 31, 55), key, 8)).toBe(T(w, 31, 54));
    expect(stallWarnings(w, stall)).toEqual([]);
    // Cut the ramp: unreachable (null), never an infinite loop.
    setLand(w, 31, 54, 8, 0);
    markNetworkDirty(w);
    expect(distanceTo(w, entrance, key)).toBeNull();
    expect(nextStep(w, entrance, key)).toBeNull();
  });

  it('a gate connects at the ride or stall height: a stall on a cliff edge facing a lower path has no field', () => {
    const w = makeTestWorld();
    setLandRect(w, 32, 50, 32, 50, 12);
    for (let y = 50; y <= 59; y++) groundPath(w, 31, y);
    const stall = placeStallDirect(w, 'snack_shack', 32, 50, 3);
    markNetworkDirty(w);
    expect(gateNode(w, T(w, 32, 50), T(w, 31, 50))).toBe(-1);
    expect(distanceField(w, `stall:${stall.id}`)).toBeNull();
    expect(stallWarnings(w, stall)).toEqual(['This stall must face a footpath']);
    // An elevated path at the stall height outside it connects.
    const w2 = makeTestWorld();
    setLandRect(w2, 32, 50, 32, 50, 12);
    const p = elevated(w2, 31, 50, 12);
    const st2 = placeStallDirect(w2, 'snack_shack', 32, 50, 3);
    expect(gateNode(w2, T(w2, 32, 50), T(w2, 31, 50))).toBe(64 * 64 + w2.state.elevatedPaths.indexOf(p));
    expect(stallWarnings(w2, st2)).toEqual([]);
  });

  it('a queue on an elevated path belongs to the ride whose entrance it touches at the ride height', () => {
    const w = makeTestWorld();
    // A carousel on a plateau at 12; its entrance outside (21, 23) and below it ground at 8: elevated queue at 12.
    setLandRect(w, 20, 20, 22, 22, 12);
    const ride = placeRideDirect(w, 'carousel', 20, 20, 0);
    expect(ride.entrance?.outside).toBe(T(w, 21, 23));
    elevated(w, 21, 23, 12, 'queue');
    elevated(w, 21, 24, 12, 'queue');
    elevated(w, 21, 25, 12, 'footpath');
    expect(queueOwner(w, T(w, 21, 24))).toBe(ride.id);
    expect(queueOwner(w, T(w, 21, 24), 12)).toBe(ride.id);
    expect(queueOwner(w, T(w, 21, 24), 8)).toBeNull();
    expect(distanceTo(w, T(w, 21, 25), `ride:${ride.id}`, 12)).toBe(2);
    expect(rideWarnings(w, ride)).toEqual(['The exit needs a footpath']);
    // A ground queue under it at 8 does not belong to the ride.
    groundPath(w, 21, 24, 'queue');
    expect(queueOwner(w, T(w, 21, 24), 8)).toBeNull();
    expect(distanceField(w, `ride:${ride.id}`)?.[T(w, 21, 24)]).toBe(UNREACHABLE);
  });

  it('two nodes on one tile stay apart: a ground row and an overpass', () => {
    const w = makeTestWorld();
    for (let x = 10; x <= 20; x++) groundPath(w, x, 30);
    for (let y = 25; y <= 35; y++) elevated(w, 15, y, 11);
    expect(pathNodesAt(w, T(w, 15, 30)).map((n) => n.z)).toEqual([8, 11]);
    expect(staffDistanceTo(w, T(w, 10, 30), T(w, 20, 30), 8)).toBe(10);
    expect(staffDistanceTo(w, T(w, 15, 25), T(w, 15, 35), 11)).toBe(10);
    expect(staffDistanceTo(w, T(w, 10, 30), T(w, 15, 25), 8)).toBeNull();
    // Without z the best node of the tile is used.
    expect(staffDistanceTo(w, T(w, 15, 30), T(w, 15, 35))).toBe(5);
    expect(staffDistanceTo(w, T(w, 15, 30), T(w, 10, 30))).toBe(5);
  });
});
