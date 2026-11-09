/**
 * Track builder with the water rides (phase-2 §7, Phase 4 §4.4, §7): picker, station run of the type's station piece,
 * palette groups, ghosts with the Phase 4 reasons, the touch flow, and a full circuit built through the builder.
 * Water rides are research content; this file treats every type as researched. Owner: W3-C.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/research/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/sim/research/api')>()),
  isUnlocked: () => true,
}));

import { getTrackPieceDef, getTrackTypeDef, type TrackTypeDef } from '../../../src/data/track';
import { TERRAIN_ERR } from '../../../src/data/strings/terrain';
import { TRACK_WARN } from '../../../src/data/strings/track';
import { en } from '../../../src/data/strings/en';
import { Game } from '../../../src/game';
import { trackToolOf } from '../../../src/render/track/toolState';
import { Owned, tileIndex } from '../../../src/sim/map';
import {
  buildSelected,
  confirmAction,
  gateGhostAt,
  mapTap,
  paletteFor,
  paletteGroupOf,
  pickableTrackTypes,
  pieceGhostFor,
  placeStationNow,
  refreshStationGhost,
  selectPiece,
  setStationLength,
  startStation,
  stationCost,
  stationGhostAt,
} from '../../../src/ui/track/builder';
import { makeTestWorld, placeFootpath, placeQueue } from '../../helpers/world';
import { dataOf, EAST, rideOf } from './helpers';

function game(): Game {
  return new Game(makeTestWorld());
}

describe('picker and station', () => {
  it('lists the water types once they are unlocked, with a station cost from their own station piece', () => {
    const g = game();
    const ids = pickableTrackTypes(g.world).map((t) => t.id);
    expect(ids).toContain('log_flume');
    expect(ids).toContain('rapids_raft');
    const flume = getTrackTypeDef('log_flume') as TrackTypeDef;
    expect(stationCost(flume, 2)).toBe(flume.costs.base + 2 * (getTrackPieceDef('flume_station')?.cost ?? 0));
    expect(en['ui.track.boats']).toBe('Boats');
    expect(en['ui.track.drive.waterChannel']).toBe('Water channel');
  });

  it('a 2-tile station run lays 2 station pieces of the type', () => {
    const g = game();
    startStation(g, 'rapids_raft');
    const st = trackToolOf(g.tool);
    setStationLength(g, 2);
    st.anchor = tileIndex(g.world.state.map, 10, 10);
    g.tool.rotation = EAST;
    refreshStationGhost(g, null);
    expect(st.stationGhost?.valid).toBe(true);
    const id = placeStationNow(g)!;
    expect(dataOf(g.world, id).pieces.map((p) => p.defId)).toEqual(['rapids_station', 'rapids_station']);
    expect(st.phase).toBe('pieces');
  });

  it('station and gate ghosts give the construction rights reason', () => {
    const g = game();
    const map = g.world.state.map;
    map.owned[tileIndex(map, 11, 10)] = Owned.RightsOwned;
    const sg = stationGhostAt(g.world, 'log_flume', tileIndex(map, 10, 10), EAST, 2);
    expect(sg).toMatchObject({ valid: false, reason: TERRAIN_ERR.onlyRights });
    startStation(g, 'log_flume');
    trackToolOf(g.tool).anchor = tileIndex(map, 20, 20);
    g.tool.rotation = EAST;
    refreshStationGhost(g, null);
    const id = placeStationNow(g)!;
    map.owned[tileIndex(map, 20, 19)] = Owned.RightsOwned;
    expect(gateGhostAt(g.world, id, 'entrance', tileIndex(map, 20, 19))).toMatchObject({ valid: false, reason: TERRAIN_ERR.onlyRights });
  });
});

describe('palette and ghosts', () => {
  it('water pieces sit in the Straight, Slopes, Turns, and Special groups; Banking stays empty', () => {
    expect(paletteGroupOf('W')).toBe('special');
    const g = game();
    startStation(g, 'log_flume');
    trackToolOf(g.tool).anchor = tileIndex(g.world.state.map, 10, 10);
    g.tool.rotation = EAST;
    refreshStationGhost(g, null);
    const id = placeStationNow(g)!;
    const pal = Object.fromEntries(paletteFor(g.world, id).map((p) => [p.id, p.pieces.map((d) => d.id)]));
    expect(pal.straight).toEqual(['flume_station', 'flume_straight']);
    expect(pal.slopes).toEqual(['flume_slope_down', 'flume_drop', 'flume_lift']);
    expect(pal.turns).toEqual(['flume_turn_small_l', 'flume_turn_small_r', 'flume_turn_medium_l', 'flume_turn_medium_r']);
    expect(pal.banking).toEqual([]);
    expect(pal.special).toEqual(['flume_splashdown']);
  });

  it('a ghost below the land names the reason and outlines the sloped tile', () => {
    const g = game();
    const map = g.world.state.map;
    startStation(g, 'log_flume');
    trackToolOf(g.tool).anchor = tileIndex(map, 10, 10);
    g.tool.rotation = EAST;
    refreshStationGhost(g, null);
    const id = placeStationNow(g)!;
    const ok = pieceGhostFor(g.world, id, 'flume_lift', false, 6)!;
    expect(ok).toMatchObject({ ok: true, heightAboveGround: 2 });
    map.slope[tileIndex(map, 11, 10)] = 0b0011;
    const bad = pieceGhostFor(g.world, id, 'flume_straight', false, 6)!;
    expect(bad).toMatchObject({ ok: false, reason: TERRAIN_ERR.trackBelowLand });
    expect(bad.conflictTiles).toEqual([tileIndex(map, 11, 10)]);
  });
});

describe('a Log Flume built through the builder (touch flow: select, Build; map taps never build)', () => {
  it('closes, asks for the gates, and passes its test', () => {
    const g = game();
    const map = g.world.state.map;
    placeQueue(g.world, 10, 8);
    placeFootpath(g.world, 11, 8);
    startStation(g, 'log_flume');
    const st = trackToolOf(g.tool);
    setStationLength(g, 2);
    st.anchor = tileIndex(map, 10, 10);
    g.tool.rotation = EAST;
    refreshStationGhost(g, null);
    mapTap(g, tileIndex(map, 10, 10), false);
    confirmAction(g);
    const id = st.rideId!;
    const plan = [
      'flume_lift', 'flume_lift', 'flume_lift', 'flume_straight', 'flume_turn_small_r', 'flume_drop', 'flume_splashdown', 'flume_turn_small_r',
      ...Array(6).fill('flume_straight'), 'flume_turn_small_r', 'flume_straight', 'flume_straight', 'flume_straight', 'flume_turn_small_r',
    ];
    let last = null as ReturnType<typeof buildSelected>;
    for (const p of plan) {
      selectPiece(g, p);
      mapTap(g, tileIndex(map, 30, 30), false);
      last = buildSelected(g);
      expect(last?.ok).toBe(true);
    }
    expect(last?.ok && last.warnings).toEqual([TRACK_WARN.circuitComplete]);
    expect(st.phase).toBe('entrance');
    mapTap(g, tileIndex(map, 10, 9), false);
    confirmAction(g);
    expect(st.phase).toBe('exit');
    mapTap(g, tileIndex(map, 11, 9), false);
    confirmAction(g);
    expect(rideOf(g.world, id).entrance && rideOf(g.world, id).exit).toBeTruthy();
    expect(g.dispatch({ type: 'startTestRun', rideId: id }).ok).toBe(true);
    g.step((dataOf(g.world, id).testRun?.ticksLeft ?? 0) + 1);
    expect(dataOf(g.world, id).test?.passed).toBe(true);
    expect(g.dispatch({ type: 'setRideOpen', rideId: id, open: true }).ok).toBe(true);
  });
});
