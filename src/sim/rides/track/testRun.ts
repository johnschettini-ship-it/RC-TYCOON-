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
import { highestAboveGround } from './placement';
import { computeRatings, ratingInputsOf } from './ratings';
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

/** Simulate the test lap of a closed circuit. Pure: reads the ride data and the map, changes nothing. */
export function runTestLap(map: MapState, data: TrackRideData, type: TrackTypeDef): TestResult {
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
    laps: 1,
    holdFrontMm: null,
    leader: null,
    slowFactor: 1,
  };
  const win: { gv: number; gl: number }[] = [];
  let posG = -Infinity;
  let negG = Infinity;
  let lat = 0;
  let air = 0;
  let vMax = 0;
  let ticks = 0;
  for (;;) {
    const r = stepTrain(ctx, train);
    ticks++;
    if (r.stall) {
      res.failPiece = r.pieceIndex + 1;
      res.failKind = r.stall;
      res.ticks = ticks;
      return res;
    }
    if (train.v > vMax) vMax = train.v;
    const onStation = layout.statics[r.pieceIndex]?.def.special === 'station';
    if (!onStation) {
      win.push(trainG(layout, train));
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
      return res;
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
  const r = computeRatings(ratingInputsOf(res), type);
  res.excitement = r.excitement;
  res.intensity = r.intensity;
  res.nausea = r.nausea;
  res.penalty = r.penalty;
  return res;
}
