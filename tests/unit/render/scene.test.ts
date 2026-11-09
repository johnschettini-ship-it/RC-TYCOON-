import { describe, expect, it } from 'vitest';
import { QUEUE_SLOTS_PER_TILE, createQueueWalker, queueSlot } from '../../../src/render/queue';
import { entranceOuterDir, fenceSegments, fenceEdgeDepth } from '../../../src/render/fence';
import { JOIN_E, JOIN_N, JOIN_S, JOIN_W, pathJoinMask } from '../../../src/render/paths';
import { GUEST_WALK_TICKS_PER_TILE, guestPosition, walkerHeights, type GuestPos } from '../../../src/render/guestPos';
import { staffPosition, type StaffPos } from '../../../src/render/management/staffPos';
import { executeCommand } from '../../../src/sim/commands';
import type { World } from '../../../src/sim/types';
import { SHIRT_COLOURS, shirtIndex, temperamentTint, TINT_STEPS, tintStep } from '../../../src/render/palette';
import { Content, Owned, generateMap, tileIndex } from '../../../src/sim/map';
import { addGuestDirect, makeTestWorld, placeFootpath, placeQueue, placeRideDirect, placeStallDirect } from '../../helpers/world';

describe('queue slots (4 guests per tile, from the entrance outward)', () => {
  it('walks the queue from ride.entrance.outside and maps index → tile, 4 per tile', () => {
    const world = makeTestWorld();
    const ride = placeRideDirect(world, 'carousel', 10, 10, 0); // entrance outside = (11, 13)
    const map = world.state.map;
    const q = [placeQueue(world, 11, 13), placeQueue(world, 11, 14), placeQueue(world, 11, 15), placeQueue(world, 12, 15)];
    expect(ride.entrance?.outside).toBe(q[0]);
    const walker = createQueueWalker(map.width * map.height);
    const chain = walker.chain(map, ride.entrance!.outside);
    expect(chain).toEqual(q);
    expect(QUEUE_SLOTS_PER_TILE).toBe(4);
    const out: GuestPos = { fx: 0, fy: 0, z: 0, tile: -1 };
    const tiles: number[] = [];
    for (let k = 0; k < 16; k++) {
      queueSlot(map, chain, ride.entrance!.gate, k, out);
      tiles.push(out.tile);
    }
    expect(tiles).toEqual([q[0], q[0], q[0], q[0], q[1], q[1], q[1], q[1], q[2], q[2], q[2], q[2], q[3], q[3], q[3], q[3]]);
  });

  it('places slot 0 nearest the gate and spaces slots along the walking line', () => {
    const world = makeTestWorld();
    const ride = placeRideDirect(world, 'carousel', 10, 10, 0);
    const map = world.state.map;
    placeQueue(world, 11, 13);
    placeQueue(world, 11, 14);
    placeQueue(world, 12, 14);
    const chain = createQueueWalker(map.width * map.height).chain(map, ride.entrance!.outside);
    const p = (k: number): GuestPos => {
      const o: GuestPos = { fx: 0, fy: 0, z: 0, tile: -1 };
      queueSlot(map, chain, ride.entrance!.gate, k, o);
      return o;
    };
    // First tile: the gate is north (y − 1), so slot 0 has the smallest y.
    expect(p(0).fy).toBeLessThan(p(1).fy);
    expect(p(1).fy).toBeLessThan(p(3).fy);
    expect(p(0).fx).toBeCloseTo(11.5, 1);
    for (let k = 0; k < 4; k++) expect(Math.floor(p(k).fy)).toBe(13);
    // Third tile (12, 14): the previous tile is west, so slots move east as k grows.
    expect(p(8).fx).toBeLessThan(p(9).fx);
    expect(Math.floor(p(11).fx)).toBe(12);
    // Overflow guests stay on the last tile.
    expect(p(40).tile).toBe(tileIndex(map, 12, 14));
    expect(p(0).z).toBe(map.heights[tileIndex(map, 11, 13)]);
  });

  it('returns an empty chain when the entrance has no queue tile', () => {
    const world = makeTestWorld();
    const ride = placeRideDirect(world, 'carousel', 10, 10, 0);
    const map = world.state.map;
    expect(createQueueWalker(map.width * map.height).chain(map, ride.entrance!.outside)).toEqual([]);
    expect(createQueueWalker(16).chain(map, -1)).toEqual([]);
  });

  it('stops at a branch after the first neighbour in N, E, S, W order and never loops', () => {
    const world = makeTestWorld();
    const map = world.state.map;
    // A 2 × 2 ring of queue tiles.
    const a = placeQueue(world, 20, 20);
    const b = placeQueue(world, 21, 20);
    const c = placeQueue(world, 21, 21);
    const d = placeQueue(world, 20, 21);
    expect(createQueueWalker(map.width * map.height).chain(map, a)).toEqual([a, b, c, d]);
  });
});

describe('park fence (rule R3)', () => {
  it('draws a segment on every owned / not-owned edge except the entrance outer edge', () => {
    const map = generateMap();
    const segs = fenceSegments(map);
    // Ring of 62 × 62 owned tiles: 4 × 62 edges, minus the gap at the entrance (31, 62)–(31, 63),
    // plus the entrance tile's west and east edges.
    expect(segs.length).toBe(4 * 62 - 1 + 2);
    const has = (x: number, y: number, dir: number): boolean => segs.some((s) => s.tile === tileIndex(map, x, y) && s.dir === dir);
    expect(has(5, 1, 0)).toBe(true); // north border
    expect(has(1, 7, 3)).toBe(true); // west border
    expect(has(62, 7, 1)).toBe(true); // east border
    expect(has(5, 62, 2)).toBe(true); // south border
    expect(has(31, 62, 2)).toBe(false); // gap above the entrance
    expect(has(31, 63, 2)).toBe(false); // entrance outer edge
    expect(has(31, 63, 3)).toBe(true);
    expect(has(31, 63, 1)).toBe(true);
    expect(entranceOuterDir(map)).toBe(2);
  });

  it('follows ownership changes and sorts edges by their midpoint', () => {
    const map = generateMap({ width: 8, height: 8 });
    map.owned[tileIndex(map, 3, 3)] = Owned.NotOwned;
    const segs = fenceSegments(map);
    const inner = segs.filter((s) => [tileIndex(map, 3, 2), tileIndex(map, 4, 3), tileIndex(map, 3, 4), tileIndex(map, 2, 3)].includes(s.tile));
    expect(inner.length).toBe(4);
    expect(fenceEdgeDepth(map, tileIndex(map, 3, 4), 0)).toBe(3.5 + 4);
    expect(fenceEdgeDepth(map, tileIndex(map, 3, 2), 2)).toBe(3.5 + 3);
    expect(fenceEdgeDepth(map, tileIndex(map, 2, 3), 1)).toBe(3 + 3.5);
    expect(fenceEdgeDepth(map, tileIndex(map, 4, 3), 3)).toBe(4 + 3.5);
  });
});

describe('path auto-join', () => {
  it('joins footpaths to footpath neighbours and the park entrance', () => {
    const world = makeTestWorld();
    const map = world.state.map;
    const s = world.state;
    // Generated stub: (31, 60)–(31, 62) north of the entrance (31, 63).
    expect(pathJoinMask(map, tileIndex(map, 31, 62), s.rides, s.stalls)).toBe(JOIN_N | JOIN_S);
    expect(pathJoinMask(map, tileIndex(map, 31, 60), s.rides, s.stalls)).toBe(JOIN_S);
    placeFootpath(world, 32, 60);
    placeFootpath(world, 30, 60);
    expect(pathJoinMask(map, tileIndex(map, 31, 60), s.rides, s.stalls)).toBe(JOIN_E | JOIN_S | JOIN_W);
    // The entrance joins the stub and its outer edge.
    expect(pathJoinMask(map, map.entranceTile, s.rides, s.stalls)).toBe(JOIN_N | JOIN_S);
  });

  it('joins a queue to its ride entrance, other queue tiles, and a footpath at its free end', () => {
    const world = makeTestWorld();
    const map = world.state.map;
    const s = world.state;
    placeRideDirect(world, 'carousel', 10, 10, 0); // entrance gate (11, 12), outside (11, 13); exit outside (11, 9)
    placeQueue(world, 11, 13);
    placeQueue(world, 11, 14);
    placeFootpath(world, 11, 15);
    placeFootpath(world, 12, 13); // beside the queue, but not at its free end
    expect(pathJoinMask(map, tileIndex(map, 11, 13), s.rides, s.stalls)).toBe(JOIN_N | JOIN_S);
    expect(pathJoinMask(map, tileIndex(map, 11, 14), s.rides, s.stalls)).toBe(JOIN_N | JOIN_S);
    expect(pathJoinMask(map, tileIndex(map, 11, 15), s.rides, s.stalls)).toBe(JOIN_N);
    expect(pathJoinMask(map, tileIndex(map, 12, 13), s.rides, s.stalls)).toBe(0);
    // The exit footpath joins the exit gate.
    placeFootpath(world, 11, 9);
    expect(pathJoinMask(map, tileIndex(map, 11, 9), s.rides, s.stalls)).toBe(JOIN_S);
  });

  it('joins a footpath to the service side of a stall only', () => {
    const world = makeTestWorld();
    const map = world.state.map;
    const s = world.state;
    placeStallDirect(world, 'snack_shack', 20, 20, 2); // serves south: (20, 21)
    placeFootpath(world, 20, 21);
    placeFootpath(world, 21, 20);
    expect(pathJoinMask(map, tileIndex(map, 20, 21), s.rides, s.stalls)).toBe(JOIN_N);
    expect(pathJoinMask(map, tileIndex(map, 21, 20), s.rides, s.stalls)).toBe(0);
    expect(map.content[tileIndex(map, 20, 20)]).toBe(Content.Building);
  });
});

describe('guest position', () => {
  it('interpolates between tile and nextTile with progress and alpha', () => {
    const world = makeTestWorld();
    const map = world.state.map;
    const a = tileIndex(map, 10, 10);
    const b = tileIndex(map, 11, 10);
    const g = addGuestDirect(world, a, { nextTile: b, progress: 5, lane: 0, dir: 1 });
    const out: GuestPos = { fx: 0, fy: 0, z: 0, tile: -1 };
    guestPosition(map, g, 0, out);
    expect(GUEST_WALK_TICKS_PER_TILE).toBe(10);
    expect(out.fx).toBeCloseTo(11, 6);
    guestPosition(map, g, 0.5, out);
    expect(out.fx).toBeCloseTo(11.05, 6);
    expect(out.z).toBe(map.heights[a]);
    // Lanes spread guests across the path, perpendicular to the walking direction.
    const ys = [0, 1, 2, 3].map((lane) => {
      guestPosition(map, { ...g, lane }, 0, out);
      return out.fy;
    });
    expect(new Set(ys).size).toBe(4);
    for (const y of ys) expect(Math.floor(y)).toBe(10);
  });

  it('stands at the tile centre plus the lane offset when not walking', () => {
    const world = makeTestWorld();
    const map = world.state.map;
    const t = tileIndex(map, 5, 6);
    const g = addGuestDirect(world, t, { nextTile: -1, lane: 1, dir: 0 });
    const out: GuestPos = { fx: 0, fy: 0, z: 0, tile: -1 };
    guestPosition(map, g, 0.9, out);
    expect(Math.floor(out.fx)).toBe(5);
    expect(out.fy).toBeCloseTo(6.5, 6);
    expect(out.tile).toBe(t);
  });
});

describe('walkers on path nodes (Phase 4 §4.2: drawn at their node height, W3-B)', () => {
  /**
   * Row 10: ground footpath at (20, 10) and (23, 10), height 8; a channel 2 steps deep on (21–22, 10) with a bridge
   * (elevated footpath at 8) over it. Row 12: an elevated ramp rising east, x 24–26, z 9, 10, 11.
   */
  function bridgeWorld(): World {
    const w = makeTestWorld();
    const map = w.state.map;
    for (const x of [21, 22]) map.heights[tileIndex(map, x, 10)] = 6;
    placeFootpath(w, 20, 10);
    placeFootpath(w, 23, 10);
    const ok = (cmd: Parameters<typeof executeCommand>[1]): void => {
      const r = executeCommand(w, cmd);
      if (!r.ok) throw new Error(r.reason);
    };
    ok({ type: 'buildPathLine', x0: 21, y0: 10, x1: 22, y1: 10, kind: 'footpath', z: 8 });
    ok({ type: 'buildPathLine', x0: 24, y0: 12, x1: 26, y1: 12, kind: 'footpath', z: 9, ramp: 'up' });
    return w;
  }
  const at = (w: World, progress: number, from: [number, number], to: [number, number], z: number): number => {
    const map = w.state.map;
    const g = addGuestDirect(w, tileIndex(map, ...from), { z, nextTile: tileIndex(map, ...to), progress, lane: 1, dir: 1 });
    const out: GuestPos = { fx: 0, fy: 0, z: 0, tile: -1 };
    return guestPosition(map, g, 0, out, walkerHeights(w)).z;
  };

  it('a guest stepping from the bank onto a bridge stays at deck height (no dip into the channel)', () => {
    const w = bridgeWorld();
    for (const p of [0, 2.5, 5, 7.5, 9.9]) expect(at(w, p, [20, 10], [21, 10], 8), `progress ${p}`).toBe(8);
    // Across the bridge and off it at the far bank.
    for (const p of [0, 5, 9]) expect(at(w, p, [21, 10], [22, 10], 8)).toBe(8);
    for (const p of [0, 5, 9]) expect(at(w, p, [22, 10], [23, 10], 8)).toBe(8);
    // The map-only height (no node heights) dips to the channel floor past the edge: what this fixes.
    const g = addGuestDirect(w, tileIndex(w.state.map, 20, 10), { z: 8, nextTile: tileIndex(w.state.map, 21, 10), progress: 7.5, lane: 1, dir: 1 });
    expect(guestPosition(w.state.map, g, 0, { fx: 0, fy: 0, z: 0, tile: -1 }).z).toBe(6);
  });

  it('a guest walking up an elevated ramp rises continuously with the deck', () => {
    const w = bridgeWorld();
    // Standing at the centre of the middle ramp tile: half a step above its base.
    expect(at(w, 0, [25, 12], [25, 12], 10)).toBeCloseTo(10.5, 9);
    const heights = [0, 2.5, 5, 7.5].map((p) => at(w, p, [24, 12], [25, 12], 9));
    expect(heights[0]).toBeCloseTo(9.5, 9);
    expect(heights[1]).toBeCloseTo(9.75, 9);
    expect(heights[2]).toBeCloseTo(10, 9);
    expect(heights[3]).toBeCloseTo(10.25, 9);
  });

  it('staff use the same node heights', () => {
    const w = bridgeWorld();
    const map = w.state.map;
    const out: StaffPos = { fx: 0, fy: 0, z: 0 };
    const s = { tile: tileIndex(map, 20, 10), nextTile: tileIndex(map, 21, 10), progress: 9, z: 8 };
    expect(staffPosition(map, s, 12, 0, out, walkerHeights(w)).z).toBe(8);
    expect(staffPosition(map, s, 12, 0, out).z).toBe(6);
  });
});

describe('palette', () => {
  it('derives a stable shirt colour from the guest id', () => {
    expect(SHIRT_COLOURS.length).toBeGreaterThanOrEqual(8);
    expect(shirtIndex(17)).toBe(shirtIndex(17));
    const used = new Set<number>();
    for (let id = 1; id <= 200; id++) {
      const i = shirtIndex(id);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(SHIRT_COLOURS.length);
      used.add(i);
    }
    expect(used.size).toBe(SHIRT_COLOURS.length);
  });

  it('tints blue at T ≤ 35 and orange at T ≥ 65, blending between', () => {
    expect(tintStep(0)).toBe(0);
    expect(tintStep(35)).toBe(0);
    expect(tintStep(65)).toBe(TINT_STEPS - 1);
    expect(tintStep(100)).toBe(TINT_STEPS - 1);
    expect(tintStep(50)).toBe((TINT_STEPS - 1) / 2);
    for (let t = 36; t < 65; t++) expect(tintStep(t)).toBeGreaterThanOrEqual(tintStep(t - 1));
    const blue = temperamentTint(0);
    const orange = temperamentTint(100);
    expect(blue[2]).toBeGreaterThan(blue[0]);
    expect(orange[0]).toBeGreaterThan(orange[2]);
    expect(temperamentTint(20)).toEqual(blue);
    expect(temperamentTint(80)).toEqual(orange);
  });
});
