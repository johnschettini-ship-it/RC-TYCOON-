import { describe, expect, it } from 'vitest';
import { TERRAIN_ERR } from '../../../src/data/strings/terrain';
import { MAX_CORNER_HEIGHT, PAINT_COST, TERRAIN_STEP_COST, TERRAIN_TILE_FEE } from '../../../src/data/tuning/terrain';
import { executeCommand } from '../../../src/sim/commands';
import type { Command, TerrainCommand } from '../../../src/sim/commands/types';
import { Content, Owned, Terrain, tileIndex } from '../../../src/sim/map';
import { cornerHeightsOf } from '../../../src/sim/terrain/corners';
import { setTileCorners } from '../../../src/sim/terrain/normalize';
import { previewTerrainCommand, skippedWarning } from '../../../src/sim/terrain/commands';
import { currentLedger } from '../../../src/sim/economy/ledger';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, placeFootpath, placeQueue, placeRideDirect, placeStallDirect, stateHash } from '../../helpers/world';

const FLAT_RAISE = TERRAIN_TILE_FEE + 4 * TERRAIN_STEP_COST;

function at(w: World, x: number, y: number): number {
  return tileIndex(w.state.map, x, y);
}

function corners(w: World, x: number, y: number): readonly number[] {
  return cornerHeightsOf(w.state.map, at(w, x, y));
}

/** Run a command that must fail; the state hash must not change. */
function expectFail(w: World, cmd: Command, reason: string): void {
  const before = stateHash(w);
  expect(executeCommand(w, cmd)).toEqual({ ok: false, reason });
  expect(stateHash(w)).toBe(before);
}

describe('corner tool (Phase 4 §4.1)', () => {
  it('raises the shared vertex in all 4 tiles and charges tile fee + step cost each', () => {
    const w = makeTestWorld();
    const cash = w.state.park.cash;
    const r = executeCommand(w, { type: 'raiseCorner', x: 10, y: 10, corner: 0 });
    const cost = 4 * (TERRAIN_TILE_FEE + TERRAIN_STEP_COST);
    expect(r).toEqual({ ok: true, cost, warnings: [] });
    // Vertex (10, 10) is N of (10, 10), E of (9, 10), S of (9, 9), W of (10, 9).
    expect(corners(w, 10, 10)).toEqual([9, 8, 8, 8]);
    expect(corners(w, 9, 10)).toEqual([8, 9, 8, 8]);
    expect(corners(w, 9, 9)).toEqual([8, 8, 9, 8]);
    expect(corners(w, 10, 9)).toEqual([8, 8, 8, 9]);
    expect(corners(w, 11, 10)).toEqual([8, 8, 8, 8]);
    expect(w.state.park.cash).toBe(cash - cost);
    expect(currentLedger(w).lines.construction).toBe(-cost);
  });

  it('names the same vertex from any of its 4 tiles', () => {
    const a = makeTestWorld();
    const b = makeTestWorld();
    executeCommand(a, { type: 'raiseCorner', x: 10, y: 10, corner: 0 });
    executeCommand(b, { type: 'raiseCorner', x: 9, y: 9, corner: 2 });
    expect(stateHash(b)).toBe(stateHash(a));
  });

  it('lowers the shared vertex and normalizes each tile', () => {
    const w = makeTestWorld();
    expect(executeCommand(w, { type: 'lowerCorner', x: 10, y: 10, corner: 0 }).ok).toBe(true);
    expect(corners(w, 10, 10)).toEqual([7, 8, 8, 8]);
    expect(w.state.map.heights[at(w, 10, 10)]).toBe(7);
    expect(w.state.map.slope[at(w, 10, 10)]).toBe(2 | 4 | 8);
    expect(corners(w, 9, 9)).toEqual([8, 8, 7, 8]);
    // A second lower drags the other corners down (corners above m + 1 drop to m + 1).
    executeCommand(w, { type: 'lowerCorner', x: 10, y: 10, corner: 0 });
    expect(corners(w, 10, 10)).toEqual([6, 7, 7, 7]);
  });

  it('is atomic: one blocked tile fails the whole command', () => {
    const w = makeTestWorld();
    placeFootpath(w, 9, 9);
    expectFail(w, { type: 'raiseCorner', x: 10, y: 10, corner: 0 }, TERRAIN_ERR.pathInWay);
  });

  it('a vertex on the park border fails with "Outside the park"', () => {
    const w = makeTestWorld();
    expectFail(w, { type: 'raiseCorner', x: 1, y: 1, corner: 0 }, TERRAIN_ERR.outsidePark);
  });

  it('a corner raised again past the normalize limit changes nothing and costs nothing', () => {
    const w = makeTestWorld();
    setTileCorners(w.state.map, at(w, 20, 20), [9, 8, 8, 8]);
    // Every other tile at vertex (20, 20) is outside this test: isolate with a single-tile view of the cost.
    const r = executeCommand(w, { type: 'raiseCorner', x: 20, y: 20, corner: 0 });
    expect(r.ok).toBe(true);
    expect(corners(w, 20, 20)).toEqual([9, 8, 8, 8]);
    // The 3 neighbours rose; tile (20, 20) did not change.
    expect(r.ok && r.cost).toBe(3 * (TERRAIN_TILE_FEE + TERRAIN_STEP_COST));
  });
});

describe('raise and lower brushes (Phase 4 §4.1)', () => {
  it('raise: a flat tile rises by 1; a sloped tile becomes flat at its highest corner', () => {
    const w = makeTestWorld();
    expect(executeCommand(w, { type: 'raiseLand', x: 10, y: 10, size: 1 })).toEqual({ ok: true, cost: FLAT_RAISE, warnings: [] });
    expect(corners(w, 10, 10)).toEqual([9, 9, 9, 9]);
    setTileCorners(w.state.map, at(w, 20, 20), [9, 8, 8, 9]);
    const r = executeCommand(w, { type: 'raiseLand', x: 20, y: 20, size: 1 });
    expect(r).toEqual({ ok: true, cost: TERRAIN_TILE_FEE + 2 * TERRAIN_STEP_COST, warnings: [] });
    expect(corners(w, 20, 20)).toEqual([9, 9, 9, 9]);
  });

  it('lower: a flat tile drops by 1; a sloped tile becomes flat at its lowest corner', () => {
    const w = makeTestWorld();
    expect(executeCommand(w, { type: 'lowerLand', x: 10, y: 10, size: 1 })).toEqual({ ok: true, cost: FLAT_RAISE, warnings: [] });
    expect(corners(w, 10, 10)).toEqual([7, 7, 7, 7]);
    setTileCorners(w.state.map, at(w, 20, 20), [9, 9, 9, 8]);
    const r = executeCommand(w, { type: 'lowerLand', x: 20, y: 20, size: 1 });
    expect(r).toEqual({ ok: true, cost: TERRAIN_TILE_FEE + 3 * TERRAIN_STEP_COST, warnings: [] });
    expect(corners(w, 20, 20)).toEqual([8, 8, 8, 8]);
  });

  it('brush sizes 3, 5, 7 cover the centred square and the cost total is exact', () => {
    for (const size of [3, 5, 7] as const) {
      const w = makeTestWorld();
      const cash = w.state.park.cash;
      const r = executeCommand(w, { type: 'raiseLand', x: 20, y: 20, size });
      expect(r).toEqual({ ok: true, cost: size * size * FLAT_RAISE, warnings: [] });
      const half = (size - 1) / 2;
      for (let y = 20 - half - 1; y <= 20 + half + 1; y++) {
        for (let x = 20 - half - 1; x <= 20 + half + 1; x++) {
          const inside = Math.abs(x - 20) <= half && Math.abs(y - 20) <= half;
          expect(w.state.map.heights[at(w, x, y)]).toBe(inside ? 9 : 8);
        }
      }
      expect(w.state.park.cash).toBe(cash - size * size * FLAT_RAISE);
    }
  });

  it('a brush at the map edge covers only map tiles', () => {
    const w = makeTestWorld();
    const p = previewTerrainCommand(w, { type: 'raiseLand', x: 0, y: 0, size: 3 });
    expect(p.tiles).toEqual([at(w, 0, 0), at(w, 1, 0), at(w, 0, 1), at(w, 1, 1)]);
    // Only (1, 1) is owned: 3 tiles skipped.
    const r = executeCommand(w, { type: 'raiseLand', x: 0, y: 0, size: 3 });
    expect(r).toEqual({ ok: true, cost: FLAT_RAISE, warnings: ['3 tiles were skipped: Outside the park'] });
  });

  it('a brush fully off the map fails with "Outside the park"', () => {
    const w = makeTestWorld();
    expectFail(w, { type: 'raiseLand', x: -5, y: 3, size: 1 }, TERRAIN_ERR.outsidePark);
  });

  it('heights stay in 0–63', () => {
    const w = makeTestWorld();
    setTileCorners(w.state.map, at(w, 10, 10), [MAX_CORNER_HEIGHT, MAX_CORNER_HEIGHT, MAX_CORNER_HEIGHT, MAX_CORNER_HEIGHT]);
    expectFail(w, { type: 'raiseLand', x: 10, y: 10, size: 1 }, TERRAIN_ERR.tooHigh);
    expectFail(w, { type: 'raiseCorner', x: 10, y: 10, corner: 1 }, TERRAIN_ERR.tooHigh);
    setTileCorners(w.state.map, at(w, 20, 20), [0, 0, 0, 0]);
    expectFail(w, { type: 'lowerLand', x: 20, y: 20, size: 1 }, TERRAIN_ERR.tooLow);
  });
});

describe('level tool (Phase 4 §4.1)', () => {
  it('flattens the rectangle at the target height and charges each changed tile', () => {
    const w = makeTestWorld();
    const r = executeCommand(w, { type: 'levelLand', x0: 12, y0: 11, x1: 10, y1: 10, targetHeight: 10 });
    const per = TERRAIN_TILE_FEE + 8 * TERRAIN_STEP_COST;
    expect(r).toEqual({ ok: true, cost: 6 * per, warnings: [] });
    for (let y = 10; y <= 11; y++) for (let x = 10; x <= 12; x++) expect(corners(w, x, y)).toEqual([10, 10, 10, 10]);
    expect(w.state.map.heights[at(w, 13, 10)]).toBe(8);
  });

  it('tiles already flat at the target are free; sloped tiles pay their corner steps', () => {
    const w = makeTestWorld();
    setTileCorners(w.state.map, at(w, 10, 10), [9, 8, 8, 8]);
    const r = executeCommand(w, { type: 'levelLand', x0: 10, y0: 10, x1: 11, y1: 10, targetHeight: 8 });
    expect(r).toEqual({ ok: true, cost: TERRAIN_TILE_FEE + TERRAIN_STEP_COST, warnings: [] });
    expect(corners(w, 10, 10)).toEqual([8, 8, 8, 8]);
    expect(executeCommand(w, { type: 'levelLand', x0: 10, y0: 10, x1: 11, y1: 10, targetHeight: 8 })).toEqual({ ok: true, cost: 0, warnings: [] });
  });

  it('a target outside 0–63 fails with the height strings', () => {
    const w = makeTestWorld();
    expectFail(w, { type: 'levelLand', x0: 10, y0: 10, x1: 10, y1: 10, targetHeight: 64 }, TERRAIN_ERR.tooHigh);
    expectFail(w, { type: 'levelLand', x0: 10, y0: 10, x1: 10, y1: 10, targetHeight: -1 }, TERRAIN_ERR.tooLow);
  });
});

describe('smooth tool (Phase 4 §4.1)', () => {
  it('each vertex takes the rounded mean of the corner heights at it', () => {
    const w = makeTestWorld();
    setTileCorners(w.state.map, at(w, 10, 10), [10, 10, 10, 10]);
    // Each corner of (10, 10) is shared with 3 tiles at 8: round((10 + 8 + 8 + 8) / 4) = round(8.5) = 9.
    const r = executeCommand(w, { type: 'smoothLand', x: 10, y: 10, size: 1 });
    expect(r).toEqual({ ok: true, cost: TERRAIN_TILE_FEE + 4 * TERRAIN_STEP_COST, warnings: [] });
    expect(corners(w, 10, 10)).toEqual([9, 9, 9, 9]);
    // Tiles outside the brush keep their heights.
    expect(corners(w, 9, 9)).toEqual([8, 8, 8, 8]);
  });

  it('gives the same output for the same input', () => {
    const make = (): World => {
      const w = makeTestWorld();
      const hs = [12, 8, 9, 15, 7, 10, 11, 8, 14, 9, 8, 13, 10, 7, 12, 9, 11, 8, 10, 16, 8, 9, 12, 7, 10];
      let k = 0;
      for (let y = 18; y < 23; y++) for (let x = 18; x < 23; x++) setTileCorners(w.state.map, at(w, x, y), [hs[k] as number, hs[k] as number, hs[k] as number, hs[k++] as number]);
      return w;
    };
    const a = make();
    const b = make();
    const ra = executeCommand(a, { type: 'smoothLand', x: 20, y: 20, size: 5 });
    const rb = executeCommand(b, { type: 'smoothLand', x: 20, y: 20, size: 5 });
    expect(rb).toEqual(ra);
    expect(stateHash(b)).toBe(stateHash(a));
    // Smoothing never leaves a corner outside the input range.
    for (let y = 18; y < 23; y++) {
      for (let x = 18; x < 23; x++) {
        for (const c of corners(a, x, y)) {
          expect(c).toBeGreaterThanOrEqual(7);
          expect(c).toBeLessThanOrEqual(16);
        }
      }
    }
  });

  it('an already smooth area does not change and costs nothing', () => {
    const w = makeTestWorld();
    expect(executeCommand(w, { type: 'smoothLand', x: 20, y: 20, size: 7 })).toEqual({ ok: true, cost: 0, warnings: [] });
  });
});

describe('paint tool (Phase 4 §4.1)', () => {
  it('sets the terrain type with a flat fee per changed tile', () => {
    const w = makeTestWorld();
    const r = executeCommand(w, { type: 'paintTerrain', x: 20, y: 20, size: 3, terrain: Terrain.Snow });
    expect(r).toEqual({ ok: true, cost: 9 * PAINT_COST, warnings: [] });
    for (let y = 19; y <= 21; y++) for (let x = 19; x <= 21; x++) expect(w.state.map.terrain[at(w, x, y)]).toBe(Terrain.Snow);
    expect(w.state.map.terrain[at(w, 22, 20)]).toBe(Terrain.Grass);
    // Heights unchanged (cosmetic only).
    expect(w.state.map.heights[at(w, 20, 20)]).toBe(8);
    // Tiles that already have the type are free.
    expect(executeCommand(w, { type: 'paintTerrain', x: 21, y: 20, size: 3, terrain: Terrain.Snow })).toEqual({ ok: true, cost: 3 * PAINT_COST, warnings: [] });
  });

  it('skips blocked tiles like the other brushes', () => {
    const w = makeTestWorld();
    placeFootpath(w, 20, 20);
    expect(executeCommand(w, { type: 'paintTerrain', x: 20, y: 20, size: 3, terrain: Terrain.Sand })).toEqual({
      ok: true,
      cost: 8 * PAINT_COST,
      warnings: ['1 tiles were skipped: A path is in the way'],
    });
    expect(w.state.map.terrain[at(w, 20, 20)]).toBe(Terrain.Grass);
  });
});

describe('every §4.1 check string, in table order', () => {
  /** A tile that fails every check at once; each step removes the current failure and expects the next one. */
  it('reports the first failing check of the table', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const i = at(w, 20, 30);
    // Move the park entrance onto (20, 30) with its path leading north, so (20, 31) is its outside spawn tile.
    map.content[map.entranceTile] = Content.Empty;
    map.entranceTile = i;
    map.content[i] = Content.ParkEntrance;
    placeFootpath(w, 20, 29);
    setTileCorners(map, i, [MAX_CORNER_HEIGHT, MAX_CORNER_HEIGHT, MAX_CORNER_HEIGHT, MAX_CORNER_HEIGHT]);
    map.owned[i] = Owned.NotOwned;
    const raise: TerrainCommand = { type: 'raiseLand', x: 20, y: 30, size: 1 };
    expectFail(w, raise, TERRAIN_ERR.outsidePark);
    map.owned[i] = Owned.LandForSale;
    expectFail(w, raise, TERRAIN_ERR.outsidePark);
    map.owned[i] = Owned.RightsForSale;
    expectFail(w, raise, TERRAIN_ERR.outsidePark);
    map.owned[i] = Owned.RightsOwned;
    expectFail(w, raise, TERRAIN_ERR.onlyRights);
    map.owned[i] = Owned.Owned;
    expectFail(w, raise, TERRAIN_ERR.entranceInWay);
    // The outside spawn tile of the entrance.
    expectFail(w, { type: 'raiseLand', x: 20, y: 31, size: 1 }, TERRAIN_ERR.entranceInWay);
    map.content[i] = Content.Footpath;
    map.entranceTile = at(w, 31, 63);
    map.content[map.entranceTile] = Content.ParkEntrance;
    expectFail(w, raise, TERRAIN_ERR.pathInWay);
    map.content[i] = Content.Queue;
    expectFail(w, raise, TERRAIN_ERR.pathInWay);
    map.content[i] = Content.Building;
    expectFail(w, raise, TERRAIN_ERR.rideOrStallInWay);
    map.content[i] = Content.Track;
    expectFail(w, raise, TERRAIN_ERR.trackInWay);
    map.content[i] = Content.Scenery;
    expectFail(w, raise, TERRAIN_ERR.sceneryInWay);
    map.content[i] = Content.Empty;
    // (Clearance under an object: tests/unit/terrain/occupancy.test.ts, with the occupancy module mocked.)
    expectFail(w, raise, TERRAIN_ERR.tooHigh);
    setTileCorners(map, i, [0, 0, 0, 0]);
    expectFail(w, { type: 'lowerLand', x: 20, y: 30, size: 1 }, TERRAIN_ERR.tooLow);
  });

  it('real rides, stalls, and queues block with their strings', () => {
    const w = makeTestWorld();
    placeRideDirect(w, 'carousel', 10, 10, 0);
    placeStallDirect(w, 'snack_shack', 20, 20, 2);
    placeQueue(w, 30, 30);
    expectFail(w, { type: 'raiseLand', x: 11, y: 11, size: 1 }, TERRAIN_ERR.rideOrStallInWay);
    expectFail(w, { type: 'lowerLand', x: 20, y: 20, size: 1 }, TERRAIN_ERR.rideOrStallInWay);
    expectFail(w, { type: 'raiseCorner', x: 30, y: 30, corner: 2 }, TERRAIN_ERR.pathInWay);
    // Smoothing flat land around the queue changes nothing, so the queue does not block it.
    expect(executeCommand(w, { type: 'smoothLand', x: 30, y: 30, size: 3 })).toEqual({ ok: true, cost: 0, warnings: [] });
  });
});

describe('brush skip warning (Phase 4 §4.1)', () => {
  it('"{n} tiles were skipped: {reason}" with the count and the first reason', () => {
    const w = makeTestWorld();
    placeFootpath(w, 21, 19);
    placeFootpath(w, 19, 21);
    w.state.map.content[at(w, 20, 19)] = Content.Scenery;
    const r = executeCommand(w, { type: 'raiseLand', x: 20, y: 20, size: 3 });
    // Row-major order: (20, 19) scenery comes first.
    expect(r).toEqual({ ok: true, cost: 6 * FLAT_RAISE, warnings: ['3 tiles were skipped: Scenery is in the way'] });
    expect(w.state.map.heights[at(w, 21, 19)]).toBe(8);
    expect(w.state.map.heights[at(w, 20, 20)]).toBe(9);
    expect(skippedWarning(3, TERRAIN_ERR.sceneryInWay)).toBe('3 tiles were skipped: Scenery is in the way');
  });

  it('fails with the first reason when every tile fails', () => {
    const w = makeTestWorld();
    for (let y = 9; y <= 11; y++) for (let x = 9; x <= 11; x++) placeFootpath(w, x, y);
    w.state.map.content[at(w, 9, 9)] = Content.Building;
    expectFail(w, { type: 'lowerLand', x: 10, y: 10, size: 3 }, TERRAIN_ERR.rideOrStallInWay);
  });
});

describe('cash (Phase 4 §4.1)', () => {
  it('"Not enough cash" fails the whole command; exact cash is enough', () => {
    const w = makeTestWorld();
    const cost = 9 * FLAT_RAISE;
    w.state.park.cash = cost - 1;
    expectFail(w, { type: 'raiseLand', x: 20, y: 20, size: 3 }, TERRAIN_ERR.notEnoughCash);
    w.state.park.cash = cost;
    expect(executeCommand(w, { type: 'raiseLand', x: 20, y: 20, size: 3 })).toEqual({ ok: true, cost, warnings: [] });
    expect(w.state.park.cash).toBe(0);
  });

  it('"Not enough cash" is atomic for the corner tool, paint, and water too', () => {
    const w = makeTestWorld();
    w.state.park.cash = 0;
    expectFail(w, { type: 'raiseCorner', x: 10, y: 10, corner: 0 }, TERRAIN_ERR.notEnoughCash);
    expectFail(w, { type: 'paintTerrain', x: 10, y: 10, size: 7, terrain: Terrain.Rock }, TERRAIN_ERR.notEnoughCash);
    expectFail(w, { type: 'raiseWater', x: 10, y: 10, size: 3 }, TERRAIN_ERR.notEnoughCash);
  });

  it('setup mode skips the cash check and the ledger', () => {
    const w = makeTestWorld();
    w.state.park.cash = 0;
    const r = executeCommand(w, { type: 'raiseLand', x: 20, y: 20, size: 7 }, { setup: true });
    expect(r).toEqual({ ok: true, cost: 49 * FLAT_RAISE, warnings: [] });
    expect(w.state.park.cash).toBe(0);
    expect(currentLedger(w).lines.construction).toBe(0);
  });
});

describe('command input', () => {
  it('rejects bad sizes, corners, and terrain types without changing anything', () => {
    const w = makeTestWorld();
    const bad = [
      { type: 'raiseLand', x: 10, y: 10, size: 2 },
      { type: 'raiseCorner', x: 10, y: 10, corner: 4 },
      { type: 'paintTerrain', x: 10, y: 10, size: 1, terrain: 9 },
      { type: 'levelLand', x0: 10, y0: 10, x1: 10, y1: 10, targetHeight: 8.5 },
      { type: 'raiseWater', x: 10.5, y: 10, size: 1 },
    ] as unknown as Command[];
    for (const cmd of bad) {
      const before = stateHash(w);
      const r = executeCommand(w, cmd);
      expect(r.ok).toBe(false);
      expect(stateHash(w)).toBe(before);
    }
  });

  it('a corner tile outside the map fails with "Outside the park"', () => {
    const w = makeTestWorld();
    expectFail(w, { type: 'raiseCorner', x: 64, y: 10, corner: 0 }, TERRAIN_ERR.outsidePark);
  });
});

describe('preview (ghost cost before confirm)', () => {
  it('reports the cost, tiles, and result without changing the state', () => {
    const w = makeTestWorld();
    placeFootpath(w, 20, 20);
    const before = stateHash(w);
    const p = previewTerrainCommand(w, { type: 'raiseLand', x: 20, y: 20, size: 3 });
    expect(stateHash(w)).toBe(before);
    expect(p).toMatchObject({ ok: true, cost: 8 * FLAT_RAISE, reason: null, warnings: ['1 tiles were skipped: A path is in the way'] });
    expect(p.tiles).toHaveLength(9);
    w.state.park.cash = 0;
    expect(previewTerrainCommand(w, { type: 'raiseLand', x: 20, y: 20, size: 3 })).toMatchObject({ ok: false, cost: 8 * FLAT_RAISE, reason: TERRAIN_ERR.notEnoughCash });
  });

  it('matches the command result for each tool', () => {
    const cmds: TerrainCommand[] = [
      { type: 'raiseCorner', x: 10, y: 10, corner: 3 },
      { type: 'lowerLand', x: 10, y: 10, size: 5 },
      { type: 'smoothLand', x: 10, y: 10, size: 3 },
      { type: 'levelLand', x0: 5, y0: 5, x1: 9, y1: 7, targetHeight: 11 },
      { type: 'paintTerrain', x: 10, y: 10, size: 7, terrain: Terrain.Dirt },
      { type: 'raiseWater', x: 10, y: 10, size: 3 },
    ];
    for (const cmd of cmds) {
      const w = makeTestWorld();
      const p = previewTerrainCommand(w, cmd);
      const r = executeCommand(w, cmd);
      expect(r.ok).toBe(p.ok);
      if (r.ok) expect({ cost: r.cost, warnings: r.warnings }).toEqual({ cost: p.cost, warnings: p.warnings });
    }
  });
});

describe('determinism', () => {
  it('the same commands on the same start give the same state hash', () => {
    const run = (): string => {
      const w = makeTestWorld(77);
      const cmds: Command[] = [
        { type: 'raiseLand', x: 20, y: 20, size: 5 },
        { type: 'raiseCorner', x: 22, y: 22, corner: 1 },
        { type: 'smoothLand', x: 21, y: 21, size: 7 },
        { type: 'levelLand', x0: 30, y0: 30, x1: 34, y1: 32, targetHeight: 5 },
        { type: 'raiseWater', x: 32, y: 31, size: 3 },
        { type: 'paintTerrain', x: 25, y: 25, size: 5, terrain: Terrain.Rock },
        { type: 'lowerWater', x: 31, y: 31, size: 1 },
      ];
      for (const c of cmds) executeCommand(w, c);
      return stateHash(w);
    };
    expect(run()).toBe(run());
  });
});
