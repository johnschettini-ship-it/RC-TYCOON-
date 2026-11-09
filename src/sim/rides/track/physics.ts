/**
 * 1D train physics (phase-2-coasters.md §4.7; water drives Phase 4 §4.4). Owner: W1-G; water drives W3-C.
 * State is integer mm and mm/s; each tick computes in doubles (+ − × ÷ only, plus table trig) and rounds.
 * Every term is an acceleration, so guest load never changes motion.
 *
 * Integration: the force sample is taken at the predicted midpoint of the step and the position advances by
 * the average speed, which keeps energy within 0.5% over a full drop. Stops (station, holds, gap rule)
 * brake with the larger of their nominal deceleration and the one needed to halt exactly on the point.
 */
import type { TrackPieceDef, TrackTypeDef } from '../../../data/track';
import {
  BRAKE_DECEL,
  CHAIN_ACCEL,
  CORNER_SPEED_GUEST,
  CORNER_SPEED_POWERED,
  DT,
  G,
  GAP_RULE_MM,
  POWERED_ACCEL,
  POWERED_DECEL,
  RELEASE_ACCEL,
  ROUGH_AMPLITUDE,
  ROUGH_WAVELENGTH_MM,
  SPLASH_DECEL,
  SPLASH_MAX_V,
  STATION_SPEED,
  STATION_STOP_DECEL,
  WHIRLPOOL_MAX_V,
} from '../../../data/tuning/track';
import { PI, TAU, tsin } from '../../trig';
import { newSamplePoint, pieceIndexAt, sampleAt, wrapMm, type CircuitLayout, type SamplePoint } from './layout';
import type { TrackPieceInstance, TrainState } from './types';

export interface StepContext {
  layout: CircuitLayout;
  type: TrackTypeDef;
  /** The ride's pieces (chain and brake options are read live). */
  pieces: readonly TrackPieceInstance[];
  trainLenMm: number;
  /** Laps for this dispatch: the train stops in the station after `laps × length` mm. */
  laps: number;
  /** Distance (mm) from the train's front to a point where it must stop (block hold, breakdown hold), or null. */
  holdFrontMm: number | null;
  /** Gap rule input (powered, guest-driven): distance from this front to the leader's tail, and its speed. */
  leader: { gapMm: number; vMms: number } | null;
  /** Powered speed factor (slow_running breakdown: 0.6). */
  slowFactor: number;
}

export interface StepResult {
  /** Gravity stall: the train stopped where it should not ('loop': too slow for the loop). */
  stall: 'stop' | 'loop' | null;
  /** Piece under the centre after the step (or at the stall). */
  pieceIndex: number;
  /** The train halted on a stop point this tick (or stands on it). */
  stopped: 'station' | 'hold' | 'gap' | null;
  /** The train is stopped at the station on its final lap. */
  arrived: boolean;
}

/** A train at the station stop point, seats empty. */
export function newTrain(id: number, s: number, cars: number, seatsPerCar: number): TrainState {
  return {
    id,
    s,
    v: 0,
    state: 'loading',
    dwellTicks: 0,
    lap: 0,
    seats: new Array<number>(cars * seatsPerCar).fill(-1),
    dist: 0,
    parked: false,
    release: false,
    driveMms: 0,
    lapStartTick: 0,
  };
}

/** Centre position of a train stopped in the station. */
export function stopCentreMm(layout: CircuitLayout, trainLenMm: number): number {
  return wrapMm(layout, layout.stopFrontMm - Math.round(trainLenMm / 2));
}

/** Vertical and lateral G at a sample (phase-2 §4.9). */
export function gForces(cosT: number, sinB: number, cosB: number, v: number, kv: number, kh: number): { gv: number; gl: number } {
  const v2 = v * v;
  const gv = ((G * cosT + v2 * kv) * cosB + v2 * kh * sinB) / G;
  const glRaw = (v2 * kh * cosB - G * cosT * sinB) / G;
  return { gv, gl: glRaw < 0 ? -glRaw : glRaw };
}

const SP = newSamplePoint();

/**
 * Speed after one tick of a controller that drives the train toward `target` before `remainingM` metres: up at `up`,
 * down at `down` or harder when needed to reach the target by then.
 */
function toward(v: number, target: number, remainingM: number, up: number, down = BRAKE_DECEL): number {
  if (v < target) return Math.min(target, v + up * DT);
  if (v > target) {
    const need = remainingM > 0 ? (v * v - target * target) / (2 * remainingM) : Infinity;
    return Math.max(target, v - Math.max(down, need) * DT);
  }
  return v;
}

/** Phase 2 gravity acceleration with friction and drag (friction and drag act only when v > 0). */
function gravityAccel(type: TrackTypeDef, sm: SamplePoint, v: number): number {
  let a = -G * sm.sinT;
  if (v > 0) {
    const c = sm.cosT < 0 ? -sm.cosT : sm.cosT;
    a -= type.physics.mu * G * c + type.physics.cd * v * v;
  }
  return a;
}

/**
 * Water current speed (m/s) at `uMm` into a piece: the type's current, varied on rough water as a fixed function of the
 * position (phase-2 §4.14: never the RNG, so the test run and operation stay equal).
 */
export function waterCurrentAt(type: TrackTypeDef, def: TrackPieceDef | undefined, uMm: number): number {
  const vc = (type.water?.currentMms ?? 0) / 1000;
  if (def?.special !== 'rough') return vc;
  return vc * (1 + ROUGH_AMPLITUDE * tsin((TAU * uMm) / ROUGH_WAVELENGTH_MM));
}

/** Speed after one tick of the water current (a = −g·sinθ − k·(v − vCurrent)). */
function currentStep(type: TrackTypeDef, def: TrackPieceDef | undefined, sm: SamplePoint, v: number, uMm: number): number {
  const a = -G * sm.sinT - (type.water?.k ?? 0) * (v - waterCurrentAt(type, def, uMm));
  return v + a * DT;
}

/**
 * Water drives (Phase 4 §4.4): speed after one tick for the piece under the boat's centre. A conveyor sets the speed
 * (the caller treats the boat as controlled there, so it never counts as stalled). No allocation: this runs per boat
 * per tick.
 */
function waterStep(type: TrackTypeDef, def: TrackPieceDef | undefined, sm: SamplePoint, v: number, uMm: number, pieceEndM: number): number {
  switch (def?.water?.drive ?? 'current') {
    case 'conveyor':
      return (def?.water?.conveyorMms ?? 0) / 1000;
    case 'gravity':
      return v + gravityAccel(type, sm, v) * DT;
    case 'splash':
      // Splash brake at 12 m/s², or harder when needed, so the boat always leaves the piece at ≤ 4 m/s.
      return v > SPLASH_MAX_V ? toward(v, SPLASH_MAX_V, pieceEndM, 0, SPLASH_DECEL) : currentStep(type, def, sm, v, uMm);
    case 'whirlpool':
      return Math.min(currentStep(type, def, sm, v, uMm), WHIRLPOOL_MAX_V);
    default:
      return currentStep(type, def, sm, v, uMm);
  }
}

/**
 * Advance a running train by one tick. Mutates `t.s`, `t.v`, `t.dist`, and clears `t.release` when done.
 */
export function stepTrain(ctx: StepContext, t: TrainState): StepResult {
  const { layout, type } = ctx;
  const L = layout.lengthMm;
  const v = t.v / 1000;
  const stopC = stopCentreMm(layout, ctx.trainLenMm);
  const finalDist = ctx.laps * L;
  const pi = pieceIndexAt(layout, wrapMm(layout, t.s));
  const st = layout.statics[pi];
  const def = st?.def;
  const inst = ctx.pieces[pi];
  const pieceEndM = ((layout.startMm[pi + 1] as number) - wrapMm(layout, t.s)) / 1000;
  const onStation = def?.special === 'station';
  const departing = onStation && t.dist < layout.stationEndMm - stopC;
  const arriving = onStation && !departing && t.dist >= finalDist - stopC;

  let v1: number;
  let controlled = false;
  if (type.drive === 'waterCurrent') {
    const sm = sampleAt(layout, t.s + v * DT * 500, SP);
    v1 = waterStep(type, def, sm, v, wrapMm(layout, t.s) - (layout.startMm[pi] as number), pieceEndM);
    controlled = def?.water?.drive === 'conveyor';
  } else if (type.drive === 'gravity') {
    const sm = sampleAt(layout, t.s + v * DT * 500, SP);
    v1 = v + gravityAccel(type, sm, v) * DT;
    if (def?.special === 'blockBrake' || departing) {
      v1 = toward(v, STATION_SPEED, pieceEndM, RELEASE_ACCEL);
      controlled = true;
    } else if (t.release) {
      v1 = v < STATION_SPEED ? Math.min(STATION_SPEED, v + RELEASE_ACCEL * DT) : v1;
      controlled = true;
    }
    if (inst?.chain && v1 < type.physics.chainSpeedMms / 1000) {
      v1 = Math.min(type.physics.chainSpeedMms / 1000, v + CHAIN_ACCEL * DT);
    }
    if (def?.special === 'brakes') {
      const target = inst?.brakeSpeed ?? 6;
      if (v1 > target) v1 = toward(v, target, pieceEndM, 0);
    }
    if (arriving && v1 > STATION_SPEED) v1 = Math.max(STATION_SPEED, v - BRAKE_DECEL * DT);
  } else {
    let target = (type.drive === 'guestDriven' ? t.driveMms : type.physics.driveSpeedMms) / 1000;
    if (type.drive === 'powered') target *= ctx.slowFactor;
    const corner = type.drive === 'guestDriven' ? CORNER_SPEED_GUEST : CORNER_SPEED_POWERED;
    if (def?.turnKind) target = Math.min(target, corner[def.turnKind]);
    if (departing || arriving) target = Math.min(target, STATION_SPEED);
    v1 = v < target ? Math.min(target, v + POWERED_ACCEL * DT) : Math.max(target, v - POWERED_DECEL * DT);
  }
  if (t.release && !controlled) {
    // Non-gravity drives accelerate by themselves.
    t.release = false;
  }

  // Stop points: station stop on the final lap, a hold point, the gap rule.
  let stopMm = Infinity;
  let stopKind = null as StepResult['stopped'];
  const brakeTo = (dMm: number, nominal: number, kind: NonNullable<StepResult['stopped']>, vEnd = 0): void => {
    const d = dMm / 1000;
    const free = ((v + v1) / 2) * DT;
    if (v * v - vEnd * vEnd >= 2 * nominal * d || free >= d) {
      const need = d > 0 ? (v * v - vEnd * vEnd) / (2 * d) : Infinity;
      const a = Math.max(nominal, need);
      v1 = Math.min(v1, Math.max(vEnd, v - a * DT));
      if (vEnd === 0 && dMm < stopMm) {
        stopMm = dMm;
        stopKind = kind;
      }
    }
  };
  const toStation = finalDist - t.dist;
  if (toStation >= 0) brakeTo(toStation, STATION_STOP_DECEL, 'station');
  if (ctx.holdFrontMm !== null && ctx.holdFrontMm >= 0) brakeTo(ctx.holdFrontMm, BRAKE_DECEL, 'hold');
  let gapLimitMm = Infinity;
  if (ctx.leader && type.drive !== 'gravity') {
    const room = ctx.leader.gapMm - GAP_RULE_MM;
    gapLimitMm = Math.max(0, room);
    const vL = ctx.leader.vMms / 1000;
    if (vL <= 0) brakeTo(gapLimitMm, POWERED_DECEL, 'gap');
    else if (v > vL) brakeTo(gapLimitMm, POWERED_DECEL, 'gap', vL);
  }

  if (v1 < 0) v1 = 0;
  let dsMm = Math.round(((v + v1) / 2) * DT * 1000);
  let stopped = null as StepResult['stopped'];
  if (stopMm !== Infinity) {
    if (dsMm >= stopMm) {
      dsMm = stopMm;
      v1 = 0;
      stopped = stopKind;
    } else if (v1 === 0 && stopMm - dsMm <= 50) {
      dsMm = stopMm;
      stopped = stopKind;
    }
  }
  if (dsMm > gapLimitMm) {
    dsMm = gapLimitMm;
    const vL = (ctx.leader?.vMms ?? 0) / 1000;
    if (v1 > vL) v1 = vL;
    if (v1 === 0) stopped = 'gap';
  }

  // Gravity stall (§4.7): stopped outside the station and outside a hold, or inverted with negative G.
  let stall: StepResult['stall'] = null;
  if ((type.drive === 'gravity' || type.drive === 'waterCurrent') && stopped === null && !controlled) {
    const isLoop = def?.group === 'L';
    if (v1 <= 0) {
      stall = isLoop ? 'loop' : 'stop';
    } else if (isLoop) {
      const sm = sampleAt(layout, t.s + dsMm, SP);
      if (sm.theta > PI / 2 && sm.theta < (3 * PI) / 2) {
        const { gv } = gForces(sm.cosT, sm.sinB, sm.cosB, v1, sm.kv, sm.kh);
        if (gv < 0) stall = 'loop';
      }
    }
  }
  if (stall) {
    t.v = 0;
    return { stall, pieceIndex: pi, stopped: null, arrived: false };
  }

  t.s = wrapMm(layout, t.s + dsMm);
  t.dist += dsMm;
  t.v = Math.round(v1 * 1000);
  if (t.release && type.drive === 'gravity') {
    const npi = pieceIndexAt(layout, t.s);
    const nd = layout.statics[npi]?.def;
    const onCtl = nd?.special === 'blockBrake' || (nd?.special === 'station' && t.dist < layout.stationEndMm - stopC);
    if (!onCtl && t.v >= STATION_SPEED * 1000) t.release = false;
  }
  const arrived = stopped === 'station' && t.dist === finalDist;
  return { stall: null, pieceIndex: pieceIndexAt(layout, t.s), stopped, arrived };
}

/** Sample at the train's centre (for G measurements and rendering). */
export function trainSample(layout: CircuitLayout, t: TrainState, out: SamplePoint = newSamplePoint()): SamplePoint {
  return sampleAt(layout, t.s, out);
}

/** Vertical and lateral G of a train now. */
export function trainG(layout: CircuitLayout, t: TrainState): { gv: number; gl: number } {
  const sm = sampleAt(layout, t.s, SP);
  return gForces(sm.cosT, sm.sinB, sm.cosB, t.v / 1000, sm.kv, sm.kh);
}
