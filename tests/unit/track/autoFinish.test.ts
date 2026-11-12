/**
 * R1 / R8 (owner 2026-11-12; plan ride-work-1 Task 7): Auto-finish. A bounded, deterministic, time-sliced search from
 * the track end back to the station's entry over the ride's plain pieces. Every piece passes the same tile rules and the
 * same build-time projection as `addTrackPiece`; a closing path is offered only when its closed test lap passes with no
 * hard safety limit passed. One command, `autoFinishTrack`, builds the whole path or nothing.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/sim/research/api', () => ({ isUnlocked: () => true }));

import { getTrackPieceDef, getTrackTypeDef, type TrackPieceDef, type TrackTypeDef } from '../../../src/data/track';
import { AUTO_FINISH, BRAKE_SPEED } from '../../../src/data/tuning/track';
import { TRACK_ERR, TRACK_WARN, fillTrackString } from '../../../src/data/strings/track';
import { executeCommand } from '../../../src/sim/commands';
import type { CommandResult } from '../../../src/sim/commands/types';
import { Content, tileIndex } from '../../../src/sim/map';
import {
  findClosingPath,
  isPlainPiece,
  planPath,
  startAutoFinish,
  type AutoFinishOutcome,
  type AutoPiece,
} from '../../../src/sim/rides/track/autoFinish';
import { trackEnd } from '../../../src/sim/rides/track/build';
import { jointsEqual, pieceEntryJoint, pieceExitJoint, pieceWorldTiles } from '../../../src/sim/rides/track/geometry';
import { checkPieceTiles } from '../../../src/sim/rides/track/placement';
import { firstUnsafeSection, projectPrefix } from '../../../src/sim/rides/track/projection';
import { safetyBreachOf } from '../../../src/sim/rides/track/safety';
import { runTestLapDetailed } from '../../../src/sim/rides/track/testRun';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, stateHash } from '../../helpers/world';
import {
  add,
  addAll,
  dataOf,
  EAST,
  expectOk,
  NEAR_LIMIT_DROP_PIECES,
  place,
  R1_PIECES,
  rideOf,
  SHARP_TURN_PIECES,
  times,
  UNSAFE_DROP_PIECES,
  writePieces,
  type PieceSpec,
} from './helpers';

type Found = Extract<AutoFinishOutcome, { kind: 'found' }>;

function reasonOf(r: CommandResult): string {
  if (r.ok) throw new Error('expected a refusal');
  return r.reason;
}

function found(o: AutoFinishOutcome): Found {
  if (o.kind !== 'found') throw new Error(`no path: ${o.reason}`);
  return o;
}

/** R1 (Steel Coaster at (4, 2) heading +x) without its last `missing` pieces, built by commands. */
function r1Open(missing = 5, setup = true): { w: World; id: number } {
  const w = makeTestWorld();
  const id = place(w, 'steel_coaster', 4, 2, EAST, setup);
  addAll(w, id, R1_PIECES.slice(0, R1_PIECES.length - missing), setup);
  return { w, id };
}

function cmdOf(id: number, f: Found): { type: 'autoFinishTrack'; rideId: number; pieces: AutoPiece[] } {
  return {
    type: 'autoFinishTrack',
    rideId: id,
    pieces: f.pieces.map((p) => (p.brakeSpeed === null ? { defId: p.defId, chain: p.chain } : { defId: p.defId, chain: p.chain, brakeSpeed: p.brakeSpeed })),
  };
}

/**
 * Owner 2026-11-12 ("Allow brakes + 3 s limit"): the 64 m climb of `NEAR_LIMIT_DROP_PIECES` cut just after its drop, on
 * the flat at about 33 m/s with no brakes yet. Without brakes no plain turn is safe at that speed (lateral over 3.00 G).
 */
function afterBigDrop(setup = true): { w: World; id: number } {
  const w = makeTestWorld();
  const id = place(w, 'steel_coaster', 4, 2, EAST, setup);
  const valleyEnd = NEAR_LIMIT_DROP_PIECES.findIndex((p) => p === 'gentle_down_to_flat');
  addAll(w, id, NEAR_LIMIT_DROP_PIECES.slice(0, valleyEnd + 1), setup);
  return { w, id };
}

const steel = getTrackTypeDef('steel_coaster') as TrackTypeDef;

describe('Auto-finish search (R1, R8)', () => {
  it('closes R1 when its last five pieces are missing, with a safe passing lap', () => {
    const { w, id } = r1Open();
    const f = found(findClosingPath(w, id));
    const d = dataOf(w, id);
    expect(jointsEqual(pieceExitJoint(f.pieces.at(-1)!), pieceEntryJoint(d.pieces[0]!))).toBe(true);
    expect(f.test.passed).toBe(true);
    expect(safetyBreachOf(f.test)).toBeNull();
    expect(f.pieces.length).toBeGreaterThan(0);
    expect(f.pieces.length).toBeLessThanOrEqual(AUTO_FINISH.maxPieces);
    expect(f.cost).toBe(f.pieces.reduce((s, p) => s + p.cost, 0));
    // R8: the strongest car of the finished circuit stays within the hard limits too.
    const lap = runTestLapDetailed(w.state.map, { ...d, pieces: [...d.pieces, ...f.pieces], circuitClosed: true }, steel);
    expect(lap.result.passed).toBe(true);
    expect(lap.breach).toBeNull();
    // The search changes nothing.
    expect(d.circuitClosed).toBe(false);
  });

  it('is deterministic and independent of how it is sliced (a run that finishes within the time limit)', () => {
    const a = findClosingPath(r1Open().w, r1Open().id);
    // Fake clocks (1 ms per reading), so the run is the same on every machine; it ends long before the time limit.
    let ta = 0;
    let tb = 0;
    const b = r1Open();
    const s = startAutoFinish(b.w, b.id, {}, () => ta++);
    let o: AutoFinishOutcome | null = null;
    while (!(o = s.step(1)));
    const c = r1Open();
    const t = startAutoFinish(c.w, c.id, {}, () => tb++);
    let p: AutoFinishOutcome | null = null;
    while (!(p = t.step(100)));
    expect(o).toEqual(a);
    expect(p).toEqual(a);
    expect(s.nodes).toBe(t.nodes);
    expect(Math.max(ta, tb)).toBeLessThan(AUTO_FINISH.timeLimitMs);
    // Once finished, further steps return the same outcome.
    expect(t.step(100)).toEqual(a);
  });

  it('every found path builds piece by piece with addTrackPiece to the same track and cost', () => {
    const one = r1Open(5, false);
    const f = found(findClosingPath(one.w, one.id));
    const cash0 = one.w.state.park.cash;
    for (const p of f.pieces) expectOk(add(one.w, one.id, { id: p.defId, chain: p.chain }, false));
    const d = dataOf(one.w, one.id);
    expect(d.circuitClosed).toBe(true);
    expect(d.pieces.slice(-f.pieces.length)).toEqual(f.pieces);
    expect(cash0 - one.w.state.park.cash).toBe(f.cost);
  });

  it('the command builds the whole path at once; cash drops by the shown cost', () => {
    const { w, id } = r1Open(5, false);
    const f = found(findClosingPath(w, id));
    const n0 = dataOf(w, id).pieces.length;
    const cash0 = w.state.park.cash;
    const r = expectOk(executeCommand(w, cmdOf(id, f), { setup: false }));
    expect(r.cost).toBe(f.cost);
    expect(r.warnings).toEqual([TRACK_WARN.circuitComplete]);
    const d = dataOf(w, id);
    expect(d.circuitClosed).toBe(true);
    expect(d.pieces.length).toBe(n0 + f.pieces.length);
    expect(d.pieces.slice(n0)).toEqual(f.pieces);
    expect(cash0 - w.state.park.cash).toBe(f.cost);
    // Undo removes pieces one at a time.
    expectOk(executeCommand(w, { type: 'removeLastTrackPiece', rideId: id }, { setup: false }));
    expect(dataOf(w, id).pieces.length).toBe(n0 + f.pieces.length - 1);
    expect(dataOf(w, id).circuitClosed).toBe(false);
  });

  it('the command changes nothing when the world changed after the search', () => {
    const { w, id } = r1Open(5, false);
    const f = found(findClosingPath(w, id));
    // Lay a footpath on the ground under the middle piece of the found path.
    const mid = f.pieces[Math.floor(f.pieces.length / 2)]!;
    const t = pieceWorldTiles(mid)[0]!;
    w.state.map.content[tileIndex(w.state.map, t.x, t.y)] = Content.Footpath;
    const h0 = stateHash(w);
    expect(reasonOf(executeCommand(w, cmdOf(id, f), { setup: false }))).toBe(TRACK_ERR.hitsPath);
    expect(stateHash(w)).toBe(h0);
  });

  it('not enough cash: the search finds the path, the command refuses and changes nothing', () => {
    const { w, id } = r1Open(5, false);
    const f = found(findClosingPath(w, id));
    w.state.park.cash = f.cost - 1;
    // The search does not depend on the cash.
    expect(findClosingPath(w, id)).toEqual(f);
    const h0 = stateHash(w);
    expect(reasonOf(executeCommand(w, cmdOf(id, f), { setup: false }))).toBe(TRACK_ERR.notEnoughCash);
    expect(stateHash(w)).toBe(h0);
    w.state.park.cash = f.cost;
    expectOk(executeCommand(w, cmdOf(id, f), { setup: false }));
    expect(w.state.park.cash).toBe(0);
  });

  it('the command refuses a list that does not close, an empty list and a closed circuit, changing nothing', () => {
    const { w, id } = r1Open(5, false);
    const f = found(findClosingPath(w, id));
    const h0 = stateHash(w);
    const short = { ...cmdOf(id, f), pieces: cmdOf(id, f).pieces.slice(0, -1) };
    expect(reasonOf(executeCommand(w, short, { setup: false }))).toBe(TRACK_ERR.autoFinishNotClosing);
    expect(reasonOf(executeCommand(w, { ...short, pieces: [] }, { setup: false }))).toBe(TRACK_ERR.autoFinishNotClosing);
    // A piece another ride type has, or a special piece, is not a plain piece of this ride.
    const special = { ...short, pieces: [...short.pieces, { defId: 'vertical_loop_right', chain: false }] };
    expect(reasonOf(executeCommand(w, special, { setup: false }))).toBe(TRACK_ERR.typeCannotUse);
    expect(stateHash(w)).toBe(h0);
    expectOk(executeCommand(w, cmdOf(id, f), { setup: false }));
    expect(reasonOf(executeCommand(w, cmdOf(id, f), { setup: false }))).toBe(TRACK_ERR.circuitAlreadyComplete);
  });

  it('planPath refuses a closing path when the train stops before it (R8)', () => {
    const { w, id } = r1Open(5);
    const f = found(findClosingPath(w, id));
    // Take the chain off the whole lift: the train now stops on it.
    for (let i = 2; i <= 6; i++) expectOk(executeCommand(w, { type: 'setPieceOptions', rideId: id, index: i, chain: false }));
    const d = dataOf(w, id);
    const stall = projectPrefix(d, steel).stall;
    expect(stall).not.toBeNull();
    const r = planPath(w, rideOf(w, id), d, steel, cmdOf(id, f).pieces, { setup: true });
    expect(r).toEqual({ ok: false, reason: fillTrackString(TRACK_ERR.autoFinishStallsFirst, { n: stall!.piece + 1 }), index: null });
  });

  it('a track whose train already stops says where instead of searching', () => {
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 4, 2, EAST);
    addAll(w, id, ['station', 'station', 'flat_to_gentle_up', ...times(6, 'gentle_up'), 'gentle_up_to_flat', ...times(4, 'straight')]);
    const stall = projectPrefix(dataOf(w, id), steel).stall;
    expect(stall).not.toBeNull();
    const s = startAutoFinish(w, id);
    expect(s.step(Infinity)).toEqual({ kind: 'none', reason: fillTrackString(TRACK_ERR.autoFinishStallsFirst, { n: stall!.piece + 1 }) });
    expect(s.nodes).toBe(0);
  });

  it('a walled-in track end gives none within the node limit', () => {
    const { w, id } = r1Open();
    const end = trackEnd(w, rideOf(w, id), dataOf(w, id));
    // Buildings on every free tile round the track end (and on it): no piece can be laid from it.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const i = tileIndex(w.state.map, end.x + dx, end.y + dy);
        if (w.state.map.content[i] === Content.Empty) w.state.map.content[i] = Content.Building;
      }
    }
    const s = startAutoFinish(w, id);
    expect(s.step(Infinity)).toEqual({ kind: 'none', reason: TRACK_ERR.autoFinishNone });
    expect(s.nodes).toBeLessThanOrEqual(AUTO_FINISH.nodeLimit);
  });

  it('stops at the node limit and tells the player what to change', () => {
    // A far track end with a low limit: the search gives up instead of running on.
    const { w, id } = r1Open(5);
    const s = startAutoFinish(w, id, { nodeLimit: 3 });
    expect(s.step(Infinity)).toEqual({ kind: 'none', reason: TRACK_ERR.autoFinishGaveUp });
    expect(s.nodes).toBe(3);
  });

  it('a track end with no safe way back stops at the node budget (about 3 s on the reference desktop)', () => {
    // Owner 2026-11-12: the 70 m climb of UNSAFE_DROP_PIECES cut high on its lift; every way down passes 6.0 G.
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 4, 2, EAST);
    writePieces(w, id, UNSAFE_DROP_PIECES.slice(0, 12));
    const s = startAutoFinish(w, id);
    expect(s.step(Infinity)).toEqual({ kind: 'none', reason: TRACK_ERR.autoFinishGaveUp });
    expect(s.nodes).toBe(AUTO_FINISH.nodeLimit);
    expect(TRACK_ERR.autoFinishGaveUp).toBe('No safe way back found: build closer to the station or lower the track');
  }, 60_000);

  it('stops after 3,000 ms of waiting on the player\'s device (fake clock) and says what to change', () => {
    // Owner 2026-11-12: the time limit, not the node budget, ends a long search. UNSAFE_DROP_PIECES cut high on its
    // lift spends the whole node budget without a clock; with one it stops when 3,000 ms have passed since the start.
    expect(AUTO_FINISH.timeLimitMs).toBe(3_000);
    const w = makeTestWorld();
    const id = place(w, 'steel_coaster', 4, 2, EAST);
    writePieces(w, id, UNSAFE_DROP_PIECES.slice(0, 12));
    // Frames 10 ms apart, the clock still within a frame: the frame at 2,990 ms searches, the one at 3,000 ms stops.
    let t = 50_000;
    const s = startAutoFinish(w, id, {}, () => t);
    let o: AutoFinishOutcome | null = null;
    let frames = 0;
    let nodesBefore = 0;
    while (!o && frames < 1_000) {
      nodesBefore = s.nodes;
      o = s.step(AUTO_FINISH.nodesPerSlice);
      frames++;
      if (!o) t += 10;
    }
    expect(o).toEqual({ kind: 'none', reason: TRACK_ERR.autoFinishGaveUp });
    expect(t - 50_000).toBe(AUTO_FINISH.timeLimitMs);
    expect(frames).toBe(301);
    expect(s.nodes).toBe(nodesBefore);
    expect(s.nodes).toBeGreaterThan(0);
    expect(s.nodes).toBeLessThan(AUTO_FINISH.nodeLimit);
    // A clock that moves within a slice stops the search within that slice.
    let u = 0;
    const r = startAutoFinish(w, id, {}, () => (u += 1));
    expect(r.step(Number.POSITIVE_INFINITY)).toEqual({ kind: 'none', reason: TRACK_ERR.autoFinishGaveUp });
    expect(r.nodes).toBeLessThan(AUTO_FINISH.timeLimitMs);
    expect(u).toBeGreaterThanOrEqual(AUTO_FINISH.timeLimitMs);
  });

  it('a track that already holds a piece over a hard safety limit is answered at once, naming the piece Open names', () => {
    expect(TRACK_ERR.autoFinishUnsafeFirst).toBe('Piece {n} is over the safety limit: fix it first');
    for (const [pieces, cut] of [
      [SHARP_TURN_PIECES, 30],
      [UNSAFE_DROP_PIECES, 40],
    ] as const) {
      const w = makeTestWorld();
      const id = place(w, 'steel_coaster', 4, 2, EAST);
      writePieces(w, id, pieces.slice(0, cut));
      const d = dataOf(w, id);
      const unsafe = firstUnsafeSection(d.pieces, steel, d.trainConfig.carsPerTrain);
      expect(unsafe).not.toBeNull();
      const reason = fillTrackString(TRACK_ERR.autoFinishUnsafeFirst, { n: unsafe!.pieceIndex + 1 });
      let readings = 0;
      const s = startAutoFinish(w, id, {}, () => readings++);
      expect(s.step(1)).toEqual({ kind: 'none', reason });
      expect(s.nodes).toBe(0);
      // The command refuses the same way, before it looks at the pieces.
      expect(planPath(w, rideOf(w, id), d, steel, [{ defId: 'straight', chain: false }], { setup: true })).toEqual({ ok: false, reason, index: null });
    }
  });

  it('a closed circuit and an empty track are refused at once', () => {
    const { w, id } = r1Open(0);
    expect(findClosingPath(w, id)).toEqual({ kind: 'none', reason: TRACK_ERR.circuitAlreadyComplete });
  });

  it('may use plain brakes (owner 2026-11-12), never block brakes or special pieces', () => {
    const def = (id: string): TrackPieceDef => getTrackPieceDef(id) as TrackPieceDef;
    expect(isPlainPiece(steel, def('brakes'))).toBe(true);
    expect(isPlainPiece(steel, def('block_brake'))).toBe(false);
    expect(isPlainPiece(steel, def('vertical_loop_right'))).toBe(false);
    expect(AUTO_FINISH.brakeSpeeds.length).toBeGreaterThan(0);
    for (const v of AUTO_FINISH.brakeSpeeds) expect(Number.isInteger(v) && v >= BRAKE_SPEED.min && v <= BRAKE_SPEED.max).toBe(true);
  });

  it('finds a way back after a big drop by braking before the turns (owner 2026-11-12)', () => {
    const { w, id } = afterBigDrop();
    const f = found(findClosingPath(w, id));
    const brakes = f.pieces.filter((p) => p.defId === 'brakes');
    expect(brakes.length).toBeGreaterThan(0);
    for (const b of brakes) expect(AUTO_FINISH.brakeSpeeds).toContain(b.brakeSpeed);
    expect(f.pieces.some((p) => p.defId === 'block_brake')).toBe(false);
    for (const p of f.pieces) expect(p.brakeSpeed === null).toBe(p.defId !== 'brakes');
    // R8: the finished lap passes and its strongest car stays within the hard limits.
    const d = dataOf(w, id);
    const lap = runTestLapDetailed(w.state.map, { ...d, pieces: [...d.pieces, ...f.pieces], circuitClosed: true }, steel);
    expect(lap.result.passed).toBe(true);
    expect(lap.breach).toBeNull();
    expect(f.test).toEqual(lap.result);
  });

  it('a path with brakes is the same however the search is sliced, and builds with the command and piece by piece', () => {
    const a = found(findClosingPath(afterBigDrop().w, afterBigDrop().id));
    const b = afterBigDrop();
    const s = startAutoFinish(b.w, b.id);
    let o: AutoFinishOutcome | null = null;
    while (!(o = s.step(7)));
    expect(o).toEqual(a);
    // The command, with the brake speeds.
    const c = afterBigDrop(false);
    const cash0 = c.w.state.park.cash;
    expectOk(executeCommand(c.w, cmdOf(c.id, a), { setup: false }));
    expect(dataOf(c.w, c.id).circuitClosed).toBe(true);
    expect(dataOf(c.w, c.id).pieces.slice(-a.pieces.length)).toEqual(a.pieces);
    expect(cash0 - c.w.state.park.cash).toBe(a.cost);
    // Piece by piece with addTrackPiece.
    const e = afterBigDrop(false);
    for (const p of a.pieces) expectOk(add(e.w, e.id, p.brakeSpeed === null ? { id: p.defId, chain: p.chain } : { id: p.defId, chain: p.chain, brakeSpeed: p.brakeSpeed }, false));
    expect(dataOf(e.w, e.id).pieces.slice(-a.pieces.length)).toEqual(a.pieces);
  });

  it('the command checks brake speeds like addTrackPiece', () => {
    const { w, id } = afterBigDrop(false);
    const f = found(findClosingPath(w, id));
    const cmd = cmdOf(id, f);
    const k = cmd.pieces.findIndex((p) => p.defId === 'brakes');
    const h0 = stateHash(w);
    const withSpeed = (speed: number): typeof cmd => ({ ...cmd, pieces: cmd.pieces.map((p, i) => (i === k ? { ...p, brakeSpeed: speed } : p)) });
    expect(reasonOf(executeCommand(w, withSpeed(BRAKE_SPEED.max + 1), { setup: false }))).toBe(TRACK_ERR.brakeSpeedRange);
    expect(reasonOf(executeCommand(w, withSpeed(2.5), { setup: false }))).toBe(TRACK_ERR.brakeSpeedRange);
    // A brake speed on a piece that is not a brake is refused.
    const j = cmd.pieces.findIndex((p) => p.defId !== 'brakes');
    const other = { ...cmd, pieces: cmd.pieces.map((p, i) => (i === j ? { ...p, brakeSpeed: 6 } : p)) };
    expect(reasonOf(executeCommand(w, other, { setup: false }))).toBe(TRACK_ERR.typeCannotUse);
    expect(stateHash(w)).toBe(h0);
  });

  const OTHER: { typeId: string; specs: PieceSpec[] }[] = [
    {
      typeId: 'junior_coaster',
      specs: ['station', 'station', { id: 'flat_to_gentle_up', chain: true }, { id: 'gentle_up_to_flat', chain: true }, 'flat_to_gentle_down', 'gentle_down_to_flat', 'straight', 'turn_medium_right', 'straight'],
    },
    { typeId: 'mini_railway', specs: ['station', ...times(4, 'straight'), 'turn_medium_right', 'straight'] },
    { typeId: 'log_flume', specs: ['flume_station', 'flume_lift', 'flume_straight', 'flume_turn_small_r', 'flume_slope_down', 'flume_straight'] },
  ];
  for (const c of OTHER) {
    it(`works for a ${c.typeId} end`, () => {
      const w = makeTestWorld();
      const id = place(w, c.typeId, 10, 10, EAST);
      addAll(w, id, c.specs);
      const f = found(findClosingPath(w, id));
      expect(f.test.passed).toBe(true);
      expectOk(executeCommand(w, cmdOf(id, f), { setup: true }));
      expect(dataOf(w, id).circuitClosed).toBe(true);
    });
  }

  it('checkPieceTiles without options is unchanged; with the defaults spelt out it gives the same answer', () => {
    const { w, id } = r1Open();
    const d = dataOf(w, id);
    const end = trackEnd(w, rideOf(w, id), d);
    const piece = { defId: 'straight', x: end.x, y: end.y, z: end.z, dir: end.dir, chain: false, brakeSpeed: null, cost: 0 };
    const a = checkPieceTiles(w, id, d.pieces.length, piece, steel, d.pieces);
    const b = checkPieceTiles(w, id, d.pieces.length, piece, steel, d.pieces, {});
    expect(b).toEqual(a);
    expect(a.ok && typeof a.runAfter).toBe('number');
  });
});
