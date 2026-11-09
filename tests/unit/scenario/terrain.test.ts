/** Phase 5 §4.2 steps 1–6: noise, terrain features, slope pass, water, terrain rules (master R18, R19). */
import { describe, expect, it } from 'vitest';
import type { Feature, MapGenSpec } from '../../../src/data/scenarios/types';
import { CRATER_DEPTH, MAX_SLOPE_PASSES } from '../../../src/data/tuning/scenario';
import { Terrain } from '../../../src/sim/map';
import { generateTerrain, GenerationError, type TerrainResult } from '../../../src/sim/scenario/terrain';

const BASE = 8;

function spec(patch: Partial<MapGenSpec> = {}): MapGenSpec {
  return {
    width: 32,
    height: 32,
    seed: 77,
    baseHeight: BASE,
    noise: { amplitude: 0, scale: 16, octaves: 1 },
    waterLevel: 0,
    terrainRules: [],
    features: [],
    park: { owned: [], forSale: [], rightsForSale: [], entrance: { x: 16, y: 31, side: 'S' } },
    ...patch,
  };
}

const at = (t: TerrainResult, x: number, y: number): number => y * t.width + x;
/** Corner heights [N, E, S, W] of a tile. */
function corners(t: TerrainResult, x: number, y: number): number[] {
  const i = at(t, x, y);
  const h = t.heights[i] as number;
  const s = t.slope[i] as number;
  return [h + (s & 1 ? 1 : 0), h + (s & 2 ? 1 : 0), h + (s & 4 ? 1 : 0), h + (s & 8 ? 1 : 0)];
}
const wet = (t: TerrainResult, x: number, y: number): boolean => (t.water[at(t, x, y)] as number) > (t.heights[at(t, x, y)] as number);

/** Neighbours without a cliff between them (equal tile offsets) share both corners of their common edge. */
function expectSlopeLegal(t: TerrainResult): void {
  for (let y = 0; y < t.height; y++) {
    for (let x = 0; x < t.width; x++) {
      const i = at(t, x, y);
      expect(t.slope[i] as number).toBeLessThan(15);
      expect(t.heights[i] as number).toBeLessThanOrEqual(63);
      const c = corners(t, x, y);
      if (x + 1 < t.width && t.offset[i] === t.offset[i + 1]) {
        const e = corners(t, x + 1, y);
        expect([c[1], c[2]], `tile ${x},${y} east edge`).toEqual([e[0], e[3]]);
      }
      if (y + 1 < t.height && t.offset[i] === t.offset[i + t.width]) {
        const s = corners(t, x, y + 1);
        expect([c[3], c[2]], `tile ${x},${y} south edge`).toEqual([s[0], s[1]]);
      }
    }
  }
}

describe('base and noise (steps 1–2)', () => {
  it('a spec without noise or features is flat grass at the base height, dry', () => {
    const t = generateTerrain(spec());
    expect(t.heights.every((h) => h === BASE)).toBe(true);
    expect(t.slope.every((s) => s === 0)).toBe(true);
    expect(t.water.every((w) => w === 0)).toBe(true);
    expect(t.terrain.every((v) => v === Terrain.Grass)).toBe(true);
  });

  it('noise stays within base ± amplitude and is the same for the same seed', () => {
    const a = generateTerrain(spec({ noise: { amplitude: 5, scale: 8, octaves: 3 } }));
    const b = generateTerrain(spec({ noise: { amplitude: 5, scale: 8, octaves: 3 } }));
    const c = generateTerrain(spec({ seed: 78, noise: { amplitude: 5, scale: 8, octaves: 3 } }));
    expect(Array.from(a.heights)).toEqual(Array.from(b.heights));
    expect(Array.from(a.heights)).not.toEqual(Array.from(c.heights));
    for (let i = 0; i < a.heights.length; i++) {
      expect(a.heights[i] as number).toBeGreaterThanOrEqual(BASE - 5);
      expect((a.heights[i] as number) + 1).toBeLessThanOrEqual(BASE + 5);
    }
    expect(new Set(a.heights).size).toBeGreaterThan(3);
  });
});

describe('slope pass (step 4, master R18)', () => {
  const rough: Feature[] = [
    { kind: 'cone', cx: 16, cy: 16, radius: 6, peak: 20, craterRadius: 0 },
    { kind: 'lower', area: { circle: { cx: 4, cy: 4, radius: 2 } }, by: 9, falloff: 1 },
    { kind: 'raise', area: { rect: { x0: 24, y0: 2, x1: 28, y1: 6 } }, by: 12, falloff: 0 },
    { kind: 'cliff', from: { x: 0, y: 26 }, to: { x: 32, y: 26 }, height: 5 },
  ];

  it('neighbours share corners everywhere except across cliff tiles, in few passes', () => {
    const t = generateTerrain(spec({ noise: { amplitude: 9, scale: 4, octaves: 4 }, features: rough }));
    expectSlopeLegal(t);
    expect(t.passes).toBeGreaterThan(0);
    expect(t.passes).toBeLessThanOrEqual(MAX_SLOPE_PASSES);
  });

  it('keeps the peak of a steep cone and widens its foot instead', () => {
    const t = generateTerrain(spec({ features: [rough[0] as Feature] }));
    expect(Math.max(...corners(t, 16, 16), ...corners(t, 15, 15))).toBe(BASE + 20);
    expect(t.heights[at(t, 16, 16 + 9)] as number).toBeGreaterThan(BASE);
  });
});

describe('terrain features (step 3, heights relative to the base, master R19)', () => {
  it('raise with a falloff lifts the centre by `by` and leaves far land alone', () => {
    const t = generateTerrain(spec({ features: [{ kind: 'raise', area: { circle: { cx: 16, cy: 16, radius: 3 } }, by: 4, falloff: 4 }] }));
    expect(t.heights[at(t, 16, 16)]).toBe(BASE + 4);
    expect(t.heights[at(t, 1, 1)]).toBe(BASE);
    expect(t.offset.every((o) => o === 0)).toBe(true);
  });

  it('raise or lower with falloff 0 moves whole tiles and leaves cliff edges', () => {
    const t = generateTerrain(spec({ features: [{ kind: 'raise', area: { rect: { x0: 10, y0: 10, x1: 19, y1: 19 } }, by: 20, falloff: 0 }] }));
    for (const [x, y] of [[10, 10], [19, 19], [15, 12]] as const) {
      expect(t.heights[at(t, x, y)]).toBe(BASE + 20);
      expect(t.slope[at(t, x, y)]).toBe(0);
    }
    expect(t.heights[at(t, 9, 10)]).toBe(BASE);
    expect(t.heights[at(t, 20, 19)]).toBe(BASE);
    expect(t.offset[at(t, 12, 12)]).toBe(20);
  });

  it('flatten makes its tiles flat at the height and the land around ramps to it', () => {
    const t = generateTerrain(spec({ noise: { amplitude: 6, scale: 4, octaves: 3 }, features: [{ kind: 'flatten', rect: { x0: 8, y0: 8, x1: 15, y1: 12 }, height: 3 }] }));
    for (let y = 8; y <= 12; y++) {
      for (let x = 8; x <= 15; x++) {
        expect(t.heights[at(t, x, y)]).toBe(BASE + 3);
        expect(t.slope[at(t, x, y)]).toBe(0);
      }
    }
    expectSlopeLegal(t);
  });

  it('flatten areas that cannot be joined by slopes fail generation', () => {
    const bad = spec({
      features: [
        { kind: 'flatten', rect: { x0: 2, y0: 2, x1: 5, y1: 5 }, height: 0 },
        { kind: 'flatten', rect: { x0: 7, y0: 2, x1: 9, y1: 5 }, height: 6 },
      ],
    });
    expect(() => generateTerrain(bad)).toThrow(GenerationError);
  });

  it('cone: the rim reaches the peak and the crater floor is CRATER_DEPTH below it', () => {
    const t = generateTerrain(spec({ width: 48, height: 48, features: [{ kind: 'cone', cx: 24, cy: 24, radius: 20, peak: 16, craterRadius: 6 }] }));
    const centre = Math.min(...corners(t, 23, 23), ...corners(t, 24, 24));
    expect(centre).toBe(BASE + 16 - CRATER_DEPTH);
    expect(Math.max(...corners(t, 24, 17))).toBe(BASE + 16);
    expect(t.heights[at(t, 1, 1)]).toBe(BASE);
  });

  it('cliff raises the tiles left of the line (north of a line heading east)', () => {
    const t = generateTerrain(spec({ features: [{ kind: 'cliff', from: { x: 0, y: 10 }, to: { x: 32, y: 10 }, height: 8 }] }));
    expect(t.heights[at(t, 5, 9)]).toBe(BASE + 8);
    expect(t.heights[at(t, 5, 0)]).toBe(BASE + 8);
    expect(t.heights[at(t, 5, 10)]).toBe(BASE);
    const r = generateTerrain(spec({ features: [{ kind: 'cliff', from: { x: 32, y: 10 }, to: { x: 0, y: 10 }, height: 8 }] }));
    expect(r.heights[at(r, 5, 9)]).toBe(BASE);
    expect(r.heights[at(r, 5, 10)]).toBe(BASE + 8);
  });

  it('lake: a round pond with its surface at the relative height', () => {
    const t = generateTerrain(spec({ features: [{ kind: 'lake', cx: 16, cy: 16, radius: 4, surface: 0 }] }));
    expect(wet(t, 15, 15)).toBe(true);
    expect(t.water[at(t, 15, 15)]).toBe(BASE);
    expect(wet(t, 16, 11)).toBe(false);
    expect(wet(t, 2, 2)).toBe(false);
    expectSlopeLegal(t);
  });

  it('river: a wet channel along the polyline, water depth − 1 steps above the bed', () => {
    const t = generateTerrain(spec({ features: [{ kind: 'river', points: [{ x: 0, y: 16 }, { x: 32, y: 16 }], width: 3, depth: 2 }] }));
    for (let x = 0; x < 32; x++) {
      expect(wet(t, x, 15)).toBe(true);
      expect(wet(t, x, 16)).toBe(true);
      expect(wet(t, x, 12)).toBe(false);
    }
    const i = at(t, 10, 16);
    expect(t.water[i]).toBe((t.heights[i] as number) + 1);
    expectSlopeLegal(t);
  });

  it('sea: water along one edge at the relative surface, deeper toward the edge, with a beach slope', () => {
    const t = generateTerrain(spec({ noise: { amplitude: 3, scale: 8, octaves: 2 }, features: [{ kind: 'sea', edge: 'E', depthTiles: 6, surface: 0 }] }));
    for (let y = 0; y < 32; y++) {
      expect(wet(t, 31, y)).toBe(true);
      expect(t.water[at(t, 31, y)]).toBe(BASE);
      expect(t.heights[at(t, 31, y)] as number).toBeLessThan(t.heights[at(t, 27, y)] as number);
    }
    expect(wet(t, 10, 10)).toBe(false);
    expectSlopeLegal(t);
  });

  it('waterLevel fills every tile below the relative level', () => {
    const t = generateTerrain(spec({ noise: { amplitude: 6, scale: 8, octaves: 2 }, waterLevel: 1 }));
    let wetTiles = 0;
    for (let i = 0; i < t.heights.length; i++) {
      const isWet = (t.water[i] as number) > (t.heights[i] as number);
      expect(isWet).toBe((t.heights[i] as number) < BASE + 1);
      if (isWet) {
        wetTiles++;
        expect(t.water[i]).toBe(BASE + 1);
      }
    }
    expect(wetTiles).toBeGreaterThan(0);
  });
});

describe('terrain rules (step 6)', () => {
  it('the first matching rule wins; heights are relative; nearWater counts tiles from water; default grass', () => {
    const t = generateTerrain(
      spec({
        features: [
          { kind: 'lake', cx: 6, cy: 6, radius: 3, surface: 0 },
          { kind: 'raise', area: { rect: { x0: 20, y0: 20, x1: 31, y1: 31 } }, by: 9, falloff: 0 },
        ],
        terrainRules: [
          { minHeight: 7, terrain: 'snow' },
          { minHeight: 9, terrain: 'rock' },
          { nearWater: 2, terrain: 'sand' },
        ],
      }),
    );
    expect(t.terrain[at(t, 25, 25)]).toBe(Terrain.Snow);
    expect(t.terrain[at(t, 5, 5)]).toBe(Terrain.Sand);
    let lastWet = 0;
    for (let y = 0; y < 32; y++) if (wet(t, 5, y)) lastWet = y;
    expect(lastWet).toBeGreaterThan(5);
    expect(t.terrain[at(t, 5, lastWet + 2)]).toBe(Terrain.Sand);
    expect(t.terrain[at(t, 5, lastWet + 3)]).toBe(Terrain.Grass);
    expect(t.terrain[at(t, 15, 15)]).toBe(Terrain.Grass);
  });
});

describe('bad data fails generation', () => {
  it('rejects a river that is too shallow to hold water and an unknown terrain', () => {
    expect(() => generateTerrain(spec({ features: [{ kind: 'river', points: [{ x: 0, y: 1 }, { x: 5, y: 1 }], width: 2, depth: 1 }] }))).toThrow(GenerationError);
    expect(() => generateTerrain(spec({ terrainRules: [{ terrain: 'lava' as 'rock' }] }))).toThrow(GenerationError);
    expect(() => generateTerrain(spec({ width: 0 }))).toThrow(GenerationError);
  });
});
