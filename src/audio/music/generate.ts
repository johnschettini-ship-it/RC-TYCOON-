/**
 * Phrase generator (Phase 6 §4.3). Owner: W4-B. Pure and deterministic: theme + seed + section → notes.
 *
 * - Form: 8-bar phrases A A B A. The A sections share one RNG stream (so they are equal); B has its own.
 * - Chords: A starts and ends on the tonic; B starts on the theme's `bStart` chord and ends on its `turn` chord;
 *   bars 2–7 follow the theme's Markov table.
 * - Melody: scale degrees only; a chord tone on every strong beat (beats 1 and 3 in 4/4), chosen within 2 degrees of
 *   the previous note; other notes step by at most 2 degrees, with a rare leap; bars 5–6 reuse the rhythm of bars 1–2.
 * - Bass: the chord root on the theme's bass beats (1 and 3; the waltz plays beat 1 only).
 * - Pad: the chord in the theme's style. Drums: kick, snare, and hat from the theme's bar patterns (midi 0).
 * - Swing (Jungle Lagoon) moves every off-beat eighth to 2/3 of the beat after the notes are placed.
 */
import {
  MUSIC_BASS_OCTAVE_CHANCE,
  MUSIC_FORM,
  MUSIC_LEAP_CHANCE,
  MUSIC_MAX_STEP_DEGREES,
  MUSIC_MELODY_HIGH_OVER,
  MUSIC_MELODY_LOW,
  MUSIC_PHRASE_BARS,
  MUSIC_REST_CHANCE,
  MUSIC_SWING_RATIO,
} from '../../data/tuning/music';
import { MUSIC_THEMES, type MusicThemeId, type MusicVoice, type NoteEvent } from '../types';
import { mixSeed, musicRng, type MusicRng } from './rng';
import { degreePc, placeAbove, scaleDegreeMidi, themeDef, type DrumBar, type ThemeDef } from './themes';

/** The chord of one bar: its index in the theme table, root pitch class, and tone pitch classes (0–11). */
export interface BarChord {
  chord: number;
  root: number;
  tones: number[];
}

export interface Phrase {
  /** Chord index per bar. */
  chords: number[];
  bars: BarChord[];
  /** Sorted by beat, then voice. */
  notes: NoteEvent[];
}

const EPS = 1e-9;
const VOICE_ORDER: Record<MusicVoice, number> = { kick: 0, snare: 1, hat: 2, bass: 3, pad: 4, lead: 5 };

/** Section 0–3 of the A A B A form (other values wrap). */
export function formLetter(section: number): 'A' | 'B' {
  const s = ((Math.trunc(section) % MUSIC_FORM.length) + MUSIC_FORM.length) % MUSIC_FORM.length;
  return MUSIC_FORM[s] as 'A' | 'B';
}

/** Beats in one 8-bar phrase of `theme`. */
export function phraseBeats(theme: MusicThemeId): number {
  return MUSIC_PHRASE_BARS * themeDef(theme).beatsPerBar;
}

export function composePhrase(theme: MusicThemeId, seed: number, section: number): Phrase {
  const t = themeDef(theme);
  const letter = formLetter(section);
  const rng = musicRng(mixSeed(seed, MUSIC_THEMES.indexOf(theme), letter === 'A' ? 1 : 2));
  const chords = progression(t, letter, rng);
  const notes: NoteEvent[] = [];
  melody(t, letter, chords, rng, notes);
  pad(t, chords, notes);
  bass(t, chords, rng, notes);
  drums(t, letter, notes);
  if (t.swing) for (const n of notes) swingNote(n);
  notes.sort((a, b) => a.beat - b.beat || VOICE_ORDER[a.voice] - VOICE_ORDER[b.voice] || a.midi - b.midi);
  const bars = chords.map((c) => {
    const degrees = t.chords[c] as readonly number[];
    return { chord: c, root: degreePc(t, degrees[0] as number), tones: degrees.map((d) => degreePc(t, d)) };
  });
  return { chords, bars, notes };
}

/** Phase 6 §4.3 contract: the notes of one 8-bar section of the A A B A form. */
export function generatePhrase(theme: MusicThemeId, seed: number, section: number): NoteEvent[] {
  return composePhrase(theme, seed, section).notes;
}

// ------------------------------------------------------------------ chords

function progression(t: ThemeDef, letter: 'A' | 'B', rng: MusicRng): number[] {
  const out = [letter === 'A' ? 0 : t.bStart];
  for (let bar = 1; bar < MUSIC_PHRASE_BARS - 1; bar++) out.push(rng.weighted(t.transitions[out[bar - 1] as number] as number[]));
  out.push(letter === 'A' ? 0 : t.turn);
  return out;
}

/** Chord tones of chord `c` as scale degrees modulo the scale length. */
function chordDegrees(t: ThemeDef, c: number): Set<number> {
  const n = t.scale.length;
  return new Set((t.chords[c] as readonly number[]).map((d) => ((d % n) + n) % n));
}

// ------------------------------------------------------------------ melody

function melody(t: ThemeDef, letter: 'A' | 'B', chords: number[], rng: MusicRng, out: NoteEvent[]): void {
  const n = t.scale.length;
  const lo = MUSIC_MELODY_LOW;
  const hi = n + MUSIC_MELODY_HIGH_OVER;
  const motif = letter === 'A' && t.motif ? t.motif : null;
  const pick = (): readonly number[] => t.rhythms[rng.int(t.rhythms.length)] as readonly number[];
  const r0 = motif ? motif.map(() => 1) : pick();
  const r1 = pick();
  const r2 = pick();
  const r3 = pick();
  const r6 = pick();
  const cadence = t.cadences[rng.int(t.cadences.length)] as readonly number[];
  const rhythms = [r0, r1, r2, r3, r0, r1, r6, cadence];
  // A starts near the third of the tonic chord; B starts higher, near the fifth.
  let prev = letter === 'A' ? 2 : 4;

  for (let bar = 0; bar < MUSIC_PHRASE_BARS; bar++) {
    const tones = chordDegrees(t, chords[bar] as number);
    const isTone = (d: number): boolean => tones.has(((d % n) + n) % n);
    const rhythm = rhythms[bar] as readonly number[];
    let pos = 0;
    for (let k = 0; k < rhythm.length; k++) {
      const dur = rhythm[k] as number;
      const onset = pos;
      pos += dur;
      const strong = t.strongBeats.some((s) => Math.abs(s - onset) < EPS);
      const last = k === rhythm.length - 1;
      let deg: number;
      if (motif && bar === 0) deg = motif[k] as number;
      else if (letter === 'A' && bar === MUSIC_PHRASE_BARS - 1 && last) deg = nearestOf(prev, lo, hi, (d) => d % n === 0, rng);
      else if (strong || (bar === 0 && k === 0)) deg = chordToneNear(prev, lo, hi, isTone, rng);
      else deg = stepFrom(prev, lo, hi, rng);
      // A breath at the half phrase and the phrase end: the last weak note of bars 4 and 8 may rest.
      if (!strong && last && k > 0 && (bar === 3 || bar === MUSIC_PHRASE_BARS - 1) && rng.chance(MUSIC_REST_CHANCE)) continue;
      out.push({
        voice: 'lead',
        beat: bar * t.beatsPerBar + onset,
        lengthBeats: dur * t.articulation,
        midi: scaleDegreeMidi(t, deg),
        velocity: strong ? 0.9 : round2(0.68 + rng.next() * 0.12),
      });
      prev = deg;
    }
  }
}

/** A chord tone within `MUSIC_MAX_STEP_DEGREES` of `prev` (small moves favoured); the nearest one if none is that close. */
function chordToneNear(prev: number, lo: number, hi: number, isTone: (d: number) => boolean, rng: MusicRng): number {
  const cands: number[] = [];
  const weights: number[] = [];
  for (let d = Math.max(lo, prev - MUSIC_MAX_STEP_DEGREES); d <= Math.min(hi, prev + MUSIC_MAX_STEP_DEGREES); d++) {
    if (!isTone(d)) continue;
    cands.push(d);
    const dist = Math.abs(d - prev);
    weights.push(dist === 0 ? 1 : dist === 1 ? 3 : 2);
  }
  if (cands.length > 0) return cands[rng.weighted(weights)] as number;
  return nearestOf(prev, lo, hi, isTone, rng);
}

/** The degree in [lo, hi] nearest to `prev` that passes `ok` (ties broken by the RNG). */
function nearestOf(prev: number, lo: number, hi: number, ok: (d: number) => boolean, rng: MusicRng): number {
  for (let dist = 0; dist <= hi - lo; dist++) {
    const below = prev - dist >= lo && ok(prev - dist);
    const above = dist > 0 && prev + dist <= hi && ok(prev + dist);
    if (below && above) return rng.chance(0.5) ? prev - dist : prev + dist;
    if (below) return prev - dist;
    if (above) return prev + dist;
  }
  return Math.min(hi, Math.max(lo, prev));
}

/** A weak-beat note: a step of at most 2 degrees (repeats rare), or a rare leap of 3–4 toward the middle. */
function stepFrom(prev: number, lo: number, hi: number, rng: MusicRng): number {
  const mid = (lo + hi) / 2;
  let step: number;
  if (rng.chance(MUSIC_LEAP_CHANCE)) step = (3 + rng.int(2)) * (prev > mid ? -1 : 1);
  else step = ([-2, -1, 0, 1, 2] as const)[rng.weighted([1, 3, 1, 3, 1])] as number;
  let d = prev + step;
  if (d < lo || d > hi) d = prev - step;
  return Math.min(hi, Math.max(lo, d));
}

// ------------------------------------------------------------------ pad, bass, drums

function pad(t: ThemeDef, chords: number[], out: NoteEvent[]): void {
  const bpb = t.beatsPerBar;
  const push = (beat: number, lengthBeats: number, midi: number, velocity: number): void => {
    out.push({ voice: 'pad', beat, lengthBeats, midi, velocity });
  };
  for (let bar = 0; bar < MUSIC_PHRASE_BARS; bar++) {
    const start = bar * bpb;
    const tones = (t.chords[chords[bar] as number] as readonly number[])
      .map((d) => placeAbove(degreePc(t, d), t.padLow))
      .sort((a, b) => a - b);
    switch (t.pad) {
      case 'sustain':
      case 'soft':
      case 'tremolo': {
        const vel = t.pad === 'soft' ? 0.45 : t.pad === 'tremolo' ? 0.55 : 0.6;
        for (const m of tones) push(start, bpb, m, vel);
        break;
      }
      case 'waltz':
        for (let b = 1; b < bpb; b++) for (const m of tones) push(start + b, 0.6, m, 0.55);
        break;
      case 'eighths':
        for (let e = 0; e < bpb * 2; e++) for (const m of tones) push(start + e / 2, 0.4, m, e % 2 === 0 ? 0.55 : 0.45);
        break;
      case 'offbeat':
        for (let b = 1; b < bpb; b += 2) for (const m of tones) push(start + b + 0.5, 0.3, m, 0.5);
        break;
      case 'arp16': {
        const up = [...tones, ...tones.map((m) => m + 12)];
        const order = [0, 1, 2, 3, 4, 5, 4, 3];
        for (let i = 0; i < bpb * 4; i++) {
          const m = up[(order[i % order.length] as number) % up.length] as number;
          push(start + i / 4, 0.22, m, i % 4 === 0 ? 0.55 : 0.42);
        }
        break;
      }
    }
  }
}

function bass(t: ThemeDef, chords: number[], rng: MusicRng, out: NoteEvent[]): void {
  const bpb = t.beatsPerBar;
  for (let bar = 0; bar < MUSIC_PHRASE_BARS; bar++) {
    const root = (t.chords[chords[bar] as number] as readonly number[])[0] as number;
    const midi = placeAbove(degreePc(t, root), t.bassLow);
    t.bassBeats.forEach((b, i) => {
      const next = t.bassBeats[i + 1] ?? bpb;
      // The waltz "oom" is one beat long; other basses hold until the next bass beat.
      const len = (t.pad === 'waltz' ? 1 : next - b) * 0.9;
      const up = i > 0 && rng.chance(MUSIC_BASS_OCTAVE_CHANCE);
      out.push({
        voice: 'bass',
        beat: bar * bpb + b,
        lengthBeats: len,
        midi: midi + (up ? 12 : 0),
        velocity: i === 0 ? 0.85 : 0.75,
      });
    });
  }
}

function drums(t: ThemeDef, letter: 'A' | 'B', out: NoteEvent[]): void {
  const bpb = t.beatsPerBar;
  for (let bar = 0; bar < MUSIC_PHRASE_BARS; bar++) {
    const db: DrumBar =
      letter === 'B' && bar === MUSIC_PHRASE_BARS - 1 && t.fill ? t.fill : (t.drums[bar % t.drums.length] as DrumBar);
    const start = bar * bpb;
    for (const [b, v] of db.kick) out.push({ voice: 'kick', beat: start + b, lengthBeats: 0.25, midi: 0, velocity: v });
    for (const [b, v] of db.snare) out.push({ voice: 'snare', beat: start + b, lengthBeats: 0.25, midi: 0, velocity: v });
    for (const [b, v] of db.hat) out.push({ voice: 'hat', beat: start + b, lengthBeats: 0.1, midi: 0, velocity: v });
  }
}

// ------------------------------------------------------------------ swing

/** Swung time: [0, ½] of a beat maps to [0, r] and [½, 1] to [r, 1] (r = `MUSIC_SWING_RATIO`). */
export function swingBeat(beat: number): number {
  const whole = Math.floor(beat + EPS);
  const f = Math.max(0, beat - whole);
  const r = MUSIC_SWING_RATIO;
  const g = f <= 0.5 ? (f / 0.5) * r : r + ((f - 0.5) / 0.5) * (1 - r);
  return whole + g;
}

function swingNote(n: NoteEvent): void {
  const start = swingBeat(n.beat);
  const end = swingBeat(n.beat + n.lengthBeats);
  n.beat = start;
  n.lengthBeats = end - start;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
