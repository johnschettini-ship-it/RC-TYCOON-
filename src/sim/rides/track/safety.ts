/**
 * Hard safety limits (R7, owner 2026-11-12; plan ride-work-1 Task 3). Owner: W1-G.
 * Ratings use the train's average G; safety uses the strongest car (owner change, 2026-11-12): each car's own 5-tick
 * moving average (the test lap's window), then the largest over the cars (review I-2, controller 2026-11-12). One
 * value, one rounding (integer hundredths) for the meter, Build and Open.
 */
import { G_AVERAGE_TICKS, METER_WARN_MARGIN_G, RATING, SAFETY_LIMIT } from '../../../data/tuning/track';
import { TRACK_ERR, fillTrackString } from '../../../data/strings/track';
import { newCarG, type CarG } from './physics';

export type SafetyKind = 'posG' | 'negG' | 'lat';

export interface SafetyBreach {
  kind: SafetyKind;
  /** Hundredths of a G (the strongest car's windowed value). */
  value: number;
}

/** Strongest-car G extremes in hundredths. */
export interface SafetyValues {
  posGMax: number;
  vertGMin: number;
  latMax: number;
}

const LIMIT_POS = Math.round(SAFETY_LIMIT.posGMax * 100);
const LIMIT_NEG = Math.round(SAFETY_LIMIT.vertGMin * 100);
const LIMIT_LAT = Math.round(SAFETY_LIMIT.latMax * 100);
const WARN_POS = Math.round((RATING.penalty.posGMax - METER_WARN_MARGIN_G) * 100);
const WARN_NEG = Math.round((RATING.penalty.vertGMin + METER_WARN_MARGIN_G) * 100);
const WARN_LAT = Math.round((RATING.penalty.latMax - METER_WARN_MARGIN_G) * 100);

/** Hundredths past a hard limit for one kind (strict: exactly the limit is allowed). */
export function overLimit(kind: SafetyKind, hundredths: number): boolean {
  if (kind === 'posG') return hundredths > LIMIT_POS;
  if (kind === 'negG') return hundredths < LIMIT_NEG;
  return hundredths > LIMIT_LAT;
}

/** The first limit passed (posG, then negG, then lat), or null. */
export function safetyBreachOf(m: SafetyValues): SafetyBreach | null {
  if (overLimit('posG', m.posGMax)) return { kind: 'posG', value: m.posGMax };
  if (overLimit('negG', m.vertGMin)) return { kind: 'negG', value: m.vertGMin };
  if (overLimit('lat', m.latMax)) return { kind: 'lat', value: m.latMax };
  return null;
}

export type MeterLevel = 'ok' | 'warn' | 'over';

/** `over` past the hard limit; `warn` from 0.5 G before the rating penalty limit up to and including the hard limit. */
export function meterLevel(kind: SafetyKind, hundredths: number): MeterLevel {
  if (overLimit(kind, hundredths)) return 'over';
  if (kind === 'posG') return hundredths >= WARN_POS ? 'warn' : 'ok';
  if (kind === 'negG') return hundredths <= WARN_NEG ? 'warn' : 'ok';
  return hundredths >= WARN_LAT ? 'warn' : 'ok';
}

/**
 * Two decimals (the hundredths the limits compare), Unicode minus: 601 → "6.01", −230 → "−2.30". A value just past a
 * limit never reads as the limit itself. The meter, the Build refusal and the Open refusal all use it.
 */
export function formatSafetyG(hundredths: number): string {
  const a = Math.abs(Math.round(hundredths));
  const s = `${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
  return hundredths < 0 && a > 0 ? `−${s}` : s;
}

function limitOf(kind: SafetyKind): number {
  return kind === 'posG' ? LIMIT_POS : kind === 'negG' ? LIMIT_NEG : LIMIT_LAT;
}

function breachParams(b: SafetyBreach): { g: string; limit: string } {
  return { g: formatSafetyG(b.value), limit: formatSafetyG(limitOf(b.kind)) };
}

/** Open refusal and ride warning for a test whose strongest car passed a limit on piece `pieceNumber` (1-based). */
export function unsafeOpenReason(b: SafetyBreach, pieceNumber: number): string {
  const template = b.kind === 'posG' ? TRACK_ERR.unsafePosG : b.kind === 'negG' ? TRACK_ERR.unsafeNegG : TRACK_ERR.unsafeLat;
  return fillTrackString(template, { ...breachParams(b), n: pieceNumber });
}

/**
 * The test message for the same case: a string-table id with its parameters (not a filled English sentence), so the
 * message log shows it in the player's language.
 */
export function unsafeTestMessage(b: SafetyBreach, pieceNumber: number): { textId: string; params: { g: string; n: number; limit: string } } {
  const textId = b.kind === 'posG' ? 'track.testUnsafePosG' : b.kind === 'negG' ? 'track.testUnsafeNegG' : 'track.testUnsafeLat';
  return { textId, params: { ...breachParams(b), n: pieceNumber } };
}

/** Build refusal (Task 5) for a piece whose projected section passes a hard limit. */
export function unsafePieceReason(b: SafetyBreach): string {
  const template = b.kind === 'posG' ? TRACK_ERR.pieceUnsafePosG : b.kind === 'negG' ? TRACK_ERR.pieceUnsafeNegG : TRACK_ERR.pieceUnsafeLat;
  return fillTrackString(template, breachParams(b));
}

/**
 * Each car's own moving window of the last `G_AVERAGE_TICKS` G samples (review I-2). Fill `sample` (e.g. through
 * `trainG(..., win.sample)`), then `push()`; the window means are summed oldest first, as an array window would be.
 * Allocation-free per tick; `clone()` copies the state (the projection's snapshots).
 */
export class CarGWindow {
  readonly cars: number;
  /** Write the current tick's per-car G here before `push()`. */
  readonly sample: CarG;
  private readonly gv: Float64Array;
  private readonly gl: Float64Array;
  private count = 0;
  private head = 0;

  constructor(cars: number) {
    this.cars = cars;
    this.sample = newCarG(cars);
    this.gv = new Float64Array(cars * G_AVERAGE_TICKS);
    this.gl = new Float64Array(cars * G_AVERAGE_TICKS);
  }

  push(): void {
    const base = this.head * this.cars;
    for (let k = 0; k < this.cars; k++) {
      this.gv[base + k] = this.sample.gv[k] as number;
      this.gl[base + k] = this.sample.gl[k] as number;
    }
    this.head = (this.head + 1) % G_AVERAGE_TICKS;
    if (this.count < G_AVERAGE_TICKS) this.count++;
  }

  /** Largest and smallest windowed vertical G and largest windowed lateral G over the cars (G, doubles). */
  extremes(out: { posG: number; negG: number; lat: number }): { posG: number; negG: number; lat: number } {
    out.posG = -Infinity;
    out.negG = Infinity;
    out.lat = 0;
    const n = this.count;
    if (n === 0) return out;
    const first = (this.head - n + G_AVERAGE_TICKS) % G_AVERAGE_TICKS;
    for (let k = 0; k < this.cars; k++) {
      let gv = 0;
      let gl = 0;
      for (let j = 0; j < n; j++) {
        const i = ((first + j) % G_AVERAGE_TICKS) * this.cars + k;
        gv += this.gv[i] as number;
        gl += this.gl[i] as number;
      }
      gv /= n;
      gl /= n;
      if (gv > out.posG) out.posG = gv;
      if (gv < out.negG) out.negG = gv;
      if (gl > out.lat) out.lat = gl;
    }
    return out;
  }

  clone(): CarGWindow {
    const c = new CarGWindow(this.cars);
    c.gv.set(this.gv);
    c.gl.set(this.gl);
    c.count = this.count;
    c.head = this.head;
    return c;
  }
}
