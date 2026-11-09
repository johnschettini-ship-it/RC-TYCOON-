import { describe, expect, it } from 'vitest';
import { ANGLE_FRAMES, decodeRideFrame, encodeRideFrame, occupancyLevel, rideAnimation, rideFrameFor } from '../../../src/render/anim';
import { CHUNK_SIZE, TerrainTracker, chunkCount } from '../../../src/render/terrainTracker';
import { Content, generateMap, tileIndex } from '../../../src/sim/map';
import { getFlatRideDef } from '../../../src/data/catalog';

describe('ride animation from ride.cycle.phase', () => {
  const cyc = 400;
  it('is still while waiting, loading, and unloading', () => {
    for (const phase of ['waiting', 'loading', 'unloading'] as const) {
      expect(rideAnimation('carousel', { phase, ticks: 123 }, cyc)).toEqual({ turn: 0, swing: 0 });
    }
  });

  it('turns while running, starting and ending at frame 0', () => {
    const start = rideAnimation('carousel', { phase: 'running', ticks: 0 }, cyc);
    const end = rideAnimation('carousel', { phase: 'running', ticks: cyc }, cyc);
    const mid = rideAnimation('carousel', { phase: 'running', ticks: cyc / 2 }, cyc);
    expect(start.turn).toBe(0);
    expect(Math.abs(end.turn - Math.round(end.turn))).toBeLessThan(1e-9);
    expect(end.turn).toBeGreaterThan(0);
    expect(mid.turn).toBeGreaterThan(0);
    // Monotonic: the ride never turns backwards.
    let last = -1;
    for (let t = 0; t <= cyc; t += 5) {
      const a = rideAnimation('teacup_twirl', { phase: 'running', ticks: t }, cyc).turn;
      expect(a).toBeGreaterThanOrEqual(last);
      last = a;
    }
  });

  it('swings the swing tower out while running and back in at the end', () => {
    expect(rideAnimation('swing_tower', { phase: 'running', ticks: 0 }, cyc).swing).toBe(0);
    expect(rideAnimation('swing_tower', { phase: 'running', ticks: cyc / 2 }, cyc).swing).toBe(1);
    expect(rideAnimation('swing_tower', { phase: 'running', ticks: cyc }, cyc).swing).toBe(0);
  });

  it('encodes angle, swing, and occupancy into one frame number below 2048', () => {
    for (let a = 0; a < ANGLE_FRAMES; a++) {
      for (let s = 0; s <= 4; s++) {
        for (let o = 0; o <= 4; o++) {
          const f = encodeRideFrame(a, s, o);
          expect(f).toBeLessThan(2048);
          expect(decodeRideFrame(f)).toEqual({ angle: a, swing: s, occupancy: o });
        }
      }
    }
  });

  it('maps riders to 5 occupancy levels', () => {
    expect(occupancyLevel(0, 16)).toBe(0);
    expect(occupancyLevel(1, 16)).toBe(1);
    expect(occupancyLevel(8, 16)).toBe(2);
    expect(occupancyLevel(15, 16)).toBe(3);
    expect(occupancyLevel(16, 16)).toBe(4);
    expect(occupancyLevel(99, 16)).toBe(4);
  });

  it('builds a frame for a ride record', () => {
    const def = getFlatRideDef('carousel')!;
    const f = rideFrameFor({ defId: 'carousel', cycle: { phase: 'waiting', ticks: 0 }, riders: [] }, def);
    expect(f).toBe(0);
    const g = rideFrameFor({ defId: 'carousel', cycle: { phase: 'running', ticks: 37 }, riders: [1, 2, 3] }, def);
    expect(decodeRideFrame(g).occupancy).toBe(1);
    expect(decodeRideFrame(g).swing).toBe(0);
  });
});

describe('terrain chunk dirty flags', () => {
  it('uses 8 × 8-tile chunks (Phase 6 §4.6: 16 × 16 images were 9 MB each at the phone zoom bucket)', () => {
    expect(CHUNK_SIZE).toBe(8);
    const map = generateMap();
    expect(chunkCount(map)).toEqual({ cx: 8, cy: 8 });
  });

  it('marks every chunk dirty on the first sync, then nothing until the map changes', () => {
    const map = generateMap();
    const t = new TerrainTracker();
    t.sync(map);
    expect(t.dirtyCount()).toBe(64);
    for (let c = 0; c < 64; c++) t.clean(c);
    t.sync(map);
    expect(t.dirtyCount()).toBe(0);
  });

  it('marks the chunk of a changed tile and the chunks of its neighbours', () => {
    const map = generateMap();
    const t = new TerrainTracker();
    t.sync(map);
    for (let c = 0; c < 64; c++) t.clean(c);
    map.content[tileIndex(map, 20, 20)] = Content.Footpath;
    t.sync(map);
    expect(t.dirtyList()).toEqual([2 * 8 + 2]);
    for (let c = 0; c < 64; c++) t.clean(c);
    // A tile on a chunk corner touches three chunks through its neighbours.
    map.owned[tileIndex(map, 16, 16)] = 0;
    t.sync(map);
    expect(t.dirtyList()).toEqual([1 * 8 + 2, 2 * 8 + 1, 2 * 8 + 2]);
  });

  it('resets when the world gets a new map', () => {
    const t = new TerrainTracker();
    t.sync(generateMap());
    for (let c = 0; c < 64; c++) t.clean(c);
    t.sync(generateMap({ width: 32, height: 32 }));
    expect(t.dirtyCount()).toBe(16);
  });
});
