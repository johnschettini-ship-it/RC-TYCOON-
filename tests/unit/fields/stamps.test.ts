/**
 * Calm and Buzz stamps (Phase 4 §4.6 sources table): one test per source row, the stamp formula
 * `s × (R + 1 − d)` at Chebyshev distance d ≤ R, read values with litter and mess penalties, and the bands.
 */
import { describe, expect, it } from 'vitest';
import { getFlatRideDef, getSceneryDef } from '../../../src/data/catalog';
import {
  FIELD_BANDS,
  FIELD_MAX,
  FIELD_RADIUS,
  FIELD_STRENGTH,
  FLAT_THRILL_INTENSITY_DIVISOR,
  LITTER_CALM_PENALTY,
  MESS_CALM_PENALTY,
  WILTED_CALM_DIVISOR,
} from '../../../src/data/tuning/fields';
import { GARDEN_WILT_BELOW } from '../../../src/data/tuning/scenery';
import { buzzAt, calmAt, fieldBand, markFieldsDirty } from '../../../src/sim/fields/api';
import { fieldsRaw } from '../../../src/sim/fields/store';
import { footprintTiles } from '../../../src/sim/footprint';
import { PathItem, tileIndex } from '../../../src/sim/map';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, placeRideDirect } from '../../helpers/world';
import { addSceneryDirect, bruteStamp, trackRideDirect, trackTilesOf } from './helpers';

/** Raw Calm and Buzz at (x, y) through the field cache (no penalties, no cap). */
function raw(w: World, x: number, y: number): { calm: number; buzz: number } {
  const f = fieldsRaw(w);
  const i = tileIndex(w.state.map, x, y);
  return { calm: f.calm[i] as number, buzz: f.buzz[i] as number };
}

/** Every tile of the map: actual raw value equals the brute-force stamp of the given sources. */
function expectField(w: World, field: 'calm' | 'buzz', tiles: readonly number[], s: number, r: number): void {
  const f = fieldsRaw(w)[field];
  const { width, height } = w.state.map;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const want = bruteStamp(width, tiles, s, r, x, y);
      if ((f[y * width + x] as number) !== want) expect(`${field} at ${x},${y}: ${f[y * width + x]}`).toBe(`${field} at ${x},${y}: ${want}`);
    }
  }
}

describe('stamp formula: s × (R + 1 − d) for Chebyshev d ≤ R', () => {
  it('a 1×1 centre item (Round Oak, C 3, R 3) at (20, 20)', () => {
    const w = makeTestWorld();
    addSceneryDirect(w, 'oak_round', 20, 20);
    expect(FIELD_RADIUS.scenery1x1).toBe(3);
    expect(raw(w, 20, 20).calm).toBe(12);
    expect(raw(w, 21, 21).calm).toBe(9);
    expect(raw(w, 22, 19).calm).toBe(6);
    expect(raw(w, 17, 23).calm).toBe(3);
    expect(raw(w, 16, 20).calm).toBe(0);
    expect(raw(w, 20, 20).buzz).toBe(0);
    expectField(w, 'calm', [tileIndex(w.state.map, 20, 20)], 3, 3);
  });

  it('clips at the map edge', () => {
    const w = makeTestWorld();
    addSceneryDirect(w, 'willow', 0, 0);
    expect(raw(w, 0, 0).calm).toBe(16);
    expectField(w, 'calm', [0], 4, 3);
  });
});

describe('sources table rows (Phase 4 §4.6)', () => {
  it('centre scenery 2×2 stamps from every tile with R 4 (Carved Fountain, C 6)', () => {
    const w = makeTestWorld();
    addSceneryDirect(w, 'fountain_carved', 30, 30);
    const map = w.state.map;
    const tiles = [tileIndex(map, 30, 30), tileIndex(map, 31, 30), tileIndex(map, 30, 31), tileIndex(map, 31, 31)];
    expect(FIELD_RADIUS.sceneryLarge).toBe(4);
    // Own tile 6 × 5 plus 3 neighbours at d 1: 3 × 6 × 4.
    expect(raw(w, 30, 30).calm).toBe(30 + 72);
    expectField(w, 'calm', tiles, 6, 4);
  });

  it('a 2×2 item with both Calm and Buzz stamps both fields (Bandstand, C 3, B 1)', () => {
    const w = makeTestWorld();
    addSceneryDirect(w, 'bandstand', 10, 40);
    const map = w.state.map;
    const tiles = [tileIndex(map, 10, 40), tileIndex(map, 11, 40), tileIndex(map, 10, 41), tileIndex(map, 11, 41)];
    expectField(w, 'calm', tiles, 3, 4);
    expectField(w, 'buzz', tiles, 1, 4);
  });

  it('centre scenery 2×1 stamps its 2 tiles with R 4 and swaps sides at rotation 1 and 3 (Rope Bridge Decor)', () => {
    const def = getSceneryDef('rope_bridge_decor')!;
    expect([def.w, def.d]).toEqual([2, 1]);
    const w0 = makeTestWorld();
    addSceneryDirect(w0, 'rope_bridge_decor', 20, 20, { rotation: 0 });
    expectField(w0, 'calm', [tileIndex(w0.state.map, 20, 20), tileIndex(w0.state.map, 21, 20)], def.calm, 4);
    const w1 = makeTestWorld();
    addSceneryDirect(w1, 'rope_bridge_decor', 20, 20, { rotation: 1 });
    expectField(w1, 'calm', [tileIndex(w1.state.map, 20, 20), tileIndex(w1.state.map, 20, 21)], def.calm, 4);
  });

  it('edge scenery stamps its tile with R 1 (Low Hedge, C 1)', () => {
    const w = makeTestWorld();
    addSceneryDirect(w, 'hedge_low', 12, 12, { edge: 2 });
    expect(FIELD_RADIUS.sceneryEdge).toBe(1);
    expect(raw(w, 12, 12).calm).toBe(2);
    expect(raw(w, 13, 11).calm).toBe(1);
    expect(raw(w, 14, 12).calm).toBe(0);
    expectField(w, 'calm', [tileIndex(w.state.map, 12, 12)], 1, 1);
  });

  it('edge Buzz too (Basalt Wall, B 1), and items with C 0 and B 0 add nothing (Wooden Fence)', () => {
    const w = makeTestWorld();
    addSceneryDirect(w, 'wall_basalt', 12, 12, { edge: 1 });
    addSceneryDirect(w, 'fence_wood', 40, 40, { edge: 0 });
    expectField(w, 'buzz', [tileIndex(w.state.map, 12, 12)], 1, 1);
    expectField(w, 'calm', [], 0, 1);
  });

  it('a wilted garden gives floor(C / 2) Calm at its size radius; at the wilt line it is not wilted', () => {
    const w = makeTestWorld();
    const bed = addSceneryDirect(w, 'bed_mixed', 20, 20, { waterLevel: GARDEN_WILT_BELOW });
    const c = getSceneryDef('bed_mixed')!.calm;
    expect(raw(w, 20, 20).calm).toBe(c * 4);
    bed.waterLevel = GARDEN_WILT_BELOW - 1;
    markFieldsDirty(w, tileIndex(w.state.map, 20, 20));
    expect(raw(w, 20, 20).calm).toBe(Math.floor(c / WILTED_CALM_DIVISOR) * 4);
    expectField(w, 'calm', [tileIndex(w.state.map, 20, 20)], Math.floor(c / WILTED_CALM_DIVISOR), FIELD_RADIUS.scenery1x1);
  });

  it('a wet tile gives Calm 1 with R 2', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const i = tileIndex(map, 25, 25);
    map.water[i] = (map.heights[i] as number) + 1;
    markFieldsDirty(w, i);
    expect(raw(w, 25, 25).calm).toBe(3);
    expectField(w, 'calm', [i], FIELD_STRENGTH.wetTile, FIELD_RADIUS.wetTile);
    // Water at the ground height is not wet (Phase 4 §4.3: above the lowest corner).
    map.water[i] = map.heights[i] as number;
    markFieldsDirty(w, i);
    expect(raw(w, 25, 25).calm).toBe(0);
  });

  it('a bench gives Calm 1 with R 2; a bin and a lamp give nothing', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const i = tileIndex(map, 8, 9);
    map.pathItem[i] = PathItem.Bench;
    markFieldsDirty(w, i);
    expectField(w, 'calm', [i], FIELD_STRENGTH.bench, FIELD_RADIUS.bench);
    map.pathItem[i] = PathItem.Bin;
    map.pathItem[tileIndex(map, 9, 9)] = PathItem.Lamp;
    markFieldsDirty(w, i);
    expectField(w, 'calm', [], 0, 2);
  });

  it('an open thrill flat ride gives Buzz 2 + floor(intensity / 2) from each footprint tile with R 5', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'flip_arm', 20, 20, 0);
    const def = getFlatRideDef('flip_arm')!;
    const tiles = footprintTiles(w.state.map, 20, 20, def.w, def.d, 0)!;
    expectField(w, 'buzz', [], 0, 5);
    ride.status = 'open';
    w.state.tick += 1;
    const s = FIELD_STRENGTH.flatThrillBase + Math.floor(def.intensity / FLAT_THRILL_INTENSITY_DIVISOR);
    expect(s).toBe(6); // Flip Arm intensity 8.00
    expectField(w, 'buzz', tiles, s, FIELD_RADIUS.flatRide);
    expectField(w, 'calm', [], 0, 5);
  });

  it('Swing Tower (intensity 4.00) gives Buzz 4 from each tile', () => {
    const w = makeTestWorld();
    placeRideDirect(w, 'swing_tower', 30, 10, 1).status = 'open';
    const tiles = footprintTiles(w.state.map, 30, 10, 3, 3, 1)!;
    expectField(w, 'buzz', tiles, 4, 5);
  });

  it('an open family flat ride gives Buzz 1 with R 5; chill, closed, and broken rides give none', () => {
    const w = makeTestWorld();
    placeRideDirect(w, 'carousel', 10, 10, 0).status = 'open';
    placeRideDirect(w, 'big_wheel', 40, 10, 0).status = 'open';
    placeRideDirect(w, 'flip_arm', 10, 40, 0).status = 'closed';
    placeRideDirect(w, 'drop_tower', 40, 40, 0).status = 'broken';
    placeRideDirect(w, 'thunder_disc', 25, 50, 0).status = 'inspecting';
    const tiles = footprintTiles(w.state.map, 10, 10, 3, 3, 0)!;
    expectField(w, 'buzz', tiles, FIELD_STRENGTH.flatFamily, FIELD_RADIUS.flatRide);
  });

  it('an open thrill track ride gives Buzz 2 from each track tile with R 3', () => {
    const w = makeTestWorld();
    const ride = trackRideDirect(w, 'steel_coaster', 20, 30, 'open');
    const tiles = trackTilesOf(w, ride);
    expect(tiles.length).toBeGreaterThan(0);
    expectField(w, 'buzz', tiles, FIELD_STRENGTH.trackThrill, FIELD_RADIUS.trackThrill);
  });

  it('an open family track ride gives Buzz 1 with R 2; a chill track ride and a testing one give none', () => {
    const w = makeTestWorld();
    const ride = trackRideDirect(w, 'junior_coaster', 20, 30, 'open');
    trackRideDirect(w, 'mini_railway', 40, 30, 'open');
    trackRideDirect(w, 'wooden_coaster', 20, 50, 'testing');
    expectField(w, 'buzz', trackTilesOf(w, ride), FIELD_STRENGTH.trackFamily, FIELD_RADIUS.trackFamily);
  });

  it('sources add up', () => {
    const w = makeTestWorld();
    addSceneryDirect(w, 'oak_round', 20, 20);
    addSceneryDirect(w, 'oak_round', 21, 20);
    expect(raw(w, 20, 20).calm).toBe(12 + 9);
    expect(raw(w, 21, 20).calm).toBe(9 + 12);
  });
});

describe('read values: min(255, raw − localPenalty), floored at 0', () => {
  it('litter costs 8 and mess 16 Calm on that tile only; Buzz has no penalty', () => {
    const w = makeTestWorld();
    addSceneryDirect(w, 'fountain_carved', 30, 30); // raw Calm 102 at (30, 30)
    placeRideDirect(w, 'carousel', 26, 26, 0).status = 'open';
    const map = w.state.map;
    const i = tileIndex(map, 30, 30);
    const buzz = buzzAt(w, i);
    expect(calmAt(w, i)).toBe(102);
    map.litter[i] = 2;
    expect(calmAt(w, i)).toBe(102 - 2 * LITTER_CALM_PENALTY);
    map.mess[i] = 1;
    expect(calmAt(w, i)).toBe(102 - 2 * LITTER_CALM_PENALTY - MESS_CALM_PENALTY);
    expect(calmAt(w, tileIndex(map, 31, 30))).toBe(fieldsRaw(w).calm[tileIndex(map, 31, 30)]);
    expect(buzzAt(w, i)).toBe(buzz);
    map.mess[i] = 9;
    expect(calmAt(w, i)).toBe(0);
  });

  it('caps at 255', () => {
    const w = makeTestWorld();
    for (let y = 18; y <= 22; y += 2) for (let x = 18; x <= 22; x += 2) addSceneryDirect(w, 'rock_waterfall', x, y);
    const i = tileIndex(w.state.map, 20, 20);
    expect(fieldsRaw(w).calm[i] as number).toBeGreaterThan(FIELD_MAX);
    expect(calmAt(w, i)).toBe(FIELD_MAX);
  });

  it('tiles outside the map read 0', () => {
    const w = makeTestWorld();
    addSceneryDirect(w, 'oak_round', 0, 0);
    expect(calmAt(w, -1)).toBe(0);
    expect(buzzAt(w, w.state.map.width * w.state.map.height)).toBe(0);
  });
});

describe('bands: None < 20, Low 20–59, Medium 60–119, High ≥ 120', () => {
  it('splits at the thresholds', () => {
    expect([...FIELD_BANDS]).toEqual([20, 60, 120]);
    expect(fieldBand(0)).toBe('none');
    expect(fieldBand(19)).toBe('none');
    expect(fieldBand(20)).toBe('low');
    expect(fieldBand(59)).toBe('low');
    expect(fieldBand(60)).toBe('medium');
    expect(fieldBand(119)).toBe('medium');
    expect(fieldBand(120)).toBe('high');
    expect(fieldBand(255)).toBe('high');
  });
});
