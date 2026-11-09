/**
 * Track building: plan and apply pieces and gates (phase-2 §4.5, §4.6, §6). Owner: W1-G.
 * `planAppend` is pure, so the builder UI can use it for the ghost (valid, reason, cost, tiles).
 */
import { getTrackPieceDef, type TrackPieceDef, type TrackTypeDef } from '../../../data/track';
import { BRAKE_SPEED, MAX_PIECES, STATION_MAX_TILES } from '../../../data/tuning/track';
import { TRACK_ERR } from '../../../data/strings/track';
import { canAfford, pay, recordLedger, type CommandContext } from '../../economy/ledger';
import { Content, inBounds, tileIndex } from '../../map';
import { markNetworkDirty } from '../../pathing';
import type { World } from '../../types';
import type { Ride } from '../types';
import { clearTest, refundShare } from './common';
import { jointsEqual, pieceEntryJoint, pieceExitJoint, pieceWorldTiles, TRACK_DX, TRACK_DY, type Joint } from './geometry';
import { invalidateLayout } from './layout';
import { checkPieceTiles, pieceCost, refreshGroundTiles, type TilePlan } from './placement';
import type { TrackPieceInstance, TrackRideData } from './types';

export interface PiecePlan {
  piece: TrackPieceInstance;
  def: TrackPieceDef;
  tiles: TilePlan[];
  cost: number;
  closes: boolean;
}

export type PlanResult = { ok: true; plan: PiecePlan } | { ok: false; reason: string };

/** The joint where the next piece starts (the station entry when the track is empty). */
export function trackEnd(world: World, ride: Ride, data: TrackRideData): Joint {
  const last = data.pieces[data.pieces.length - 1];
  if (last) return pieceExitJoint(last);
  const map = world.state.map;
  const z = inBounds(map, ride.x, ride.y) ? (map.heights[tileIndex(map, ride.x, ride.y)] as number) : 0;
  return { x: ride.x, y: ride.y, z, dir: ride.rotation, slope: 'F', bank: 'none' };
}

/** Validate a piece at the track end (§4.6 order: length, piece, type, fit, tiles, supports, cash). */
export function planAppend(
  world: World,
  ride: Ride,
  data: TrackRideData,
  type: TrackTypeDef,
  defId: string,
  chain: boolean,
  brakeSpeed: number | undefined,
  ctx: CommandContext,
): PlanResult {
  const pieces = data.pieces;
  if (data.circuitClosed) return { ok: false, reason: TRACK_ERR.circuitAlreadyComplete };
  if (pieces.length >= MAX_PIECES) return { ok: false, reason: TRACK_ERR.tooLong };
  const def = getTrackPieceDef(defId);
  if (!def) return { ok: false, reason: TRACK_ERR.unknownPiece };
  if (pieces.length === 0 && def.special !== 'station') return { ok: false, reason: TRACK_ERR.mustStartWithStation };
  if (!type.groups.includes(def.group)) return { ok: false, reason: TRACK_ERR.typeCannotUse };
  if (chain && (!type.chain || !def.chainable)) return { ok: false, reason: TRACK_ERR.typeCannotUse };
  let bs: number | null = null;
  if (def.special === 'brakes') {
    bs = brakeSpeed ?? BRAKE_SPEED.default;
    if (!Number.isInteger(bs) || bs < BRAKE_SPEED.min || bs > BRAKE_SPEED.max) return { ok: false, reason: TRACK_ERR.brakeSpeedRange };
  }
  if (def.special === 'station') {
    const allStations = pieces.every((p) => getTrackPieceDef(p.defId)?.special === 'station');
    if (!allStations || pieces.length >= STATION_MAX_TILES) return { ok: false, reason: TRACK_ERR.doesNotFit };
  }
  const end = trackEnd(world, ride, data);
  if (def.entry.slope !== end.slope || def.entry.bank !== end.bank) return { ok: false, reason: TRACK_ERR.doesNotFit };
  const piece: TrackPieceInstance = { defId, x: end.x, y: end.y, z: end.z, dir: end.dir, chain, brakeSpeed: bs, cost: 0 };
  const chk = checkPieceTiles(world, ride.id, pieces.length, piece, type, pieces);
  if (!chk.ok) return chk;
  const cost = pieceCost(type, def, chain, chk.heightAboveGround);
  if (!canAfford(world, cost, ctx)) return { ok: false, reason: TRACK_ERR.notEnoughCash };
  piece.cost = cost;
  const first = pieces[0];
  const closes = first !== undefined && jointsEqual(pieceExitJoint(piece), pieceEntryJoint(first));
  return { ok: true, plan: { piece, def, tiles: chk.tiles, cost, closes } };
}

/** Apply a validated plan: add the piece, take ground tiles, pay, close the circuit. */
export function applyPlan(world: World, ride: Ride, data: TrackRideData, plan: PiecePlan, ctx: CommandContext): void {
  const map = world.state.map;
  data.pieces.push(plan.piece);
  for (const t of plan.tiles) {
    if (t.takesGround) {
      map.content[t.index] = Content.Track;
      map.contentRef[t.index] = ride.id;
    }
  }
  pay(world, plan.cost, 'construction', ctx);
  ride.totalBuildCost += plan.cost;
  if (plan.closes) data.circuitClosed = true;
  clearTest(ride, data);
}

/** Remove the last piece (not the first station). Returns the refund in cents. */
export function removeLast(world: World, ride: Ride, data: TrackRideData, ctx: CommandContext): number {
  const map = world.state.map;
  const piece = data.pieces.pop() as TrackPieceInstance;
  invalidateLayout(data);
  const tiles = pieceWorldTiles(piece)
    .filter((t) => inBounds(map, t.x, t.y))
    .map((t) => tileIndex(map, t.x, t.y));
  refreshGroundTiles(world, tiles);
  const refund = Math.floor(piece.cost * refundShare(data));
  if (!ctx.setup && refund > 0) recordLedger(world, 'demolitionRefunds', refund);
  ride.totalBuildCost -= piece.cost;
  data.circuitClosed = false;
  clearTest(ride, data);
  if (getTrackPieceDef(piece.defId)?.special === 'station') dropGatesNotBesideStation(world, ride, data);
  return refund;
}

/** Station tiles with their direction. */
export function stationPieces(data: TrackRideData): TrackPieceInstance[] {
  const out: TrackPieceInstance[] = [];
  for (const p of data.pieces) {
    if (getTrackPieceDef(p.defId)?.special !== 'station') break;
    out.push(p);
  }
  return out;
}

/** Outward direction when (x, y) is beside a station tile's side, else null. */
export function gateSide(data: TrackRideData, x: number, y: number): number | null {
  for (const p of stationPieces(data)) {
    for (const side of [(p.dir + 1) % 4, (p.dir + 3) % 4]) {
      if (p.x + (TRACK_DX[side] as number) === x && p.y + (TRACK_DY[side] as number) === y) return side;
    }
  }
  return null;
}

export function clearGateTile(world: World, ride: Ride, tile: number): void {
  const map = world.state.map;
  if (tile >= 0 && map.content[tile] === Content.Building && map.contentRef[tile] === ride.id) {
    map.content[tile] = Content.Empty;
    map.contentRef[tile] = -1;
  }
}

function dropGatesNotBesideStation(world: World, ride: Ride, data: TrackRideData): void {
  const map = world.state.map;
  let changed = false;
  for (const kind of ['entrance', 'exit'] as const) {
    const g = ride[kind];
    if (!g) continue;
    const x = g.gate % map.width;
    const y = Math.floor(g.gate / map.width);
    if (gateSide(data, x, y) === null) {
      clearGateTile(world, ride, g.gate);
      ride[kind] = null;
      changed = true;
    }
  }
  if (changed) markNetworkDirty(world);
}
