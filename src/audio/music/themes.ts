/**
 * Music themes (Phase 6 §4.3 table). Owner: W4-B. Original material only: scales, chord tables, rhythms, and drum
 * patterns are generic genre building blocks, written here for this game; no tune of another game is copied.
 *
 * Time unit: a beat is a quarter note in 4/4 and 3/4 and an eighth note in 6/8 (`beatUnit` = its length in quarter
 * notes). `tempo` is quarter notes per minute for every theme.
 *
 * Chords are lists of scale degrees (0 = tonic; a degree ≥ the scale length is the next octave), root first. Chord 0
 * is the tonic. `transitions[from][to]` are integer Markov weights for the next bar's chord.
 */
import type { MusicThemeId } from '../types';

export type Metre = '4/4' | '3/4' | '6/8';
export type LeadKind = 'triSquare' | 'triangle' | 'sineBell' | 'saw' | 'detunedSquare' | 'sineHarmonic' | 'sawDelay';
/** How the pad plays the chord: held all bar, waltz stabs on 2 and 3, eighth pulses, off-beat stabs, sixteenth arps. */
export type PadStyle = 'sustain' | 'soft' | 'tremolo' | 'waltz' | 'eighths' | 'offbeat' | 'arp16';

/** A drum hit: beat in the bar and velocity (0–1). */
export type Hit = readonly [beat: number, velocity: number];

export interface DrumBar {
  kick: readonly Hit[];
  snare: readonly Hit[];
  hat: readonly Hit[];
}

export interface ThemeDef {
  id: MusicThemeId;
  /** Semitones above the tonic. */
  scale: readonly number[];
  /** MIDI note of melody degree 0. */
  leadTonic: number;
  /** Pad and bass notes sit in [low, low + 12) (arps climb from `padLow`). */
  padLow: number;
  bassLow: number;
  tempo: number;
  metre: Metre;
  beatsPerBar: number;
  beatUnit: number;
  /** Beats of a bar where the melody lands on a chord tone. */
  strongBeats: readonly number[];
  /** Beats of a bar where the bass plays the chord root. */
  bassBeats: readonly number[];
  swing: boolean;
  lead: LeadKind;
  /** Day low-pass on the lead (null = open). */
  leadLowpassHz: number | null;
  pad: PadStyle;
  padWave: OscillatorType;
  bassWave: OscillatorType;
  chords: readonly (readonly number[])[];
  transitions: readonly (readonly number[])[];
  /** Chord index the B section starts on and the chord that ends it (leads back to A). */
  bStart: number;
  turn: number;
  /** Melody rhythms of one bar (note lengths in beats; each has an onset on every strong beat). */
  rhythms: readonly (readonly number[])[];
  /** Rhythms of the last bar of a phrase. */
  cadences: readonly (readonly number[])[];
  /** Sounding share of each melody note's slot. */
  articulation: number;
  /** Drum bars, used in turn by bar index. */
  drums: readonly DrumBar[];
  /** Last bar of the B section (a small fill), or null. */
  fill: DrumBar | null;
  /** Melody degrees of the first bar of every A section (one per beat), or null. */
  motif: readonly number[] | null;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11] as const;
const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10] as const;
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11] as const;
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10] as const;
const MINOR_PENTATONIC = [0, 3, 5, 7, 10] as const;

/** A triad stacked in thirds on scale degree `d` of a 7-note scale. */
const triad = (d: number): readonly number[] => [d, d + 2, d + 4];

/** Hits at every `step` beats of a bar of `beats` beats; `onBeat` velocity on whole beats, `off` between. */
function grid(beats: number, step: number, onBeat: number, off: number): Hit[] {
  const out: Hit[] = [];
  for (let i = 0; i * step < beats - 1e-9; i++) {
    const b = i * step;
    out.push([b, Math.abs(b - Math.round(b)) < 1e-9 ? onBeat : off]);
  }
  return out;
}

/** 6/8 hats: one per eighth, a little louder on the two dotted-quarter pulses. */
const pulses = (n: number): Hit[] => grid(n, 1, 0.12, 0.12).map(([b]) => [b, b % 3 === 0 ? 0.2 : 0.12] as const);

const STRAIGHT_44: readonly (readonly number[])[] = [
  [1, 1, 1, 1],
  [2, 1, 1],
  [1, 0.5, 0.5, 1, 1],
  [1.5, 0.5, 1, 1],
  [1, 1, 2],
  [0.5, 0.5, 1, 1, 0.5, 0.5],
  [1, 1, 1.5, 0.5],
];
const CADENCE_44: readonly (readonly number[])[] = [
  [2, 2],
  [1, 1, 2],
];

export const THEMES: readonly ThemeDef[] = Object.freeze<ThemeDef[]>([
  {
    id: 'title',
    scale: MAJOR,
    leadTonic: 72, // C5
    padLow: 55,
    bassLow: 36,
    tempo: 104,
    metre: '4/4',
    beatsPerBar: 4,
    beatUnit: 1,
    strongBeats: [0, 2],
    bassBeats: [0, 2],
    swing: false,
    lead: 'triSquare',
    leadLowpassHz: null,
    pad: 'sustain',
    padWave: 'triangle',
    bassWave: 'triangle',
    // I ii IV V vi
    chords: [triad(0), triad(1), triad(3), triad(4), triad(5)],
    transitions: [
      [0, 2, 4, 3, 3],
      [0, 0, 1, 5, 1],
      [2, 2, 0, 4, 1],
      [5, 0, 1, 0, 3],
      [0, 3, 4, 1, 0],
    ],
    bStart: 2,
    turn: 3,
    rhythms: STRAIGHT_44,
    cadences: CADENCE_44,
    articulation: 0.85,
    drums: [{ kick: [[0, 0.9], [2, 0.8]], snare: [[1, 0.6], [3, 0.6]], hat: grid(4, 0.5, 0.35, 0.25) }],
    fill: { kick: [[0, 0.9], [2, 0.8]], snare: [[1, 0.6], [3, 0.6], [3.5, 0.5]], hat: grid(3, 0.5, 0.35, 0.25) },
    // The original 4-note motif C–E–G–A (spec), one note per beat.
    motif: [0, 2, 4, 5],
  },
  {
    id: 'classic_fair',
    scale: MAJOR,
    leadTonic: 65, // F4
    padLow: 57,
    bassLow: 36,
    tempo: 120,
    metre: '3/4',
    beatsPerBar: 3,
    beatUnit: 1,
    strongBeats: [0, 2],
    // Waltz bass: the root on beat 1, the pad's chord on beats 2 and 3.
    bassBeats: [0],
    swing: false,
    lead: 'triangle',
    leadLowpassHz: null,
    pad: 'waltz',
    padWave: 'triangle',
    bassWave: 'triangle',
    chords: [triad(0), triad(1), triad(3), triad(4), triad(5)],
    transitions: [
      [0, 1, 3, 4, 2],
      [0, 0, 0, 5, 1],
      [3, 1, 0, 4, 0],
      [6, 0, 1, 0, 2],
      [0, 3, 3, 2, 0],
    ],
    bStart: 2,
    turn: 3,
    rhythms: [
      [1, 1, 1],
      [2, 1],
      [1, 0.5, 0.5, 1],
      [1.5, 0.5, 1],
      [0.5, 0.5, 1, 1],
    ],
    cadences: [[2, 1], [1, 1, 1]],
    articulation: 0.8,
    drums: [{ kick: [[0, 0.7]], snare: [], hat: [[1, 0.3], [2, 0.3]] }],
    fill: null,
    motif: null,
  },
  {
    id: 'frost_peaks',
    scale: MINOR_PENTATONIC,
    leadTonic: 76, // E5
    padLow: 55,
    bassLow: 36,
    tempo: 84,
    metre: '4/4',
    beatsPerBar: 4,
    beatUnit: 1,
    strongBeats: [0, 2],
    bassBeats: [0, 2],
    swing: false,
    lead: 'sineBell',
    leadLowpassHz: null,
    pad: 'soft',
    padWave: 'sine',
    bassWave: 'sine',
    // Em (E G B), G (G B D), Asus4 (A D E), Dsus2 (D E A): every tone in E minor pentatonic.
    chords: [
      [0, 1, 3],
      [1, 3, 4],
      [2, 4, 5],
      [4, 5, 7],
    ],
    transitions: [
      [0, 3, 3, 2],
      [2, 0, 2, 3],
      [3, 2, 0, 2],
      [4, 2, 1, 0],
    ],
    bStart: 1,
    turn: 3,
    rhythms: [
      [2, 2],
      [2, 1, 1],
      [1, 1, 2],
      [1, 1, 1, 1],
      [2, 1.5, 0.5],
    ],
    cadences: [[2, 2]],
    articulation: 1,
    // Sparse drums: a soft kick every other bar, a hat on beat 3.
    drums: [
      { kick: [[0, 0.45]], snare: [], hat: [[2, 0.2]] },
      { kick: [], snare: [], hat: [[2, 0.2], [3, 0.12]] },
    ],
    fill: { kick: [[0, 0.45]], snare: [[2, 0.25]], hat: [] },
    motif: null,
  },
  {
    id: 'volcano_ridge',
    scale: NATURAL_MINOR,
    leadTonic: 69, // A4
    padLow: 52,
    bassLow: 36,
    tempo: 132,
    metre: '4/4',
    beatsPerBar: 4,
    beatUnit: 1,
    strongBeats: [0, 2],
    bassBeats: [0, 2],
    swing: false,
    lead: 'saw',
    leadLowpassHz: 2_500,
    pad: 'eighths',
    padWave: 'sawtooth',
    bassWave: 'sawtooth',
    // i III iv VI VII v
    chords: [triad(0), triad(2), triad(3), triad(5), triad(6), triad(4)],
    transitions: [
      [0, 1, 2, 4, 3, 1],
      [1, 0, 2, 2, 3, 0],
      [2, 1, 0, 1, 3, 2],
      [2, 1, 1, 0, 5, 0],
      [5, 2, 0, 1, 0, 0],
      [4, 0, 1, 2, 0, 0],
    ],
    bStart: 3,
    turn: 4,
    rhythms: [
      [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      [1, 0.5, 0.5, 1, 0.5, 0.5],
      [0.5, 0.5, 1, 0.5, 0.5, 1],
      [1.5, 0.5, 1, 1],
      [1, 1, 1, 1],
    ],
    cadences: [[1, 1, 2], [2, 2]],
    articulation: 0.75,
    drums: [{ kick: [[0, 0.95], [1.5, 0.6], [2, 0.9], [2.5, 0.6]], snare: [[1, 0.8], [3, 0.8]], hat: grid(4, 0.5, 0.4, 0.3) }],
    fill: {
      kick: [[0, 0.95], [2, 0.9]],
      snare: [[1, 0.8], [3, 0.6], [3.25, 0.65], [3.5, 0.7], [3.75, 0.8]],
      hat: grid(3, 0.5, 0.4, 0.3),
    },
    motif: null,
  },
  {
    id: 'spooky_hollow',
    scale: HARMONIC_MINOR,
    leadTonic: 62, // D4
    padLow: 50,
    bassLow: 36,
    tempo: 92,
    metre: '6/8',
    beatsPerBar: 6,
    beatUnit: 0.5,
    strongBeats: [0, 3],
    bassBeats: [0, 3],
    swing: false,
    lead: 'detunedSquare',
    leadLowpassHz: null,
    pad: 'tremolo',
    padWave: 'triangle',
    bassWave: 'square',
    // i iv V VI ii° III+
    chords: [triad(0), triad(3), triad(4), triad(5), triad(1), triad(2)],
    transitions: [
      [0, 3, 2, 3, 1, 1],
      [2, 0, 3, 1, 2, 0],
      [6, 1, 0, 2, 0, 1],
      [1, 2, 2, 0, 3, 0],
      [0, 0, 6, 0, 0, 0],
      [1, 3, 0, 2, 0, 0],
    ],
    bStart: 3,
    turn: 2,
    rhythms: [
      [3, 3],
      [2, 1, 2, 1],
      [1, 1, 1, 1, 1, 1],
      [3, 2, 1],
      [1, 1, 1, 3],
      [2, 1, 3],
    ],
    cadences: [[3, 3], [2, 1, 3]],
    articulation: 0.9,
    drums: [{ kick: [[0, 0.6]], snare: [[3, 0.35]], hat: pulses(6) }],
    fill: { kick: [[0, 0.6]], snare: [[3, 0.35], [5, 0.3]], hat: pulses(5) },
    motif: null,
  },
  {
    id: 'jungle_lagoon',
    scale: MIXOLYDIAN,
    leadTonic: 67, // G4
    padLow: 55,
    bassLow: 36,
    tempo: 108,
    metre: '4/4',
    beatsPerBar: 4,
    beatUnit: 1,
    strongBeats: [0, 2],
    bassBeats: [0, 2],
    swing: true,
    lead: 'sineHarmonic',
    leadLowpassHz: null,
    pad: 'offbeat',
    padWave: 'triangle',
    bassWave: 'triangle',
    // I bVII IV v ii
    chords: [triad(0), triad(6), triad(3), triad(4), triad(1)],
    transitions: [
      [0, 4, 3, 1, 1],
      [3, 0, 4, 1, 0],
      [4, 2, 0, 1, 1],
      [3, 1, 2, 0, 1],
      [2, 1, 1, 3, 0],
    ],
    bStart: 2,
    turn: 1,
    rhythms: [
      [0.5, 0.5, 1, 0.5, 0.5, 1],
      [1, 0.5, 0.5, 1, 1],
      [0.5, 0.5, 0.5, 0.5, 1, 1],
      [1.5, 0.5, 1, 1],
      [1, 1, 0.5, 0.5, 0.5, 0.5],
    ],
    cadences: [[1, 1, 2], [0.5, 0.5, 1, 2]],
    articulation: 0.6,
    // Shuffle percussion: the swing moves every off-beat hat to the last triplet of the beat.
    drums: [{ kick: [[0, 0.8], [2, 0.7], [2.5, 0.45]], snare: [[1, 0.6], [3, 0.6]], hat: grid(4, 0.5, 0.3, 0.22) }],
    fill: { kick: [[0, 0.8], [2, 0.7]], snare: [[1, 0.6], [3, 0.6], [3.5, 0.45]], hat: grid(3, 0.5, 0.3, 0.22) },
    motif: null,
  },
  {
    id: 'starport',
    scale: NATURAL_MINOR,
    leadTonic: 64, // E4 (a saw lead stays below the very bright octave)
    padLow: 52,
    bassLow: 36,
    tempo: 116,
    metre: '4/4',
    beatsPerBar: 4,
    beatUnit: 1,
    strongBeats: [0, 2],
    bassBeats: [0, 2],
    swing: false,
    lead: 'sawDelay',
    leadLowpassHz: null,
    pad: 'arp16',
    padWave: 'square',
    bassWave: 'sawtooth',
    // i VI III VII iv
    chords: [triad(0), triad(5), triad(2), triad(6), triad(3)],
    transitions: [
      [0, 4, 2, 2, 2],
      [1, 0, 3, 4, 1],
      [1, 2, 0, 4, 1],
      [4, 2, 1, 0, 1],
      [2, 3, 0, 2, 0],
    ],
    bStart: 1,
    turn: 3,
    rhythms: [
      [0.75, 0.75, 0.5, 1, 1],
      [1, 1, 1, 1],
      [0.5, 0.5, 0.5, 0.5, 1, 1],
      [1.5, 0.5, 2],
      [1, 0.5, 0.5, 0.75, 0.75, 0.5],
    ],
    cadences: [[2, 2], [1, 1, 2]],
    articulation: 0.7,
    drums: [
      {
        kick: [[0, 0.8], [1, 0.75], [2, 0.8], [3, 0.75]],
        snare: [[1, 0.55], [3, 0.55]],
        hat: grid(4, 0.25, 0.12, 0.12).map(([b]) => [b, b % 1 === 0.5 ? 0.35 : 0.1] as const),
      },
    ],
    fill: {
      kick: [[0, 0.8], [1, 0.75], [2, 0.8]],
      snare: [[1, 0.55], [3, 0.5], [3.25, 0.55], [3.5, 0.6], [3.75, 0.7]],
      hat: grid(3, 0.5, 0.12, 0.35),
    },
    motif: null,
  },
]);

const BY_ID = new Map<MusicThemeId, ThemeDef>(THEMES.map((t) => [t.id, t]));

export function themeDef(id: MusicThemeId): ThemeDef {
  const t = BY_ID.get(id);
  if (!t) throw new RangeError(`Unknown music theme ${id}`);
  return t;
}

/** MIDI note of melody scale degree `deg` (any integer; wraps into octaves around `leadTonic`). */
export function scaleDegreeMidi(t: ThemeDef, deg: number): number {
  const n = t.scale.length;
  const oct = Math.floor(deg / n);
  const i = deg - oct * n;
  return t.leadTonic + 12 * oct + (t.scale[i] as number);
}

/** Pitch class (0–11) of scale degree `deg`. */
export function degreePc(t: ThemeDef, deg: number): number {
  return ((scaleDegreeMidi(t, deg) % 12) + 12) % 12;
}

/** The lowest MIDI note ≥ `low` with pitch class `pc`. */
export function placeAbove(pc: number, low: number): number {
  return low + ((((pc - low) % 12) + 12) % 12);
}
