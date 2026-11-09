/**
 * Track builder logic (phase-2 §7.1–7.3): palette filtering, ghost state mapping, the touch confirm flow,
 * undo, and gate placement. Pure: drives the builder through a real `Game` (no DOM).
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../../../../src/game';
import { TRACK_ERR, TRACK_WARN } from '../../../../src/data/strings/track';
import { getTrackTypeDef } from '../../../../src/data/track';
import { trackToolOf } from '../../../../src/render/track/toolState';
import type { Command } from '../../../../src/sim/commands/types';
import { Content, tileIndex } from '../../../../src/sim/map';
import {
  aimGate,
  buildSelected,
  confirmAction,
  editTrackRide,
  enterPieces,
  gateCandidates,
  gateGhostAt,
  ghostBadge,
  heightTag,
  hoverPiece,
  leaveBuilder,
  mapHover,
  mapTap,
  minStationTiles,
  paletteFor,
  paletteGroupOf,
  pickableTrackTypes,
  pieceGhostFor,
  placeGateNow,
  previewPieceId,
  refreshPieceGhost,
  refreshStationGhost,
  rotateStation,
  selectGroup,
  selectPiece,
  setStationLength,
  startStation,
  stationGhostAt,
  stepBrakeSpeed,
  syncSelection,
  toggleChain,
  undoPiece,
} from '../../../../src/ui/track/builder';
import { takeTrackTab } from '../../../../src/ui/track/tabRequest';
import { makeTestWorld, placeFootpath } from '../../../helpers/world';
import { addAll, dataOf, EAST, place, R1_PIECES, rideOf } from '../../track/helpers';

function setup(): { game: Game; cmds: Command[] } {
  const game = new Game(makeTestWorld());
  const cmds: Command[] = [];
  game.onCommand((c) => cmds.push(c));
  return { game, cmds };
}

const money = (c: number): string => `$${(c / 100).toFixed(0)}`;

describe('palette filtering (§7.1 step 3)', () => {
  it('lists only pieces that fit the track end and the type, in the five groups', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    const pal = paletteFor(w, id);
    expect(pal.map((g) => g.id)).toEqual(['straight', 'slopes', 'turns', 'banking', 'special']);
    const ids = (g: string): string[] => pal.find((x) => x.id === g)!.pieces.map((p) => p.id);
    expect(ids('straight')).toEqual(['station', 'straight']);
    expect(ids('slopes')).toEqual(['flat_to_gentle_up', 'flat_to_gentle_down']);
    expect(ids('turns')).toEqual(['turn_small_left', 'turn_small_right', 'turn_medium_left', 'turn_medium_right']);
    expect(ids('banking')).toEqual(['bank_left_in', 'bank_right_in']);
    expect(ids('special')).toEqual(['brakes', 'block_brake', 'vertical_loop_left', 'vertical_loop_right']);
  });

  it('after a slope only slope pieces fit; the junior coaster has no steep pieces and no loops', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    addAll(w, id, ['flat_to_gentle_up']);
    const pal = paletteFor(w, id);
    expect(pal.filter((g) => g.pieces.length > 0).map((g) => g.id)).toEqual(['slopes']);
    expect(pal.find((g) => g.id === 'slopes')!.pieces.map((p) => p.id)).toEqual(['gentle_up', 'gentle_up_to_flat', 'gentle_to_steep_up']);

    const j = place(w, 'junior_coaster', 30, 30, EAST);
    addAll(w, j, ['flat_to_gentle_up']);
    expect(paletteFor(w, j).find((g) => g.id === 'slopes')!.pieces.map((p) => p.id)).toEqual(['gentle_up', 'gentle_up_to_flat']);
    const j2 = place(w, 'junior_coaster', 30, 40, EAST);
    expect(paletteFor(w, j2).find((g) => g.id === 'special')!.pieces.map((p) => p.id)).toEqual(['brakes', 'block_brake']);
  });

  it('a closed circuit has an empty palette', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 4, 2, EAST);
    addAll(w, id, R1_PIECES);
    expect(paletteFor(w, id).every((g) => g.pieces.length === 0)).toBe(true);
  });

  it('syncSelection drops a piece that no longer fits and moves to the first group with pieces', () => {
    const { game } = setup();
    const id = place(game.world, 'steel_coaster', 10, 10, EAST);
    enterPieces(game, id);
    const st = trackToolOf(game.tool);
    selectPiece(game, 'turn_small_right');
    expect(st.group).toBe('turns');
    addAll(game.world, id, ['flat_to_gentle_up']);
    syncSelection(st, paletteFor(game.world, id));
    expect(st.selected).toBeNull();
    expect(st.group).toBe('slopes');
  });

  it('piece table groups map to palette groups; the picker lists only unlocked rail types', () => {
    expect(paletteGroupOf('S')).toBe('straight');
    expect(paletteGroupOf('X')).toBe('slopes');
    expect(paletteGroupOf('Tm')).toBe('turns');
    expect(paletteGroupOf('B')).toBe('banking');
    expect(paletteGroupOf('Sp')).toBe('special');
    const w = makeTestWorld();
    expect(pickableTrackTypes(w).map((t) => t.id)).toEqual(['steel_coaster', 'junior_coaster', 'mini_railway']);
    w.state.management.research.unlocked.push('ghost_train', 'go_karts');
    expect(pickableTrackTypes(w).map((t) => t.id)).toEqual(['steel_coaster', 'junior_coaster', 'mini_railway', 'ghost_train', 'go_karts']);
  });
});

describe('ghost state mapping (§7.1 steps 4–5)', () => {
  it('a valid ghost carries cost, height, tiles, and the closing flag', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    const g = pieceGhostFor(w, id, 'flat_to_gentle_up', true, 6)!;
    expect(g.ok).toBe(true);
    expect(g.reason).toBeNull();
    expect(g.cost).toBe(4000 + 2000 + 300); // piece + chain + $3 per metre of height
    expect(g.heightAboveGround).toBe(1);
    expect(g.piece).toMatchObject({ defId: 'flat_to_gentle_up', x: 11, y: 10, z: 8, dir: 0, chain: true });
    expect(g.tiles).toEqual([tileIndex(w.state.map, 11, 10)]);
    expect(g.closes).toBe(false);
    expect(ghostBadge(g, money)).toBe('✓ $63');
    expect(heightTag(g.heightAboveGround)).toBe('+1 m');
    // The chain option is dropped for pieces that cannot carry it.
    expect(pieceGhostFor(w, id, 'flat_to_gentle_down', true, 6)!.piece.chain).toBe(false);
  });

  it('an invalid ghost has the §4.6 reason and outlines the conflicting tile', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 10, 10, EAST);
    const path = placeFootpath(w, 11, 10);
    const g = pieceGhostFor(w, id, 'straight', false, 6)!;
    expect(g.ok).toBe(false);
    expect(g.reason).toBe(TRACK_ERR.hitsPath);
    expect(g.conflictTiles).toEqual([path]);
    expect(g.cost).toBe(0);
    expect(ghostBadge(g, money)).toBe('✕');
    const w2 = makeTestWorld();
    const id2 = place(w2, 'steel_coaster', 10, 10, EAST);
    expect(pieceGhostFor(w2, id2, 'flat_to_gentle_down', false, 6)!.reason).toBe(TRACK_ERR.belowGround);
    const edge = place(w2, 'steel_coaster', 62, 20, EAST);
    const out = pieceGhostFor(w2, edge, 'straight', false, 6)!;
    expect(out.reason).toBe(TRACK_ERR.outsidePark);
  });

  it('the station ghost runs along the map direction and reports local reasons', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const type = getTrackTypeDef('steel_coaster')!;
    expect(minStationTiles(type, 4)).toBe(3);
    const at = (x: number, y: number): number => tileIndex(map, x, y);
    expect(stationGhostAt(w, 'steel_coaster', at(10, 10), 1, 3)!.tiles).toEqual([at(10, 10), at(11, 10), at(12, 10)]);
    expect(stationGhostAt(w, 'steel_coaster', at(10, 10), 2, 2)!.tiles).toEqual([at(10, 10), at(10, 11)]);
    expect(stationGhostAt(w, 'steel_coaster', at(10, 10), 3, 2)!.tiles).toEqual([at(10, 10), at(9, 10)]);
    expect(stationGhostAt(w, 'steel_coaster', at(10, 10), 0, 2)!.tiles).toEqual([at(10, 10), at(10, 9)]);
    const ok = stationGhostAt(w, 'steel_coaster', at(10, 10), 1, 3)!;
    expect(ok.valid).toBe(true);
    expect(ok.cost).toBe(300_000 + 3 * 6000);
    placeFootpath(w, 12, 10);
    expect(stationGhostAt(w, 'steel_coaster', at(10, 10), 1, 3)!.reason).toBe(TRACK_ERR.hitsPath);
    expect(stationGhostAt(w, 'steel_coaster', at(61, 10), 1, 3)!.reason).toBe(TRACK_ERR.outsidePark);
    w.state.park.cash = 1000;
    expect(stationGhostAt(w, 'steel_coaster', at(20, 20), 1, 3)!.reason).toBe(TRACK_ERR.notEnoughCash);
    expect(stationGhostAt(w, 'ghost_train', at(20, 30), 1, 1)!.reason).toBe(TRACK_ERR.notResearched);
  });
});

describe('confirm flow (§7.2 desktop, §7.3 touch)', () => {
  it('touch: a map tap only moves the station ghost; Confirm places the whole station', () => {
    const { game, cmds } = setup();
    const map = game.world.state.map;
    startStation(game, 'steel_coaster');
    const st = trackToolOf(game.tool);
    expect(game.tool.tool).toBe('track');
    expect(st.phase).toBe('station');
    expect(st.stationLength).toBe(3);
    expect(game.tool.rotation).toBe(1);
    mapTap(game, tileIndex(map, 20, 20), false);
    expect(cmds).toEqual([]);
    expect(st.stationGhost).toMatchObject({ x: 20, y: 20, dir: 1, length: 3, valid: true });
    rotateStation(game);
    setStationLength(game, 2);
    refreshStationGhost(game, null);
    expect(st.stationGhost).toMatchObject({ x: 20, y: 20, dir: 2, length: 2 });
    confirmAction(game);
    expect(cmds.map((c) => c.type)).toEqual(['placeStation', 'addTrackPiece']);
    expect(cmds[0]).toEqual({ type: 'placeStation', typeId: 'steel_coaster', x: 20, y: 20, dir: 2 });
    expect(st.phase).toBe('pieces');
    expect(dataOf(game.world, st.rideId!).pieces.map((p) => p.defId)).toEqual(['station', 'station']);
  });

  it('desktop: a map click places the station at once', () => {
    const { game, cmds } = setup();
    startStation(game, 'mini_railway');
    mapHover(game, tileIndex(game.world.state.map, 30, 30));
    expect(trackToolOf(game.tool).stationGhost?.x).toBe(30);
    mapTap(game, tileIndex(game.world.state.map, 30, 30), true);
    expect(cmds[0]?.type).toBe('placeStation');
    expect(trackToolOf(game.tool).phase).toBe('pieces');
  });

  it('touch: tap a piece to see its ghost, Build adds it; map taps never add pieces', () => {
    const { game, cmds } = setup();
    const id = place(game.world, 'steel_coaster', 10, 10, EAST);
    enterPieces(game, id);
    const st = trackToolOf(game.tool);
    st.touch = true;
    selectPiece(game, 'straight');
    hoverPiece(game, 'turn_small_left');
    expect(previewPieceId(st)).toBe('straight');
    refreshPieceGhost(game);
    expect(st.pieceGhost?.defId).toBe('straight');
    const ghostTile = st.pieceGhost!.tiles[0]!;
    mapTap(game, ghostTile, false);
    expect(cmds).toEqual([]);
    buildSelected(game);
    expect(cmds).toEqual([{ type: 'addTrackPiece', rideId: id, defId: 'straight' }]);
    // The selection stays while it still fits, so Build can add the same piece again.
    expect(st.selected).toBe('straight');
  });

  it('desktop: hover previews, a click on the ghost builds the selected piece', () => {
    const { game, cmds } = setup();
    const id = place(game.world, 'steel_coaster', 10, 10, EAST);
    enterPieces(game, id);
    const st = trackToolOf(game.tool);
    selectPiece(game, 'straight');
    hoverPiece(game, 'turn_small_right');
    expect(previewPieceId(st)).toBe('turn_small_right');
    hoverPiece(game, null);
    expect(previewPieceId(st)).toBe('straight');
    refreshPieceGhost(game);
    mapTap(game, tileIndex(game.world.state.map, 30, 30), true);
    expect(cmds).toEqual([]);
    mapTap(game, st.pieceGhost!.tiles[0]!, true);
    expect(cmds).toEqual([{ type: 'addTrackPiece', rideId: id, defId: 'straight' }]);
  });

  it('chain and brake options go into the command; options clamp to their ranges', () => {
    const { game, cmds } = setup();
    const id = place(game.world, 'steel_coaster', 10, 10, EAST);
    enterPieces(game, id);
    toggleChain(game);
    selectPiece(game, 'flat_to_gentle_up');
    buildSelected(game);
    expect(cmds.at(-1)).toEqual({ type: 'addTrackPiece', rideId: id, defId: 'flat_to_gentle_up', chain: true });
    selectPiece(game, 'gentle_up_to_flat');
    buildSelected(game);
    toggleChain(game);
    selectPiece(game, 'brakes');
    stepBrakeSpeed(game, 2);
    buildSelected(game);
    expect(cmds.at(-1)).toEqual({ type: 'addTrackPiece', rideId: id, defId: 'brakes', brakeSpeed: 8 });
    for (let i = 0; i < 30; i++) stepBrakeSpeed(game, 1);
    expect(trackToolOf(game.tool).brakeSpeed).toBe(20);
    for (let i = 0; i < 30; i++) stepBrakeSpeed(game, -1);
    expect(trackToolOf(game.tool).brakeSpeed).toBe(2);
    // Mini railway has no chain option.
    const m = place(game.world, 'mini_railway', 30, 30, EAST);
    enterPieces(game, m);
    toggleChain(game);
    expect(trackToolOf(game.tool).chain).toBe(false);
  });

  it('a group key selects a palette group; Esc leaves the builder and keeps the track', () => {
    const { game } = setup();
    const id = place(game.world, 'steel_coaster', 10, 10, EAST);
    enterPieces(game, id);
    selectGroup(game, 'special');
    expect(trackToolOf(game.tool).group).toBe('special');
    leaveBuilder(game);
    expect(game.tool.tool).toBe('inspect');
    expect(trackToolOf(game.tool).phase).toBe('idle');
    expect(game.tool.selectedEntity).toEqual({ kind: 'ride', id });
    expect(takeTrackTab(id)).toBe('track');
    expect(dataOf(game.world, id).pieces.length).toBe(1);
  });
});

describe('undo', () => {
  it('removes the last piece with a full refund before opening; the first station stays', () => {
    const { game } = setup();
    const id = place(game.world, 'steel_coaster', 10, 10, EAST, false);
    enterPieces(game, id);
    selectPiece(game, 'straight');
    const cash0 = game.world.state.park.cash;
    buildSelected(game);
    expect(game.world.state.park.cash).toBe(cash0 - 2500);
    expect(undoPiece(game)?.ok).toBe(true);
    expect(game.world.state.park.cash).toBe(cash0);
    expect(dataOf(game.world, id).pieces.length).toBe(1);
    const r = undoPiece(game);
    expect(r).toEqual({ ok: false, reason: TRACK_ERR.firstStation });
    expect(trackToolOf(game.tool).phase).toBe('pieces');
  });

  it('undo after the circuit closed reopens it and returns to the pieces phase', () => {
    const { game } = setup();
    const id = place(game.world, 'steel_coaster', 4, 2, EAST);
    addAll(game.world, id, R1_PIECES.slice(0, -1));
    enterPieces(game, id);
    selectPiece(game, 'turn_medium_right');
    const r = buildSelected(game);
    expect(r?.ok && r.warnings).toEqual([TRACK_WARN.circuitComplete]);
    const st = trackToolOf(game.tool);
    expect(st.phase).toBe('entrance');
    undoPiece(game);
    expect(st.phase).toBe('pieces');
    expect(dataOf(game.world, id).circuitClosed).toBe(false);
  });
});

describe('gates (§7.1 step 7)', () => {
  it('candidates are the free owned tiles beside the station sides', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 4, 2, EAST);
    addAll(w, id, R1_PIECES);
    const at = (x: number, y: number): number => tileIndex(w.state.map, x, y);
    expect(gateCandidates(w, id).sort((a, b) => a - b)).toEqual([at(4, 1), at(5, 1), at(6, 1), at(4, 3), at(5, 3), at(6, 3)]);
    placeFootpath(w, 5, 3);
    expect(gateCandidates(w, id)).not.toContain(at(5, 3));
    expect(gateGhostAt(w, id, 'entrance', at(5, 3))).toMatchObject({ valid: false, reason: TRACK_ERR.tileNotEmpty });
    expect(gateGhostAt(w, id, 'entrance', at(8, 3))).toMatchObject({ valid: false, reason: TRACK_ERR.gateBesideStation });
    expect(gateGhostAt(w, id, 'exit', at(4, 0))).toMatchObject({ valid: false, reason: TRACK_ERR.outsidePark });
    expect(gateGhostAt(w, id, 'exit', at(6, 3))).toMatchObject({ valid: true, reason: null });
  });

  it('closing the circuit asks for the entrance, then the exit, then opens the Test tab', () => {
    const { game, cmds } = setup();
    const map = game.world.state.map;
    const id = place(game.world, 'steel_coaster', 4, 2, EAST);
    addAll(game.world, id, R1_PIECES.slice(0, -1));
    enterPieces(game, id);
    selectPiece(game, 'turn_medium_right');
    buildSelected(game);
    const st = trackToolOf(game.tool);
    expect(st.phase).toBe('entrance');
    expect(st.gateCandidates).toHaveLength(6);
    // Touch: aim, then confirm.
    st.touch = true;
    mapTap(game, tileIndex(map, 4, 3), false);
    expect(cmds.at(-1)?.type).toBe('addTrackPiece');
    expect(st.gateGhost).toMatchObject({ kind: 'entrance', valid: true });
    confirmAction(game);
    expect(cmds.at(-1)).toEqual({ type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 4, y: 3 });
    expect(st.phase).toBe('exit');
    expect(map.content[tileIndex(map, 4, 3)]).toBe(Content.Building);
    aimGate(game, tileIndex(map, 6, 3));
    expect(placeGateNow(game)?.ok).toBe(true);
    expect(st.phase).toBe('idle');
    expect(game.tool.tool).toBe('inspect');
    expect(game.tool.selectedEntity).toEqual({ kind: 'ride', id });
    expect(takeTrackTab(id)).toBe('test');
    expect(rideOf(game.world, id).exit).not.toBeNull();
  });
});

describe('edit a finished track (§7.4 Track tab)', () => {
  it('an open ride must close first; a closed ride returns to building and keeps its gates', () => {
    const { game } = setup();
    const id = place(game.world, 'steel_coaster', 4, 2, EAST);
    addAll(game.world, id, R1_PIECES);
    game.dispatch({ type: 'placeTrackGate', rideId: id, kind: 'entrance', x: 4, y: 3 });
    game.dispatch({ type: 'placeTrackGate', rideId: id, kind: 'exit', x: 6, y: 3 });
    game.dispatch({ type: 'startTestRun', rideId: id });
    for (let i = 0; i < 1100; i++) game.step(1);
    expect(game.dispatch({ type: 'setRideOpen', rideId: id, open: true }).ok).toBe(true);
    expect(editTrackRide(game, id)).toBe(false);
    expect(game.tool.tool).toBe('inspect');
    game.dispatch({ type: 'setRideOpen', rideId: id, open: false });
    for (let i = 0; i < 2000 && !editTrackRide(game, id); i++) game.step(1);
    const st = trackToolOf(game.tool);
    expect(rideOf(game.world, id).status).toBe('building');
    expect(game.tool.tool).toBe('track');
    // Both gates stand, so the builder stays on the closed circuit for Undo instead of finishing.
    expect(st.phase).toBe('pieces');
    expect(paletteFor(game.world, id).every((g) => g.pieces.length === 0)).toBe(true);
    undoPiece(game);
    expect(paletteFor(game.world, id).find((g) => g.id === 'turns')!.pieces.length).toBeGreaterThan(0);
    selectPiece(game, 'turn_medium_right');
    buildSelected(game);
    // Closed again with both gates: the ride panel opens on the Test tab.
    expect(st.phase).toBe('idle');
    expect(takeTrackTab(id)).toBe('test');
  });
});
