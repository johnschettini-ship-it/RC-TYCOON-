/**
 * Phase 4 placement rules for every track ride (Phase 4 §4.2, §4.5, §4.9; master 6.3, R17). Owner: W3-C.
 * - "The track is below the land": the rail may not cut a raised corner of a sloped tile.
 * - Construction rights (state 3): track may pass over with zMin (= lowest rail − 1 m) ≥ ground + 3; nothing may
 *   stand on that ground (station, ground-level track, gates).
 * - Elevated paths and scenery come from the unified occupancy list (W3-B); this test stands in for it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const occ = vi.hoisted(() => ({ list: new Map<number, Array<{ kind: string; id: number; zMin: number; zMax: number }>>(), dirty: 0 }));
vi.mock('../../../src/sim/occupancy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/sim/occupancy')>()),
  occupantsAt: (_w: unknown, tile: number) => occ.list.get(tile) ?? [],
  markOccupancyDirty: () => {
    occ.dirty++;
  },
}));

import { TERRAIN_ERR } from '../../../src/data/strings/terrain';
import { TRACK_ERR } from '../../../src/data/strings/track';
import { executeCommand } from '../../../src/sim/commands';
import { Content, Owned, tileIndex } from '../../../src/sim/map';
import { demolishTrackRide } from '../../../src/sim/rides/track/api';
import { makeTestWorld } from '../../helpers/world';
import { add, addAll, dataOf, EAST, expectOk, place, rideOf } from './helpers';

const reasonOf = (r: { ok: boolean; reason?: string }): string | undefined => (r.ok ? undefined : r.reason);

beforeEach(() => {
  occ.list.clear();
  occ.dirty = 0;
});

describe(`"${TERRAIN_ERR.trackBelowLand}"`, () => {
  it('a rail at the base of a sloped tile cuts its raised corner', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const id = place(w, 'log_flume', 10, 10, EAST);
    map.slope[tileIndex(map, 11, 10)] = 0b0011;
    expect(reasonOf(add(w, id, 'flume_straight'))).toBe(TERRAIN_ERR.trackBelowLand);
    expect(reasonOf(add(w, id, 'flume_lift'))).toBe(TERRAIN_ERR.trackBelowLand);
    expect(dataOf(w, id).pieces).toHaveLength(1);
    // A rail above the raised corner is fine.
    map.slope[tileIndex(map, 11, 10)] = 0;
    expectOk(add(w, id, 'flume_lift'));
    map.slope[tileIndex(map, 12, 10)] = 0b0110;
    expectOk(add(w, id, 'flume_straight'));
  });

  it('a rail below the tile base keeps the Phase 2 string; a station needs flat ground', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    map.heights[tileIndex(map, 11, 10)] = 9;
    expect(reasonOf(add(w, id, 'straight'))).toBe(TRACK_ERR.belowGround);
    map.heights[tileIndex(map, 11, 10)] = 8;
    map.slope[tileIndex(map, 11, 10)] = 0b1000;
    expect(reasonOf(add(w, id, 'station'))).toBe(TRACK_ERR.stationOnGround);
    map.slope[tileIndex(map, 20, 20)] = 0b0001;
    expect(reasonOf(executeCommand(w, { type: 'placeStation', typeId: 'log_flume', x: 20, y: 20, dir: EAST }, { setup: true }))).toBe(TRACK_ERR.stationOnGround);
  });
});

describe('construction rights (Phase 4 §4.9): zMin ≥ ground + 3', () => {
  it('a rail 4 m up (zMin = ground + 3) passes over rights; 2 m up does not', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const high = place(w, 'log_flume', 10, 10, EAST);
    addAll(w, high, ['flume_lift', 'flume_lift']);
    map.owned[tileIndex(map, 13, 10)] = Owned.RightsOwned;
    expectOk(add(w, high, 'flume_straight'));
    // Supports may stand on rights land.
    expect(map.content[tileIndex(map, 13, 10)]).toBe(Content.Track);

    const low = place(w, 'log_flume', 10, 20, EAST);
    addAll(w, low, ['flume_lift']);
    map.owned[tileIndex(map, 12, 20)] = Owned.RightsOwned;
    expect(reasonOf(add(w, low, 'flume_straight'))).toBe(TERRAIN_ERR.onlyRights);
    expect(reasonOf(add(w, low, 'flume_lift'))).toBe(TERRAIN_ERR.onlyRights);
  });

  it('stations, ground-level track, and gates may not touch rights land; other states stay "Outside the park"', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    map.owned[tileIndex(map, 20, 20)] = Owned.RightsOwned;
    expect(reasonOf(executeCommand(w, { type: 'placeStation', typeId: 'rapids_raft', x: 20, y: 20, dir: EAST }, { setup: true }))).toBe(TERRAIN_ERR.onlyRights);
    for (const o of [Owned.NotOwned, Owned.LandForSale, Owned.RightsForSale]) {
      map.owned[tileIndex(map, 20, 20)] = o;
      expect(reasonOf(executeCommand(w, { type: 'placeStation', typeId: 'rapids_raft', x: 20, y: 20, dir: EAST }, { setup: true }))).toBe(TRACK_ERR.outsidePark);
    }
    const id = place(w, 'rapids_raft', 10, 10, EAST);
    map.owned[tileIndex(map, 11, 10)] = Owned.RightsOwned;
    expect(reasonOf(add(w, id, 'rapids_straight'))).toBe(TERRAIN_ERR.onlyRights);
    map.owned[tileIndex(map, 10, 9)] = Owned.RightsOwned;
    expect(reasonOf(executeCommand(w, { type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 10, y: 9 }))).toBe(TERRAIN_ERR.onlyRights);
  });
});

describe('elevated paths and scenery from the occupancy list', () => {
  it('track must clear an elevated path by the Phase 2 path rule (rail ≥ path + 4 m)', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const id = place(w, 'log_flume', 10, 10, EAST);
    addAll(w, id, ['flume_lift', 'flume_lift', 'flume_lift']);
    // Rail at 14 on (14, 10): a path deck at z 10 occupies [10, 13); the track envelope starts at 13.
    const t = tileIndex(map, 14, 10);
    occ.list.set(t, [{ kind: 'elevatedPath', id: 900, zMin: 11, zMax: 14 }]);
    expect(reasonOf(add(w, id, 'flume_straight'))).toBe(TRACK_ERR.hitsPath);
    occ.list.set(t, [{ kind: 'elevatedPath', id: 900, zMin: 10, zMax: 13 }]);
    expectOk(add(w, id, 'flume_straight'));
    // The path below spans the tile like a ground path: no support through the deck.
    expect(map.content[t]).toBe(Content.Empty);
  });

  it('track passes over scenery only above its top (trees under track, Phase 4 §4.5)', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const id = place(w, 'rapids_raft', 10, 10, EAST);
    addAll(w, id, ['rapids_lift', 'rapids_lift', 'rapids_lift']);
    const t = tileIndex(map, 14, 10);
    map.content[t] = Content.Scenery;
    map.contentRef[t] = 950;
    occ.list.set(t, [{ kind: 'scenery', id: 950, zMin: 8, zMax: 15 }]);
    expect(reasonOf(add(w, id, 'rapids_straight'))).toBe(TERRAIN_ERR.sceneryInWay);
    occ.list.set(t, [{ kind: 'scenery', id: 950, zMin: 8, zMax: 13 }]);
    expectOk(add(w, id, 'rapids_straight'));
    expect(map.content[t]).toBe(Content.Scenery);
    // Ground-level track can never share a scenery tile.
    const low = place(w, 'rapids_raft', 10, 20, EAST);
    const s = tileIndex(map, 11, 20);
    map.content[s] = Content.Scenery;
    occ.list.set(s, [{ kind: 'scenery', id: 951, zMin: 8, zMax: 9 }]);
    expect(reasonOf(add(w, low, 'rapids_straight'))).toBe(TERRAIN_ERR.sceneryInWay);
  });

  it('ignores ground paths and track in the occupancy list (checked by the Phase 2 rules)', () => {
    const w = makeTestWorld();
    const id = place(w, 'log_flume', 10, 10, EAST);
    occ.list.set(tileIndex(w.state.map, 11, 10), [{ kind: 'groundPath', id: -1, zMin: 8, zMax: 11 }, { kind: 'track', id, zMin: 7, zMax: 11 }]);
    expectOk(add(w, id, 'flume_straight'));
  });

  it('every track change marks the occupancy list dirty', () => {
    const w = makeTestWorld();
    const id = place(w, 'log_flume', 10, 10, EAST);
    const afterPlace = occ.dirty;
    expect(afterPlace).toBeGreaterThan(0);
    expectOk(add(w, id, 'flume_straight'));
    expect(occ.dirty).toBeGreaterThan(afterPlace);
    const afterAdd = occ.dirty;
    expectOk(executeCommand(w, { type: 'removeLastTrackPiece', rideId: id }, { setup: true }));
    expect(occ.dirty).toBeGreaterThan(afterAdd);
    const afterRemove = occ.dirty;
    demolishTrackRide(w, rideOf(w, id), { setup: true });
    expect(occ.dirty).toBeGreaterThan(afterRemove);
  });
});
