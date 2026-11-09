import { describe, expect, it } from 'vitest';
import { extent, flatRideGates, footprintTiles, frontDir, stallServiceTile } from '../../../src/sim/footprint';
import { tileIndex, type Dir } from '../../../src/sim/map';
import { makeTestWorld } from '../../helpers/world';

describe('footprint geometry (contract)', () => {
  const map = makeTestWorld().state.map;
  const T = (x: number, y: number): number => tileIndex(map, x, y);

  it('front faces S, W, N, E for rotations 0–3', () => {
    expect([0, 1, 2, 3].map((r) => frontDir(r as Dir))).toEqual([2, 3, 0, 1]);
  });

  it('3×3 gates at rotation 0: entrance south middle, exit north middle', () => {
    const g = flatRideGates(map, 10, 10, 3, 3, 0);
    expect(g.entrance).toEqual({ gate: T(11, 12), outside: T(11, 13) });
    expect(g.exit).toEqual({ gate: T(11, 10), outside: T(11, 9) });
  });

  it('3×5 pendulum ship at rotation 1 covers 5 × 3 tiles; entrance faces west', () => {
    expect(extent(3, 5, 1)).toEqual({ ex: 5, ey: 3 });
    const tiles = footprintTiles(map, 10, 10, 3, 5, 1);
    expect(tiles).toHaveLength(15);
    const g = flatRideGates(map, 10, 10, 3, 5, 1);
    expect(g.entrance).toEqual({ gate: T(10, 11), outside: T(9, 11) });
    expect(g.exit).toEqual({ gate: T(14, 11), outside: T(15, 11) });
  });

  it('every rotation covers exactly w × d distinct tiles inside its extent', () => {
    for (const r of [0, 1, 2, 3] as Dir[]) {
      const tiles = footprintTiles(map, 20, 20, 4, 2, r) ?? [];
      expect(new Set(tiles).size).toBe(8);
      const { ex, ey } = extent(4, 2, r);
      for (const i of tiles) {
        const x = i % map.width;
        const y = Math.floor(i / map.width);
        expect(x >= 20 && x < 20 + ex && y >= 20 && y < 20 + ey).toBe(true);
      }
    }
  });

  it('returns null or −1 at the map edge', () => {
    expect(footprintTiles(map, 62, 62, 3, 3, 0)).toBeNull();
    expect(stallServiceTile(map, 0, 0, 0)).toBe(-1);
    expect(stallServiceTile(map, 5, 5, 2)).toBe(T(5, 6));
  });
});
