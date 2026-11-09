/**
 * Track API for other modules (renderer, UI, economy, weather, saves). Owner: W1-G.
 * The signatures of `canOpenTrackRide` and `demolishTrackRide` are a contract.
 */
import { getTrackPieceDef, getTrackTypeDef, type TrackPieceDef } from '../../../data/track';
import { TICKS_PER_MONTH } from '../../../data/tuning/core';
import {
  DEP_FLOOR,
  DEP_MONTHS,
  EXTRA_TRAIN_RUN_DIVISOR,
  RUN_COST_PER_PIECE_CENTS,
  TALL_HEIGHT_M,
} from '../../../data/tuning/track';
import { TRACK_ERR, TRACK_RATING_WARN, fillTrackString } from '../../../data/strings/track';
import { ok, type CommandContext, type CommandResult } from '../../commands/types';
import { recordLedger } from '../../economy/ledger';
import { findGuest, finishRide, forgetDestination, leaveQueue } from '../../guests/api';
import { Content, inBounds, tileIndex } from '../../map';
import { markOccupancyDirty } from '../../occupancy';
import { markNetworkDirty } from '../../pathing';
import type { GameState, World } from '../../types';
import type { Cents } from '../../units';
import type { Ride } from '../types';
import { planAppend, trackEnd } from './build';
import { trainCountBlock } from './commands';
import { findRide, refundShare, trackData } from './common';
import { jointsEqual, localToWorld, pieceEntryJoint, pieceExitJoint, piecesForEnd, pieceStatic, pieceWorldTiles, worldYaw } from './geometry';
import { buildLayout, getLayout, newSamplePoint, poseAt, type TrackPose } from './layout';
import { buildOccupancy, groundOwner, highestAboveGround, refreshGroundTiles } from './placement';
import { ratingWarnings } from './ratings';
import type { TrackPieceInstance, TrackRideData, TrainState } from './types';

/** Null when the track ride may open, else the reason (phase-2 §4.6 strings). */
export function canOpenTrackRide(world: World, ride: Ride): string | null {
  const data = trackData(world, ride.id);
  if (!data) return TRACK_ERR.noRide;
  if (ride.status === 'testing') return TRACK_ERR.waitForTest;
  if (!data.circuitClosed) return TRACK_ERR.circuitNotComplete;
  if (!ride.entrance || !ride.exit) return TRACK_ERR.needGates;
  if (!data.test || !data.test.passed || !ride.stats) return TRACK_ERR.runTestFirst;
  return trainCountBlock(data, data.typeId);
}

/** Remove a whole track ride: pieces, gates, trains, riders (refund rule master R15). */
export function demolishTrackRide(world: World, ride: Ride, ctx: CommandContext): CommandResult {
  const s = world.state;
  const map = s.map;
  const data = trackData(world, ride.id);
  // Riders leave through the exit gate; the queue empties.
  if (data) {
    for (const t of data.trains) {
      for (let k = 0; k < t.seats.length; k++) {
        const gid = t.seats[k] as number;
        if (gid < 0) continue;
        t.seats[k] = -1;
        const g = findGuest(world, gid);
        if (g) {
          g.seat = null;
          finishRide(world, g, ride);
        }
      }
    }
  }
  ride.riders = [];
  for (const gid of [...ride.queue]) {
    const g = findGuest(world, gid);
    if (g) leaveQueue(world, g, ride, null);
  }
  ride.queue = [];

  const tiles = new Set<number>();
  if (data) {
    for (const p of data.pieces) {
      if (!getTrackPieceDef(p.defId)) continue;
      for (const t of pieceWorldTiles(p)) if (inBounds(map, t.x, t.y)) tiles.add(tileIndex(map, t.x, t.y));
    }
  }
  const refund = Math.floor(ride.totalBuildCost * (data ? refundShare(data) : 0.5));
  s.rides = s.rides.filter((r) => r.id !== ride.id);
  delete s.track.rides[String(ride.id)];
  for (let i = 0; i < map.content.length; i++) {
    if (map.contentRef[i] === ride.id && (map.content[i] === Content.Track || map.content[i] === Content.Building)) {
      map.content[i] = Content.Empty;
      map.contentRef[i] = -1;
      tiles.add(i);
    }
  }
  refreshGroundTiles(world, tiles);
  markOccupancyDirty(world);
  if (!ctx.setup && refund > 0) recordLedger(world, 'demolitionRefunds', refund);
  forgetDestination(world, `ride:${ride.id}`);
  markNetworkDirty(world);
  return ok(-refund);
}

/** Asset value (master R14): totalBuildCost × max(0.30, 1 − 0.7 × ageMonths / 120), cents. */
export function trackAssetValue(world: World, rideId: number): Cents {
  const ride = findRide(world, rideId);
  if (!ride) return 0;
  const ageMonths = Math.floor(Math.max(0, world.state.tick - ride.builtTick) / TICKS_PER_MONTH);
  const f = Math.max(DEP_FLOOR, 1 - ((1 - DEP_FLOOR) * ageMonths) / DEP_MONTHS);
  return Math.round(ride.totalBuildCost * f);
}

/** Running cost per month (§4.12): run base + $1.50 × pieces + extra train cost / 20 × (trains − 1), cents. */
export function trackRunningCostMonthly(world: World, ride: Ride): Cents {
  const data = trackData(world, ride.id);
  const type = getTrackTypeDef(data?.typeId ?? ride.defId);
  if (!type) return 0;
  const pieces = data ? data.pieces.length : 0;
  const trains = data ? data.trainConfig.trains : 1;
  return type.costs.runBase + RUN_COST_PER_PIECE_CENTS * pieces + Math.round((type.costs.extraTrain / EXTRA_TRAIN_RUN_DIVISOR) * (trains - 1));
}

/** Highest rail above the ground (m), from the current pieces. */
export function trackHighestPointM(world: World, rideId: number): number {
  const data = trackData(world, rideId);
  return data ? highestAboveGround(world.state.map, data.pieces) : 0;
}

/** Catalog `tall` flag: set from the last passed test when highest ≥ 20 m. */
export function trackIsTall(world: World, rideId: number): boolean {
  const t = trackData(world, rideId)?.test;
  return !!t && t.passed && t.highestM >= TALL_HEIGHT_M;
}

/** Throughput in guests per game hour (§4.11), or null without a passed test. */
export function trackThroughputPerHour(world: World, rideId: number): number | null {
  const data = trackData(world, rideId);
  const type = data ? getTrackTypeDef(data.typeId) : undefined;
  if (!data || !type || !data.test?.passed) return null;
  const seats = data.trainConfig.carsPerTrain * type.vehicle.seatsPerCar;
  return (seats * data.trainConfig.trains * 50) / (data.test.rideTimeTicks + data.operation.maxDwellTicks);
}

/** Ride panel warnings for the last test (§4.10 table). */
export function trackWarnings(world: World, rideId: number): string[] {
  const data = trackData(world, rideId);
  const t = data?.test;
  if (!data || !t) return [];
  if (!t.passed) {
    const piece = t.failPiece ?? 1;
    if (t.failKind === 'loop') return [fillTrackString(TRACK_RATING_WARN.testFailedLoop, { n: piece })];
    const name = getTrackPieceDef(data.pieces[piece - 1]?.defId ?? '')?.name ?? '';
    return [fillTrackString(TRACK_RATING_WARN.testFailedStop, { n: piece, name })];
  }
  return ratingWarnings(t);
}

/** Builder palette: pieces that fit the track end and the ride type (§7.1). */
export function nextTrackPieces(world: World, rideId: number): TrackPieceDef[] {
  const ride = findRide(world, rideId);
  const data = trackData(world, rideId);
  if (!ride || !data || data.circuitClosed) return [];
  const end = trackEnd(world, ride, data);
  const onlyStations = data.pieces.every((p) => getTrackPieceDef(p.defId)?.special === 'station');
  return piecesForEnd(data.typeId, end.slope, end.bank, onlyStations && data.pieces.length < 12);
}

/** Ghost preview for the builder: the same checks as `addTrackPiece`, without changing anything. */
export function previewTrackPiece(
  world: World,
  rideId: number,
  defId: string,
  chain = false,
  brakeSpeed?: number,
): { ok: true; cost: Cents; closes: boolean; tiles: number[]; heightAboveGround: number } | { ok: false; reason: string } {
  const ride = findRide(world, rideId);
  const data = trackData(world, rideId);
  const type = data ? getTrackTypeDef(data.typeId) : undefined;
  if (!ride || !data || !type) return { ok: false, reason: TRACK_ERR.noRide };
  const r = planAppend(world, ride, data, type, defId, chain, brakeSpeed, { setup: false });
  if (!r.ok) return r;
  const map = world.state.map;
  const h = Math.max(0, ...r.plan.tiles.map((t) => t.wt.railMax - (map.heights[t.index] as number)));
  return { ok: true, cost: r.plan.cost, closes: r.plan.closes, tiles: r.plan.tiles.map((t) => t.index), heightAboveGround: h };
}

/** Car poses of every train on the circuit, front car first (renderer). */
export function trainCarPoses(world: World, rideId: number): { trainId: number; seats: number[]; cars: TrackPose[] }[] {
  const data = trackData(world, rideId);
  const type = data ? getTrackTypeDef(data.typeId) : undefined;
  if (!data || !type || data.pieces.length === 0) return [];
  const layout = getLayout(data);
  const carLen = type.vehicle.carLengthMm;
  const cars = data.trainConfig.carsPerTrain;
  const sp = newSamplePoint();
  const out: { trainId: number; seats: number[]; cars: TrackPose[] }[] = [];
  for (const t of data.trains) {
    if (t.parked) continue;
    const n = Math.max(1, Math.round(t.seats.length / type.vehicle.seatsPerCar)) || cars;
    const front = t.s + (n * carLen) / 2;
    const poses: TrackPose[] = [];
    for (let k = 0; k < n; k++) poses.push(poseAt(layout, front - (k + 0.5) * carLen, sp));
    out.push({ trainId: t.id, seats: t.seats, cars: poses });
  }
  return out;
}

/**
 * Load check (phase-2 §5): every piece belongs to the type's piece set (Phase 4), pieces chain joint to joint,
 * `circuitClosed` matches the geometry, 0 ≤ train.s < circuit length, seats hold −1 or a guest id. With `state`, seated guests must exist and be
 * riding this ride. Null when sound, else a short reason.
 */
export function checkTrackRideForLoad(data: TrackRideData, state?: GameState): string | null {
  const type = getTrackTypeDef(data.typeId);
  if (!type) return 'Unknown track ride type';
  if (!Array.isArray(data.pieces) || data.pieces.length === 0) return 'Track ride has no pieces';
  for (const p of data.pieces) {
    const def = getTrackPieceDef(p.defId);
    if (!def) return 'Unknown track piece';
    // Phase 4 §4.4: a type builds only pieces of its own set (rail, flume, or rapids).
    if (def.set !== type.pieceSet) return 'Track piece does not belong to this ride type';
  }
  if (getTrackPieceDef((data.pieces[0] as { defId: string }).defId)?.special !== 'station') return 'Track does not start with a station';
  for (let i = 1; i < data.pieces.length; i++) {
    const prev = pieceExitJoint(data.pieces[i - 1]!);
    if (!jointsEqual(prev, pieceEntryJoint(data.pieces[i]!))) return 'Track pieces do not join';
  }
  const closes = jointsEqual(pieceExitJoint(data.pieces[data.pieces.length - 1]!), pieceEntryJoint(data.pieces[0]!));
  if (closes !== data.circuitClosed) return 'Circuit flag does not match the track';
  const L = buildLayout(data.pieces).lengthMm;
  for (const t of data.trains) {
    if (!Number.isInteger(t.s) || t.s < 0 || t.s >= L) return 'Train position is outside the circuit';
    if (!Number.isInteger(t.v) || t.v < 0) return 'Train speed is not valid';
    for (const g of t.seats) {
      if (!Number.isInteger(g) || g < -1) return 'Train seat is not valid';
      if (g >= 0 && state) {
        const guest = state.guests.find((x) => x.id === g);
        if (!guest || guest.state !== 'riding' || guest.seat?.rideId !== data.rideId) return 'Seated guest is not riding this ride';
      }
    }
  }
  return null;
}

/** One occupied tile of one piece, for per-tile slice rendering (§4.13). */
export interface TrackTileSlice {
  pieceIndex: number;
  tile: number;
  x: number;
  y: number;
  /** Absolute rail range on this tile (m). */
  railMin: number;
  railMax: number;
  /** The rail passes over this tile (false: reserved corner of a medium turn). */
  rail: boolean;
  /** A support stands under this tile, from the ground up to `railMin`. */
  support: boolean;
  ground: number;
}

/**
 * Every occupied tile of a ride's pieces with its support flag. Builds the occupancy list, so call it when the
 * track changes (cache by piece count), not every frame.
 */
export function trackTileSlices(world: World, rideId: number): TrackTileSlice[] {
  const data = trackData(world, rideId);
  if (!data) return [];
  const map = world.state.map;
  const occ = buildOccupancy(world);
  const out: TrackTileSlice[] = [];
  data.pieces.forEach((p, pieceIndex) => {
    if (!getTrackPieceDef(p.defId)) return;
    for (const t of pieceWorldTiles(p)) {
      if (!inBounds(map, t.x, t.y)) continue;
      const tile = tileIndex(map, t.x, t.y);
      const ground = map.heights[tile] as number;
      const owner = map.content[tile] === Content.Track ? groundOwner(occ.get(tile) ?? [], ground) : null;
      const support = !!owner && owner.rideId === rideId && owner.pieceIndex === pieceIndex && t.railMin > ground;
      out.push({ pieceIndex, tile, x: t.x, y: t.y, railMin: t.railMin, railMax: t.railMax, rail: t.rail, support, ground });
    }
  });
  return out;
}

/** World samples of a placed piece (every 0.25 m): metres (tile x spans [4x, 4x + 4]), absolute height, angles. */
export function pieceWorldSamples(piece: TrackPieceInstance): {
  n: number;
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  yaw: Float64Array;
  pitch: Float64Array;
  bankSin: Float64Array;
  bankCos: Float64Array;
} {
  const sm = pieceStatic(piece.defId).samples;
  const n = sm.n;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const z = new Float64Array(n);
  const yaw = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const w = localToWorld(piece, sm.x[k] as number, sm.y[k] as number);
    x[k] = w.x;
    y[k] = w.y;
    z[k] = piece.z + (sm.h[k] as number);
    yaw[k] = worldYaw(piece, sm.yaw[k] as number);
  }
  return { n, x, y, z, yaw, pitch: sm.theta, bankSin: sm.sinB, bankCos: sm.cosB };
}

/** Spin frame (0–15) of a spinning car, derived from the distance travelled (render only, deterministic). */
export function trainSpinFrame(train: TrainState): number {
  return Math.floor(train.dist / 750) % 16;
}
