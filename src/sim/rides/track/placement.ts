/**
 * Placement, clearance, and supports (phase-2 §4.5–4.6). Owner: W1-G.
 * The per-tile occupancy list (master 6.3) is derived from the track rides on every call; it is never saved.
 *
 * Envelope of a track tile: [railMin − 1, railMax + 3) metres. A tile whose ground the track owns
 * (ground-level rail or a support) extends its envelope down to the ground.
 */
import { getTrackPieceDef, type TrackPieceDef, type TrackTypeDef } from '../../../data/track';
import {
  CHAIN_EXTRA_CENTS,
  ENVELOPE_ABOVE_M,
  ENVELOPE_BELOW_M,
  HEIGHT_COST_CENTS_PER_M,
  MAX_UNSUPPORTED_TILES,
  PATH_CLEARANCE_M,
} from '../../../data/tuning/track';
import { TRACK_ERR, fillTrackString } from '../../../data/strings/track';
import { Content, inBounds, isOwned, tileIndex, type MapState } from '../../map';
import type { World } from '../../types';
import { pieceStatic, pieceWorldTiles, type WorldPieceTile } from './geometry';
import type { TrackPieceInstance } from './types';

export interface Envelope {
  rideId: number;
  pieceIndex: number;
  railMin: number;
  railMax: number;
  rail: boolean;
}

export type Occupancy = Map<number, Envelope[]>;

/** Track envelopes by tile index, rides in ascending id order. */
export function buildOccupancy(world: World): Occupancy {
  const occ: Occupancy = new Map();
  const map = world.state.map;
  for (const ride of world.state.rides) {
    if (ride.kind !== 'track') continue;
    const data = world.state.track.rides[String(ride.id)];
    if (!data) continue;
    data.pieces.forEach((p, pieceIndex) => {
      if (!getTrackPieceDef(p.defId)) return;
      for (const t of pieceWorldTiles(p)) {
        if (!inBounds(map, t.x, t.y)) continue;
        const i = tileIndex(map, t.x, t.y);
        let list = occ.get(i);
        if (!list) {
          list = [];
          occ.set(i, list);
        }
        list.push({ rideId: ride.id, pieceIndex, railMin: t.railMin, railMax: t.railMax, rail: t.rail });
      }
    });
  }
  return occ;
}

/** True when this envelope blocks the ground of its tile (rail tile with a support, or too low for a path). */
export function needsGround(env: { rail: boolean; railMin: number }, ground: number): boolean {
  return env.rail || env.railMin < ground + PATH_CLEARANCE_M;
}

/** The envelope whose support or rail stands on the ground of this tile: the lowest that needs ground. */
export function groundOwner(envs: readonly Envelope[], ground: number): Envelope | null {
  let best: Envelope | null = null;
  for (const e of envs) {
    if (!needsGround(e, ground)) continue;
    if (
      !best ||
      e.railMin < best.railMin ||
      (e.railMin === best.railMin && (e.rideId < best.rideId || (e.rideId === best.rideId && e.pieceIndex < best.pieceIndex)))
    ) {
      best = e;
    }
  }
  return best;
}

function interval(env: Envelope | { railMin: number; railMax: number }, ground: number, ownsGround: boolean): [number, number] {
  const lo = ownsGround ? ground : env.railMin - ENVELOPE_BELOW_M;
  return [lo, env.railMax + ENVELOPE_ABOVE_M];
}

/** Recompute the ground content of track-affected tiles from the remaining track (after a removal). */
export function refreshGroundTiles(world: World, tiles: Iterable<number>): void {
  const map = world.state.map;
  const occ = buildOccupancy(world);
  for (const i of tiles) {
    const c = map.content[i];
    if (c !== Content.Empty && c !== Content.Track) continue;
    const owner = groundOwner(occ.get(i) ?? [], map.heights[i] as number);
    if (owner) {
      map.content[i] = Content.Track;
      map.contentRef[i] = owner.rideId;
    } else {
      map.content[i] = Content.Empty;
      map.contentRef[i] = -1;
    }
  }
}

export interface TilePlan {
  index: number;
  wt: WorldPieceTile;
  /** The new piece takes the ground of this tile (content becomes Track). */
  takesGround: boolean;
}

export interface TileCheck {
  ok: true;
  tiles: TilePlan[];
  /** Highest rail above the ground on this piece (m). */
  heightAboveGround: number;
}

/**
 * Check the tiles of a candidate piece of ride `rideId` (index `pieceIndex` in its list).
 * `ownPieces` is the ride's current piece list (for the span rule). Returns a §4.6 reason or the tile plan.
 */
export function checkPieceTiles(
  world: World,
  rideId: number,
  pieceIndex: number,
  piece: TrackPieceInstance,
  type: TrackTypeDef,
  ownPieces: readonly TrackPieceInstance[],
): TileCheck | { ok: false; reason: string } {
  const map = world.state.map;
  const def = getTrackPieceDef(piece.defId) as TrackPieceDef;
  const wts = pieceWorldTiles(piece);
  for (const t of wts) {
    if (!inBounds(map, t.x, t.y) || !isOwned(map, tileIndex(map, t.x, t.y))) return { ok: false, reason: TRACK_ERR.outsidePark };
  }
  const idx = wts.map((t) => tileIndex(map, t.x, t.y));
  if (def.special === 'station') {
    for (const i of idx) if (piece.z !== map.heights[i]) return { ok: false, reason: TRACK_ERR.stationOnGround };
  }
  for (let k = 0; k < wts.length; k++) {
    if ((wts[k] as WorldPieceTile).railMin < (map.heights[idx[k] as number] as number)) return { ok: false, reason: TRACK_ERR.belowGround };
  }
  let heightAboveGround = 0;
  for (let k = 0; k < wts.length; k++) {
    const h = (wts[k] as WorldPieceTile).railMax - (map.heights[idx[k] as number] as number);
    if (h > heightAboveGround) heightAboveGround = h;
  }
  if (heightAboveGround > type.maxHeightM) return { ok: false, reason: fillTrackString(TRACK_ERR.tooHigh, { n: type.maxHeightM }) };

  const occ = buildOccupancy(world);
  const plans: TilePlan[] = [];
  for (let k = 0; k < wts.length; k++) {
    const wt = wts[k] as WorldPieceTile;
    const i = idx[k] as number;
    const g = map.heights[i] as number;
    const c = map.content[i];
    if (c === Content.Building || c === Content.ParkEntrance || c === Content.Scenery) {
      return { ok: false, reason: TRACK_ERR.hitsBuilding };
    }
    if (c === Content.Footpath || c === Content.Queue) {
      if (wt.railMin < g + PATH_CLEARANCE_M) return { ok: false, reason: TRACK_ERR.hitsPath };
    }
    const takesGround = c === Content.Empty && needsGround(wt, g);
    const [lo, hi] = interval(wt, g, takesGround);
    const envs = occ.get(i) ?? [];
    const owner = c === Content.Track ? groundOwner(envs, g) : null;
    if (c === Content.Track && envs.length === 0) {
      return { ok: false, reason: map.contentRef[i] === rideId ? TRACK_ERR.hitsOwnTrack : TRACK_ERR.hitsOtherTrack };
    }
    for (const e of envs) {
      const [elo, ehi] = interval(e, g, e === owner);
      if (lo < ehi && elo < hi) {
        return { ok: false, reason: e.rideId === rideId ? TRACK_ERR.hitsOwnTrack : TRACK_ERR.hitsOtherTrack };
      }
    }
    plans.push({ index: i, wt, takesGround });
  }

  // Span rule: at most 2 consecutive rail tiles without a support along the track.
  let run = trailingUnsupported(world, rideId, ownPieces.slice(0, pieceIndex), occ);
  const st = pieceStatic(piece.defId);
  for (const ti of st.railOrder) {
    const p = plans[ti] as TilePlan;
    if (p.takesGround) run = 0;
    else if (++run > MAX_UNSUPPORTED_TILES) return { ok: false, reason: TRACK_ERR.noSupports };
  }
  return { ok: true, tiles: plans, heightAboveGround };
}

/** Rail tiles without a support at the end of the existing track. */
function trailingUnsupported(world: World, rideId: number, pieces: readonly TrackPieceInstance[], occ: Occupancy): number {
  const map = world.state.map;
  let run = 0;
  for (let pi = pieces.length - 1; pi >= 0; pi--) {
    const p = pieces[pi] as TrackPieceInstance;
    const st = pieceStatic(p.defId);
    const wts = pieceWorldTiles(p);
    for (let r = st.railOrder.length - 1; r >= 0; r--) {
      const wt = wts[st.railOrder[r] as number] as WorldPieceTile;
      const i = tileIndex(map, wt.x, wt.y);
      if (map.content[i] === Content.Track) {
        const owner = groundOwner(occ.get(i) ?? [], map.heights[i] as number);
        if (owner && owner.rideId === rideId && owner.pieceIndex === pi) return run;
      }
      run++;
    }
  }
  return run;
}

/** Build cost of one piece (§4.12), cents. */
export function pieceCost(type: TrackTypeDef, def: TrackPieceDef, chain: boolean, heightAboveGround: number): number {
  return (
    Math.round((def.cost * type.costs.pieceFactorPermille) / 1000) +
    (chain ? CHAIN_EXTRA_CENTS : 0) +
    HEIGHT_COST_CENTS_PER_M * Math.max(0, heightAboveGround)
  );
}

/** Highest rail above the ground over all pieces (m). */
export function highestAboveGround(map: MapState, pieces: readonly TrackPieceInstance[]): number {
  let best = 0;
  for (const p of pieces) {
    if (!getTrackPieceDef(p.defId)) continue;
    for (const t of pieceWorldTiles(p)) {
      if (!inBounds(map, t.x, t.y)) continue;
      const h = t.railMax - (map.heights[tileIndex(map, t.x, t.y)] as number);
      if (h > best) best = h;
    }
  }
  return best;
}
