/**
 * Test run (phase-2-coasters.md §4.9). Owner: W1-G.
 * One empty train of the configured size runs one lap. The whole lap is simulated here with the same
 * `stepTrain` the live train uses, so the result is known at dispatch and the live test train in the
 * world follows exactly the same path; the result is published when the live lap ends.
 */
import type { TrackTypeDef } from '../../../data/track';
import {
  AIRTIME_G,
  DROP_THRESHOLD_M,
  G_AVERAGE_TICKS,
  GUEST_DRIVE_BASE,
  GUEST_DRIVE_SPAN,
  TEST_CHART_EVERY_TICKS,
  TEST_KART_TEMPERAMENT,
  TEST_MAX_TICKS,
} from '../../../data/tuning/track';
import type { MapState } from '../../map';
import { getLayout, type CircuitLayout } from './layout';
import { newTrain, stepTrain, stopCentreMm, trainG, type StepContext } from './physics';
import { climbAboveStationM, highestAboveGround } from './placement';
import { addWaterExtras, computeRatings, heightIntensityStep, ratingInputsOf, waterRatingExtras } from './ratings';
import { CarGWindow, safetyBreachOf, overLimit, type SafetyBreach, type SafetyKind, type SafetyValues } from './safety';
import { stepWithStops, usesStops } from './stops';
import type { TestResult, TrackRideData, TrainState } from './types';

/** Guest-driven target speed for a temperament (mm/s). */
export function kartSpeedMms(temperament: number): number {
  return Math.round((GUEST_DRIVE_BASE + (GUEST_DRIVE_SPAN * temperament) / 100) * 1000);
}

export function trainLengthMm(type: TrackTypeDef, cars: number): number {
  return cars * type.vehicle.carLengthMm;
}

/** A train dispatched from the station stop point. */
export function dispatchedTestTrain(layout: CircuitLayout, type: TrackTypeDef, cars: number): TrainState {
  const t = newTrain(1, stopCentreMm(layout, trainLengthMm(type, cars)), cars, type.vehicle.seatsPerCar);
  t.state = 'running';
  t.release = type.drive === 'gravity';
  t.driveMms = type.drive === 'guestDriven' ? kartSpeedMms(TEST_KART_TEMPERAMENT) : 0;
  return t;
}

/** Drops along the circuit geometry: continuous descents of ≥ 3 m. */
export function measureDrops(layout: CircuitLayout): { drops: number; dropMaxMm: number } {
  let drops = 0;
  let dropMax = 0;
  let prev = NaN;
  let runTop = NaN;
  const close = (): void => {
    if (!Number.isNaN(runTop)) {
      const d = runTop - prev;
      if (d >= DROP_THRESHOLD_M - 1e-9) {
        drops++;
        if (d > dropMax) dropMax = d;
      }
      runTop = NaN;
    }
  };
  layout.statics.forEach((st, pi) => {
    const z = layout.pieces[pi]?.z ?? 0;
    const sm = st.samples;
    for (let k = pi === 0 ? 0 : 1; k < sm.n; k++) {
      const h = z + (sm.h[k] as number);
      if (!Number.isNaN(prev)) {
        if (h < prev - 1e-9) {
          if (Number.isNaN(runTop)) runTop = prev;
        } else {
          close();
        }
      }
      prev = h;
    }
  });
  close();
  return { drops, dropMaxMm: Math.round(dropMax * 1000) };
}

function emptyResult(): TestResult {
  return {
    passed: false,
    failPiece: null,
    failKind: null,
    ticks: 0,
    vMaxMms: 0,
    vAvgMms: 0,
    rideTimeTicks: 0,
    lengthMm: 0,
    drops: 0,
    dropMaxMm: 0,
    posGMax: 100,
    vertGMin: 100,
    airtimeTicks: 0,
    latMax: 0,
    inversions: 0,
    highestM: 0,
    turnPieces: 0,
    smallTurns: 0,
    spookyTunnels: 0,
    laps: 1,
    excitement: 0,
    intensity: 0,
    nausea: 0,
    penalty: false,
    chart: { every: TEST_CHART_EVERY_TICKS, speedCms: [], gv: [], gl: [] },
  };
}

/**
 * A test lap with its safety findings (R7). `worst`: the strongest car's G (each car's own 5-tick window, then the
 * extremes over the cars; review I-2), hundredths, over the part of the lap that ran. `breach`: the first hard limit
 * those values pass (posG, negG, lat), and `breachPiece` the piece under the centre at the first tick where that kind
 * passed it. `troublePiece`/`troubleKind`: the stall piece (0-based) when the lap failed, else the breach, else null.
 */
export interface TestLapDetail {
  result: TestResult;
  troublePiece: number | null;
  troubleKind: SafetyKind | 'stall' | null;
  worst: SafetyValues;
  breach: SafetyBreach | null;
  breachPiece: number | null;
}

/** Simulate the test lap of a closed circuit. Pure: reads the ride data and the map, changes nothing. */
export function runTestLap(map: MapState, data: TrackRideData, type: TrackTypeDef): TestResult {
  return runTestLapDetailed(map, data, type).result;
}

const details = new WeakMap<TestResult, TestLapDetail>();

/**
 * The detail of a stored test result (`data.test` or a pending `testRun.result`), cached by the result object (never
 * saved). A result loaded from a save is re-run once; the pieces cannot have changed since (any change clears the test).
 */
export function testLapDetail(map: MapState, data: TrackRideData, type: TrackTypeDef, test: TestResult): TestLapDetail {
  let d = details.get(test);
  if (!d) {
    d = runTestLapDetailed(map, data, type);
    details.set(test, d);
  }
  return d;
}

/** Remember a lap's detail under its result (the test command, so the published result needs no re-run). */
export function rememberTestLapDetail(d: TestLapDetail): void {
  details.set(d.result, d);
}

const PIECE_NONE = -1;

/** Simulate the test lap and its safety findings (see `TestLapDetail`). Pure. */
export function runTestLapDetailed(map: MapState, data: TrackRideData, type: TrackTypeDef): TestLapDetail {
  const layout = getLayout(data);
  const cars = data.trainConfig.carsPerTrain;
  const res = emptyResult();
  res.lengthMm = layout.lengthMm;
  for (const st of layout.statics) {
    res.inversions += st.def.inversions;
    if (st.def.turnKind) res.turnPieces++;
    if (st.def.turnKind === 'small') res.smallTurns++;
    if (st.def.special === 'spooky') res.spookyTunnels++;
  }
  res.highestM = highestAboveGround(map, data.pieces);
  res.laps = type.drive === 'guestDriven' ? data.operation.laps : 1;
  const d = measureDrops(layout);
  res.drops = d.drops;
  res.dropMaxMm = d.dropMaxMm;

  const train = dispatchedTestTrain(layout, type, cars);
  const ctx: StepContext = {
    layout,
    type,
    pieces: data.pieces,
    trainLenMm: trainLengthMm(type, cars),
    cars,
    carLenMm: type.vehicle.carLengthMm,
    laps: 1,
    holdFrontMm: null,
    leader: null,
    slowFactor: 1,
  };
  // Phase 6 Monorail: the test train dwells at each stop too, so the ride time includes the stops.
  const stops = usesStops(layout, type);
  const win: { gv: number; gl: number }[] = [];
  // R7 (owner change and review I-2): each car's own window; the first piece where each kind passed its hard limit.
  const carWin = new CarGWindow(cars);
  const ext = { posG: 0, negG: 0, lat: 0 };
  let wPos = -Infinity;
  let wNeg = Infinity;
  let wLat = 0;
  const firstOver = { posG: PIECE_NONE, negG: PIECE_NONE, lat: PIECE_NONE };
  const finish = (failed: boolean): TestLapDetail => {
    const worst: SafetyValues = {
      posGMax: wPos === -Infinity ? 100 : Math.round(wPos * 100),
      vertGMin: wNeg === Infinity ? 100 : Math.round(wNeg * 100),
      latMax: Math.round(wLat * 100),
    };
    const breach = safetyBreachOf(worst);
    const breachPiece = breach ? firstOver[breach.kind] : null;
    if (failed) return { result: res, troublePiece: (res.failPiece ?? 1) - 1, troubleKind: 'stall', worst, breach, breachPiece };
    return { result: res, troublePiece: breachPiece, troubleKind: breach ? breach.kind : null, worst, breach, breachPiece };
  };
  let posG = -Infinity;
  let negG = Infinity;
  let lat = 0;
  let air = 0;
  let vMax = 0;
  let ticks = 0;
  for (;;) {
    const r = stops ? stepWithStops(ctx, layout, train) : stepTrain(ctx, train);
    ticks++;
    if (r === null) {
      // Dwelling at a stop: no move, no G measured (a station).
      if (ticks % TEST_CHART_EVERY_TICKS === 0) {
        res.chart.speedCms.push(0);
        res.chart.gv.push(100);
        res.chart.gl.push(0);
      }
      continue;
    }
    if (r.stall) {
      res.failPiece = r.pieceIndex + 1;
      res.failKind = r.stall;
      res.ticks = ticks;
      return finish(true);
    }
    if (train.v > vMax) vMax = train.v;
    const onStation = layout.statics[r.pieceIndex]?.def.special === 'station';
    if (!onStation) {
      // R6 (owner 2026-11-12): the G of the train averaged over its cars (ratings).
      const g = trainG(layout, train, cars, type.vehicle.carLengthMm, carWin.sample);
      win.push({ gv: g.gv, gl: g.gl });
      carWin.push();
      carWin.extremes(ext);
      if (ext.posG > wPos) wPos = ext.posG;
      if (ext.negG < wNeg) wNeg = ext.negG;
      if (ext.lat > wLat) wLat = ext.lat;
      if (firstOver.posG === PIECE_NONE && overLimit('posG', Math.round(ext.posG * 100))) firstOver.posG = r.pieceIndex;
      if (firstOver.negG === PIECE_NONE && overLimit('negG', Math.round(ext.negG * 100))) firstOver.negG = r.pieceIndex;
      if (firstOver.lat === PIECE_NONE && overLimit('lat', Math.round(ext.lat * 100))) firstOver.lat = r.pieceIndex;
      if (win.length > G_AVERAGE_TICKS) win.shift();
      let gv = 0;
      let gl = 0;
      for (const g of win) {
        gv += g.gv;
        gl += g.gl;
      }
      gv /= win.length;
      gl /= win.length;
      if (gv > posG) posG = gv;
      if (gv < negG) negG = gv;
      if (gl > lat) lat = gl;
      if (gv < AIRTIME_G) air++;
      if (ticks % TEST_CHART_EVERY_TICKS === 0) {
        res.chart.speedCms.push(Math.round(train.v / 10));
        res.chart.gv.push(Math.round(gv * 100));
        res.chart.gl.push(Math.round(gl * 100));
      }
    } else if (ticks % TEST_CHART_EVERY_TICKS === 0) {
      res.chart.speedCms.push(Math.round(train.v / 10));
      res.chart.gv.push(100);
      res.chart.gl.push(0);
    }
    if (r.arrived) break;
    if (ticks >= TEST_MAX_TICKS) {
      res.failPiece = r.pieceIndex + 1;
      res.failKind = 'stop';
      res.ticks = ticks;
      return finish(true);
    }
  }
  res.passed = true;
  res.ticks = ticks;
  res.rideTimeTicks = ticks;
  res.vMaxMms = vMax;
  res.vAvgMms = Math.round((layout.lengthMm * 20) / ticks);
  res.posGMax = posG === -Infinity ? 100 : Math.round(posG * 100);
  res.vertGMin = negG === Infinity ? 100 : Math.round(negG * 100);
  res.latMax = Math.round(lat * 100);
  res.airtimeTicks = air;
  // Phase 4 §4.4: the water extras are added after the Phase 2 formula (rail circuits add nothing).
  const r = addWaterExtras(computeRatings(ratingInputsOf(res), type), waterRatingExtras(layout.statics.map((st) => st.def)));
  res.excitement = r.excitement;
  // R2 (owner 2026-11-12): a circuit that climbs above the type's old height limit counts as more intense.
  res.intensity = Math.min(1000, r.intensity + heightIntensityStep(climbAboveStationM(data.pieces), type));
  res.nausea = r.nausea;
  res.penalty = r.penalty;
  return finish(false);
}
