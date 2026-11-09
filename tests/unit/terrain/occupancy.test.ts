/**
 * Terrain and water checks that go through the occupancy module (W3-B), the scenery queries (W3-D), and the
 * dirty marks for fields (W3-E) and light (W3-F). Those modules are stubs until their cards merge, so this file
 * mocks them with small fakes that answer like the contracts say.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TERRAIN_ERR } from '../../../src/data/strings/terrain';
import { WATER_STEP_COST } from '../../../src/data/tuning/terrain';
import type { Occupant } from '../../../src/sim/occupancy';
import type { Scenery } from '../../../src/sim/scenery/types';

const fake = vi.hoisted(() => ({
  occupants: new Map<number, Occupant[]>(),
  scenery: new Map<number, unknown[]>(),
  fields: [] as number[],
  light: [] as number[],
  network: 0,
  occupancy: 0,
}));

vi.mock('../../../src/sim/occupancy', async (orig) => {
  const real = await orig<typeof import('../../../src/sim/occupancy')>();
  return {
    ...real,
    occupantsAt: (_w: unknown, tile: number) => fake.occupants.get(tile) ?? [],
    clearanceBlock: (_w: unknown, tile: number, zMin: number, zMax: number) =>
      (fake.occupants.get(tile) ?? []).find((o) => o.zMin < zMax && zMin < o.zMax) ?? null,
    lowestAbove: (_w: unknown, tile: number, z: number) => {
      const list = (fake.occupants.get(tile) ?? []).filter((o) => o.zMin >= z);
      return list.length ? Math.min(...list.map((o) => o.zMin)) : null;
    },
    markOccupancyDirty: () => {
      fake.occupancy++;
    },
  };
});
vi.mock('../../../src/sim/scenery/api', async (orig) => {
  const real = await orig<typeof import('../../../src/sim/scenery/api')>();
  return { ...real, sceneryOnTile: (_w: unknown, tile: number) => fake.scenery.get(tile) ?? [] };
});
vi.mock('../../../src/sim/fields/api', async (orig) => {
  const real = await orig<typeof import('../../../src/sim/fields/api')>();
  return {
    ...real,
    markFieldsDirty: (_w: unknown, tile: number) => {
      fake.fields.push(tile);
    },
  };
});
vi.mock('../../../src/sim/lighting/api', async (orig) => {
  const real = await orig<typeof import('../../../src/sim/lighting/api')>();
  return {
    ...real,
    markLightDirty: (_w: unknown, tile: number) => {
      fake.light.push(tile);
    },
  };
});
vi.mock('../../../src/sim/pathing', async (orig) => {
  const real = await orig<typeof import('../../../src/sim/pathing')>();
  return {
    ...real,
    markNetworkDirty: (w: Parameters<typeof real.markNetworkDirty>[0]) => {
      fake.network++;
      real.markNetworkDirty(w);
    },
  };
});

const { executeCommand } = await import('../../../src/sim/commands');
const { tileIndex } = await import('../../../src/sim/map');
const { makeTestWorld, stateHash } = await import('../../helpers/world');

afterEach(() => {
  fake.occupants.clear();
  fake.scenery.clear();
  fake.fields.length = 0;
  fake.light.length = 0;
  fake.network = 0;
  fake.occupancy = 0;
});

function elevated(zMin: number, id = 99): Occupant {
  return { kind: 'elevatedPath', id, zMin, zMax: zMin + 3 };
}

describe('clearance under an object (Phase 4 §4.1)', () => {
  it('"Not enough clearance under an object" when the new max corner reaches zMin', () => {
    const w = makeTestWorld();
    const i = tileIndex(w.state.map, 20, 20);
    fake.occupants.set(i, [elevated(10)]);
    expect(executeCommand(w, { type: 'raiseLand', x: 20, y: 20, size: 1 }).ok).toBe(true); // max corner 9 < 10
    const before = stateHash(w);
    expect(executeCommand(w, { type: 'raiseLand', x: 20, y: 20, size: 1 })).toEqual({ ok: false, reason: TERRAIN_ERR.noClearance });
    expect(executeCommand(w, { type: 'raiseCorner', x: 20, y: 20, corner: 2 })).toEqual({ ok: false, reason: TERRAIN_ERR.noClearance });
    expect(stateHash(w)).toBe(before);
    // Lowering under an object is always fine.
    expect(executeCommand(w, { type: 'lowerLand', x: 20, y: 20, size: 1 }).ok).toBe(true);
  });

  it('comes after the ground checks and before the height limit', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const i = tileIndex(map, 20, 20);
    map.heights[i] = 63;
    fake.occupants.set(i, [{ kind: 'track', id: 5, zMin: 63, zMax: 70 }]);
    map.content[i] = 6; // scenery
    expect(executeCommand(w, { type: 'raiseLand', x: 20, y: 20, size: 1 })).toEqual({ ok: false, reason: TERRAIN_ERR.sceneryInWay });
    map.content[i] = 0;
    expect(executeCommand(w, { type: 'raiseLand', x: 20, y: 20, size: 1 })).toEqual({ ok: false, reason: TERRAIN_ERR.noClearance });
    fake.occupants.clear();
    expect(executeCommand(w, { type: 'raiseLand', x: 20, y: 20, size: 1 })).toEqual({ ok: false, reason: TERRAIN_ERR.tooHigh });
  });

  it('an edge scenery item on the tile blocks with "Scenery is in the way"', () => {
    const w = makeTestWorld();
    const i = tileIndex(w.state.map, 20, 20);
    const item: Scenery = { id: 7, defId: 'hedge', x: 20, y: 20, z: 8, rotation: 0, edge: 1, waterLevel: 255 };
    fake.scenery.set(i, [item]);
    expect(executeCommand(w, { type: 'raiseLand', x: 20, y: 20, size: 1 })).toEqual({ ok: false, reason: TERRAIN_ERR.sceneryInWay });
    expect(executeCommand(w, { type: 'raiseWater', x: 20, y: 20, size: 1 })).toEqual({ ok: false, reason: TERRAIN_ERR.sceneryInWay });
  });
});

describe('water and objects above (Phase 4 §4.3)', () => {
  it('an elevated path is a bridge: water may reach its zMin but not pass it', () => {
    const w = makeTestWorld();
    const i = tileIndex(w.state.map, 20, 20);
    fake.occupants.set(i, [elevated(9)]);
    expect(executeCommand(w, { type: 'raiseWater', x: 20, y: 20, size: 1 })).toEqual({ ok: true, cost: WATER_STEP_COST, warnings: [] });
    expect(w.state.map.water[i]).toBe(9);
    const before = stateHash(w);
    expect(executeCommand(w, { type: 'raiseWater', x: 20, y: 20, size: 1 })).toEqual({ ok: false, reason: TERRAIN_ERR.noClearance });
    expect(stateHash(w)).toBe(before);
  });

  it('a track above the new surface blocks with the track string', () => {
    const w = makeTestWorld();
    const i = tileIndex(w.state.map, 20, 20);
    fake.occupants.set(i, [{ kind: 'track', id: 3, zMin: 8, zMax: 13 }]);
    expect(executeCommand(w, { type: 'raiseWater', x: 20, y: 20, size: 1 })).toEqual({ ok: false, reason: TERRAIN_ERR.trackInWay });
  });
});

describe('dirty marks after an edit', () => {
  it('water edits mark fields and light on each changed tile; land edits mark the network and occupancy', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    executeCommand(w, { type: 'raiseWater', x: 20, y: 20, size: 3 });
    const brush: number[] = [];
    for (let y = 19; y <= 21; y++) for (let x = 19; x <= 21; x++) brush.push(tileIndex(map, x, y));
    expect(fake.fields).toEqual(brush);
    expect(fake.light).toEqual(brush);
    expect(fake.network).toBe(1);
    fake.fields.length = 0;
    // Raising land out of the water dries the tile: a wet-tile change.
    executeCommand(w, { type: 'raiseLand', x: 20, y: 20, size: 1 });
    expect(fake.fields).toEqual([tileIndex(map, 20, 20)]);
    expect(fake.network).toBe(2);
    expect(fake.occupancy).toBe(1);
    // Paint changes neither heights nor water.
    fake.fields.length = 0;
    executeCommand(w, { type: 'paintTerrain', x: 30, y: 30, size: 1, terrain: 4 });
    expect(fake.fields).toEqual([]);
    expect(fake.network).toBe(2);
  });

  it('a failed command marks nothing', () => {
    const w = makeTestWorld();
    w.state.park.cash = 0;
    executeCommand(w, { type: 'raiseWater', x: 20, y: 20, size: 3 });
    executeCommand(w, { type: 'raiseLand', x: 20, y: 20, size: 3 });
    expect(fake.fields).toEqual([]);
    expect(fake.network).toBe(0);
    expect(fake.occupancy).toBe(0);
  });
});
