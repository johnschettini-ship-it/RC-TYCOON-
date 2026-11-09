/**
 * Building blocks of the SFX recipes (Phase 6 §4.2). Owner: W4-A. A recipe builds its nodes into `env.out` (the voice
 * input the engine owns), starts them at `env.t`, schedules every source to stop by its end, and returns a handle.
 */
import { sfxInfo, type SfxId } from '../types';
import type { AudioRng } from '../rng';
import type { NoiseBank, NoiseKind } from './noise';

export interface RecipeEnv {
  ctx: BaseAudioContext;
  /** Connect the sound here (the voice gain; falloff and pan come after it). */
  out: AudioNode;
  /** Start time on the audio clock (s). */
  t: number;
  /** Request parameter (drop height in m, award sign), recipe-specific; 0 when absent. */
  param: number;
  rng: AudioRng;
  noise: NoiseBank;
}

/** A playing sound. */
export interface SfxVoice {
  /** Audio-clock time (s) the sound is silent for good; `Infinity` for loops. */
  readonly end: number;
  /** Stop every source at `at` (s). Safe to call more than once. */
  stop(at: number): void;
  /** Loops: a recipe value (rumble cutoff Hz, chain click rate per s). */
  tune?(value: number, at: number): void;
  /** `coaster_chain`: schedule clicks from `now` up to `until` (s). */
  schedule?(now: number, until: number): void;
}

export type Recipe = (env: RecipeEnv) => SfxVoice;

/** Phase 6 §4.2 length of a one-shot in seconds. */
export function lengthS(id: SfxId): number {
  return (sfxInfo(id).lengthMs ?? 0) / 1000;
}

/** Collects the sources of one voice so `stop` can reach them. */
export class Sources {
  readonly list: AudioScheduledSourceNode[] = [];

  add<T extends AudioScheduledSourceNode>(s: T): T {
    this.list.push(s);
    return s;
  }

  voice(end: number): SfxVoice {
    return { end, stop: (at) => this.stopAll(at) };
  }

  stopAll(at: number): void {
    for (const s of this.list) {
      try {
        s.stop(at);
      } catch {
        // Already stopped (older engines throw on a second stop).
      }
    }
  }
}

export function gainNode(ctx: BaseAudioContext, value = 0): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

export function filterNode(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q = Math.SQRT1_2): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/** An oscillator playing from `t` to `end` (`Infinity` = until stopped). */
export function oscNode(src: Sources, ctx: BaseAudioContext, type: OscillatorType, freq: number, t: number, end: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.frequency.setValueAtTime(freq, t);
  o.start(t);
  if (Number.isFinite(end)) o.stop(end);
  return src.add(o);
}

/** Looping noise from a random point of the buffer, playing from `t` to `end` (`Infinity` = until stopped). */
export function noiseNode(src: Sources, env: Pick<RecipeEnv, 'ctx' | 'noise' | 'rng'>, kind: NoiseKind, t: number, end: number): AudioBufferSourceNode {
  const b = env.ctx.createBufferSource();
  const buf = env.noise[kind];
  b.buffer = buf;
  b.loop = true;
  b.start(t, env.rng.next() * buf.duration);
  if (Number.isFinite(end)) b.stop(end);
  return src.add(b);
}

/** Attack to `peak` in `attack` s, then an exponential decay that reaches silence at `end`. */
export function pluck(param: AudioParam, t: number, attack: number, peak: number, end: number): void {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(0.0001, end);
  param.setValueAtTime(0, end);
}

/** Exponential glide of a frequency-like parameter from `from` to `to` between `t` and `end`. */
export function glide(param: AudioParam, from: number, to: number, t: number, end: number): void {
  param.setValueAtTime(from, t);
  param.exponentialRampToValueAtTime(to, end);
}
