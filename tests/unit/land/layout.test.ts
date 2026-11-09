import { describe, expect, it } from 'vitest';
import { generateFreePlayMap } from '../../../src/sim/land/layout';
import { Content, Owned, Terrain, tileIndex, type MapState } from '../../../src/sim/map';
import { FREE_PLAY_BORDER, MAP_SIZE_DEFAULT, MAP_SIZES } from '../../../src/data/tuning/land';
import { GROUND_LEVEL } from '../../../src/data/tuning/core';
import { createWorld } from '../../../src/sim/world';
import { fenceSegments, entranceOuterDir } from '../../../src/render/fence';
import { executeCommand } from '../../../src/sim/commands';

function countOwned(map: MapState, state: number): number {
  let n = 0;
  for (let i = 0; i < map.owned.length; i++) if (map.owned[i] === state) n++;
  return n;
}

describe('free-play layout (Phase 4 §4.9)', () => {
  for (const size of MAP_SIZES) {
    it(`size ${size}: owned centre square, a ring for sale, 4 outer tiles not owned, the entrance in the gap`, () => {
      const map = generateFreePlayMap(size);
      expect(map.width).toBe(size);
      expect(map.height).toBe(size);
      const s = Math.min(48, size - 8);
      const o = Math.floor((size - s) / 2);
      const ex = o + Math.floor((s - 1) / 2);
      const ey = o + s;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = tileIndex(map, x, y);
          const inSquare = x >= o && x < o + s && y >= o && y < o + s;
          const border = x < FREE_PLAY_BORDER || y < FREE_PLAY_BORDER || x >= size - FREE_PLAY_BORDER || y >= size - FREE_PLAY_BORDER;
          const expected = inSquare || (x === ex && y === ey) ? Owned.Owned : border ? Owned.NotOwned : Owned.LandForSale;
          if (map.owned[i] !== expected) throw new Error(`owned(${x}, ${y}) = ${map.owned[i]}, expected ${expected}`);
          if (map.heights[i] !== GROUND_LEVEL || map.slope[i] !== 0 || map.water[i] !== 0 || map.terrain[i] !== Terrain.Grass) {
            throw new Error(`tile (${x}, ${y}) is not flat grass at ground level`);
          }
        }
      }
      expect(countOwned(map, Owned.Owned)).toBe(s * s + 1);
      // Entrance: owned, south of the square, with the 3-tile footpath stub leading north.
      expect(map.entranceTile).toBe(tileIndex(map, ex, ey));
      expect(map.content[map.entranceTile]).toBe(Content.ParkEntrance);
      for (let k = 1; k <= 3; k++) expect(map.content[tileIndex(map, ex, ey - k)]).toBe(Content.Footpath);
      expect(map.content[tileIndex(map, ex, ey - 4)]).toBe(Content.Empty);
      expect(entranceOuterDir(map)).toBe(2);
      // Fence: the square's border, the entrance's two sides, and the gap at the entrance's outer edge.
      const segs = fenceSegments(map);
      expect(segs.length).toBe(4 * s - 1 + 2);
      expect(segs.some((g) => g.tile === map.entranceTile && g.dir === 2)).toBe(false);
      expect(segs.some((g) => g.tile === tileIndex(map, ex, ey - 1) && g.dir === 2)).toBe(false);
    });
  }

  it('is deterministic and defaults to 96 × 96', () => {
    const a = generateFreePlayMap();
    const b = generateFreePlayMap(MAP_SIZE_DEFAULT);
    expect(a.width).toBe(96);
    expect(Array.from(a.owned)).toEqual(Array.from(b.owned));
    expect(Array.from(a.content)).toEqual(Array.from(b.content));
  });

  it('64 × 64 keeps the Build 1 entrance column (x = 31)', () => {
    const map = generateFreePlayMap(64);
    expect(map.entranceTile % 64).toBe(31);
  });

  it('createWorld builds the free-play map at the requested size, and land around it can be bought', () => {
    const world = createWorld({ seed: 7, parkName: 'Wide Park', layout: 'freePlay', mapSize: 128 });
    const map = world.state.map;
    expect(map.width).toBe(128);
    const o = (128 - 48) / 2;
    // The ring just west of the square is for sale; buy a 2 × 2 block there.
    expect(map.owned[tileIndex(map, o - 1, o)]).toBe(Owned.LandForSale);
    const r = executeCommand(world, { type: 'buyLand', x0: o - 2, y0: o, x1: o - 1, y1: o + 1 });
    expect(r.ok).toBe(true);
    expect(map.owned[tileIndex(map, o - 2, o + 1)]).toBe(Owned.Owned);
    // The border stays not for sale.
    expect(executeCommand(world, { type: 'buyLand', x0: 1, y0: 1, x1: 1, y1: 1 })).toEqual({ ok: false, reason: 'This land is not for sale' });
  });
});
