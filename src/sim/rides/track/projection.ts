/**
 * Section projection (R5, owner 2026-11-12; plan ride-work-1 Task 4). Owner: W1-G.
 * The builder's meter, the build-time safety rule (R7) and Auto-finish (R1/R8) ask what the test train would do on one
 * more piece. The answer is simulated, not estimated: the test lap's train is dispatched from the station and stepped
 * with `stepTrain` over the open track (`buildLayout(pieces, true)`: past the last piece the track runs on straight, so
 * the whole train can cross it), with the test lap's G windows. The run over the existing track (the prefix) is cached
 * per track change; each candidate continues from it. Pure: reads the ride data, changes nothing; nothing is saved.
 *
 * Safety values are the strongest car's (each car's own 5-tick window, then the extremes over the cars: owner change
 * and review I-2), the same values the test lap refuses to open with; `avg` holds the train's average (ratings).
 * Monorail stops are not simulated (no dwell; speed and G are unaffected).
 */
import { getTrackPieceDef, type TrackTypeDef } from '../../../data/track';
import { DT, G_AVERAGE_TICKS, PROJECTION_MAX_TICKS, TEST_MAX_TICKS } from '../../../data/tuning/track';
import { buildLayout, getLayout, pieceIndexAt, type CircuitLayout } from './layout';
import { stepTrain, trainG, type StepContext, type StepResult } from './physics';
import { CarGWindow, safetyBreachOf, type SafetyBreach } from './safety';
import { dispatchedTestTrain, trainLengthMm } from './testRun';
import type { TrackPieceInstance, TrackRideData, TrainState } from './types';

export type ProjectionStallKind = 'stop' | 'loop' | 'corkscrew';

export interface SectionProjection {
  /** The train's centre crossed the whole candidate piece. */
  reached: boolean;
  /** 0-based piece where the train stops (on the candidate or before it), or null. */
  stallPiece: number | null;
  stallKind: ProjectionStallKind | null;
  /**
   * Top speed (mm/s) and the strongest car's G extremes (hundredths; each car's own 5-tick window, then the extremes
   * over the cars) while the centre is on the candidate; 0/100/100/0 when never measured. These are the safety values.
   */
  vMaxMms: number;
  posGMax: number;
  vertGMin: number;
  latMax: number;
  /** The same extremes of the train's average G (the test lap's rating values), hundredths. */
  avg: { posGMax: number; vertGMin: number; latMax: number };
  /** The first hard limit the safety values pass (`safetyBreachOf`), or null. */
  breach: SafetyBreach | null;
}

export interface ProjectionSnapshot {
  train: TrainState;
  /** The test lap's window of the train's average G. */
  win: { gv: number; gl: number }[];
  /** Each car's own window (review I-2). */
  carWin: CarGWindow;
  /** Ticks stepped since the dispatch. */
  ticks: number;
  stall: { piece: number; kind: ProjectionStallKind } | null;
}

function cloneSnapshot(s: ProjectionSnapshot): ProjectionSnapshot {
  return {
    train: { ...s.train, seats: s.train.seats.slice() },
    win: s.win.slice(),
    carWin: s.carWin.clone(),
    ticks: s.ticks,
    stall: s.stall ? { ...s.stall } : null,
  };
}

function contextFor(layout: CircuitLayout, pieces: readonly TrackPieceInstance[], type: TrackTypeDef, cars: number): StepContext {
  return {
    layout,
    type,
    pieces,
    trainLenMm: trainLengthMm(type, cars),
    cars,
    carLenMm: type.vehicle.carLengthMm,
    laps: Number.POSITIVE_INFINITY,
    holdFrontMm: null,
    leader: null,
    slowFactor: 1,
  };
}

/**
 * The furthest a step from this state can sample, as the snapshot rule measures it: the train's front plus one tick at
 * its speed. The cars' centres lie at least half a car behind the front, which covers the speed gained in the step.
 */
function reachMm(t: TrainState, trainLenMm: number): number {
  return t.s + trainLenMm / 2 + t.v * DT;
}

/** One test-lap step with the G windows (station ticks are not measured, as in the test lap). */
function stepOnce(ctx: StepContext, w: ProjectionSnapshot): { r: StepResult; measured: boolean } {
  const r = stepTrain(ctx, w.train);
  w.ticks++;
  if (r.stall) {
    w.stall = { piece: r.pieceIndex, kind: r.stall };
    return { r, measured: false };
  }
  if (ctx.layout.statics[r.pieceIndex]?.def.special === 'station') return { r, measured: false };
  const g = trainG(ctx.layout, w.train, ctx.cars, ctx.carLenMm, w.carWin.sample);
  w.win.push({ gv: g.gv, gl: g.gl });
  if (w.win.length > G_AVERAGE_TICKS) w.win.shift();
  w.carWin.push();
  return { r, measured: true };
}

/** The test train dispatched from the station of `pieces` (open layout), before its first step. */
export function dispatchSnapshot(pieces: readonly TrackPieceInstance[], type: TrackTypeDef, cars: number): ProjectionSnapshot {
  const layout = buildLayout(pieces as TrackPieceInstance[], true);
  return { train: dispatchedTestTrain(layout, type, cars), win: [], carWin: new CarGWindow(cars), ticks: 0, stall: null };
}

const prefixCache = new WeakMap<CircuitLayout, { cars: number; snap: ProjectionSnapshot }>();

/**
 * The run over the existing track: from the dispatch to the last tick whose next step samples only real pieces
 * (`front + v·dt ≤ end`), or to a stall. Cached by `getLayout(data)` (replaced on every piece, chain, brake or train
 * change) and the car count. Do not change the returned snapshot.
 */
export function projectPrefix(data: TrackRideData, type: TrackTypeDef): ProjectionSnapshot {
  const key = getLayout(data);
  const cars = data.trainConfig.carsPerTrain;
  const hit = prefixCache.get(key);
  if (hit && hit.cars === cars) return hit.snap;
  const pieces = data.pieces;
  const layout = buildLayout(pieces, true);
  const ctx = contextFor(layout, pieces, type, cars);
  const w = dispatchSnapshot(pieces, type, cars);
  const end = layout.lengthMm;
  while (!w.stall && reachMm(w.train, ctx.trainLenMm) <= end) {
    if (w.ticks >= TEST_MAX_TICKS) {
      // The test lap's own bound: a train that never gets there counts as stopped (as the test lap fails it).
      w.stall = { piece: pieceIndexAt(layout, w.train.s), kind: 'stop' };
      break;
    }
    stepOnce(ctx, w);
  }
  prefixCache.set(key, { cars, snap: w });
  return w;
}

function emptyProjection(): SectionProjection {
  return {
    reached: false,
    stallPiece: null,
    stallKind: null,
    vMaxMms: 0,
    posGMax: 100,
    vertGMin: 100,
    latMax: 0,
    avg: { posGMax: 100, vertGMin: 100, latMax: 0 },
    breach: null,
  };
}

/**
 * Continue `from` (a snapshot taken on the pieces before the last one) over `pieces`, whose last piece is the
 * candidate. Measures while the train's centre is on the candidate; stops when the centre leaves it, on a stall, or
 * after `PROJECTION_MAX_TICKS` (then not reached, no stall). `next` is the snapshot for the next piece: taken at the
 * same rule as `projectPrefix`, against the candidate's end (or at the stall). `from` is not changed.
 */
export function continueProjection(
  pieces: readonly TrackPieceInstance[],
  type: TrackTypeDef,
  cars: number,
  from: ProjectionSnapshot,
): { projection: SectionProjection; next: ProjectionSnapshot } {
  const out = emptyProjection();
  if (from.stall) {
    out.stallPiece = from.stall.piece;
    out.stallKind = from.stall.kind;
    return { projection: out, next: from };
  }
  const layout = buildLayout(pieces as TrackPieceInstance[], true);
  const ctx = contextFor(layout, pieces, type, cars);
  const last = pieces.length - 1;
  const a = layout.startMm[last] as number;
  const b = layout.startMm[last + 1] as number;
  const w = cloneSnapshot(from);
  let next: ProjectionSnapshot | null = null;
  let vMax = 0;
  let pos = -Infinity;
  let neg = Infinity;
  let lat = 0;
  let aPos = -Infinity;
  let aNeg = Infinity;
  let aLat = 0;
  const ext = { posG: 0, negG: 0, lat: 0 };
  for (let n = 0; n < PROJECTION_MAX_TICKS; n++) {
    if (next === null && reachMm(w.train, ctx.trainLenMm) > b) next = cloneSnapshot(w);
    if (w.train.s >= b) {
      out.reached = true;
      break;
    }
    const { measured } = stepOnce(ctx, w);
    if (w.stall) {
      out.stallPiece = w.stall.piece;
      out.stallKind = w.stall.kind;
      break;
    }
    const c = w.train.s;
    if (c < a || c >= b) continue;
    if (w.train.v > vMax) vMax = w.train.v;
    if (!measured) continue;
    let gv = 0;
    let gl = 0;
    for (const g of w.win) {
      gv += g.gv;
      gl += g.gl;
    }
    gv /= w.win.length;
    gl /= w.win.length;
    if (gv > aPos) aPos = gv;
    if (gv < aNeg) aNeg = gv;
    if (gl > aLat) aLat = gl;
    w.carWin.extremes(ext);
    if (ext.posG > pos) pos = ext.posG;
    if (ext.negG < neg) neg = ext.negG;
    if (ext.lat > lat) lat = ext.lat;
  }
  next ??= cloneSnapshot(w);
  out.vMaxMms = vMax;
  out.posGMax = pos === -Infinity ? 100 : Math.round(pos * 100);
  out.vertGMin = neg === Infinity ? 100 : Math.round(neg * 100);
  out.latMax = Math.round(lat * 100);
  out.avg = {
    posGMax: aPos === -Infinity ? 100 : Math.round(aPos * 100),
    vertGMin: aNeg === Infinity ? 100 : Math.round(aNeg * 100),
    latMax: Math.round(aLat * 100),
  };
  out.breach = safetyBreachOf(out);
  return { projection: out, next };
}

/**
 * Project `candidate` appended to the ride's open track. A candidate that lengthens the first station moves the
 * dispatch point, so it is projected from the dispatch; any other continues from the cached prefix.
 */
export function projectSection(data: TrackRideData, type: TrackTypeDef, candidate: TrackPieceInstance): SectionProjection {
  const cars = data.trainConfig.carsPerTrain;
  const pieces = [...data.pieces, candidate];
  const extendsStation = isStation(candidate) && data.pieces.every(isStation);
  const from = extendsStation ? dispatchSnapshot(pieces, type, cars) : projectPrefix(data, type);
  return continueProjection(pieces, type, cars, from).projection;
}

function isStation(p: TrackPieceInstance): boolean {
  return getTrackPieceDef(p.defId)?.special === 'station';
}
