/**
 * Scenery placement and removal (Phase 4 §4.5, §6): every rule and its string, check order, multi-tile items,
 * 2 × 1 rotation, edge items on path tiles, arches over paths, the 50% refund, and atomic failures.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The occupancy module (W3-B) answers "free" until it lands; tests drive it through this fake.
const occ = vi.hoisted(() => ({
  block: null as null | { kind: 'groundPath' | 'elevatedPath' | 'track' | 'scenery'; id: number; zMin: number; zMax: number },
  calls: [] as Array<[number, number, number]>,
  list: [] as Array<{ kind: 'groundPath' | 'elevatedPath' | 'track' | 'scenery'; id: number; zMin: number; zMax: number }>,
}));
vi.mock('../../../src/sim/occupancy', async (orig) => {
  const real = await orig<typeof import('../../../src/sim/occupancy')>();
  return {
    ...real,
    clearanceBlock: (_w: unknown, tile: number, zMin: number, zMax: number) => {
      occ.calls.push([tile, zMin, zMax]);
      return occ.block;
    },
    occupantsAt: () => occ.list,
  };
});

import { getSceneryDef, SCENERY } from '../../../src/data/catalog';
import { SCENERY_ERR } from '../../../src/data/strings/scenery';
import { TERRAIN_ERR } from '../../../src/data/strings/terrain';
import { executeCommand } from '../../../src/sim/commands';
import { currentLedger } from '../../../src/sim/economy/ledger';
import { Content, Owned, tileIndex } from '../../../src/sim/map';
import { edgeBlocked, findScenery, sceneryOnTile } from '../../../src/sim/scenery/api';
import { sceneryRefund } from '../../../src/sim/scenery/commands';
import { placeRideDirect, placeStallDirect, stateHash } from '../../helpers/world';
import { place, placeOk, reasonOf, sceneryWorld } from './helpers';

beforeEach(() => {
  occ.block = null;
  occ.calls = [];
  occ.list = [];
});

describe('placeScenery: a 1 × 1 centre item', () => {
  it('pays the cost, marks the tile, starts full, and keeps the list sorted by id', () => {
    const w = sceneryWorld();
    const s = w.state;
    const cash = s.park.cash;
    const r = place(w, 'oak_round', 10, 10);
    expect(r).toEqual({ ok: true, cost: 4_000, warnings: [], id: 1 });
    expect(s.park.cash).toBe(cash - 4_000);
    expect(currentLedger(w).lines.construction).toBe(-4_000);
    const i = tileIndex(s.map, 10, 10);
    expect(s.map.content[i]).toBe(Content.Scenery);
    expect(s.map.contentRef[i]).toBe(1);
    expect(s.scenery).toEqual([{ id: 1, defId: 'oak_round', x: 10, y: 10, z: 8, rotation: 0, edge: -1, waterLevel: 255 }]);
    placeOk(w, 'bed_tulip', 12, 10);
    placeOk(w, 'boulder', 11, 10);
    expect(s.scenery.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(findScenery(w, 2)?.defId).toBe('bed_tulip');
  });

  it('stores z as the ground height of the tile', () => {
    const w = sceneryWorld();
    const i = tileIndex(w.state.map, 10, 10);
    w.state.map.heights[i] = 13;
    placeOk(w, 'boulder', 10, 10);
    expect(w.state.scenery[0]?.z).toBe(13);
  });
});

describe('placeScenery: rules in order (Phase 4 §4.5 table)', () => {
  it('owned state 1, else "Outside the park" or the rights string', () => {
    const w = sceneryWorld();
    expect(reasonOf(place(w, 'oak_round', 0, 5))).toBe(SCENERY_ERR.outsidePark);
    expect(SCENERY_ERR.outsidePark).toBe('Outside the park');
    const i = tileIndex(w.state.map, 5, 5);
    w.state.map.owned[i] = Owned.RightsOwned;
    expect(reasonOf(place(w, 'oak_round', 5, 5))).toBe('You only have construction rights here');
    w.state.map.owned[i] = Owned.LandForSale;
    expect(reasonOf(place(w, 'oak_round', 5, 5))).toBe('Outside the park');
    expect(reasonOf(place(w, 'oak_round', -1, 5))).toBe('Outside the park');
    expect(reasonOf(place(w, 'oak_round', 5, 64))).toBe('Outside the park');
  });

  it('a dry tile, else "Scenery cannot go in water"', () => {
    const w = sceneryWorld();
    const i = tileIndex(w.state.map, 6, 6);
    w.state.map.water[i] = 9; // surface above the ground (8): wet
    expect(reasonOf(place(w, 'oak_round', 6, 6))).toBe('Scenery cannot go in water');
    w.state.map.water[i] = 8; // surface at the ground: dry
    expect(place(w, 'oak_round', 6, 6).ok).toBe(true);
  });

  it('a free centre slot, else the §4.1 string of the object in the way', () => {
    const w = sceneryWorld();
    const map = w.state.map;
    map.content[tileIndex(map, 20, 20)] = Content.Footpath;
    map.content[tileIndex(map, 21, 20)] = Content.Queue;
    placeRideDirect(w, 'carousel', 24, 20);
    placeStallDirect(w, 'snack_shack', 30, 20);
    map.content[tileIndex(map, 32, 20)] = Content.Track;
    placeOk(w, 'boulder', 34, 20);
    expect(reasonOf(place(w, 'oak_round', 20, 20))).toBe('A path is in the way');
    expect(reasonOf(place(w, 'oak_round', 21, 20))).toBe('A path is in the way');
    expect(reasonOf(place(w, 'oak_round', 24, 20))).toBe('A ride or stall is in the way');
    expect(reasonOf(place(w, 'oak_round', 30, 20))).toBe('A ride or stall is in the way');
    expect(reasonOf(place(w, 'oak_round', 32, 20))).toBe('A track is in the way');
    expect(reasonOf(place(w, 'oak_round', 34, 20))).toBe('Scenery is in the way');
    const e = map.entranceTile;
    expect(reasonOf(place(w, 'oak_round', e % map.width, Math.floor(e / map.width)))).toBe('The park entrance is in the way');
  });

  it('flat land unless the item has slopeOk: "This item needs flat land"', () => {
    const w = sceneryWorld();
    const map = w.state.map;
    map.slope[tileIndex(map, 8, 8)] = 0b0011;
    expect(reasonOf(place(w, 'fountain_garden', 8, 8))).toBe('This item needs flat land');
    expect(reasonOf(place(w, 'bed_tulip', 8, 8))).toBe('This item needs flat land');
    expect(getSceneryDef('oak_round')?.slopeOk).toBe(true);
    expect(place(w, 'oak_round', 8, 8).ok).toBe(true);
  });

  it('[ground, ground + height) free in the occupancy list, else "Not enough clearance under an object"', () => {
    const w = sceneryWorld();
    const i = tileIndex(w.state.map, 9, 9);
    expect(place(w, 'pine_tall', 9, 9, 0, -1, true).ok).toBe(true);
    expect(occ.calls).toContainEqual([i, 8, 17]);
    occ.block = { kind: 'track', id: 99, zMin: 14, zMax: 20 };
    expect(reasonOf(place(w, 'oak_round', 10, 9))).toBe('Not enough clearance under an object');
    expect(SCENERY_ERR.noClearance).toBe(TERRAIN_ERR.noClearance);
  });

  it('unlocked, except in setup mode: "Not unlocked"', () => {
    const w = sceneryWorld();
    w.state.management.research.unlocked = [];
    expect(reasonOf(place(w, 'statue_frost', 5, 5))).toBe('Not unlocked');
    expect(place(w, 'statue_frost', 5, 5, 0, -1, true).ok).toBe(true);
  });

  it('cash ≥ cost: exact cash builds, one cent less fails with "Not enough cash"', () => {
    const w = sceneryWorld();
    w.state.park.cash = 4_000 - 1;
    expect(reasonOf(place(w, 'oak_round', 5, 5))).toBe('Not enough cash');
    w.state.park.cash = 4_000;
    expect(place(w, 'oak_round', 5, 5).ok).toBe(true);
    expect(w.state.park.cash).toBe(0);
  });

  it('the first failing rule wins: owned before water before slot before slope before cash', () => {
    const w = sceneryWorld();
    const map = w.state.map;
    const i = tileIndex(map, 7, 7);
    map.owned[i] = Owned.NotOwned;
    map.water[i] = 12;
    map.content[i] = Content.Footpath;
    map.slope[i] = 0b0001;
    w.state.park.cash = 0;
    expect(reasonOf(place(w, 'fountain_garden', 7, 7))).toBe('Outside the park');
    map.owned[i] = Owned.Owned;
    expect(reasonOf(place(w, 'fountain_garden', 7, 7))).toBe('Scenery cannot go in water');
    map.water[i] = 0;
    expect(reasonOf(place(w, 'fountain_garden', 7, 7))).toBe('A path is in the way');
    map.content[i] = Content.Empty;
    expect(reasonOf(place(w, 'fountain_garden', 7, 7))).toBe('This item needs flat land');
    map.slope[i] = 0;
    expect(reasonOf(place(w, 'fountain_garden', 7, 7))).toBe('Not enough cash');
  });

  it('a failed command leaves the state unchanged', () => {
    const w = sceneryWorld();
    w.state.park.cash = 10;
    const h = stateHash(w);
    for (const [id, x, y] of [['oak_round', 0, 0], ['tent_red', 62, 62], ['fountain_carved', 10, 10], ['nope', 10, 10]] as const) {
      expect(place(w, id, x, y).ok).toBe(false);
      expect(stateHash(w)).toBe(h);
    }
  });

  it('rejects unknown items, rotations, and edges', () => {
    const w = sceneryWorld();
    expect(reasonOf(place(w, 'no_such_item', 5, 5))).toBe(SCENERY_ERR.unknownItem);
    expect(reasonOf(executeCommand(w, { type: 'placeScenery', defId: 'oak_round', x: 5, y: 5, rotation: 4 as never, edge: -1 }))).toBe(SCENERY_ERR.badRotation);
    expect(reasonOf(place(w, 'oak_round', 5, 5, 0, 2))).toBe(SCENERY_ERR.badEdge);
    expect(reasonOf(place(w, 'hedge_low', 5, 5, 0, -1))).toBe(SCENERY_ERR.badEdge);
    expect(reasonOf(executeCommand(w, { type: 'placeScenery', defId: 'oak_round', x: 5.5, y: 5, rotation: 0, edge: -1 }))).toBe('Outside the park');
  });
});

describe('multi-tile items', () => {
  it('a 2 × 2 item checks every tile and marks all 4', () => {
    const w = sceneryWorld();
    const map = w.state.map;
    map.content[tileIndex(map, 11, 11)] = Content.Footpath;
    expect(reasonOf(place(w, 'tent_red', 10, 10))).toBe('A path is in the way');
    map.content[tileIndex(map, 11, 11)] = Content.Empty;
    map.water[tileIndex(map, 10, 11)] = 9;
    expect(reasonOf(place(w, 'tent_red', 10, 10))).toBe('Scenery cannot go in water');
    map.water[tileIndex(map, 10, 11)] = 0;
    expect(reasonOf(place(w, 'tent_red', 62, 30))).toBe('Outside the park');
    const id = placeOk(w, 'tent_red', 10, 10);
    for (const [x, y] of [[10, 10], [11, 10], [10, 11], [11, 11]] as const) {
      expect(map.content[tileIndex(map, x, y)]).toBe(Content.Scenery);
      expect(map.contentRef[tileIndex(map, x, y)]).toBe(id);
      expect(sceneryOnTile(w, tileIndex(map, x, y)).map((s) => s.id)).toEqual([id]);
    }
    expect(map.content[tileIndex(map, 12, 10)]).toBe(Content.Empty);
  });

  it('all tiles of a multi-tile item stand at one base height', () => {
    const w = sceneryWorld();
    const map = w.state.map;
    map.heights[tileIndex(map, 11, 10)] = 9;
    expect(reasonOf(place(w, 'tent_blue', 10, 10))).toBe('This item needs flat land');
    // slopeOk 2 × 2 items take slopes, but still one base height.
    map.heights[tileIndex(map, 11, 10)] = 8;
    map.slope[tileIndex(map, 11, 10)] = 0b0010;
    expect(reasonOf(place(w, 'tent_blue', 10, 10))).toBe('This item needs flat land');
    expect(place(w, 'lava_crag', 10, 10).ok).toBe(true);
  });

  it('rotation 1 and 3 swap the sides of a 2 × 1 item', () => {
    const w = sceneryWorld();
    const map = w.state.map;
    const covered = (id: number): number[][] => {
      const out: number[][] = [];
      for (let i = 0; i < map.contentRef.length; i++) if (map.contentRef[i] === id) out.push([i % map.width, Math.floor(i / map.width)]);
      return out;
    };
    expect(covered(placeOk(w, 'rope_bridge_decor', 10, 10, 0))).toEqual([[10, 10], [11, 10]]);
    expect(covered(placeOk(w, 'rope_bridge_decor', 10, 12, 1))).toEqual([[10, 12], [10, 13]]);
    expect(covered(placeOk(w, 'rope_bridge_decor', 10, 15, 2))).toEqual([[10, 15], [11, 15]]);
    expect(covered(placeOk(w, 'rope_bridge_decor', 14, 10, 3))).toEqual([[14, 10], [14, 11]]);
    // The swapped side is checked: rotation 1 at y = 62 reaches the unowned outer ring.
    expect(reasonOf(place(w, 'rope_bridge_decor', 20, 62, 1))).toBe('Outside the park');
    expect(place(w, 'rope_bridge_decor', 20, 62, 0).ok).toBe(true);
  });
});

describe('edge items (fences, hedges, walls)', () => {
  it('go on an edge of a path tile, leave the path in place, and block movement across that edge from both sides', () => {
    const w = sceneryWorld();
    const map = w.state.map;
    const a = tileIndex(map, 20, 20);
    const b = tileIndex(map, 21, 20);
    map.content[a] = Content.Footpath;
    map.content[b] = Content.Footpath;
    expect(edgeBlocked(w, a, 1)).toBe(false);
    const id = placeOk(w, 'hedge_low', 20, 20, 0, 1);
    expect(map.content[a]).toBe(Content.Footpath);
    expect(map.contentRef[a]).toBe(-1);
    expect(findScenery(w, id)).toMatchObject({ edge: 1, x: 20, y: 20, z: 8 });
    expect(edgeBlocked(w, a, 1)).toBe(true);
    expect(edgeBlocked(w, b, 3)).toBe(true);
    expect(edgeBlocked(w, a, 0)).toBe(false);
    expect(edgeBlocked(w, a, 2)).toBe(false);
    expect(edgeBlocked(w, b, 1)).toBe(false);
    expect(sceneryOnTile(w, a).map((s) => s.id)).toEqual([id]);
  });

  it('one item per shared edge: the same edge or the neighbour\'s facing edge is "Scenery is in the way"', () => {
    const w = sceneryWorld();
    placeOk(w, 'fence_wood', 20, 20, 0, 2);
    expect(reasonOf(place(w, 'rail_iron', 20, 20, 0, 2))).toBe('Scenery is in the way');
    expect(reasonOf(place(w, 'rail_iron', 20, 21, 0, 0))).toBe('Scenery is in the way');
    expect(place(w, 'rail_iron', 20, 20, 0, 1).ok).toBe(true);
    expect(place(w, 'rail_iron', 20, 20, 0, 0).ok).toBe(true);
    expect(place(w, 'rail_iron', 20, 20, 0, 3).ok).toBe(true);
  });

  it('stand on tiles with a centre item, but not on rides, stalls, track, or the entrance', () => {
    const w = sceneryWorld();
    const map = w.state.map;
    placeOk(w, 'bed_mixed', 10, 10);
    expect(place(w, 'hedge_low', 10, 10, 0, 2).ok).toBe(true);
    placeRideDirect(w, 'carousel', 24, 20);
    expect(reasonOf(place(w, 'hedge_low', 24, 20, 0, 0))).toBe('A ride or stall is in the way');
    map.content[tileIndex(map, 32, 20)] = Content.Track;
    expect(reasonOf(place(w, 'hedge_low', 32, 20, 0, 0))).toBe('A track is in the way');
    const e = map.entranceTile;
    expect(reasonOf(place(w, 'hedge_low', e % map.width, Math.floor(e / map.width), 0, 0))).toBe('The park entrance is in the way');
  });

  it('follow the owned, water, and flat rules, and check clearance against elevated paths and track only', () => {
    const w = sceneryWorld();
    const map = w.state.map;
    expect(reasonOf(place(w, 'hedge_low', 0, 10, 0, 1))).toBe('Outside the park');
    map.water[tileIndex(map, 5, 5)] = 10;
    expect(reasonOf(place(w, 'hedge_low', 5, 5, 0, 1))).toBe('Scenery cannot go in water');
    map.slope[tileIndex(map, 6, 6)] = 0b0001;
    expect(reasonOf(place(w, 'wall_ice', 6, 6, 0, 1))).toBe('This item needs flat land');
    occ.list = [{ kind: 'groundPath', id: -1, zMin: 8, zMax: 11 }];
    expect(place(w, 'wall_ice', 7, 7, 0, 1).ok).toBe(true);
    occ.list = [{ kind: 'elevatedPath', id: 50, zMin: 9, zMax: 12 }];
    expect(reasonOf(place(w, 'wall_ice', 7, 7, 0, 2))).toBe('Not enough clearance under an object');
    occ.list = [{ kind: 'elevatedPath', id: 50, zMin: 10, zMax: 13 }];
    expect(place(w, 'wall_ice', 7, 7, 0, 2).ok).toBe(true);
  });
});

describe('arches over paths (overPath)', () => {
  it('go on a flat ground footpath; the path stays walkable; the arch occupies [ground + 3, ground + height)', () => {
    const w = sceneryWorld();
    const map = w.state.map;
    const i = tileIndex(map, 15, 15);
    map.content[i] = Content.Footpath;
    const r = place(w, 'ticket_arch', 15, 15, 1);
    expect(r.ok).toBe(true);
    expect(map.content[i]).toBe(Content.Footpath);
    expect(map.contentRef[i]).toBe(-1);
    expect(occ.calls).toContainEqual([i, 11, 13]);
    expect(sceneryOnTile(w, i).map((s) => s.defId)).toEqual(['ticket_arch']);
    expect(reasonOf(place(w, 'ice_arch', 15, 15))).toBe('Scenery is in the way');
  });

  it('need a footpath: grass and queues fail with "Arches go over a footpath"; a ramp needs flat land', () => {
    const w = sceneryWorld();
    const map = w.state.map;
    expect(reasonOf(place(w, 'neon_arch', 16, 16))).toBe(SCENERY_ERR.archNeedsPath);
    map.content[tileIndex(map, 17, 16)] = Content.Queue;
    expect(reasonOf(place(w, 'neon_arch', 17, 16))).toBe(SCENERY_ERR.archNeedsPath);
    placeRideDirect(w, 'carousel', 24, 20);
    expect(reasonOf(place(w, 'neon_arch', 24, 20))).toBe('A ride or stall is in the way');
    const ramp = tileIndex(map, 18, 16);
    map.content[ramp] = Content.Footpath;
    map.slope[ramp] = 0b0011;
    expect(reasonOf(place(w, 'neon_arch', 18, 16))).toBe('This item needs flat land');
  });

  it('every arch in the catalog is an overPath item', () => {
    const arches = SCENERY.filter((d) => d.overPath).map((d) => d.id);
    expect(arches).toEqual(['ticket_arch', 'ice_arch', 'volcano_gate', 'gate_crooked', 'ruin_arch', 'neon_arch']);
  });
});

describe('removeScenery and demolish', () => {
  it('refunds 50% of the build cost, clears the tiles, and books demolitionRefunds', () => {
    const w = sceneryWorld();
    const s = w.state;
    const id = placeOk(w, 'fountain_carved', 10, 10);
    const cash = s.park.cash;
    const r = executeCommand(w, { type: 'removeScenery', id });
    expect(r).toEqual({ ok: true, cost: -20_000, warnings: [] });
    expect(s.park.cash).toBe(cash + 20_000);
    expect(currentLedger(w).lines.demolitionRefunds).toBe(20_000);
    expect(s.scenery).toEqual([]);
    for (const [x, y] of [[10, 10], [11, 10], [10, 11], [11, 11]] as const) {
      const i = tileIndex(s.map, x, y);
      expect(s.map.content[i]).toBe(Content.Empty);
      expect(s.map.contentRef[i]).toBe(-1);
    }
  });

  it('rounds an odd refund down and frees the edge again', () => {
    const w = sceneryWorld();
    const map = w.state.map;
    const id = placeOk(w, 'hedge_low', 20, 20, 0, 1);
    // Every catalog price is whole dollars; the formula floors odd cents.
    expect(sceneryRefund(1_001)).toBe(500);
    expect(sceneryRefund(0)).toBe(0);
    const r = executeCommand(w, { type: 'removeScenery', id });
    expect(r).toEqual({ ok: true, cost: -500, warnings: [] });
    expect(edgeBlocked(w, tileIndex(map, 20, 20), 1)).toBe(false);
    expect(edgeBlocked(w, tileIndex(map, 21, 20), 3)).toBe(false);
    expect(place(w, 'fence_wood', 21, 20, 0, 3).ok).toBe(true);
  });

  it('an arch removal leaves the path; setup mode books nothing', () => {
    const w = sceneryWorld();
    const map = w.state.map;
    const i = tileIndex(map, 15, 15);
    map.content[i] = Content.Footpath;
    const id = placeOk(w, 'ruin_arch', 15, 15);
    const cash = w.state.park.cash;
    expect(executeCommand(w, { type: 'removeScenery', id }, { setup: true })).toEqual({ ok: true, cost: -6_500, warnings: [] });
    expect(w.state.park.cash).toBe(cash);
    expect(map.content[i]).toBe(Content.Footpath);
    expect(sceneryOnTile(w, i)).toEqual([]);
    expect(place(w, 'ruin_arch', 15, 15).ok).toBe(true);
  });

  it('an unknown id fails with "Nothing to remove" and changes nothing', () => {
    const w = sceneryWorld();
    placeOk(w, 'boulder', 3, 3);
    const h = stateHash(w);
    expect(executeCommand(w, { type: 'removeScenery', id: 77 })).toEqual({ ok: false, reason: 'Nothing to remove' });
    expect(stateHash(w)).toBe(h);
  });

  it('the demolish tool on a centre item removes it with the refund', () => {
    const w = sceneryWorld();
    placeOk(w, 'willow', 4, 4);
    const r = executeCommand(w, { type: 'demolish', x: 4, y: 4 });
    expect(r).toEqual({ ok: true, cost: -3_000, warnings: [] });
    expect(w.state.scenery).toEqual([]);
    expect(w.state.map.content[tileIndex(w.state.map, 4, 4)]).toBe(Content.Empty);
  });
});
