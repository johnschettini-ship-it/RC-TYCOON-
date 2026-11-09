/**
 * Track ride operation (phase-2-coasters.md §4.7 fault guard, §4.8 blocks and dispatch, §4.9 live test, §4.11 guests).
 * Owner: W1-G; Phase 6 (W4-D): Monorail stops (`stops.ts`) and the `trainDrop` and `splash` sound cues (`cues.ts`). Trains update in ascending train id; decisions use a snapshot of the other trains taken at the start of
 * the ride's tick, so the order never changes the outcome.
 *
 * Breakdowns (Phase 3 §4.5, master R16): a broken ride (not `slow_running`) holds each train at the station or at the
 * next block brake and dispatches nothing. Unattended for EVACUATE_TICKS (`isEvacuating`: no Mechanic assigned), the
 * ride evacuates: a train held in the station lets its riders off through `finishRide` (exit gate); a train held at a
 * block brake keeps its riders seated and moves on block by block (normal block rules, so trains never touch) until
 * it reaches the station, where its riders get off. An empty train in the station goes to the shed when another train
 * is still out, so the next one can reach the station. Nobody boards, and the ride stays broken until it is fixed.
 */
import type { TrackTypeDef } from '../../../data/track';
import { getTrackPieceDef } from '../../../data/track';
import {
  BLOCK_MARGIN_MM,
  GAP_RULE_MM,
  KART_DISPATCH_SPACING_TICKS,
  TEST_KART_TEMPERAMENT,
  UNLOAD_TICKS,
} from '../../../data/tuning/track';
import { isEvacuating, onRideDispatch } from '../../breakdowns/api';
import { emit } from '../../events';
import { boardRide, findGuest, finishRide, leaveQueue } from '../../guests/api';
import { emitSound } from '../../sound';
import type { World } from '../../types';
import type { Ride } from '../types';
import { kartSpeedMms } from './testRun';
import { getLayout, type CircuitLayout } from './layout';
import { emitTrackCues } from './cues';
import { newTrain, stepTrain, stopCentreMm, type StepContext, type StepResult } from './physics';
import { stepWithStops, usesStops } from './stops';
import type { TrackRideData, TrainState } from './types';

/** Snapshot of a train for this tick's decisions (positions in mm). */
interface Snap {
  id: number;
  front: number;
  tail: number;
  len: number;
  v: number;
}

function modL(x: number, L: number): number {
  const r = x % L;
  return r < 0 ? r + L : r;
}

export function trainLen(type: TrackTypeDef, data: TrackRideData): number {
  return data.trainConfig.carsPerTrain * type.vehicle.carLengthMm;
}

/** Create the configured trains: the first in the station, the rest in the shed. */
export function ensureTrains(data: TrackRideData, type: TrackTypeDef, layout: CircuitLayout): void {
  if (data.trains.length > 0) return;
  const cars = data.trainConfig.carsPerTrain;
  const sc = stopCentreMm(layout, trainLen(type, data));
  for (let i = 0; i < data.trainConfig.trains; i++) {
    const t = newTrain(i + 1, sc, cars, type.vehicle.seatsPerCar);
    t.parked = i > 0;
    data.trains.push(t);
  }
}

function snapshot(data: TrackRideData, layout: CircuitLayout, len: number): Snap[] {
  const L = layout.lengthMm;
  const half = Math.round(len / 2);
  return data.trains
    .filter((t) => !t.parked)
    .map((t) => ({ id: t.id, front: modL(t.s + half, L), tail: modL(t.s - half, L), len, v: t.v }));
}

/** True when another train occupies the block that starts at block point index `k` (§4.8, with a 1 m margin). */
function blockOccupied(layout: CircuitLayout, snaps: readonly Snap[], k: number, selfId: number): boolean {
  const L = layout.lengthMm;
  const P = layout.blockPoints;
  const a = P[k] as number;
  const b = P[(k + 1) % P.length] as number;
  const blen = modL(b - a, L) || L;
  for (const s of snaps) {
    if (s.id === selfId) continue;
    const d = modL(s.front - a, L);
    if (d > 0 && d <= blen) return true;
    if (modL(b - (s.tail - BLOCK_MARGIN_MM), L) <= s.len + BLOCK_MARGIN_MM) return true;
  }
  return false;
}

/** Index of the block whose end is the station stop point (the block before the station). */
function lastBlock(layout: CircuitLayout): number {
  return layout.blockPoints.length - 1;
}

/** Laps this train runs before it stops in the station. */
function lapsFor(type: TrackTypeDef, data: TrackRideData, t: TrainState, L: number): number {
  if (type.drive !== 'guestDriven') return 1;
  return Math.max(data.operation.laps, Math.floor(t.dist / L) + 1);
}

/**
 * Unload one train: riders leave through the exit gate. `finishRide` (guest module) applies the ride effects,
 * including the §4.11 temperament reactions and their thoughts (`airtimeAwesome`, `neverUpsideDown`).
 */
function unloadTrain(world: World, ride: Ride, t: TrainState): void {
  for (let k = 0; k < t.seats.length; k++) {
    const gid = t.seats[k] as number;
    if (gid < 0) continue;
    t.seats[k] = -1;
    const ri = ride.riders.indexOf(gid);
    if (ri >= 0) ride.riders.splice(ri, 1);
    const g = findGuest(world, gid);
    if (!g) continue;
    g.seat = null;
    finishRide(world, g, ride);
  }
}

/** Board guests from the queue front into free seats, front car first (§4.11). */
function boardTrain(world: World, ride: Ride, type: TrackTypeDef, t: TrainState): void {
  const spc = type.vehicle.seatsPerCar;
  for (let seat = 0; seat < t.seats.length && ride.queue.length > 0; seat++) {
    if ((t.seats[seat] as number) >= 0) continue;
    while (ride.queue.length > 0) {
      const gid = ride.queue[0] as number;
      const g = findGuest(world, gid);
      if (!g) {
        ride.queue.shift();
        continue;
      }
      if (boardRide(world, g, ride)) {
        const qi = ride.queue.indexOf(gid);
        if (qi >= 0) ride.queue.splice(qi, 1);
        t.seats[seat] = gid;
        g.seat = { rideId: ride.id, trainId: t.id, car: Math.floor(seat / spc), seat: seat % spc };
        ride.riders.push(gid);
        ride.totals.riders++;
        ride.totals.ridersThisMonth++;
        ride.totals.income += ride.price;
        ride.totals.incomeThisMonth += ride.price;
        break;
      }
      leaveQueue(world, g, ride, null);
      const qi = ride.queue.indexOf(gid);
      if (qi >= 0) ride.queue.splice(qi, 1);
    }
  }
}

function stationTile(world: World, ride: Ride): number {
  return ride.entrance?.gate ?? ride.y * world.state.map.width + ride.x;
}

/** Fault guard (§4.7): a stall in operation closes the ride; riders appear at the exit gate. */
export function faultClose(world: World, ride: Ride, data: TrackRideData, pieceIndex: number): void {
  console.error(`Track ride ${ride.id} (${ride.name}): train stalled on piece ${pieceIndex + 1} in operation`);
  for (const t of data.trains) unloadTrain(world, ride, t);
  ride.status = 'closed';
  ride.stats = null;
  data.test = null;
  data.trains = [];
  emit(world, { type: 'message', category: 'park', textId: 'track.fault', tile: stationTile(world, ride), entityId: ride.id });
}

/** Live test (§4.9): the test train runs its lap; the precomputed result is published when the lap ends. */
export function stepLiveTest(world: World, ride: Ride, data: TrackRideData, type: TrackTypeDef): void {
  const run = data.testRun;
  if (!run) {
    ride.status = 'closed';
    return;
  }
  const layout = getLayout(data);
  const t = data.trains[0];
  const stops = usesStops(layout, type);
  if (t && (t.state === 'running' || (stops && t.state === 'held'))) {
    const ctx: StepContext = {
      layout,
      type,
      pieces: data.pieces,
      trainLenMm: trainLen(type, data),
      laps: 1,
      holdFrontMm: null,
      leader: null,
      slowFactor: 1,
    };
    // Phase 6 Monorail: the live test train dwells at each stop, exactly as the precomputed lap did.
    const from = t.s;
    const dist0 = t.dist;
    const r = stops ? stepWithStops(ctx, layout, t) : stepTrain(ctx, t);
    if (r) {
      emitTrackCues(world, ride, layout, t, from, t.dist - dist0);
      if (r.stall || r.arrived) t.state = 'waiting';
    }
  }
  run.ticksLeft--;
  if (run.ticksLeft > 0) return;
  const res = run.result;
  data.testRun = null;
  data.test = res;
  data.trains = [];
  ride.status = 'closed';
  ride.stats = res.passed ? { excitement: res.excitement, intensity: res.intensity, nausea: res.nausea } : null;
  const tile = stationTile(world, ride);
  if (res.passed) {
    emit(world, { type: 'message', category: 'park', textId: 'track.testPassed', params: { name: ride.name }, tile, entityId: ride.id });
  } else {
    const n = res.failPiece ?? 1;
    const name = getTrackPieceDef(data.pieces[n - 1]?.defId ?? '')?.name ?? '';
    const textId = res.failKind === 'loop' ? 'track.testFailedLoop' : res.failKind === 'corkscrew' ? 'track.testFailedCorkscrew' : 'track.testFailedStop';
    emit(world, { type: 'message', category: 'park', textId, params: { n, name }, tile, entityId: ride.id });
  }
}

/** One tick of operation for a built, tested (or closed) ride. */
export function operateRide(world: World, ride: Ride, data: TrackRideData, type: TrackTypeDef): void {
  const layout = getLayout(data);
  const L = layout.lengthMm;
  if (L <= 0) return;
  ensureTrains(data, type, layout);
  const tick = world.state.tick;
  const open = ride.status === 'open';
  const closed = ride.status === 'closed';
  // Unattended breakdown (`isEvacuating`, Phase 3 §4.5 + master R16): station trains let riders off and empty
  // trains go to the shed, as when the ride closes; held trains move on block by block to the station.
  const evacuating = isEvacuating(world, ride);
  const holdAll = ride.status === 'broken' && ride.breakdownType !== 'slow_running' && !evacuating;
  const slowFactor = ride.breakdownType === 'slow_running' ? 0.6 : 1;
  const len = trainLen(type, data);
  const stopC = stopCentreMm(layout, len);
  const gravity = type.drive === 'gravity';
  const stops = usesStops(layout, type);
  const snaps = snapshot(data, layout, len);
  const snapOf = new Map(snaps.map((s) => [s.id, s]));
  const P = layout.blockPoints;
  // Trains leave the shed before anyone moves, so every decision this tick sees them.
  if (open) {
    for (const t of data.trains) {
      if (!t.parked) continue;
      const free = gravity
        ? !blockOccupied(layout, snaps, lastBlock(layout), t.id) && arcFree(snaps, L, layout.stopFrontMm, len, t.id)
        : arcFree(snaps, L, layout.stopFrontMm + GAP_RULE_MM, len + GAP_RULE_MM + 10_000, t.id);
      if (free) {
        t.parked = false;
        t.s = stopC;
        t.v = 0;
        t.state = 'loading';
        t.dwellTicks = 0;
        t.dist = 0;
        t.lap = 0;
        const half = Math.round(len / 2);
        const snap: Snap = { id: t.id, front: modL(t.s + half, L), tail: modL(t.s - half, L), len, v: 0 };
        snaps.push(snap);
        snapOf.set(t.id, snap);
      }
      break;
    }
  }

  for (const t of data.trains) {
    if (t.parked) continue;
    switch (t.state) {
      case 'unloading':
        t.dwellTicks++;
        if (t.dwellTicks >= UNLOAD_TICKS) {
          unloadTrain(world, ride, t);
          t.state = 'loading';
          t.dwellTicks = 0;
        }
        break;
      case 'loading':
      case 'waiting': {
        const riders = t.seats.some((g) => g >= 0);
        if (closed || evacuating) {
          if (riders) {
            t.state = 'unloading';
            t.dwellTicks = 0;
          } else if (data.trains.some((o) => o !== t && !o.parked)) {
            t.parked = true;
          }
          break;
        }
        if (!open) break;
        if (t.state === 'loading') {
          boardTrain(world, ride, type, t);
          t.dwellTicks++;
          const full = t.seats.every((g) => g >= 0);
          if (t.dwellTicks >= data.operation.maxDwellTicks || (full && t.dwellTicks >= data.operation.minDwellTicks)) t.state = 'waiting';
          break;
        }
        // waiting: dispatch when the next block is free (gravity) and the kart spacing allows it.
        if (gravity && blockOccupied(layout, snaps, 0, t.id)) break;
        if (type.drive === 'guestDriven' && data.lastDispatchTick >= 0 && tick - data.lastDispatchTick < KART_DISPATCH_SPACING_TICKS) break;
        if (onRideDispatch(world, ride)) break;
        t.state = 'running';
        t.dwellTicks = 0;
        t.dist = 0;
        t.lap = 0;
        t.release = gravity;
        t.lapStartTick = tick;
        if (type.drive === 'guestDriven') {
          const driver = (t.seats[0] as number) >= 0 ? findGuest(world, t.seats[0] as number) : undefined;
          t.driveMms = kartSpeedMms(driver ? driver.temperament : TEST_KART_TEMPERAMENT);
        }
        data.lastDispatchTick = tick;
        // Phase 6 §4.2 `ride_bell` (W4-A): a train leaves the station.
        emitSound(world, 'rideCycleStart', ride.y * world.state.map.width + ride.x, ride.id);
        break;
      }
      default: {
        // running or held
        const me = snapOf.get(t.id) as Snap;
        let holdFrontMm: number | null = null;
        if (gravity) {
          let best = Infinity;
          let bestK = -1;
          for (let k = 1; k < P.length; k++) {
            const d = modL((P[k] as number) - me.front, L);
            if (d < best) {
              best = d;
              bestK = k;
            }
          }
          const toStation = lapsFor(type, data, t, L) * L - t.dist;
          if (bestK > 0 && best < toStation && (holdAll || blockOccupied(layout, snaps, bestK, t.id))) holdFrontMm = best;
        }
        let leader: StepContext['leader'] = null;
        if (!gravity) {
          let gap = Infinity;
          let vL = 0;
          for (const o of snaps) {
            if (o.id === t.id) continue;
            const g = modL(o.tail - me.front, L);
            if (g < gap) {
              gap = g;
              vL = o.v;
            }
          }
          if (gap !== Infinity) leader = { gapMm: gap, vMms: vL };
        }
        const ctx: StepContext = { layout, type, pieces: data.pieces, trainLenMm: len, laps: lapsFor(type, data, t, L), holdFrontMm, leader, slowFactor };
        const lapsBefore = Math.floor(t.dist / L);
        const from = t.s;
        const dist0 = t.dist;
        let r: StepResult;
        if (stops) {
          // Phase 6 Monorail: dwell at a stop (riders stay seated), else go on to the next stop or the station.
          const sr = stepWithStops(ctx, layout, t);
          if (!sr) break;
          r = sr;
        } else {
          if (t.state === 'held' && holdFrontMm === null) {
            t.state = 'running';
            t.release = gravity;
          }
          ctx.holdFrontMm = holdFrontMm;
          r = stepTrain(ctx, t);
        }
        emitTrackCues(world, ride, layout, t, from, t.dist - dist0);
        if (r.stall) {
          faultClose(world, ride, data, r.pieceIndex);
          return;
        }
        if (type.drive === 'guestDriven' && Math.floor(t.dist / L) > lapsBefore && !r.arrived) {
          const lapTicks = tick + 1 - t.lapStartTick;
          if (data.bestLapTicks === null || lapTicks < data.bestLapTicks) data.bestLapTicks = lapTicks;
          t.lap++;
          t.lapStartTick = tick + 1;
        }
        if (r.arrived) {
          if (type.drive === 'guestDriven') {
            const lapTicks = tick + 1 - t.lapStartTick;
            if (data.bestLapTicks === null || lapTicks < data.bestLapTicks) data.bestLapTicks = lapTicks;
          }
          t.state = 'unloading';
          t.dwellTicks = 0;
          t.dist = 0;
          t.lap = 0;
          t.release = false;
        } else if (r.stopped === 'hold') {
          t.state = 'held';
        }
        break;
      }
    }
  }
}

/** No other train has any part in the arc of length `len` ending at `front`. */
function arcFree(snaps: readonly Snap[], L: number, front: number, len: number, selfId: number): boolean {
  const start = front - len - BLOCK_MARGIN_MM;
  const alen = len + BLOCK_MARGIN_MM;
  for (const s of snaps) {
    if (s.id === selfId) continue;
    // Intervals [start, front] and [s.tail, s.front] on the circle intersect?
    if (modL(s.front - start, L) <= alen || modL(front - s.tail, L) <= s.len) return false;
  }
  return true;
}
