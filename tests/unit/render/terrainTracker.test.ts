/** Phase 6 §4.6 finding (W4-E): the terrain change check compares 4 tiles at a time and only the layers chunks show. */
import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, TerrainTracker, TRACKED_LAYERS, chunkCount } from '../../../src/render/terrainTracker';
import { generateMap, PathItem, type MapState } from '../../../src/sim/map';

function settled(map: MapState): TerrainTracker {
  const t = new TerrainTracker();
  t.sync(map);
  const { cx, cy } = chunkCount(map);
  for (let c = 0; c < cx * cy; c++) t.clean(c);
  return t;
}

const chunkOf = (map: MapState, i: number): number => {
  const x = i % map.width;
  const y = Math.floor(i / map.width);
  return Math.floor(y / CHUNK_SIZE) * Math.ceil(map.width / CHUNK_SIZE) + Math.floor(x / CHUNK_SIZE);
};

describe('terrain tracker diff', () => {
  it('finds a single changed tile in every tracked layer, at every byte of a word and in the tail', () => {
    // 37 × 21 = 777 tiles: not a multiple of 4, so the last tiles are outside the word compare.
    const map = generateMap({ width: 37, height: 21 });
    const n = map.width * map.height;
    for (const layer of TRACKED_LAYERS) {
      for (const i of [0, 1, 2, 3, 4, 401, 402, 403, n - 5, n - 2, n - 1]) {
        const t = settled(map);
        const v = t.version;
        const arr = map[layer];
        arr[i] = (arr[i] as number) + 1;
        t.sync(map);
        expect(t.version, `${layer} tile ${i}`).toBe(v + 1);
        expect(t.isDirty(chunkOf(map, i)), `${layer} tile ${i}`).toBe(true);
        // The snapshot took the new value: a second sync sees nothing.
        const { cx, cy } = chunkCount(map);
        for (let c = 0; c < cx * cy; c++) t.clean(c);
        t.sync(map);
        expect(t.version).toBe(v + 1);
        expect(t.dirtyCount()).toBe(0);
      }
    }
  });

  it('finds every changed tile when several change in one word', () => {
    const map = generateMap({ width: 64, height: 64 });
    const t = settled(map);
    // Tiles 15 and 16 share a word but lie in chunks 0 and 1 (and their neighbours' chunks).
    map.heights[15] = 20;
    map.heights[16] = 20;
    t.sync(map);
    expect(t.isDirty(0)).toBe(true);
    expect(t.isDirty(1)).toBe(true);
    expect(t.dirtyList()).toEqual([0, 1]);
  });

  it('works on layers that are not word-aligned and on replaced layer arrays', () => {
    const base = generateMap({ width: 32, height: 32 });
    const n = 32 * 32;
    const buf = new Uint8Array(n + 1);
    const map: MapState = { ...base, terrain: buf.subarray(1) };
    const t = settled(map);
    map.terrain[700] = 3;
    t.sync(map);
    expect(t.isDirty(chunkOf(map, 700))).toBe(true);
    // A layer array swapped for a new one with the same values: no change; then a changed value is seen.
    const t2 = settled(map);
    map.slope = map.slope.slice();
    t2.sync(map);
    expect(t2.dirtyCount()).toBe(0);
    map.slope[5] = 1;
    t2.sync(map);
    expect(t2.isDirty(0)).toBe(true);
  });

  it('path items and their broken flag are not chunk art: changing them redraws no terrain', () => {
    const map = generateMap({ width: 64, height: 64 });
    const t = settled(map);
    const v = t.version;
    map.pathItem[100] = PathItem.Bench;
    map.pathItemFlags[100] = 1;
    map.litter[100] = 2;
    t.sync(map);
    expect(t.version).toBe(v);
    expect(t.dirtyCount()).toBe(0);
  });
});
