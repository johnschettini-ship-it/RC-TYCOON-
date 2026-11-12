/**
 * Auto-finish (R1, R8, owner 2026-11-12; plan ride-work-1 decision 9, Task 7). Owner: W1-G.
 *
 * A weighted A* search from the track end back to the station's entry joint over the ride's plain pieces (its own set
 * and groups, `special === null`, no loops, corkscrews or helices); a chainable piece gets a chain only where the
 * projected train would stop on it without one. Every piece of a path passes the same rules as `addTrackPiece` would apply once the pieces before it are
 * built: the tile rules (`checkPieceTiles`, with the path's own pieces as extra envelopes) and the build-time projection
 * (R5/R7: no hard limit passed); the search also skips a piece on which the projected train stops. A closing path is
 * offered only when the finished circuit's test lap passes with no hard limit passed (R8, strongest car).
 *
 * Deterministic: priority `f = g + weight·h` (g: track length added, mm; h: a tile-distance estimate, mm), ties by
 * lower h, then insertion order; children in piece-table order; one visit per joint.
 * Bounded: `AUTO_FINISH` limits the pieces, the expanded nodes and the closed laps. Time-sliced: `step(n)` takes at
 * most n nodes off the open list, and the answer never depends on how the search is sliced. Pure: reads the world,
 * changes nothing.
 *
 * `planPath` re-checks a given list in the same way (the `autoFinishTrack` command), so the command refuses a path
 * the world no longer allows (a path laid across it, or cash spent) and changes nothing.
 */
import { getTrackPieceDef, type TrackPieceDef, type TrackTypeDef } from '../../../data/track';
import { TRACK_ERR, fillTrackString } from '../../../data/strings/track';
import { AUTO_FINISH, CHAIN_EXTRA_CENTS, MAX_PIECES, STEEP_RISE_M, TILE_MM } from '../../../data/tuning/track';
import type { CommandContext } from '../../commands/types';
import { canAfford } from '../../economy/ledger';
import type { World } from '../../types';
import type { Cents } from '../../units';
import type { Ride } from '../types';
import { trackEnd, type PiecePlan } from './build';
import { trackContext } from './common';
import { jointsEqual, pieceEntryJoint, pieceExitJoint, piecesForEnd, type Joint } from './geometry';
import { buildOccupancy, checkPieceTiles, pieceCost, trailingUnsupported, type Occupancy, type TilePlan } from './placement';
import { continueProjection, projectPrefix, type ProjectionSnapshot, type SectionProjection } from './projection';
import { unsafePieceReason } from './safety';
import { runTestLapDetailed } from './testRun';
import type { TestResult, TrackPieceInstance, TrackRideData } from './types';

export interface AutoPiece {
  defId: string;
  chain: boolean;
}

export type AutoFinishOutcome =
  | { kind: 'found'; pieces: TrackPieceInstance[]; cost: Cents; test: TestResult }
  | { kind: 'none'; reason: string };

export interface AutoFinishSearch {
  /**
   * Take up to `maxNodes` nodes off the open list (each is projected, and expanded when it passes); the outcome when
   * finished (the same one on every later call), else null.
   */
  step(maxNodes: number): AutoFinishOutcome | null;
  /** Nodes expanded so far (the root and every node that passed its projection; `nodeLimit` bounds it). */
  readonly nodes: number;
}

/** Limits of one search (`AUTO_FINISH` by default; tests lower them). */
export interface AutoFinishLimits {
  maxPieces: number;
  nodeLimit: number;
  lapTries: number;
}

/** Groups that are never plain, even without a `special` (loops, corkscrews, helices). */
const NOT_PLAIN_GROUPS: readonly string[] = ['L', 'Cs', 'Hx'];

/** A plain piece of this type: one Auto-finish may use. */
export function isPlainPiece(type: TrackTypeDef, def: TrackPieceDef): boolean {
  return (
    def.set === type.pieceSet &&
    type.groups.includes(def.group) &&
    !type.excludePieces.includes(def.id) &&
    def.special === null &&
    !NOT_PLAIN_GROUPS.includes(def.group)
  );
}

/** Why Auto-finish cannot start on this track (closed, empty, or the train already stops on it), or null. */
function startBlock(data: TrackRideData, type: TrackTypeDef): string | null {
  if (data.circuitClosed) return TRACK_ERR.circuitAlreadyComplete;
  if (data.pieces.length === 0) return TRACK_ERR.mustStartWithStation;
  const stall = projectPrefix(data, type).stall;
  if (stall) return fillTrackString(TRACK_ERR.autoFinishStallsFirst, { n: stall.piece + 1 });
  return null;
}

/** The pieces laid so far on a path: their instances and tile plans, in order. */
interface PathSoFar {
  pieces: readonly TrackPieceInstance[];
  tiles: readonly (readonly TilePlan[])[];
}

/** Envelopes of the path's pieces (indices after the ride's pieces), for `checkPieceTiles`'s `extra`. */
function extraOccupancy(rideId: number, base: number, path: PathSoFar): Occupancy {
  const occ: Occupancy = new Map();
  path.tiles.forEach((plans, k) => {
    for (const t of plans) {
      let list = occ.get(t.index);
      if (!list) {
        list = [];
        occ.set(t.index, list);
      }
      list.push({ rideId, pieceIndex: base + k, railMin: t.wt.railMin, railMax: t.wt.railMax, rail: t.wt.rail, ownsGround: t.takesGround });
    }
  });
  return occ;
}

type TileStep =
  | { ok: true; piece: TrackPieceInstance; def: TrackPieceDef; tiles: TilePlan[]; cost: Cents; runAfter: number }
  | { ok: false; reason: string };

type ProjectionStep =
  | { ok: true; projection: SectionProjection; next: ProjectionSnapshot }
  | { ok: false; reason: string; stallPiece: number | null };

/**
 * The checks `addTrackPiece` makes before the projection, on piece `spec` at joint `at`, once the ride's pieces and the
 * path's pieces (`extra`: their envelopes; `runBefore`: the span run at their end) are built: piece, type, chain, fit,
 * length, tiles and supports. The piece's cost is set.
 */
function checkTiles(
  world: World,
  ride: Ride,
  data: TrackRideData,
  type: TrackTypeDef,
  spec: AutoPiece,
  at: Joint,
  pathLength: number,
  occ: Occupancy,
  extra: Occupancy | undefined,
  runBefore: number,
): TileStep {
  const def = getTrackPieceDef(spec.defId);
  if (!def) return { ok: false, reason: TRACK_ERR.unknownPiece };
  if (!isPlainPiece(type, def)) return { ok: false, reason: TRACK_ERR.typeCannotUse };
  if (spec.chain && (!type.chain || !def.chainable)) return { ok: false, reason: TRACK_ERR.typeCannotUse };
  if (def.entry.slope !== at.slope || def.entry.bank !== at.bank) return { ok: false, reason: TRACK_ERR.doesNotFit };
  const index = data.pieces.length + pathLength;
  if (index >= MAX_PIECES) return { ok: false, reason: TRACK_ERR.tooLong };
  const piece: TrackPieceInstance = { defId: def.id, x: at.x, y: at.y, z: at.z, dir: at.dir, chain: spec.chain, brakeSpeed: null, cost: 0 };
  const chk = checkPieceTiles(world, ride.id, index, piece, type, data.pieces, { occ, extra, runBefore });
  if (!chk.ok) return chk;
  piece.cost = pieceCost(type, def, spec.chain, chk.heightAboveGround);
  return { ok: true, piece, def, tiles: chk.tiles, cost: piece.cost, runAfter: chk.runAfter };
}

/**
 * The build-time projection of the last of `pieces` (the ride's pieces, the path, the candidate) from `snap` (the
 * snapshot after the piece before): no hard limit passed (R7), and the train crosses it without stopping (R8).
 */
function checkProjection(pieces: readonly TrackPieceInstance[], type: TrackTypeDef, cars: number, snap: ProjectionSnapshot): ProjectionStep {
  const { projection, next } = continueProjection(pieces, type, cars, snap);
  if (projection.breach) return { ok: false, reason: unsafePieceReason(projection.breach), stallPiece: null };
  if (projection.stallPiece !== null) return { ok: false, reason: TRACK_ERR.autoFinishLapFails, stallPiece: projection.stallPiece };
  if (!projection.reached) return { ok: false, reason: TRACK_ERR.autoFinishLapFails, stallPiece: null };
  return { ok: true, projection, next };
}

/** The finished circuit's test lap passes and its strongest car stays within the hard limits (R8). */
function lapIsSafe(world: World, data: TrackRideData, type: TrackTypeDef, path: readonly TrackPieceInstance[]): TestResult | null {
  // A new data object, so no cache of the real ride is touched.
  const closed: TrackRideData = { ...data, pieces: [...data.pieces, ...path], circuitClosed: true };
  const lap = runTestLapDetailed(world.state.map, closed, type);
  return lap.result.passed && lap.breach === null ? lap.result : null;
}

interface SearchNode {
  joint: Joint;
  depth: number;
  /** Track length added (mm). */
  g: number;
  h: number;
  f: number;
  seq: number;
  /** Unsupported rail tiles at the end. */
  run: number;
  /** The projection snapshot after this node's piece; null until the node is popped and projected. */
  snap: ProjectionSnapshot | null;
  piece: TrackPieceInstance | null;
  def: TrackPieceDef | null;
  tiles: TilePlan[];
  parent: SearchNode | null;
}

function jointKey(j: Joint): string {
  return `${j.x},${j.y},${j.z},${j.dir},${j.slope},${j.bank}`;
}

function quarterTurns(a: number, b: number): number {
  const d = (((a - b) % 4) + 4) % 4;
  return Math.min(d, 4 - d);
}

/** Tile-distance estimate from `j` to the goal joint (mm). */
function estimate(j: Joint, goal: Joint): number {
  return (
    TILE_MM *
    (Math.abs(j.x - goal.x) +
      Math.abs(j.y - goal.y) +
      Math.round(Math.abs(j.z - goal.z) / STEEP_RISE_M) +
      quarterTurns(j.dir, goal.dir) +
      (j.slope !== 'F' ? 1 : 0) +
      (j.bank !== 'none' ? 1 : 0))
  );
}

function before(a: SearchNode, b: SearchNode): boolean {
  if (a.f !== b.f) return a.f < b.f;
  if (a.h !== b.h) return a.h < b.h;
  return a.seq < b.seq;
}

/** A binary min-heap of search nodes (order: `before`). */
class NodeHeap {
  private readonly items: SearchNode[] = [];
  get size(): number {
    return this.items.length;
  }
  push(n: SearchNode): void {
    const a = this.items;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!before(a[i] as SearchNode, a[p] as SearchNode)) break;
      [a[i], a[p]] = [a[p] as SearchNode, a[i] as SearchNode];
      i = p;
    }
  }
  pop(): SearchNode | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0 && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && before(a[l] as SearchNode, a[m] as SearchNode)) m = l;
        if (r < a.length && before(a[r] as SearchNode, a[m] as SearchNode)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m] as SearchNode, a[i] as SearchNode];
        i = m;
      }
    }
    return top;
  }
}

/** The path's pieces and tile plans from the root to `n`, in order. */
function pathOf(n: SearchNode): PathSoFar {
  const pieces: TrackPieceInstance[] = [];
  const tiles: TilePlan[][] = [];
  for (let k: SearchNode | null = n; k && k.piece; k = k.parent) {
    pieces.push(k.piece);
    tiles.push(k.tiles);
  }
  return { pieces: pieces.reverse(), tiles: tiles.reverse() };
}

/**
 * Start a search for the ride's track end (see the module doc). Nothing runs until `step`.
 *
 * A child is pushed after its tile checks; its projection runs when it is popped (most pushed children are never
 * popped, and the projection is the costly part). A popped child whose train stops on it is retried once with a chain
 * when the piece and type allow one, so a chain is laid only where the train needs it. A joint counts as visited once
 * a child reaching it passed its projection. The station's entry joint is never visited: each child reaching it is a
 * closing path whose finished lap is tested (at most `lapTries`). Expanded nodes count toward `nodeLimit`.
 */
export function startAutoFinish(world: World, rideId: number, limits: Partial<AutoFinishLimits> = {}): AutoFinishSearch {
  const lim: AutoFinishLimits = { maxPieces: AUTO_FINISH.maxPieces, nodeLimit: AUTO_FINISH.nodeLimit, lapTries: AUTO_FINISH.lapTries, ...limits };
  const tc = trackContext(world, rideId);
  const block = tc ? startBlock(tc.data, tc.type) : TRACK_ERR.noRide;
  if (!tc || block) {
    const done: AutoFinishOutcome = { kind: 'none', reason: block ?? TRACK_ERR.noRide };
    return { step: () => done, nodes: 0 };
  }
  const { ride, data, type } = tc;
  const cars = data.trainConfig.carsPerTrain;
  const goal = pieceEntryJoint(data.pieces[0] as TrackPieceInstance);
  const goalKey = jointKey(goal);
  const occ = buildOccupancy(world);
  const startJoint = trackEnd(world, ride, data);
  const open = new NodeHeap();
  const seen = new Set<string>();
  let seq = 0;
  let laps = 0;
  let nodes = 0;
  let outcome: AutoFinishOutcome | null = null;
  // Root rule (R8): when every piece that fits the track end stops the train on the existing track, say where.
  let rootChildren = 0;
  let rootStalls = 0;
  let rootStall = Infinity;
  const h0 = estimate(startJoint, goal);
  open.push({
    joint: startJoint, depth: 0, g: 0, h: h0, f: AUTO_FINISH.weight * h0, seq: seq++,
    run: trailingUnsupported(world, ride.id, data.pieces, occ), snap: projectPrefix(data, type), piece: null, def: null, tiles: [], parent: null,
  });

  const child = (parent: SearchNode, t: Extract<TileStep, { ok: true }>, exit: Joint): SearchNode => {
    const h = estimate(exit, goal);
    const g = parent.g + t.def.lengthMm;
    return { joint: exit, depth: parent.depth + 1, g, h, f: g + AUTO_FINISH.weight * h, seq: seq++, run: t.runAfter, snap: null, piece: t.piece, def: t.def, tiles: t.tiles, parent };
  };

  /** Push the children of a projected node that pass their tile checks. */
  const expand = (n: SearchNode): void => {
    if (n.depth + 1 > lim.maxPieces) return;
    const path = pathOf(n);
    const extra = path.pieces.length > 0 ? extraOccupancy(ride.id, data.pieces.length, path) : undefined;
    for (const def of piecesForEnd(type.id, n.joint.slope, n.joint.bank)) {
      if (!isPlainPiece(type, def)) continue;
      const t = checkTiles(world, ride, data, type, { defId: def.id, chain: false }, n.joint, path.pieces.length, occ, extra, n.run);
      if (!t.ok) continue;
      const exit = pieceExitJoint(t.piece);
      const key = jointKey(exit);
      if (key !== goalKey && seen.has(key)) continue;
      if (n.depth === 0) rootChildren++;
      open.push(child(n, t, exit));
    }
  };

  /** Project a popped node; on a stop, push its chained twin once. True when it passed. */
  const project = (n: SearchNode): boolean => {
    const parent = n.parent as SearchNode;
    const piece = n.piece as TrackPieceInstance;
    const pieces = [...data.pieces, ...pathOf(n).pieces];
    const pr = checkProjection(pieces, type, cars, parent.snap as ProjectionSnapshot);
    if (pr.ok) {
      n.snap = pr.next;
      return true;
    }
    const stops = pr.reason === TRACK_ERR.autoFinishLapFails;
    const def = n.def as TrackPieceDef;
    if (stops && !piece.chain && type.chain && def.chainable) {
      // The twin has the same tiles; only the chain and its price differ.
      const chained: TrackPieceInstance = { ...piece, chain: true, cost: piece.cost + CHAIN_EXTRA_CENTS };
      open.push({ ...n, piece: chained, seq: seq++ });
      return false;
    }
    if (parent.depth === 0) {
      if (pr.stallPiece !== null && pr.stallPiece < data.pieces.length) {
        rootStalls++;
        rootStall = Math.min(rootStall, pr.stallPiece);
      }
    }
    return false;
  };

  const rootAnswer = (): AutoFinishOutcome | null =>
    rootChildren > 0 && rootStalls === rootChildren
      ? { kind: 'none', reason: fillTrackString(TRACK_ERR.autoFinishStallsFirst, { n: rootStall + 1 }) }
      : null;

  const visit = (n: SearchNode): AutoFinishOutcome | null => {
    if (n.piece) {
      if (!project(n)) return rootAnswer();
      if (jointsEqual(n.joint, goal)) {
        laps++;
        const pieces = [...pathOf(n).pieces];
        const test = lapIsSafe(world, data, type, pieces);
        if (test) return { kind: 'found', pieces, cost: pieces.reduce((s, p) => s + p.cost, 0), test };
        if (laps >= lim.lapTries) return { kind: 'none', reason: TRACK_ERR.autoFinishNone };
        return null; // a goal is never expanded further
      }
    }
    seen.add(jointKey(n.joint));
    nodes++;
    expand(n);
    return null;
  };

  return {
    get nodes() {
      return nodes;
    },
    step(maxNodes: number): AutoFinishOutcome | null {
      if (outcome) return outcome;
      let budget = maxNodes;
      while (budget > 0) {
        if (open.size === 0 || nodes >= lim.nodeLimit) {
          outcome = rootAnswer() ?? { kind: 'none', reason: TRACK_ERR.autoFinishNone };
          return outcome;
        }
        const n = open.pop() as SearchNode;
        if (seen.has(jointKey(n.joint))) continue;
        budget--;
        const o = visit(n);
        if (o) {
          outcome = o;
          return outcome;
        }
      }
      return null;
    },
  };
}

/** Run a whole search at once (`startAutoFinish(...).step(Infinity)`). */
export function findClosingPath(world: World, rideId: number): AutoFinishOutcome {
  return startAutoFinish(world, rideId).step(Number.POSITIVE_INFINITY) as AutoFinishOutcome;
}

/**
 * Check a given closing path (the `autoFinishTrack` command): the start rules, each piece in order with the same checks
 * as the search, the last piece closing on the station's entry (and no earlier one), the finished lap passing with no
 * hard limit passed (R8), then the cash for the whole path. `index` names the refused piece (0-based in `pieces`) when
 * one piece is at fault. Pure.
 */
export function planPath(
  world: World,
  ride: Ride,
  data: TrackRideData,
  type: TrackTypeDef,
  pieces: readonly AutoPiece[],
  ctx: CommandContext,
): { ok: true; plans: PiecePlan[]; cost: Cents; test: TestResult } | { ok: false; reason: string; index: number | null } {
  const block = startBlock(data, type);
  if (block) return { ok: false, reason: block, index: null };
  if (pieces.length === 0) return { ok: false, reason: TRACK_ERR.autoFinishNotClosing, index: null };
  if (pieces.length > AUTO_FINISH.maxPieces) return { ok: false, reason: TRACK_ERR.autoFinishNone, index: null };
  const goal = pieceEntryJoint(data.pieces[0] as TrackPieceInstance);
  const occ = buildOccupancy(world);
  let at = trackEnd(world, ride, data);
  let run = trailingUnsupported(world, ride.id, data.pieces, occ);
  let snap = projectPrefix(data, type);
  const path: { pieces: TrackPieceInstance[]; tiles: TilePlan[][] } = { pieces: [], tiles: [] };
  const plans: PiecePlan[] = [];
  let cost = 0;
  for (let k = 0; k < pieces.length; k++) {
    const spec = pieces[k] as AutoPiece;
    if (typeof spec?.defId !== 'string' || typeof spec.chain !== 'boolean') return { ok: false, reason: TRACK_ERR.unknownPiece, index: k };
    const extra = path.pieces.length > 0 ? extraOccupancy(ride.id, data.pieces.length, path) : undefined;
    const t = checkTiles(world, ride, data, type, spec, at, path.pieces.length, occ, extra, run);
    if (!t.ok) return { ok: false, reason: t.reason, index: k };
    const pr = checkProjection([...data.pieces, ...path.pieces, t.piece], type, data.trainConfig.carsPerTrain, snap);
    if (!pr.ok) return { ok: false, reason: pr.reason, index: k };
    const c = { ...t, ...pr };
    const exit = pieceExitJoint(c.piece);
    const closes = jointsEqual(exit, goal);
    if (closes !== (k === pieces.length - 1)) return { ok: false, reason: TRACK_ERR.autoFinishNotClosing, index: closes ? k : null };
    plans.push({ piece: c.piece, def: c.def, tiles: c.tiles, cost: c.cost, closes, projection: c.projection });
    path.pieces.push(c.piece);
    path.tiles.push(c.tiles);
    cost += c.cost;
    at = exit;
    run = c.runAfter;
    snap = c.next;
  }
  const test = lapIsSafe(world, data, type, path.pieces);
  if (!test) return { ok: false, reason: TRACK_ERR.autoFinishLapFails, index: null };
  if (!canAfford(world, cost, ctx)) return { ok: false, reason: TRACK_ERR.notEnoughCash, index: null };
  return { ok: true, plans, cost, test };
}
