/**
 * R1 (owner 2026-11-12; plan ride-work-1 Task 8): Auto-finish in the builder. The search runs over frames
 * (`stepAutoFinishUi`), the found path shows with its piece count and price, Confirm sends one `autoFinishTrack`
 * command with the shown pieces, and a track change or leaving the builder cancels it. Pure: a real `Game`, no DOM.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../../../../src/game';
import { TRACK_ERR, TRACK_WARN } from '../../../../src/data/strings/track';
import { trackToolOf } from '../../../../src/render/track/toolState';
import type { Command } from '../../../../src/sim/commands/types';
import { Content, tileIndex } from '../../../../src/sim/map';
import { findClosingPath } from '../../../../src/sim/rides/track/autoFinish';
import { trackEnd } from '../../../../src/sim/rides/track/build';
import { trackKeyDown } from '../../../../src/input/track';
import {
  autoFinishAvailable,
  buildSelected,
  cancelAutoFinish,
  confirmAction,
  confirmAutoFinish,
  enterPieces,
  leaveBuilder,
  selectPiece,
  startAutoFinishUi,
  stepAutoFinishUi,
  undoPiece,
} from '../../../../src/ui/track/builder';
import { makeTestWorld } from '../../../helpers/world';
import { addAll, dataOf, EAST, NEAR_LIMIT_DROP_PIECES, place, R1_PIECES, rideOf, SHARP_TURN_PIECES, UNSAFE_DROP_PIECES, writePieces, type PieceSpec } from '../../track/helpers';
import { getTrackTypeDef } from '../../../../src/data/track';
import { fillTrackString } from '../../../../src/data/strings/track';
import { firstUnsafeSection } from '../../../../src/sim/rides/track/projection';

/** A game in the piece step of R1 without its last five pieces. */
function setup(): { game: Game; id: number; cmds: Command[] } {
  const game = new Game(makeTestWorld());
  const id = place(game.world, 'steel_coaster', 4, 2, EAST);
  addAll(game.world, id, R1_PIECES.slice(0, R1_PIECES.length - 5));
  enterPieces(game, id);
  const cmds: Command[] = [];
  game.onCommand((c) => cmds.push(c));
  return { game, id, cmds };
}

function runSearch(game: Game): void {
  const st = trackToolOf(game.tool);
  for (let i = 0; i < 500 && st.autoFinish?.state === 'searching'; i++) stepAutoFinishUi(game);
}

/** A game in the piece step of a Steel Coaster laid from `pieces` (written as they are, unsafe pieces included). */
function setupWritten(pieces: PieceSpec[]): { game: Game; id: number } {
  const game = new Game(makeTestWorld());
  const id = place(game.world, 'steel_coaster', 4, 2, EAST);
  writePieces(game.world, id, pieces);
  enterPieces(game, id);
  return { game, id };
}

describe('Auto-finish in the builder (R1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('searches over frames, then shows the path, its piece count and price', () => {
    const { game, id } = setup();
    const st = trackToolOf(game.tool);
    expect(autoFinishAvailable(game)).toBe(true);
    startAutoFinishUi(game);
    expect(st.autoFinish?.state).toBe('searching');
    expect(autoFinishAvailable(game)).toBe(false);
    runSearch(game);
    const ref = findClosingPath(game.world, id);
    if (ref.kind !== 'found') throw new Error('no path');
    expect(st.autoFinish).toMatchObject({ state: 'found', affordable: true, cost: ref.cost });
    expect(st.autoFinish!.pieces).toEqual(ref.pieces);
  });

  it('Confirm sends one autoFinishTrack command with the shown pieces and closes the circuit', () => {
    const { game, id, cmds } = setup();
    const st = trackToolOf(game.tool);
    startAutoFinishUi(game);
    runSearch(game);
    const shown = st.autoFinish!.pieces;
    const n0 = dataOf(game.world, id).pieces.length;
    const r = confirmAutoFinish(game);
    expect(r?.ok).toBe(true);
    expect(r?.ok && r.warnings).toEqual([TRACK_WARN.circuitComplete]);
    expect(cmds.filter((c) => c.type === 'autoFinishTrack')).toHaveLength(1);
    expect(cmds.at(-1)).toEqual({ type: 'autoFinishTrack', rideId: id, pieces: shown.map((p) => ({ defId: p.defId, chain: p.chain })) });
    expect(dataOf(game.world, id).circuitClosed).toBe(true);
    expect(dataOf(game.world, id).pieces.length).toBe(n0 + shown.length);
    expect(st.autoFinish).toBeNull();
    // The builder asks for the gates next (§7.1 step 7), as after a closing piece; Undo removes one piece.
    expect(st.phase).toBe('entrance');
    undoPiece(game);
    expect(dataOf(game.world, id).pieces.length).toBe(n0 + shown.length - 1);
  });

  it('a path with brakes (owner 2026-11-12) is confirmed with each brake speed', () => {
    // The 64 m climb of NEAR_LIMIT_DROP_PIECES cut just after its drop: the way back brakes before its turns.
    const game = new Game(makeTestWorld());
    const id = place(game.world, 'steel_coaster', 4, 2, EAST);
    addAll(game.world, id, NEAR_LIMIT_DROP_PIECES.slice(0, NEAR_LIMIT_DROP_PIECES.indexOf('gentle_down_to_flat') + 1));
    enterPieces(game, id);
    const cmds: Command[] = [];
    game.onCommand((c) => cmds.push(c));
    const st = trackToolOf(game.tool);
    startAutoFinishUi(game);
    runSearch(game);
    expect(st.autoFinish?.state).toBe('found');
    const shown = st.autoFinish!.pieces;
    expect(shown.some((p) => p.defId === 'brakes')).toBe(true);
    const r = confirmAutoFinish(game);
    expect(r?.ok).toBe(true);
    expect(cmds.at(-1)).toEqual({
      type: 'autoFinishTrack',
      rideId: id,
      pieces: shown.map((p) => (p.defId === 'brakes' ? { defId: p.defId, chain: p.chain, brakeSpeed: p.brakeSpeed } : { defId: p.defId, chain: p.chain })),
    });
    expect(dataOf(game.world, id).pieces.slice(-shown.length)).toEqual(shown);
  });

  it('Enter confirms a found path; Escape cancels it first and leaves the builder only after', () => {
    const a = setup();
    startAutoFinishUi(a.game);
    runSearch(a.game);
    trackKeyDown(a.game, 'Enter');
    expect(a.cmds.filter((c) => c.type === 'autoFinishTrack')).toHaveLength(1);
    const b = setup();
    const st = trackToolOf(b.game.tool);
    startAutoFinishUi(b.game);
    trackKeyDown(b.game, 'Escape');
    expect(st.autoFinish).toBeNull();
    expect(st.phase).toBe('pieces');
    trackKeyDown(b.game, 'Escape');
    expect(st.phase).toBe('idle');
  });

  it('Build and Enter add no piece while a path is shown', () => {
    const { game, id, cmds } = setup();
    selectPiece(game, 'straight');
    startAutoFinishUi(game);
    expect(buildSelected(game)).toBeNull();
    runSearch(game);
    expect(buildSelected(game)).toBeNull();
    expect(cmds.some((c) => c.type === 'addTrackPiece')).toBe(false);
    expect(dataOf(game.world, id).circuitClosed).toBe(false);
  });

  it('without the cash the path shows but Confirm sends nothing', () => {
    const { game, cmds } = setup();
    const st = trackToolOf(game.tool);
    startAutoFinishUi(game);
    runSearch(game);
    game.world.state.park.cash = st.autoFinish!.cost - 1;
    stepAutoFinishUi(game);
    expect(st.autoFinish).toMatchObject({ state: 'found', affordable: false });
    expect(confirmAutoFinish(game)).toBeNull();
    confirmAction(game);
    expect(cmds).toHaveLength(0);
    game.world.state.park.cash = st.autoFinish!.cost;
    stepAutoFinishUi(game);
    expect(st.autoFinish?.affordable).toBe(true);
  });

  it('a track change cancels the search; leaving the builder cancels it; Cancel drops the path', () => {
    const { game, id } = setup();
    const st = trackToolOf(game.tool);
    startAutoFinishUi(game);
    undoPiece(game);
    stepAutoFinishUi(game);
    expect(st.autoFinish).toBeNull();
    // A change made elsewhere (another command) is noticed on the next frame too.
    startAutoFinishUi(game);
    game.dispatch({ type: 'addTrackPiece', rideId: id, defId: 'straight' });
    stepAutoFinishUi(game);
    expect(st.autoFinish).toBeNull();
    startAutoFinishUi(game);
    leaveBuilder(game);
    expect(st.autoFinish).toBeNull();
    stepAutoFinishUi(game);
    expect(st.autoFinish).toBeNull();
    enterPieces(game, id);
    startAutoFinishUi(game);
    runSearch(game);
    cancelAutoFinish(game);
    expect(st.autoFinish).toBeNull();
    expect(dataOf(game.world, id).circuitClosed).toBe(false);
  });

  it('none shows the reason', () => {
    const { game, id } = setup();
    const st = trackToolOf(game.tool);
    const map = game.world.state.map;
    const end = trackEnd(game.world, rideOf(game.world, id), dataOf(game.world, id));
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const i = tileIndex(map, end.x + dx, end.y + dy);
        if (map.content[i] === Content.Empty) map.content[i] = Content.Building;
      }
    }
    startAutoFinishUi(game);
    runSearch(game);
    expect(st.autoFinish).toMatchObject({ state: 'none', reason: TRACK_ERR.autoFinishNone });
    // The button is back.
    expect(autoFinishAvailable(game)).toBe(true);
  });
  it('stops after 3 s of waiting on the device and shows what to change (fake clock)', () => {
    // Owner 2026-11-12: the builder hands the search its clock; 1 ms passes per reading here.
    let t = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (t += 1));
    const { game } = setupWritten(UNSAFE_DROP_PIECES.slice(0, 12));
    const st = trackToolOf(game.tool);
    startAutoFinishUi(game);
    const t0 = t;
    for (let i = 0; i < 2_000 && st.autoFinish?.state === 'searching'; i++) stepAutoFinishUi(game);
    expect(st.autoFinish).toMatchObject({ state: 'none', reason: TRACK_ERR.autoFinishGaveUp });
    expect(t - t0).toBeGreaterThanOrEqual(3_000);
    expect(t - t0).toBeLessThan(3_100);
    expect(autoFinishAvailable(game)).toBe(true);
  });

  it('a track with a piece over a hard limit is answered on the first frame, naming that piece', () => {
    const { game, id } = setupWritten(SHARP_TURN_PIECES.slice(0, 30));
    const st = trackToolOf(game.tool);
    const d = dataOf(game.world, id);
    const unsafe = firstUnsafeSection(d.pieces, getTrackTypeDef('steel_coaster')!, d.trainConfig.carsPerTrain);
    expect(unsafe).not.toBeNull();
    startAutoFinishUi(game);
    stepAutoFinishUi(game);
    expect(st.autoFinish).toMatchObject({ state: 'none', reason: fillTrackString(TRACK_ERR.autoFinishUnsafeFirst, { n: unsafe!.pieceIndex + 1 }) });
  });
});
