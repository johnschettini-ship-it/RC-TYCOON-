/**
 * Scenery queries for other cards (Phase 4 §4.5): `sceneryOnTile`, `edgeBlocked`, `spookyItemsNear`,
 * `forEachSceneryOccupant`, and the derived per-tile index (rebuilt after a load, never saved).
 */
import { describe, expect, it } from 'vitest';
import { serialize, deserialize } from '../../../src/save';
import { executeCommand } from '../../../src/sim/commands';
import { Content, tileIndex } from '../../../src/sim/map';
import { centreSceneryAt, edgeBlocked, sceneryExtent, sceneryOnTile, spookyItemsNear } from '../../../src/sim/scenery/api';
import { markSceneryDirty } from '../../../src/sim/scenery/index';
import { forEachSceneryOccupant } from '../../../src/sim/scenery/occupancy';
import { getSceneryDef } from '../../../src/data/catalog';
import { placeOk, sceneryWorld } from './helpers';

describe('sceneryOnTile', () => {
  it('lists the centre item and the tile\'s own edge items in id order', () => {
    const w = sceneryWorld();
    const map = w.state.map;
    const t = tileIndex(map, 10, 10);
    const e1 = placeOk(w, 'hedge_low', 10, 10, 0, 2);
    const c = placeOk(w, 'bed_mixed', 10, 10);
    const e0 = placeOk(w, 'fence_wood', 10, 10, 0, 0);
    expect(sceneryOnTile(w, t).map((s) => s.id)).toEqual([e1, c, e0]);
    expect(centreSceneryAt(w, t)?.id).toBe(c);
    // The neighbour shares the south edge but does not own the hedge.
    expect(sceneryOnTile(w, tileIndex(map, 10, 11))).toEqual([]);
    expect(sceneryOnTile(w, -5)).toEqual([]);
    expect(sceneryOnTile(w, map.width * map.height)).toEqual([]);
  });
});

describe('edgeBlocked', () => {
  it('is false at the map border and true from both sides of a fenced edge', () => {
    const w = sceneryWorld();
    const map = w.state.map;
    placeOk(w, 'rail_iron', 5, 5, 0, 0);
    expect(edgeBlocked(w, tileIndex(map, 5, 5), 0)).toBe(true);
    expect(edgeBlocked(w, tileIndex(map, 5, 4), 2)).toBe(true);
    expect(edgeBlocked(w, tileIndex(map, 5, 4), 0)).toBe(false);
    expect(edgeBlocked(w, -1, 0)).toBe(false);
  });
});

describe('spookyItemsNear', () => {
  it('counts spooky items (flag K) within a Chebyshev radius, edge items included', () => {
    const w = sceneryWorld();
    const map = w.state.map;
    placeOk(w, 'tree_bare', 20, 20);
    placeOk(w, 'pumpkin_lantern', 26, 20);
    placeOk(w, 'fence_spiked', 20, 14, 0, 1);
    placeOk(w, 'oak_round', 21, 20);
    const t = tileIndex(map, 20, 20);
    expect(spookyItemsNear(w, t, 0)).toBe(1);
    expect(spookyItemsNear(w, t, 5)).toBe(1);
    expect(spookyItemsNear(w, t, 6)).toBe(3);
    expect(spookyItemsNear(w, tileIndex(map, 1, 1), 6)).toBe(0);
  });
});

describe('forEachSceneryOccupant', () => {
  it('visits every footprint tile of centre items in id order; arches start 3 m up; edge items do not occupy', () => {
    const w = sceneryWorld();
    const map = w.state.map;
    map.content[tileIndex(map, 15, 15)] = Content.Footpath;
    const tent = placeOk(w, 'tent_blue', 10, 10);
    placeOk(w, 'wall_vine', 12, 12, 0, 1);
    const arch = placeOk(w, 'volcano_gate', 15, 15);
    const visits: Array<[number, number, number, number]> = [];
    forEachSceneryOccupant(w, (tile, zMin, zMax, id) => visits.push([tile, zMin, zMax, id]));
    expect(visits).toEqual([
      [tileIndex(map, 10, 10), 8, 13, tent],
      [tileIndex(map, 11, 10), 8, 13, tent],
      [tileIndex(map, 10, 11), 8, 13, tent],
      [tileIndex(map, 11, 11), 8, 13, tent],
      [tileIndex(map, 15, 15), 11, 14, arch],
    ]);
  });

  it('sceneryExtent swaps 2 × 1 sides at odd rotations', () => {
    const d = getSceneryDef('rope_bridge_decor')!;
    expect([0, 1, 2, 3].map((r) => sceneryExtent(d, r as 0 | 1 | 2 | 3))).toEqual([
      { w: 2, d: 1 },
      { w: 1, d: 2 },
      { w: 2, d: 1 },
      { w: 1, d: 2 },
    ]);
  });
});

describe('derived index', () => {
  it('rebuilds after a save and load (it is never saved)', () => {
    const w = sceneryWorld();
    const map = w.state.map;
    map.content[tileIndex(map, 20, 20)] = Content.Footpath;
    placeOk(w, 'hedge_low', 20, 20, 0, 1);
    placeOk(w, 'ticket_arch', 20, 20);
    const json = serialize(w, 'test', '2026-11-09T00:00:00.000Z');
    expect(json).not.toContain('edgeMask');
    const loaded = deserialize(json);
    if (!loaded.ok) throw new Error(loaded.error);
    const w2 = loaded.world;
    expect(edgeBlocked(w2, tileIndex(w2.state.map, 21, 20), 3)).toBe(true);
    expect(sceneryOnTile(w2, tileIndex(w2.state.map, 20, 20)).map((s) => s.defId)).toEqual(['hedge_low', 'ticket_arch']);
    expect(executeCommand(w2, { type: 'placeScenery', defId: 'neon_arch', x: 20, y: 20, rotation: 0, edge: -1 })).toEqual({
      ok: false,
      reason: 'Scenery is in the way',
    });
  });

  it('notices direct edits of the list (new list, other length) and can be dropped by hand', () => {
    const w = sceneryWorld();
    const map = w.state.map;
    placeOk(w, 'hedge_low', 5, 5, 0, 1);
    expect(edgeBlocked(w, tileIndex(map, 5, 5), 1)).toBe(true);
    w.state.scenery = [];
    expect(edgeBlocked(w, tileIndex(map, 5, 5), 1)).toBe(false);
    w.state.scenery.push({ id: 50, defId: 'fence_wood', x: 7, y: 7, z: 8, rotation: 0, edge: 2, waterLevel: 255 });
    expect(edgeBlocked(w, tileIndex(map, 7, 7), 2)).toBe(true);
    w.state.scenery[0]!.edge = 3;
    markSceneryDirty(w);
    expect(edgeBlocked(w, tileIndex(map, 7, 7), 3)).toBe(true);
    expect(edgeBlocked(w, tileIndex(map, 7, 7), 2)).toBe(false);
  });
});
