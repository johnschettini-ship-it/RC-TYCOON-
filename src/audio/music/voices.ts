/**
 * Music voices on Web Audio (Phase 6 §4.3 table). Owner: W4-B. Every sound is synthesized: oscillators, generated
 * noise, and a generated impulse response. No audio files.
 *
 * A deck is one theme playing (one side of a crossfade): voice buses → sum → crossfade gain → the music bus, with an
 * optional night reverb send (sum → convolver → wet → crossfade gain).
 */
import {
  MUSIC_BASS_LOWPASS_HZ,
  MUSIC_DELAY_BEATS,
  MUSIC_DELAY_FEEDBACK,
  MUSIC_DELAY_WET,
  MUSIC_REVERB_WET,
  MUSIC_TREMOLO_DEPTH,
  MUSIC_TREMOLO_HZ,
  MUSIC_VOICE_GAIN,
} from '../../data/tuning/music';
import type { MusicRng } from './rng';
import type { ScheduledNote } from './sequencer';
import type { ThemeDef } from './themes';

/** Shared generated buffers of one player. */
export interface VoiceShared {
  /** 1 s of white noise (snare, hat). */
  noise: AudioBuffer;
  /** Night reverb impulse (decaying noise), made on first use. */
  impulse: () => AudioBuffer;
  rng: MusicRng;
}

export interface DeckGraph {
  /** Crossfade gain, connected to the music bus. */
  out: GainNode;
  lead: AudioNode;
  pad: AudioNode;
  bass: AudioNode;
  drums: AudioNode;
  /** Every node of the deck graph (disconnected when the deck goes). */
  nodes: AudioNode[];
  /** Running modulators (tremolo LFO), stopped when the deck goes. */
  sources: AudioScheduledSourceNode[];
}

export interface DeckSetup {
  theme: ThemeDef;
  beatSeconds: number;
  leadLowpassHz: number | null;
  reverb: boolean;
  startTime: number;
}

const PAD_LOWPASS_HZ = 2_200;
const FLOOR = 0.0001;

export function midiHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** White noise from the music RNG (deterministic). */
export function makeNoise(ctx: BaseAudioContext, rng: MusicRng, seconds = 1): AudioBuffer {
  const len = Math.max(1, Math.round(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = rng.next() * 2 - 1;
  return buf;
}

/** A stereo reverb impulse: noise with a cubic decay over `seconds`. */
export function makeImpulse(ctx: BaseAudioContext, rng: MusicRng, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.round(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (rng.next() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}

export function buildDeck(ctx: BaseAudioContext, output: AudioNode, s: DeckSetup, shared: VoiceShared): DeckGraph {
  const nodes: AudioNode[] = [];
  const sources: AudioScheduledSourceNode[] = [];
  const gain = (v: number): GainNode => {
    const g = ctx.createGain();
    g.gain.value = v;
    nodes.push(g);
    return g;
  };
  const filter = (type: BiquadFilterType, hz: number): BiquadFilterNode => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    nodes.push(f);
    return f;
  };

  const out = gain(0);
  out.connect(output);
  const sum = gain(1);
  sum.connect(out);

  // Lead: optional low-pass (Volcano Ridge by day, every theme at night), optional echo (Starport).
  const lead = gain(1);
  let leadOut: AudioNode = lead;
  if (s.leadLowpassHz !== null) {
    const lp = filter('lowpass', s.leadLowpassHz);
    lead.connect(lp);
    leadOut = lp;
  }
  leadOut.connect(sum);
  if (s.theme.lead === 'sawDelay') {
    const delay = ctx.createDelay(2);
    delay.delayTime.value = Math.min(1.9, MUSIC_DELAY_BEATS * s.beatSeconds);
    nodes.push(delay);
    const fb = gain(MUSIC_DELAY_FEEDBACK);
    const wet = gain(MUSIC_DELAY_WET);
    leadOut.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(sum);
  }

  // Pad: a gentle low-pass; Spooky Hollow's pad trembles (an LFO on the pad gain).
  const pad = gain(1);
  const padLp = filter('lowpass', PAD_LOWPASS_HZ);
  pad.connect(padLp);
  padLp.connect(sum);
  if (s.theme.pad === 'tremolo') {
    pad.gain.value = 1 - MUSIC_TREMOLO_DEPTH / 2;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = MUSIC_TREMOLO_HZ;
    const depth = gain(MUSIC_TREMOLO_DEPTH / 2);
    lfo.connect(depth);
    depth.connect(pad.gain);
    lfo.start(Math.max(0, s.startTime));
    lfo.onended = () => lfo.disconnect();
    nodes.push(lfo);
    sources.push(lfo);
  }

  const bass = gain(1);
  const bassLp = filter('lowpass', MUSIC_BASS_LOWPASS_HZ);
  bass.connect(bassLp);
  bassLp.connect(sum);

  const drums = gain(1);
  drums.connect(sum);

  if (s.reverb) {
    const conv = ctx.createConvolver();
    conv.buffer = shared.impulse();
    nodes.push(conv);
    const wet = gain(MUSIC_REVERB_WET);
    sum.connect(conv);
    conv.connect(wet);
    wet.connect(out);
  }
  return { out, lead, pad, bass, drums, nodes, sources };
}

// ------------------------------------------------------------------ notes

interface Env {
  gain: GainNode;
  end: number;
}

/** Attack, hold for the note, linear release. */
function sustainEnv(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  dur: number,
  peak: number,
  attack: number,
  release: number,
): Env {
  const g = ctx.createGain();
  const p = g.gain;
  const hold = t + Math.max(attack, dur);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.setValueAtTime(peak, hold);
  p.linearRampToValueAtTime(0, hold + release);
  g.connect(dest);
  return { gain: g, end: hold + release };
}

/** Attack, then an exponential decay (plucks, bells, drums). */
function decayEnv(ctx: BaseAudioContext, dest: AudioNode, t: number, peak: number, attack: number, decay: number): Env {
  const g = ctx.createGain();
  const p = g.gain;
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.exponentialRampToValueAtTime(FLOOR, t + attack + decay);
  p.setValueAtTime(0, t + attack + decay);
  g.connect(dest);
  return { gain: g, end: t + attack + decay };
}

/** Start an oscillator into `dest`; it stops at `end` and cleans up after itself. */
function osc(
  ctx: BaseAudioContext,
  dest: AudioNode,
  type: OscillatorType,
  hz: number,
  t: number,
  end: number,
  level = 1,
  detuneCents = 0,
  extra: AudioNode[] = [],
): void {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = hz;
  if (detuneCents !== 0) o.detune.value = detuneCents;
  let into: AudioNode = dest;
  const chain: AudioNode[] = [o, ...extra];
  if (level !== 1) {
    const g = ctx.createGain();
    g.gain.value = level;
    g.connect(dest);
    into = g;
    chain.push(g);
  }
  o.connect(into);
  o.start(t);
  o.stop(end + 0.02);
  o.onended = () => {
    for (const n of chain) n.disconnect();
  };
}

function noiseHit(
  ctx: BaseAudioContext,
  dest: AudioNode,
  shared: VoiceShared,
  t: number,
  end: number,
  type: BiquadFilterType,
  hz: number,
  extra: AudioNode[],
): void {
  const src = ctx.createBufferSource();
  src.buffer = shared.noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = hz;
  src.connect(f);
  f.connect(dest);
  const offset = shared.rng.next() * 0.5;
  src.start(t, offset);
  src.stop(end + 0.02);
  src.onended = () => {
    src.disconnect();
    f.disconnect();
    for (const n of extra) n.disconnect();
  };
}

/** Play one scheduled note on a deck. */
export function playNote(ctx: BaseAudioContext, deck: DeckGraph, theme: ThemeDef, n: ScheduledNote, shared: VoiceShared): void {
  const t = Math.max(0, n.time);
  const dur = Math.max(0.01, n.duration);
  switch (n.voice) {
    case 'lead':
      return lead(ctx, deck.lead, theme, t, dur, n.midi, n.velocity * MUSIC_VOICE_GAIN.lead);
    case 'pad':
      return padNote(ctx, deck.pad, theme, t, dur, n.midi, n.velocity * MUSIC_VOICE_GAIN.pad);
    case 'bass': {
      const e = sustainEnv(ctx, deck.bass, t, dur, n.velocity * MUSIC_VOICE_GAIN.bass, 0.005, 0.06);
      return osc(ctx, e.gain, theme.bassWave, midiHz(n.midi), t, e.end, 1, 0, [e.gain]);
    }
    case 'kick': {
      // Sine kick: a fast pitch drop under an exponential decay.
      const e = decayEnv(ctx, deck.drums, t, n.velocity * MUSIC_VOICE_GAIN.kick, 0.002, 0.3);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      o.connect(e.gain);
      o.start(t);
      o.stop(e.end + 0.02);
      o.onended = () => {
        o.disconnect();
        e.gain.disconnect();
      };
      return;
    }
    case 'snare': {
      // Noise snare: high-passed noise plus a short body tone.
      const peak = n.velocity * MUSIC_VOICE_GAIN.snare;
      const e = decayEnv(ctx, deck.drums, t, peak, 0.001, 0.16);
      noiseHit(ctx, e.gain, shared, t, e.end, 'highpass', 1_200, [e.gain]);
      const body = decayEnv(ctx, deck.drums, t, peak * 0.5, 0.001, 0.08);
      return osc(ctx, body.gain, 'triangle', 190, t, body.end, 1, 0, [body.gain]);
    }
    case 'hat': {
      const e = decayEnv(ctx, deck.drums, t, n.velocity * MUSIC_VOICE_GAIN.hat, 0.001, 0.045);
      return noiseHit(ctx, e.gain, shared, t, e.end, 'highpass', 7_000, [e.gain]);
    }
  }
}

function lead(ctx: BaseAudioContext, dest: AudioNode, theme: ThemeDef, t: number, dur: number, midi: number, peak: number): void {
  const hz = midiHz(midi);
  switch (theme.lead) {
    case 'triSquare': {
      // Bright: triangle with a little square on top.
      const e = sustainEnv(ctx, dest, t, dur, peak, 0.01, 0.08);
      osc(ctx, e.gain, 'triangle', hz, t, e.end, 1, 0, [e.gain]);
      return osc(ctx, e.gain, 'square', hz, t, e.end, 0.18);
    }
    case 'triangle': {
      const e = sustainEnv(ctx, dest, t, dur, peak, 0.01, 0.1);
      return osc(ctx, e.gain, 'triangle', hz, t, e.end, 1, 0, [e.gain]);
    }
    case 'sineBell': {
      // Sine bells: the fundamental and a quiet third partial, ringing out.
      const e = decayEnv(ctx, dest, t, peak, 0.004, Math.max(0.9, dur));
      osc(ctx, e.gain, 'sine', hz, t, e.end, 1, 0, [e.gain]);
      return osc(ctx, e.gain, 'sine', hz * 3, t, e.end, 0.2);
    }
    case 'saw':
    case 'sawDelay': {
      const e = sustainEnv(ctx, dest, t, dur, peak * 0.8, 0.01, 0.08);
      return osc(ctx, e.gain, 'sawtooth', hz, t, e.end, 1, 0, [e.gain]);
    }
    case 'detunedSquare': {
      const e = sustainEnv(ctx, dest, t, dur, peak * 0.7, 0.02, 0.12);
      osc(ctx, e.gain, 'square', hz, t, e.end, 0.5, -8, [e.gain]);
      return osc(ctx, e.gain, 'square', hz, t, e.end, 0.5, 8);
    }
    case 'sineHarmonic': {
      // Sine with its 4th harmonic, fast decay (a mallet).
      const e = decayEnv(ctx, dest, t, peak, 0.003, 0.25);
      osc(ctx, e.gain, 'sine', hz, t, e.end, 1, 0, [e.gain]);
      return osc(ctx, e.gain, 'sine', hz * 4, t, e.end, 0.35);
    }
  }
}

function padNote(
  ctx: BaseAudioContext,
  dest: AudioNode,
  theme: ThemeDef,
  t: number,
  dur: number,
  midi: number,
  peak: number,
): void {
  const hz = midiHz(midi);
  let e: Env;
  switch (theme.pad) {
    case 'sustain':
      e = sustainEnv(ctx, dest, t, dur, peak, 0.25, 0.4);
      break;
    case 'soft':
      e = sustainEnv(ctx, dest, t, dur, peak, 0.6, 0.6);
      break;
    case 'tremolo':
      e = sustainEnv(ctx, dest, t, dur, peak, 0.3, 0.5);
      break;
    default:
      // Stabs and arps: a short pluck.
      e = decayEnv(ctx, dest, t, peak, 0.004, dur + 0.06);
  }
  osc(ctx, e.gain, theme.padWave, hz, t, e.end, 1, 0, [e.gain]);
}
