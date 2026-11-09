/**
 * One-shot SFX recipes (Phase 6 §4.2), synthesized at runtime. Owner: W4-A. Each recipe follows its table row (sources,
 * filters, glides) and lasts exactly its table length; every source stops by then.
 */
import { SFX_PEAK } from '../../data/tuning/audio';
import { filterNode, gainNode, glide, lengthS, noiseNode, oscNode, pluck, Sources, type Recipe } from './kit';

const P = SFX_PEAK;

/** Sine 1,200 → 800 Hz glide; attack 2 ms, decay 40 ms; peak 0.3. 45 ms. */
export const uiClick: Recipe = ({ ctx, out, t }) => {
  const src = new Sources();
  const end = t + lengthS('ui_click');
  const o = oscNode(src, ctx, 'sine', 1200, t, end);
  glide(o.frequency, 1200, 800, t, end);
  const g = gainNode(ctx);
  pluck(g.gain, t, 0.002, 0.3, t + 0.042);
  o.connect(g).connect(out);
  return src.voice(end);
};

/** Sines 660 + 990 Hz, +5% glide. 60 ms. */
export const uiOpen: Recipe = ({ ctx, out, t }) => {
  const src = new Sources();
  const end = t + lengthS('ui_open');
  const g = gainNode(ctx);
  pluck(g.gain, t, 0.005, 0.2, end);
  for (const f of [660, 990]) {
    const o = oscNode(src, ctx, 'sine', f, t, end);
    glide(o.frequency, f, f * 1.05, t, end);
    o.connect(g);
  }
  g.connect(out);
  return src.voice(end);
};

/** Square 220 → 180 Hz, low-pass 1.5 kHz, 2 pulses. 240 ms. */
export const uiError: Recipe = ({ ctx, out, t }) => {
  const src = new Sources();
  const end = t + lengthS('ui_error');
  const o = oscNode(src, ctx, 'square', 220, t, end);
  glide(o.frequency, 220, 180, t, end);
  const lp = filterNode(ctx, 'lowpass', 1500);
  const g = gainNode(ctx);
  const peak = 0.6 * P;
  // Pulse 1: 0–100 ms; pulse 2: 140–240 ms.
  for (const [a, b] of [
    [0, 0.1],
    [0.14, 0.24],
  ] as const) {
    g.gain.setValueAtTime(0, t + a);
    g.gain.linearRampToValueAtTime(peak, t + a + 0.005);
    g.gain.setValueAtTime(peak, t + b - 0.012);
    g.gain.linearRampToValueAtTime(0, t + b);
  }
  o.connect(lp).connect(g).connect(out);
  return src.voice(end);
};

/** White-noise burst, band-pass 800 Hz Q 1.5 + sine thump 110 → 60 Hz. 150 ms. */
export const buildPlace: Recipe = (env) => {
  const { ctx, out, t } = env;
  const src = new Sources();
  const end = t + lengthS('build_place');
  const n = noiseNode(src, env, 'white', t, end);
  const bp = filterNode(ctx, 'bandpass', 800, 1.5);
  const ng = gainNode(ctx);
  pluck(ng.gain, t, 0.003, P, end);
  n.connect(bp).connect(ng).connect(out);
  const o = oscNode(src, ctx, 'sine', 110, t, end);
  glide(o.frequency, 110, 60, t, end);
  const og = gainNode(ctx);
  pluck(og.gain, t, 0.002, 0.9 * P, end);
  o.connect(og).connect(out);
  return src.voice(end);
};

/** Noise tick, band-pass 2 kHz. 30 ms (at most 8 per second: `cues.ts`). */
export const buildPath: Recipe = (env) => {
  const { ctx, out, t } = env;
  const src = new Sources();
  const end = t + lengthS('build_path');
  const n = noiseNode(src, env, 'white', t, end);
  const bp = filterNode(ctx, 'bandpass', 2000, 2);
  const g = gainNode(ctx);
  pluck(g.gain, t, 0.001, 0.7 * P, end);
  n.connect(bp).connect(g).connect(out);
  return src.voice(end);
};

/** Brown noise, low-pass sweep 2 kHz → 200 Hz + 3 thumps. 400 ms. */
export const demolish: Recipe = (env) => {
  const { ctx, out, t } = env;
  const src = new Sources();
  const end = t + lengthS('demolish');
  const n = noiseNode(src, env, 'brown', t, end);
  const lp = filterNode(ctx, 'lowpass', 2000);
  glide(lp.frequency, 2000, 200, t, end);
  const ng = gainNode(ctx);
  pluck(ng.gain, t, 0.01, P, end);
  n.connect(lp).connect(ng).connect(out);
  for (const at of [0, 0.12, 0.24]) {
    const t0 = t + at;
    const t1 = Math.min(end, t0 + 0.15);
    const o = oscNode(src, ctx, 'sine', 90, t0, t1);
    glide(o.frequency, 90, 45, t0, t1);
    const og = gainNode(ctx);
    pluck(og.gain, t0, 0.003, 0.8 * P, t1);
    o.connect(og).connect(out);
  }
  return src.voice(end);
};

/** Triangle 1,319 Hz then 1,976 Hz, 50 ms each. 100 ms. */
export const cashIn: Recipe = ({ ctx, out, t }) => {
  const src = new Sources();
  const end = t + lengthS('cash_in');
  const half = (end - t) / 2;
  const o = oscNode(src, ctx, 'triangle', 1319, t, end);
  o.frequency.setValueAtTime(1976, t + half);
  const g = gainNode(ctx);
  pluck(g.gain, t, 0.002, 0.6 * P, t + half);
  g.gain.linearRampToValueAtTime(0.6 * P, t + half + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  g.gain.setValueAtTime(0, end);
  o.connect(g).connect(out);
  return src.voice(end);
};

/** FM bell: carrier 880 Hz, modulator ratio 3.5, index 4 → 0. 1 s. */
export const rideBell: Recipe = ({ ctx, out, t }) => {
  const src = new Sources();
  const end = t + lengthS('ride_bell');
  const carrier = oscNode(src, ctx, 'sine', 880, t, end);
  const modFreq = 880 * 3.5;
  const mod = oscNode(src, ctx, 'sine', modFreq, t, end);
  const depth = gainNode(ctx);
  // Frequency deviation = index × modulator frequency.
  depth.gain.setValueAtTime(4 * modFreq, t);
  depth.gain.linearRampToValueAtTime(0, end);
  mod.connect(depth).connect(carrier.frequency);
  const g = gainNode(ctx);
  pluck(g.gain, t, 0.003, 0.6 * P, end);
  carrier.connect(g).connect(out);
  return src.voice(end);
};

/** 3–6 detuned saw voices 300 → 500 → 350 Hz; formants 700 Hz + 1,200 Hz; vibrato 6 Hz. 800 ms. Louder for higher drops. */
export const coasterCheer: Recipe = ({ ctx, out, t, rng, param }) => {
  const src = new Sources();
  const end = t + lengthS('coaster_cheer');
  const voices = rng.int(3, 6);
  const lfo = oscNode(src, ctx, 'sine', 6, t, end);
  const vib = gainNode(ctx, 8);
  lfo.connect(vib);
  const mix = gainNode(ctx, 1 / voices);
  const used = new Set<number>();
  for (let i = 0; i < voices; i++) {
    const o = oscNode(src, ctx, 'sawtooth', 300, t, end);
    let cents = Math.round(rng.range(-25, 25));
    while (used.has(cents)) cents += 1;
    used.add(cents);
    o.detune.value = cents;
    o.frequency.setValueAtTime(300, t);
    o.frequency.linearRampToValueAtTime(500, t + 0.25);
    o.frequency.linearRampToValueAtTime(350, end);
    vib.connect(o.frequency);
    o.connect(mix);
  }
  const level = Math.min(1, 0.5 + Math.max(0, param) / 60);
  const g = gainNode(ctx);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(P * level, t + 0.08);
  g.gain.setValueAtTime(P * level, end - 0.25);
  g.gain.linearRampToValueAtTime(0, end);
  for (const [f, q] of [
    [700, 4],
    [1200, 5],
  ] as const) {
    mix.connect(filterNode(ctx, 'bandpass', f, q)).connect(g);
  }
  g.connect(out);
  return src.voice(end);
};

/** Noise burst, band-pass sweep 3 kHz → 600 Hz + sine 400 → 120 Hz. 600 ms. */
export const splash: Recipe = (env) => {
  const { ctx, out, t } = env;
  const src = new Sources();
  const end = t + lengthS('splash');
  const n = noiseNode(src, env, 'white', t, end);
  const bp = filterNode(ctx, 'bandpass', 3000, 1);
  glide(bp.frequency, 3000, 600, t, end);
  const ng = gainNode(ctx);
  pluck(ng.gain, t, 0.005, P, end);
  n.connect(bp).connect(ng).connect(out);
  const oEnd = t + 0.35;
  const o = oscNode(src, ctx, 'sine', 400, t, oEnd);
  glide(o.frequency, 400, 120, t, oEnd);
  const og = gainNode(ctx);
  pluck(og.gain, t, 0.004, 0.7 * P, oEnd);
  o.connect(og).connect(out);
  return src.voice(end);
};

/** Sines 523, 811, 1,247 Hz with fast decay + noise fizz. 500 ms. */
export const breakdown: Recipe = (env) => {
  const { ctx, out, t } = env;
  const src = new Sources();
  const end = t + lengthS('breakdown');
  [523, 811, 1247].forEach((f, i) => {
    const t0 = t + i * 0.04;
    const t1 = t0 + 0.28 - i * 0.05;
    const o = oscNode(src, ctx, 'sine', f, t0, t1);
    const g = gainNode(ctx);
    pluck(g.gain, t0, 0.002, 0.5 * P, t1);
    o.connect(g).connect(out);
  });
  const n = noiseNode(src, env, 'white', t, end);
  const hp = filterNode(ctx, 'highpass', 3000);
  const ng = gainNode(ctx);
  pluck(ng.gain, t, 0.01, 0.3 * P, end);
  n.connect(hp).connect(ng).connect(out);
  return src.voice(end);
};

/** Award arpeggios: up for a positive award, down for a negative one (C major up; a minor fall). */
const AWARD_UP = [523.25, 659.25, 783.99, 1046.5] as const;
const AWARD_DOWN = [783.99, 622.25, 523.25, 392] as const;

/** Triangle arpeggio, 4 notes up (param ≥ 0) or down (param < 0). 600 ms. */
export const award: Recipe = ({ ctx, out, t, param }) => {
  const src = new Sources();
  const end = t + lengthS('award');
  const notes = param < 0 ? AWARD_DOWN : AWARD_UP;
  const step = (end - t) / notes.length;
  const o = oscNode(src, ctx, 'triangle', notes[0], t, end);
  const g = gainNode(ctx);
  notes.forEach((f, i) => {
    const t0 = t + i * step;
    o.frequency.setValueAtTime(f, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.7 * P, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + step);
  });
  g.gain.setValueAtTime(0, end);
  o.connect(g).connect(out);
  return src.voice(end);
};

/** Noise burst, low-pass 120 Hz, decay 2.5 s (a second roll at a random point, audio RNG). */
export const thunder: Recipe = (env) => {
  const { ctx, out, t, rng } = env;
  const src = new Sources();
  const end = t + lengthS('thunder');
  const n = noiseNode(src, env, 'brown', t, end);
  const crack = noiseNode(src, env, 'white', t, t + 0.3);
  const lp = filterNode(ctx, 'lowpass', 120, 0.9);
  const g = gainNode(ctx);
  const roll = rng.range(0.25, 0.7);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(P, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.35 * P, t + roll);
  g.gain.linearRampToValueAtTime(0.8 * P, t + roll + 0.1);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  g.gain.setValueAtTime(0, end);
  const cg = gainNode(ctx, 0.5);
  n.connect(lp);
  crack.connect(cg).connect(lp);
  lp.connect(g).connect(out);
  return src.voice(end);
};

/** Sine 600 → 1,800 Hz glide. 800 ms. */
export const fwLaunch: Recipe = ({ ctx, out, t }) => {
  const src = new Sources();
  const end = t + lengthS('fw_launch');
  const o = oscNode(src, ctx, 'sine', 600, t, end);
  glide(o.frequency, 600, 1800, t, end);
  const g = gainNode(ctx);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.35 * P, t + 0.06);
  g.gain.setValueAtTime(0.35 * P, end - 0.2);
  g.gain.linearRampToValueAtTime(0, end);
  o.connect(g).connect(out);
  return src.voice(end);
};

/** Noise burst low-pass 1.5 kHz + random 2 ms clicks over 1 s (audio RNG). 1.3 s. */
export const fwBurst: Recipe = (env) => {
  const { ctx, out, t, rng, noise } = env;
  const src = new Sources();
  const end = t + lengthS('fw_burst');
  const boomEnd = t + 0.7;
  const n = noiseNode(src, env, 'white', t, boomEnd);
  const lp = filterNode(ctx, 'lowpass', 1500);
  const g = gainNode(ctx);
  pluck(g.gain, t, 0.004, P, boomEnd);
  n.connect(lp).connect(g).connect(out);
  // Crackle: 2 ms clicks at random times over the second after the boom.
  const cg = gainNode(ctx, 0.45 * P);
  cg.connect(out);
  const clicks = rng.int(18, 32);
  const last = end - 0.002;
  for (let i = 0; i < clicks; i++) {
    // Random times over the last second; the final click closes the sound at its table length.
    const at = i === clicks - 1 ? last : last - 1 + rng.next();
    const b = ctx.createBufferSource();
    b.buffer = noise.white;
    b.start(at, rng.next() * (noise.white.duration - 0.01), 0.002);
    b.stop(at + 0.002);
    b.connect(cg);
    src.add(b);
  }
  return src.voice(end);
};

/** Filtered noise, band-pass sweep 500 → 4,000 Hz. 700 ms. */
export const lightSwoosh: Recipe = (env) => {
  const { ctx, out, t } = env;
  const src = new Sources();
  const end = t + lengthS('light_swoosh');
  const n = noiseNode(src, env, 'pink', t, end);
  const bp = filterNode(ctx, 'bandpass', 500, 3);
  glide(bp.frequency, 500, 4000, t, end);
  const g = gainNode(ctx);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.6 * P, t + (end - t) / 2);
  g.gain.linearRampToValueAtTime(0, end);
  n.connect(bp).connect(g).connect(out);
  return src.voice(end);
};
