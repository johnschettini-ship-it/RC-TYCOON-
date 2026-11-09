import { describe, expect, it } from 'vitest';
import { guestPosition, type GuestPos } from '../../../src/render/guestPos';
import { surfaceHeight } from '../../../src/render/iso';
import { staffPosition, type StaffPos } from '../../../src/render/management/staffPos';
import { createQueueWalker, queueSlot } from '../../../src/render/queue';
import { generateMap, tileIndex } from '../../../src/sim/map';
import { makeTestWorld, placeQueue, placeRideDirect } from '../../helpers/world';

/** Guests and staff are drawn at their path node height (Phase 4 §5 `Guest.z`, `Staff.z`; W3-G card). */
describe('walkers at their height', () => {
  it('surfaceHeight follows the slope of the tile under the point', () => {
    const map = generateMap({ width: 8, height: 8 });
    const i = tileIndex(map, 3, 3);
    map.heights[i] = 9;
    map.slope[i] = 2 | 4; // E and S raised: the tile rises toward +x
    expect(surfaceHeight(map, 3, 3.5)).toBeCloseTo(9, 9);
    expect(surfaceHeight(map, 4 - 1e-9, 3.5)).toBeCloseTo(10, 6);
    expect(surfaceHeight(map, 3.5, 3.5)).toBeCloseTo(9.5, 9);
    expect(surfaceHeight(map, 1.5, 1.5)).toBe(8);
    // Off the map: the nearest edge tile.
    expect(surfaceHeight(map, -3, 2)).toBe(8);
  });

  it('a guest on a ground ramp rises with the ground while it walks', () => {
    const map = generateMap({ width: 8, height: 8 });
    const a = tileIndex(map, 2, 4);
    const ramp = tileIndex(map, 3, 4);
    const top = tileIndex(map, 4, 4);
    map.slope[ramp] = 2 | 4;
    map.heights[top] = 9;
    const out: GuestPos = { fx: 0, fy: 0, z: 0, tile: -1 };
    const g = { tile: ramp, nextTile: top, progress: 0, lane: 1, dir: 1 as const, z: 8 };
    guestPosition(map, g, 0, out);
    expect(out.z).toBeCloseTo(8.5, 9); // the ramp tile centre
    guestPosition(map, { ...g, progress: 5 }, 0, out);
    expect(out.z).toBeCloseTo(9, 6); // the top edge of the ramp
    guestPosition(map, { ...g, tile: a, nextTile: ramp, z: 8 }, 0, out);
    expect(out.z).toBe(8);
  });

  it('a guest on an elevated path is drawn at its node z, not on the ground', () => {
    const map = generateMap({ width: 8, height: 8 });
    const out: GuestPos = { fx: 0, fy: 0, z: 0, tile: -1 };
    const t = tileIndex(map, 3, 3);
    guestPosition(map, { tile: t, nextTile: t + 1, progress: 4, lane: 0, dir: 1, z: 14 }, 0.5, out);
    expect(out.z).toBe(14);
    // Without a z (Build 1 records in tests), the ground.
    guestPosition(map, { tile: t, nextTile: -1, progress: 0, lane: 0, dir: 1 }, 0, out);
    expect(out.z).toBe(8);
  });

  it('staff use the same rule', () => {
    const map = generateMap({ width: 8, height: 8 });
    const out: StaffPos = { fx: 0, fy: 0, z: 0 };
    const t = tileIndex(map, 3, 3);
    staffPosition(map, { tile: t, nextTile: -1, progress: 0, z: 12 }, 10, 0, out);
    expect(out.z).toBe(12);
    staffPosition(map, { tile: t, nextTile: -1, progress: 0, z: 8 }, 10, 0, out);
    expect(out.z).toBe(8);
    map.slope[t] = 1;
    staffPosition(map, { tile: t, nextTile: -1, progress: 0, z: 8 }, 10, 0, out);
    expect(out.z).toBeCloseTo(8.25, 9);
  });

  it('queue slots stand on the ground surface', () => {
    const world = makeTestWorld();
    const map = world.state.map;
    const ride = placeRideDirect(world, 'carousel', 10, 10, 0);
    const q = placeQueue(world, 11, 13);
    map.slope[q] = 4 | 8;
    const chain = createQueueWalker(map.width * map.height).chain(map, ride.entrance!.outside);
    const out: GuestPos = { fx: 0, fy: 0, z: 0, tile: -1 };
    queueSlot(map, chain, ride.entrance!.gate, 3, out);
    expect(out.z).toBeCloseTo(surfaceHeight(map, out.fx, out.fy), 9);
    expect(out.z).toBeGreaterThan(8);
  });
});
