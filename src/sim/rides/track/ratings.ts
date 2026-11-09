/** Ratings from measured values (phase-2-coasters.md §4.10; water extras Phase 4 §4.4). Owner: W1-G; water extras W3-C. */
import type { TrackPieceDef, TrackTypeDef } from '../../../data/track';
import { RATING, WARN, WATER_RATING_EXTRAS } from '../../../data/tuning/track';
import { TRACK_RATING_WARN } from '../../../data/strings/track';
import type { TestResult } from './types';

/** Measured values in natural units: m/s, s, m, G. */
export interface RatingInputs {
  vMax: number;
  rideTime: number;
  length: number;
  drops: number;
  dropMax: number;
  posGMax: number;
  vertGMin: number;
  airtime: number;
  latMax: number;
  inversions: number;
  turnPieces: number;
  smallTurns: number;
  spookyTunnels: number;
  laps: number;
}

export interface Ratings {
  /** Integer hundredths, 0–1000. */
  excitement: number;
  intensity: number;
  nausea: number;
  penalty: boolean;
}

function softCap(x: number): number {
  return x > RATING.softCapAt ? RATING.softCapAt + (x - RATING.softCapAt) * RATING.softCapFactor : x;
}

function finish(x: number): number {
  const c = x < 0 ? 0 : x > RATING.max ? RATING.max : x;
  return Math.round(c * 100);
}

function extraTerm(type: TrackTypeDef, m: RatingInputs): number {
  switch (type.ratings.extra) {
    case 'scenic':
      return Math.min(m.length / 100, 1.5);
    case 'smallTurns':
      return Math.min(0.1 * m.smallTurns, 1.0);
    case 'spooky':
      return Math.min(0.4 * m.spookyTunnels, 2.0);
    case 'laps':
      return 0.2 * m.laps;
    default:
      return 0;
  }
}

export function computeRatings(m: RatingInputs, type: TrackTypeDef): Ratings {
  const E = RATING.excitement;
  const I = RATING.intensity;
  const N = RATING.nausea;
  const P = RATING.penalty;
  let e =
    E.vMax * m.vMax +
    E.drop * Math.min(m.dropMax, E.dropCap) +
    E.drops * Math.min(m.drops, E.dropsCap) +
    E.air * type.ratings.kAir * Math.min(m.airtime, E.airCap) +
    E.inv * Math.min(m.inversions, E.invCap) +
    E.lat * Math.min(m.latMax, E.latCap) +
    Math.min(m.rideTime / E.timeDiv, E.timeCap) +
    type.ratings.e +
    extraTerm(type, m);
  let i =
    I.posG * Math.max(0, m.posGMax - I.posGBase) +
    I.negG * Math.max(0, I.negGBase - m.vertGMin) +
    I.lat * m.latMax +
    I.vMax * m.vMax +
    I.inv * Math.min(m.inversions, I.invCap) +
    I.drop * Math.min(m.dropMax, I.dropCap) +
    type.ratings.i;
  let n =
    N.posG * Math.max(0, m.posGMax - N.posGBase) +
    N.lat * m.latMax +
    N.inv * Math.min(m.inversions, N.invCap) +
    N.air * Math.min(m.airtime, N.airCap) +
    Math.min(N.turn * m.turnPieces, N.turnCap) +
    type.ratings.n;

  e = softCap(e);
  i = softCap(i);
  n = softCap(n);

  let penalty = false;
  if (m.posGMax > P.posGMax) {
    e -= P.factor * (m.posGMax - P.posGMax);
    penalty = true;
  }
  if (m.vertGMin < P.vertGMin) {
    e -= P.factor * (P.vertGMin - m.vertGMin);
    penalty = true;
  }
  if (m.latMax > P.latMax) {
    e -= P.factor * (m.latMax - P.latMax);
    penalty = true;
  }
  if (m.rideTime < P.shortRideS) {
    e *= m.rideTime / P.shortRideS;
    penalty = true;
  }
  return { excitement: finish(e), intensity: finish(i), nausea: finish(n), penalty };
}

/** Water rating extras in integer hundredths. */
export interface WaterExtras {
  e: number;
  i: number;
  n: number;
}

/**
 * Water rating extras of a circuit (Phase 4 §4.4 table): each splashdown, waterfall, rough piece, and whirlpool adds its
 * row, counted up to the row's limit. Rail pieces add nothing.
 */
export function waterRatingExtras(defs: readonly TrackPieceDef[]): WaterExtras {
  const count = { splashdown: 0, waterfall: 0, rough: 0, whirlpool: 0 };
  for (const d of defs) {
    const sp = d.special;
    if (sp === 'splashdown' || sp === 'waterfall' || sp === 'rough' || sp === 'whirlpool') count[sp]++;
  }
  const out: WaterExtras = { e: 0, i: 0, n: 0 };
  for (const key of ['splashdown', 'waterfall', 'rough', 'whirlpool'] as const) {
    const row = WATER_RATING_EXTRAS[key];
    const n = Math.min(count[key], row.max);
    out.e += row.e * n;
    out.i += row.i * n;
    out.n += row.n * n;
  }
  return out;
}

/** Add the water extras to a finished Phase 2 result ("after its formula") and clamp to 0.00–10.00. */
export function addWaterExtras(r: Ratings, x: WaterExtras): Ratings {
  const max = RATING.max * 100;
  const clamp = (v: number): number => (v < 0 ? 0 : v > max ? max : v);
  return { excitement: clamp(r.excitement + x.e), intensity: clamp(r.intensity + x.i), nausea: clamp(r.nausea + x.n), penalty: r.penalty };
}

/** Measured values of a stored test in natural units. */
export function ratingInputsOf(t: TestResult): RatingInputs {
  return {
    vMax: t.vMaxMms / 1000,
    rideTime: t.rideTimeTicks / 20,
    length: t.lengthMm / 1000,
    drops: t.drops,
    dropMax: t.dropMaxMm / 1000,
    posGMax: t.posGMax / 100,
    vertGMin: t.vertGMin / 100,
    airtime: t.airtimeTicks / 20,
    latMax: t.latMax / 100,
    inversions: t.inversions,
    turnPieces: t.turnPieces,
    smallTurns: t.smallTurns,
    spookyTunnels: t.spookyTunnels,
    laps: t.laps,
  };
}

/** Ride panel and test toast warnings (§4.10), in table order. */
export function ratingWarnings(r: Pick<Ratings, 'excitement' | 'intensity' | 'nausea' | 'penalty'>): string[] {
  const out: string[] = [];
  if (r.intensity > WARN.intensity * 100) out.push(TRACK_RATING_WARN.veryIntense);
  if (r.nausea > WARN.nausea * 100) out.push(TRACK_RATING_WARN.nauseating);
  if (r.excitement < WARN.dullExcitement * 100) out.push(TRACK_RATING_WARN.dull);
  if (r.penalty) out.push(TRACK_RATING_WARN.penalty);
  return out;
}
