/**
 * Noise for the SFX recipes (Phase 6 §4.2): white, pink, and brown noise and a 5 ms chain click, generated in code from
 * the audio RNG (the game ships no audio files). Owner: W4-A. The sample generators are pure; `createNoiseBank` puts
 * them into `AudioBuffer`s once per context.
 */
import { CHAIN_CLICK_MS } from '../../data/tuning/audio';
import type { AudioRng } from '../rng';

/** Uniform white noise in [−1, 1). */
export function whiteNoise(n: number, rng: AudioRng): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rng.next() * 2 - 1;
  return out;
}

/** Pink noise (−3 dB per octave, P. Kellet's economy filter), scaled to peak ≤ 1. */
export function pinkNoise(n: number, rng: AudioRng): Float32Array {
  const out = new Float32Array(n);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const w = rng.next() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    const v = b0 + b1 + b2 + w * 0.1848;
    out[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  return normalize(out, peak);
}

/** Brown noise (−6 dB per octave: leaky integrated white noise), scaled to peak ≤ 1. */
export function brownNoise(n: number, rng: AudioRng): Float32Array {
  const out = new Float32Array(n);
  let last = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const w = rng.next() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    out[i] = last;
    peak = Math.max(peak, Math.abs(last));
  }
  return normalize(out, peak);
}

/** One chain click: high-passed noise (first difference) with a fast decay, `CHAIN_CLICK_MS` long. */
export function clickSamples(sampleRate: number, rng: AudioRng): Float32Array {
  const n = Math.max(2, Math.round((sampleRate * CHAIN_CLICK_MS) / 1000));
  const out = new Float32Array(n);
  let prev = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const w = rng.next() * 2 - 1;
    const v = (w - prev) * Math.exp((-6 * i) / n);
    prev = w;
    out[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  return normalize(out, peak);
}

function normalize(xs: Float32Array, peak: number): Float32Array {
  if (peak > 1e-9) for (let i = 0; i < xs.length; i++) xs[i] = (xs[i] as number) / peak;
  return xs;
}

export type NoiseKind = 'white' | 'pink' | 'brown';

export interface NoiseBank {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
  click: AudioBuffer;
}

/** Seconds of each looping noise buffer. */
const NOISE_SECONDS = 2;

function toBuffer(ctx: BaseAudioContext, samples: Float32Array): AudioBuffer {
  const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buf.getChannelData(0).set(samples);
  return buf;
}

export function createNoiseBank(ctx: BaseAudioContext, rng: AudioRng): NoiseBank {
  const n = Math.round(ctx.sampleRate * NOISE_SECONDS);
  return {
    white: toBuffer(ctx, whiteNoise(n, rng)),
    pink: toBuffer(ctx, pinkNoise(n, rng)),
    brown: toBuffer(ctx, brownNoise(n, rng)),
    click: toBuffer(ctx, clickSamples(ctx.sampleRate, rng)),
  };
}
