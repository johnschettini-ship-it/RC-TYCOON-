/**
 * Procedural music generator (Phase 6 §4.3, §9 "same notes for the same seed and only scale notes"). Owner: W4-B.
 * Pure: no Web Audio. `composePhrase` exposes the chords per bar so the chord-tone rules can be checked.
 */
import { describe, expect, it } from 'vitest';
import { MUSIC_THEMES, type MusicThemeId, type NoteEvent } from '../../../src/audio/types';
import { composePhrase, generatePhrase } from '../../../src/audio/music';
import { THEMES, themeDef, scaleDegreeMidi } from '../../../src/audio/music/themes';
import { MUSIC_FORM, MUSIC_PHRASE_BARS, MUSIC_SWING_RATIO } from '../../../src/data/tuning/music';

const SEEDS = [1, 2, 7, 42, 1234, 99_991, 0x7fffffff];
const SECTIONS = [0, 1, 2, 3];
const PITCHED = new Set(['lead', 'pad', 'bass']);
const pc = (midi: number): number => ((midi % 12) + 12) % 12;
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

function voice(notes: NoteEvent[], v: NoteEvent['voice']): NoteEvent[] {
  return notes.filter((n) => n.voice === v);
}

/** Scale pitch classes of a theme. */
function scalePcs(theme: MusicThemeId): Set<number> {
  const d = themeDef(theme);
  return new Set(d.scale.map((s) => pc(d.leadTonic + s)));
}

describe('theme table (Phase 6 §4.3)', () => {
  it('has the 7 themes with the spec scale, tempo, and metre', () => {
    expect(THEMES.map((t) => t.id)).toEqual(MUSIC_THEMES);
    const spec: Record<MusicThemeId, [number, readonly number[], number, string, boolean]> = {
      title: [0, [0, 2, 4, 5, 7, 9, 11], 104, '4/4', false], // C major
      classic_fair: [5, [0, 2, 4, 5, 7, 9, 11], 120, '3/4', false], // F major
      frost_peaks: [4, [0, 3, 5, 7, 10], 84, '4/4', false], // E minor pentatonic
      volcano_ridge: [9, [0, 2, 3, 5, 7, 8, 10], 132, '4/4', false], // A minor
      spooky_hollow: [2, [0, 2, 3, 5, 7, 8, 11], 92, '6/8', false], // D harmonic minor
      jungle_lagoon: [7, [0, 2, 4, 5, 7, 9, 10], 108, '4/4', true], // G mixolydian, swing
      starport: [4, [0, 2, 3, 5, 7, 8, 10], 116, '4/4', false], // E minor
    };
    for (const t of THEMES) {
      const [tonic, scale, tempo, metre, swing] = spec[t.id];
      expect(pc(t.leadTonic), t.id).toBe(tonic);
      expect(t.scale, t.id).toEqual(scale);
      expect(t.tempo, t.id).toBe(tempo);
      expect(t.metre, t.id).toBe(metre);
      expect(t.swing, t.id).toBe(swing);
    }
  });

  it('lead and feel follow the table', () => {
    const lead = Object.fromEntries(THEMES.map((t) => [t.id, t.lead]));
    expect(lead).toEqual({
      title: 'triSquare',
      classic_fair: 'triangle',
      frost_peaks: 'sineBell',
      volcano_ridge: 'saw',
      spooky_hollow: 'detunedSquare',
      jungle_lagoon: 'sineHarmonic',
      starport: 'sawDelay',
    });
    expect(themeDef('volcano_ridge').leadLowpassHz).toBe(2_500);
    expect(THEMES.filter((t) => t.leadLowpassHz !== null).map((t) => t.id)).toEqual(['volcano_ridge']);
    const pad = Object.fromEntries(THEMES.map((t) => [t.id, t.pad]));
    expect(pad).toEqual({
      title: 'sustain',
      classic_fair: 'waltz',
      frost_peaks: 'soft',
      volcano_ridge: 'eighths',
      spooky_hollow: 'tremolo',
      jungle_lagoon: 'offbeat',
      starport: 'arp16',
    });
  });

  it('every chord is built from scale degrees and every Markov row leads somewhere', () => {
    for (const t of THEMES) {
      expect(t.transitions).toHaveLength(t.chords.length);
      for (const row of t.transitions) {
        expect(row).toHaveLength(t.chords.length);
        expect(row.some((w) => w > 0)).toBe(true);
        expect(row.every((w) => Number.isInteger(w) && w >= 0)).toBe(true);
      }
      for (const c of t.chords) expect(c.length).toBeGreaterThanOrEqual(3);
      expect(t.bStart).toBeGreaterThan(0);
      expect(t.turn).toBeGreaterThan(0);
    }
  });

  it('every melody rhythm fills one bar and has an onset on every strong beat; drum hits sit inside the bar', () => {
    for (const t of THEMES) {
      for (const r of [...t.rhythms, ...t.cadences]) {
        expect(r.reduce((a, b) => a + b, 0), `${t.id} ${r}`).toBeCloseTo(t.beatsPerBar);
        const onsets = r.map((_, i) => r.slice(0, i).reduce((a, b) => a + b, 0));
        for (const s of t.strongBeats) expect(onsets.some((o) => near(o, s)), `${t.id} ${r}`).toBe(true);
      }
      if (t.motif) expect(t.motif).toHaveLength(t.beatsPerBar);
      for (const bar of [...t.drums, ...(t.fill ? [t.fill] : [])])
        for (const [b, v] of [...bar.kick, ...bar.snare, ...bar.hat]) {
          expect(b).toBeGreaterThanOrEqual(0);
          expect(b).toBeLessThan(t.beatsPerBar);
          expect(v).toBeGreaterThan(0);
          expect(v).toBeLessThanOrEqual(1);
        }
    }
  });

  it('scaleDegreeMidi wraps degrees into octaves', () => {
    const c = themeDef('title');
    expect(scaleDegreeMidi(c, 0)).toBe(72);
    expect(scaleDegreeMidi(c, 2)).toBe(76);
    expect(scaleDegreeMidi(c, 7)).toBe(84);
    expect(scaleDegreeMidi(c, -1)).toBe(71);
    expect(scaleDegreeMidi(c, -7)).toBe(60);
  });
});

describe('generatePhrase: determinism', () => {
  it('the same theme, seed, and section give identical notes', () => {
    for (const theme of MUSIC_THEMES)
      for (const seed of SEEDS.slice(0, 4))
        for (const section of SECTIONS)
          expect(generatePhrase(theme, seed, section)).toEqual(generatePhrase(theme, seed, section));
  });

  it('different seeds give different notes', () => {
    for (const theme of MUSIC_THEMES) {
      const keys = new Set(SEEDS.map((s) => JSON.stringify(generatePhrase(theme, s, 0))));
      expect(keys.size, theme).toBe(SEEDS.length);
      const b = new Set(SEEDS.map((s) => JSON.stringify(generatePhrase(theme, s, 2))));
      expect(b.size, theme).toBe(SEEDS.length);
    }
  });

  it('different themes give different notes for one seed', () => {
    const keys = new Set(MUSIC_THEMES.map((t) => JSON.stringify(generatePhrase(t, 5, 0))));
    expect(keys.size).toBe(MUSIC_THEMES.length);
  });

  it('notes are sorted by beat and the input is not mutated between calls', () => {
    const a = generatePhrase('starport', 3, 0);
    for (let i = 1; i < a.length; i++) expect((a[i] as NoteEvent).beat).toBeGreaterThanOrEqual((a[i - 1] as NoteEvent).beat);
    a.length = 0;
    expect(generatePhrase('starport', 3, 0).length).toBeGreaterThan(0);
  });
});

describe('generatePhrase: notes', () => {
  it('every lead, pad, and bass note is in the theme scale; drums use midi 0', () => {
    for (const theme of MUSIC_THEMES) {
      const scale = scalePcs(theme);
      for (const seed of SEEDS)
        for (const section of SECTIONS)
          for (const n of generatePhrase(theme, seed, section)) {
            if (PITCHED.has(n.voice)) expect(scale.has(pc(n.midi)), `${theme} ${n.voice} ${n.midi}`).toBe(true);
            else expect(n.midi).toBe(0);
          }
    }
  });

  it('notes are inside the 8-bar phrase with positive lengths and velocities in 0–1', () => {
    for (const theme of MUSIC_THEMES) {
      const d = themeDef(theme);
      const beats = MUSIC_PHRASE_BARS * d.beatsPerBar;
      for (const seed of SEEDS.slice(0, 3))
        for (const section of SECTIONS)
          for (const n of generatePhrase(theme, seed, section)) {
            expect(n.beat).toBeGreaterThanOrEqual(0);
            expect(n.beat + n.lengthBeats).toBeLessThanOrEqual(beats + 1e-9);
            expect(n.lengthBeats).toBeGreaterThan(0);
            expect(n.velocity).toBeGreaterThan(0);
            expect(n.velocity).toBeLessThanOrEqual(1);
            expect(Number.isFinite(n.midi)).toBe(true);
          }
    }
  });

  it('the melody lands on a chord tone on the strong beats (beats 1 and 3 in 4/4)', () => {
    expect(themeDef('title').strongBeats).toEqual([0, 2]);
    expect(themeDef('classic_fair').strongBeats).toEqual([0, 2]);
    expect(themeDef('spooky_hollow').strongBeats).toEqual([0, 3]);
    for (const theme of MUSIC_THEMES) {
      const d = themeDef(theme);
      for (const seed of SEEDS)
        for (const section of SECTIONS) {
          const { notes, bars } = composePhrase(theme, seed, section);
          expect(bars).toHaveLength(MUSIC_PHRASE_BARS);
          for (let bar = 0; bar < MUSIC_PHRASE_BARS; bar++)
            for (const s of d.strongBeats) {
              const at = bar * d.beatsPerBar + s;
              const lead = voice(notes, 'lead').filter((n) => near(n.beat, at));
              expect(lead, `${theme} seed ${seed} bar ${bar} beat ${s}`).toHaveLength(1);
              expect((bars[bar] as { tones: number[] }).tones).toContain(pc((lead[0] as NoteEvent).midi));
            }
        }
    }
  });

  it('the melody moves mostly in steps of at most 2 scale degrees', () => {
    for (const theme of MUSIC_THEMES) {
      const d = themeDef(theme);
      const degreeOf = new Map<number, number>();
      for (let deg = -14; deg <= 21; deg++) degreeOf.set(scaleDegreeMidi(d, deg), deg);
      let steps = 0;
      let small = 0;
      for (const seed of SEEDS)
        for (const section of SECTIONS) {
          const lead = voice(generatePhrase(theme, seed, section), 'lead');
          for (let i = 1; i < lead.length; i++) {
            const a = degreeOf.get((lead[i - 1] as NoteEvent).midi) as number;
            const b = degreeOf.get((lead[i] as NoteEvent).midi) as number;
            steps++;
            if (Math.abs(a - b) <= 2) small++;
          }
        }
      expect(small / steps, theme).toBeGreaterThanOrEqual(0.85);
    }
  });

  it('the bass plays the chord root on beats 1 and 3 (4/4)', () => {
    for (const theme of MUSIC_THEMES) {
      const d = themeDef(theme);
      for (const seed of SEEDS.slice(0, 4))
        for (const section of SECTIONS) {
          const { notes, bars } = composePhrase(theme, seed, section);
          const bass = voice(notes, 'bass');
          for (const n of bass) {
            const bar = Math.floor(n.beat / d.beatsPerBar + 1e-9);
            expect(pc(n.midi), `${theme} bar ${bar}`).toBe((bars[bar] as { root: number }).root);
            expect(d.bassBeats.some((b) => near(n.beat - bar * d.beatsPerBar, b))).toBe(true);
          }
          expect(bass).toHaveLength(MUSIC_PHRASE_BARS * d.bassBeats.length);
        }
      if (d.metre === '4/4') expect(d.bassBeats, theme).toEqual([0, 2]);
    }
  });

  it('chords follow the Markov table; A starts and ends on the tonic, B starts on its own chord and ends on the turn', () => {
    for (const theme of MUSIC_THEMES) {
      const d = themeDef(theme);
      for (const seed of SEEDS)
        for (const section of SECTIONS) {
          const { chords } = composePhrase(theme, seed, section);
          const letter = MUSIC_FORM[section];
          expect(chords[0]).toBe(letter === 'A' ? 0 : d.bStart);
          expect(chords[7]).toBe(letter === 'A' ? 0 : d.turn);
          for (let bar = 1; bar < 7; bar++) {
            const from = chords[bar - 1] as number;
            const to = chords[bar] as number;
            expect((d.transitions[from] as number[])[to], `${theme} ${from}→${to}`).toBeGreaterThan(0);
          }
        }
    }
  });
});

describe('generatePhrase: form and metre', () => {
  it('the form is A A B A: sections 0, 1, and 3 are equal and section 2 differs', () => {
    expect(MUSIC_FORM).toEqual(['A', 'A', 'B', 'A']);
    for (const theme of MUSIC_THEMES)
      for (const seed of SEEDS.slice(0, 4)) {
        const a = generatePhrase(theme, seed, 0);
        expect(generatePhrase(theme, seed, 1)).toEqual(a);
        expect(generatePhrase(theme, seed, 3)).toEqual(a);
        expect(generatePhrase(theme, seed, 2)).not.toEqual(a);
        expect(generatePhrase(theme, seed, 4)).toEqual(a);
        expect(generatePhrase(theme, seed, -2)).toEqual(generatePhrase(theme, seed, 2));
      }
  });

  it('4/4 themes have 32 beats; Classic Fair is a 3/4 waltz; Spooky Hollow is 6/8', () => {
    for (const theme of ['title', 'frost_peaks', 'volcano_ridge', 'jungle_lagoon', 'starport'] as const) {
      expect(themeDef(theme).beatsPerBar).toBe(4);
      expect(themeDef(theme).beatUnit).toBe(1);
    }
    const fair = themeDef('classic_fair');
    expect(fair.beatsPerBar).toBe(3);
    // Waltz bass: the root alone on beat 1, the chord on beats 2 and 3.
    expect(fair.bassBeats).toEqual([0]);
    const notes = generatePhrase('classic_fair', 11, 0);
    for (const n of voice(notes, 'bass')) expect(n.beat % 3).toBe(0);
    const padBeats = new Set(voice(notes, 'pad').map((n) => n.beat % 3));
    expect([...padBeats].sort()).toEqual([1, 2]);
    expect(voice(notes, 'kick').every((n) => n.beat % 3 === 0)).toBe(true);
    const spooky = themeDef('spooky_hollow');
    expect(spooky.beatsPerBar).toBe(6);
    // A beat is an eighth note in 6/8; the bass pulses in dotted quarters.
    expect(spooky.beatUnit).toBe(0.5);
    expect(spooky.bassBeats).toEqual([0, 3]);
    const sp = generatePhrase('spooky_hollow', 11, 0);
    expect(Math.max(...sp.map((n) => n.beat))).toBeLessThan(48);
    expect(voice(sp, 'snare').every((n) => n.beat % 6 === 3 || n.beat % 6 === 5)).toBe(true);
  });

  it('Jungle Lagoon swings: off-beat eighths move to 2/3 of the beat, none sit on the half beat', () => {
    expect(MUSIC_SWING_RATIO).toBeCloseTo(2 / 3);
    for (const seed of SEEDS.slice(0, 3)) {
      const notes = generatePhrase('jungle_lagoon', seed, 0);
      const fracs = notes.map((n) => n.beat - Math.floor(n.beat + 1e-9));
      expect(fracs.some((f) => near(f, MUSIC_SWING_RATIO))).toBe(true);
      expect(fracs.some((f) => near(f, 0.5))).toBe(false);
      const hats = voice(notes, 'hat').map((n) => n.beat);
      expect(hats.filter((b) => near(b - Math.floor(b + 1e-9), MUSIC_SWING_RATIO)).length).toBeGreaterThanOrEqual(16);
    }
    // Straight themes keep their half beats.
    const straight = voice(generatePhrase('title', 3, 0), 'hat').map((n) => n.beat - Math.floor(n.beat));
    expect(straight.some((f) => near(f, 0.5))).toBe(true);
  });

  it('feel per theme: driving eighths, sixteenth arps, sparse drums, tremolo pad held', () => {
    const volcano = voice(generatePhrase('volcano_ridge', 4, 0), 'pad');
    for (let e = 0; e < 64; e++) expect(volcano.some((n) => near(n.beat, e / 2)), `eighth ${e}`).toBe(true);
    const starport = voice(generatePhrase('starport', 4, 0), 'pad');
    expect(starport).toHaveLength(8 * 16);
    starport.forEach((n, i) => expect(n.beat).toBeCloseTo(i / 4));
    const drums = (t: MusicThemeId): number =>
      generatePhrase(t, 4, 0).filter((n) => n.voice === 'kick' || n.voice === 'snare' || n.voice === 'hat').length;
    expect(drums('frost_peaks')).toBeLessThan(drums('title') / 3);
    const frost = generatePhrase('frost_peaks', 4, 0);
    expect(voice(frost, 'pad').every((n) => n.lengthBeats === 4)).toBe(true);
    const spooky = voice(generatePhrase('spooky_hollow', 4, 0), 'pad');
    expect(spooky.every((n) => n.lengthBeats === 6)).toBe(true);
  });

  it('the Title theme opens each A section with the original motif C–E–G–A', () => {
    for (const seed of SEEDS) {
      const lead = voice(generatePhrase('title', seed, 0), 'lead').filter((n) => n.beat < 4);
      expect(lead.map((n) => pc(n.midi))).toEqual([0, 4, 7, 9]);
      expect(lead.map((n) => n.beat)).toEqual([0, 1, 2, 3]);
    }
    const b = voice(generatePhrase('title', 1, 2), 'lead').filter((n) => n.beat < 4);
    expect(b.map((n) => pc(n.midi))).not.toEqual([0, 4, 7, 9]);
  });
});
