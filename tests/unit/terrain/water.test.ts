import { describe, expect, it } from 'vitest';
import { TERRAIN_ERR } from '../../../src/data/strings/terrain';
import { MAX_CORNER_HEIGHT, TERRAIN_STEP_COST, TERRAIN_TILE_FEE, WATER_STEP_COST } from '../../../src/data/tuning/terrain';
import { executeCommand } from '../../../src/sim/commands';
import type { Command } from '../../../src/sim/commands/types';
import { Content, Owned, tileIndex } from '../../../src/sim/map';
import { isWet, waterDepth } from '../../../src/sim/terrain/corners';
import { setTileCorners } from '../../../src/sim/terrain/normalize';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, placeFootpath, placeRideDirect, stateHash } from '../../helpers/world';

function at(w: World, x: number, y: number): number {
  return tileIndex(w.state.map, x, y);
}

function expectFail(w: World, cmd: Command, reason: string): void {
  const before = stateHash(w);
  expect(executeCommand(w, cmd)).toEqual({ ok: false, reason });
  expect(stateHash(w)).toBe(before);
}

describe('raise and lower water (Phase 4 §4.3)', () => {
  it('raise: a dry tile gets maxCorner + 1, a wet tile water + 1; $10 per tile per step', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const i = at(w, 20, 20);
    expect(isWet(map, i)).toBe(false);
    expect(executeCommand(w, { type: 'raiseWater', x: 20, y: 20, size: 1 })).toEqual({ ok: true, cost: WATER_STEP_COST, warnings: [] });
    expect(map.water[i]).toBe(9);
    expect(isWet(map, i)).toBe(true);
    expect(waterDepth(map, i)).toBe(1);
    executeCommand(w, { type: 'raiseWater', x: 20, y: 20, size: 1 });
    expect(map.water[i]).toBe(10);
    // A sloped dry tile: the surface starts above its highest corner.
    const j = at(w, 30, 30);
    setTileCorners(map, j, [9, 9, 8, 8]);
    executeCommand(w, { type: 'raiseWater', x: 30, y: 30, size: 1 });
    expect(map.water[j]).toBe(10);
    expect(waterDepth(map, j)).toBe(2);
  });

  it('a 3 × 3 brush raises 9 tiles and charges each one', () => {
    const w = makeTestWorld();
    const cash = w.state.park.cash;
    expect(executeCommand(w, { type: 'raiseWater', x: 20, y: 20, size: 3 })).toEqual({ ok: true, cost: 9 * WATER_STEP_COST, warnings: [] });
    expect(w.state.park.cash).toBe(cash - 9 * WATER_STEP_COST);
    for (let y = 19; y <= 21; y++) for (let x = 19; x <= 21; x++) expect(w.state.map.water[at(w, x, y)]).toBe(9);
  });

  it('lower: surface − 1; at or below the lowest corner it becomes 0', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const i = at(w, 20, 20);
    executeCommand(w, { type: 'raiseWater', x: 20, y: 20, size: 1 });
    executeCommand(w, { type: 'raiseWater', x: 20, y: 20, size: 1 });
    expect(map.water[i]).toBe(10);
    expect(executeCommand(w, { type: 'lowerWater', x: 20, y: 20, size: 1 })).toEqual({ ok: true, cost: WATER_STEP_COST, warnings: [] });
    expect(map.water[i]).toBe(9);
    executeCommand(w, { type: 'lowerWater', x: 20, y: 20, size: 1 });
    expect(map.water[i]).toBe(0);
    expect(isWet(map, i)).toBe(false);
  });

  it('"There is no water here" on a dry tile', () => {
    const w = makeTestWorld();
    expectFail(w, { type: 'lowerWater', x: 20, y: 20, size: 3 }, TERRAIN_ERR.noWater);
  });

  it('a brush over a lake edge skips the dry tiles with the count', () => {
    const w = makeTestWorld();
    executeCommand(w, { type: 'raiseWater', x: 20, y: 20, size: 1 });
    expect(executeCommand(w, { type: 'lowerWater', x: 20, y: 20, size: 3 })).toEqual({
      ok: true,
      cost: WATER_STEP_COST,
      warnings: ['8 tiles were skipped: There is no water here'],
    });
  });

  it('"The water cannot go higher" above 63', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const i = at(w, 20, 20);
    setTileCorners(map, i, [62, 62, 62, 62]);
    expect(executeCommand(w, { type: 'raiseWater', x: 20, y: 20, size: 1 }).ok).toBe(true);
    expect(map.water[i]).toBe(MAX_CORNER_HEIGHT);
    expectFail(w, { type: 'raiseWater', x: 20, y: 20, size: 1 }, TERRAIN_ERR.waterTooHigh);
  });

  it('ground objects block raising water with the §4.1 strings', () => {
    const w = makeTestWorld();
    placeFootpath(w, 20, 20);
    placeRideDirect(w, 'carousel', 30, 30, 0);
    w.state.map.content[at(w, 40, 40)] = Content.Scenery;
    w.state.map.content[at(w, 45, 45)] = Content.Track;
    expectFail(w, { type: 'raiseWater', x: 20, y: 20, size: 1 }, TERRAIN_ERR.pathInWay);
    expectFail(w, { type: 'raiseWater', x: 31, y: 31, size: 1 }, TERRAIN_ERR.rideOrStallInWay);
    expectFail(w, { type: 'raiseWater', x: 40, y: 40, size: 1 }, TERRAIN_ERR.sceneryInWay);
    expectFail(w, { type: 'raiseWater', x: 45, y: 45, size: 1 }, TERRAIN_ERR.trackInWay);
    expectFail(w, { type: 'raiseWater', x: 31, y: 63, size: 1 }, TERRAIN_ERR.entranceInWay);
    const map = w.state.map;
    map.owned[at(w, 50, 50)] = Owned.RightsOwned;
    expectFail(w, { type: 'raiseWater', x: 50, y: 50, size: 1 }, TERRAIN_ERR.onlyRights);
    expectFail(w, { type: 'lowerWater', x: 0, y: 0, size: 1 }, TERRAIN_ERR.outsidePark);
  });
});

describe('land edits under water (Phase 4 §4.3)', () => {
  it('lowering land under water makes it deeper', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const i = at(w, 20, 20);
    executeCommand(w, { type: 'raiseWater', x: 20, y: 20, size: 1 });
    executeCommand(w, { type: 'lowerLand', x: 20, y: 20, size: 1 });
    expect(map.water[i]).toBe(9);
    expect(waterDepth(map, i)).toBe(2);
  });

  it('raising land to the surface makes the tile dry (water normalizes to 0)', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const i = at(w, 20, 20);
    executeCommand(w, { type: 'raiseWater', x: 20, y: 20, size: 1 });
    // One corner up: the lowest corner is still under the surface, so the tile stays wet.
    executeCommand(w, { type: 'raiseCorner', x: 20, y: 20, corner: 0 });
    expect(map.water[i]).toBe(9);
    expect(isWet(map, i)).toBe(true);
    const r = executeCommand(w, { type: 'raiseLand', x: 20, y: 20, size: 1 });
    expect(r).toEqual({ ok: true, cost: TERRAIN_TILE_FEE + 3 * TERRAIN_STEP_COST, warnings: [] });
    expect(map.water[i]).toBe(0);
    expect(isWet(map, i)).toBe(false);
  });

  it('wet tiles do not block terrain edits', () => {
    const w = makeTestWorld();
    executeCommand(w, { type: 'raiseWater', x: 20, y: 20, size: 3 });
    expect(executeCommand(w, { type: 'smoothLand', x: 20, y: 20, size: 3 }).ok).toBe(true);
    expect(executeCommand(w, { type: 'lowerLand', x: 20, y: 20, size: 3 }).ok).toBe(true);
  });
});
