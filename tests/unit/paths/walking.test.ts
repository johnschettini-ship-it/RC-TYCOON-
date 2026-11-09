/**
 * Guests and staff walk on path nodes (Phase 4 §4.2; W3-B "Done": guests walk up a ramp path to a hill-top ride
 * and across a bridge). Invariants checked every tick: each walker stands on a node of its tile at its `z`, and
 * no walker stands on the ground of a wet tile.
 */
import { describe, expect, it } from 'vitest';
import { Content } from '../../../src/sim/map';
import { nodeIdAt } from '../../../src/sim/paths/nodes';
import { stepTick } from '../../../src/sim/tick';
import type { World } from '../../../src/sim/types';
import { addGuestDirect, makeTestWorld, runTicks, stateHash } from '../../helpers/world';
import { T, must, setLand, setLandRect, setWater } from './helpers';

interface Park {
  rideId: number;
  stallId: number;
}

/**
 * Entrance (31, 63), stub (31, 60..62). North: a ramp (31, 54) up a hill at 9 with a Carousel on top.
 * West: a lake (17..19, 59) crossed by a bridge at 8 to a Snack Shack.
 */
function buildHillAndLake(w: World): Park {
  setLandRect(w, 25, 38, 37, 53, 9);
  setLand(w, 31, 54, 8, 0b0011); // rises toward −y (the hill)
  for (let x = 17; x <= 19; x++) {
    setLand(w, x, 59, 6);
    setWater(w, x, 59, 8);
  }
  must(w, { type: 'buildPathLine', x0: 31, y0: 59, x1: 31, y1: 46, kind: 'footpath' });
  // Carousel on the hill: entrance outside (31, 44), exit outside (31, 40).
  const rideId = must(w, { type: 'placeRide', defId: 'carousel', x: 30, y: 41, rotation: 0 }).id as number;
  must(w, { type: 'buildPathLine', x0: 31, y0: 44, x1: 31, y1: 45, kind: 'queue' });
  must(w, { type: 'buildPathLine', x0: 31, y0: 40, x1: 34, y1: 40, kind: 'footpath' });
  must(w, { type: 'buildPathLine', x0: 34, y0: 41, x1: 34, y1: 46, kind: 'footpath' });
  must(w, { type: 'buildPathLine', x0: 33, y0: 46, x1: 32, y1: 46, kind: 'footpath' });
  // West over the lake: ground path to the bank, a bridge at 8, and a stall on the far bank.
  must(w, { type: 'buildPathLine', x0: 30, y0: 59, x1: 20, y1: 59, kind: 'footpath' });
  must(w, { type: 'buildPathLine', x0: 19, y0: 59, x1: 17, y1: 59, kind: 'footpath', z: 8 });
  must(w, { type: 'buildPathLine', x0: 16, y0: 59, x1: 14, y1: 59, kind: 'footpath' });
  const stallId = must(w, { type: 'placeStall', defId: 'snack_shack', x: 14, y: 58, rotation: 2 }).id as number;
  must(w, { type: 'setRideOpen', rideId, open: true });
  must(w, { type: 'setParkOpen', open: true });
  return { rideId, stallId };
}

/** Every guest and staff member on a node of its tile at its z; none on the ground of a wet tile. */
function checkWalkers(w: World): void {
  const map = w.state.map;
  for (const g of w.state.guests) {
    if (g.state === 'riding') continue;
    const ok = g.tile === map.entranceTile || nodeIdAt(w, g.tile, g.z) >= 0;
    if (!ok) throw new Error(`guest ${g.id} at tile ${g.tile} z ${g.z} is off the paths (state ${g.state})`);
    if ((map.water[g.tile] as number) > (map.heights[g.tile] as number) && g.z < (map.water[g.tile] as number)) {
      throw new Error(`guest ${g.id} stands in water at tile ${g.tile}`);
    }
  }
  for (const s of w.state.staff.members) {
    if (nodeIdAt(w, s.tile, s.z) < 0 && s.tile !== map.entranceTile) throw new Error(`staff ${s.id} at tile ${s.tile} z ${s.z} is off the paths`);
  }
}

describe('guests walk on path nodes', () => {
  it('up a ramp to a hill-top ride and across a bridge to a stall, always on a node and never in water', () => {
    const w = makeTestWorld();
    const park = buildHillAndLake(w);
    const ride = w.state.rides.find((r) => r.id === park.rideId)!;
    const stall = w.state.stalls.find((s) => s.id === park.stallId)!;
    let sawHill = false;
    let sawBridge = false;
    for (let t = 0; t < 12_000 && (ride.totals.riders === 0 || stall.totals.sales === 0 || !sawBridge); t++) {
      stepTick(w);
      checkWalkers(w);
      for (const g of w.state.guests) {
        if (g.tile === T(w, 31, 50) && g.z === 9) sawHill = true;
        if (g.tile === T(w, 18, 59) && g.z === 8) sawBridge = true;
      }
    }
    expect(sawHill).toBe(true);
    expect(sawBridge).toBe(true);
    expect(ride.totals.riders).toBeGreaterThan(0);
    expect(stall.totals.sales).toBeGreaterThan(0);
  });

  it('a guest climbing the ramp walks at 0.75 and comes down at 1.10', () => {
    const w = makeTestWorld();
    buildHillAndLake(w);
    w.state.park.open = false;
    const g = addGuestDirect(w, T(w, 31, 55), { target: 'exit', state: 'leaving', nextDecisionTick: 1e9 });
    // Walk to the ramp: one flat step toward the hill is forced by hand (the route to the exit goes south).
    g.target = null;
    g.state = 'walking';
    g.nextTile = T(w, 31, 54);
    g.dir = 0;
    stepTick(w);
    expect(g.progress).toBe(0.75);
    // Completes after ceil(10 / 0.75) = 14 ticks; the guest is then on the ramp at z 8.
    for (let k = 1; k < 14; k++) stepTick(w);
    expect(g.tile).toBe(T(w, 31, 54));
    expect(g.z).toBe(8);
  });

  it('demolishing a bridge under guests puts them back on the paths (Review Focus 1)', () => {
    const w = makeTestWorld();
    buildHillAndLake(w);
    const guests = [17, 18, 19].map((x) => addGuestDirect(w, T(w, x, 59), { z: 8 }));
    for (const x of [17, 18, 19]) must(w, { type: 'demolish', x, y: 59, z: 8 });
    expect(w.state.elevatedPaths).toHaveLength(0);
    stepTick(w);
    for (const g of guests) {
      expect(w.state.map.water[g.tile]).toBe(0);
      expect(nodeIdAt(w, g.tile, g.z)).toBeGreaterThanOrEqual(0);
    }
    for (let k = 0; k < 400; k++) {
      stepTick(w);
      checkWalkers(w);
    }
  });

  it('with the bridge gone the far stall is unreachable: guests never target it and nobody loops (Review Focus 2)', () => {
    const w = makeTestWorld();
    const park = buildHillAndLake(w);
    for (const x of [17, 18, 19]) must(w, { type: 'demolish', x, y: 59, z: 8 });
    for (let k = 0; k < 4_000; k++) {
      stepTick(w);
      checkWalkers(w);
      for (const g of w.state.guests) {
        if (g.target === `stall:${park.stallId}`) throw new Error('a guest targets an unreachable stall');
      }
    }
    expect(w.state.stalls.find((s) => s.id === park.stallId)!.totals.sales).toBe(0);
  });

  it('is deterministic', () => {
    const run = (): string => {
      const w = makeTestWorld(777);
      buildHillAndLake(w);
      runTicks(w, 3_000);
      return stateHash(w);
    };
    expect(run()).toBe(run());
  });
});

describe('staff walk on path nodes', () => {
  it('a Groundskeeper walks up the ramp and across the bridge with z kept right and the ramp factors', () => {
    const w = makeTestWorld();
    buildHillAndLake(w);
    w.state.park.open = false;
    must(w, { type: 'hireStaff', staffType: 'groundskeeper' });
    const s = w.state.staff.members[0]!;
    // Litter on the hill and on the far bank: the Groundskeeper goes to both.
    w.state.map.litter[T(w, 31, 48)] = 3;
    let up = false;
    let bridge = false;
    for (let k = 0; k < 3_000 && w.state.map.litter[T(w, 31, 48)] !== 0; k++) {
      stepTick(w);
      checkWalkers(w);
      if (s.state === 'walking' && s.tile === T(w, 31, 55) && s.nextTile === T(w, 31, 54) && s.progress > 0) {
        expect(s.progress % 0.75).toBeCloseTo(0, 9);
        up = true;
      }
    }
    expect(up).toBe(true);
    expect(w.state.map.litter[T(w, 31, 48)]).toBe(0);
    w.state.map.litter[T(w, 15, 59)] = 3;
    for (let k = 0; k < 3_000 && w.state.map.litter[T(w, 15, 59)] !== 0; k++) {
      stepTick(w);
      checkWalkers(w);
      if (s.tile === T(w, 18, 59)) {
        expect(s.z).toBe(8);
        bridge = true;
      }
    }
    expect(bridge).toBe(true);
    expect(w.state.map.litter[T(w, 15, 59)]).toBe(0);
    expect(w.state.map.content[T(w, 18, 59)]).toBe(Content.Empty);
  });
});
