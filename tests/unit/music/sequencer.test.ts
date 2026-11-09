/** The pure music timeline: phrases A A B A in a loop on the audio clock. Owner: W4-B. */
import { describe, expect, it } from 'vitest';
import { generatePhrase, phraseBeats } from '../../../src/audio/music';
import { createSequencer, cycleSeed, type ScheduledNote } from '../../../src/audio/music/sequencer';
import { themeDef } from '../../../src/audio/music/themes';

const times = (notes: ScheduledNote[]): number[] => notes.map((n) => n.time);

describe('createSequencer', () => {
  it('places the first phrase on the clock at 60 / tempo seconds per beat', () => {
    const seq = createSequencer({ theme: 'title', seed: 9, startTime: 2 });
    const spb = 60 / 104;
    expect(seq.beatSeconds).toBeCloseTo(spb);
    const phraseS = phraseBeats('title') * spb;
    const got = seq.pull(2 + phraseS);
    const want = generatePhrase('title', 9, 0);
    expect(got).toHaveLength(want.length);
    got.forEach((n, i) => {
      const w = want[i]!;
      expect(n.voice).toBe(w.voice);
      expect(n.midi).toBe(w.midi);
      expect(n.time).toBeCloseTo(2 + w.beat * spb, 9);
      expect(n.duration).toBeCloseTo(w.lengthBeats * spb, 9);
    });
  });

  it('6/8 beats are eighth notes: half a quarter at the quarter-note tempo', () => {
    const seq = createSequencer({ theme: 'spooky_hollow', seed: 1, startTime: 0 });
    expect(seq.beatSeconds).toBeCloseTo(60 / 92 / 2);
    expect(themeDef('spooky_hollow').beatUnit).toBe(0.5);
  });

  it('returns each note once, in time order, whatever the pull steps', () => {
    const one = createSequencer({ theme: 'starport', seed: 3, startTime: 0.5 });
    const all = one.pull(60);
    const steps = createSequencer({ theme: 'starport', seed: 3, startTime: 0.5 });
    const parts: ScheduledNote[] = [];
    for (let t = 0; t < 60; t += 0.025) parts.push(...steps.pull(Math.min(60, t + 0.1)));
    parts.push(...steps.pull(60));
    expect(parts).toEqual(all);
    for (let i = 1; i < all.length; i++) expect(all[i]!.time).toBeGreaterThanOrEqual(all[i - 1]!.time);
    expect(all.every((n) => n.time < 60)).toBe(true);
    expect(steps.peek()).toBeGreaterThanOrEqual(60);
  });

  it('plays the form A A B A, then the next cycle; even cycles repeat the main tune', () => {
    const seq = createSequencer({ theme: 'classic_fair', seed: 5, startTime: 0 });
    const ps = phraseBeats('classic_fair') * seq.beatSeconds;
    const section = (k: number): ScheduledNote[] => {
      const out = createSequencer({ theme: 'classic_fair', seed: 5, startTime: 0 }).pull((k + 1) * ps);
      return out.filter((n) => n.time >= k * ps - 1e-9).map((n) => ({ ...n, time: n.time - k * ps }));
    };
    const strip = (ns: ScheduledNote[]): unknown[] => ns.map((n) => [n.voice, n.midi, Math.round(n.time * 1e6)]);
    expect(strip(section(1))).toEqual(strip(section(0)));
    expect(strip(section(3))).toEqual(strip(section(0)));
    expect(strip(section(2))).not.toEqual(strip(section(0)));
    expect(strip(section(4))).not.toEqual(strip(section(0)));
    expect(strip(section(8))).toEqual(strip(section(0)));
    expect(cycleSeed(5, 0)).toBe(5);
    expect(cycleSeed(5, 2)).toBe(5);
    expect(cycleSeed(5, 1)).not.toBe(5);
    expect(cycleSeed(5, 3)).not.toBe(cycleSeed(5, 1));
  });

  it('a tempo factor stretches the timeline (night: × 0.85)', () => {
    const day = createSequencer({ theme: 'jungle_lagoon', seed: 2, startTime: 1 });
    const night = createSequencer({ theme: 'jungle_lagoon', seed: 2, startTime: 1, tempoFactor: 0.85 });
    expect(night.beatSeconds).toBeCloseTo(60 / (108 * 0.85));
    const d = day.pull(20);
    const n = night.pull(1 + (20 - 1) / 0.85);
    expect(n).toHaveLength(d.length);
    n.forEach((x, i) => expect(x.time - 1).toBeCloseTo((d[i]!.time - 1) / 0.85, 9));
  });

  it('shift moves the rest of the timeline later', () => {
    const seq = createSequencer({ theme: 'volcano_ridge', seed: 4, startTime: 0 });
    const ref = createSequencer({ theme: 'volcano_ridge', seed: 4, startTime: 0 });
    const a = seq.pull(1);
    expect(times(a)).toEqual(times(ref.pull(1)));
    const next = seq.peek();
    seq.shift(3);
    expect(seq.peek()).toBeCloseTo(next + 3);
    const b = seq.pull(10);
    const r = ref.pull(7);
    expect(times(b)).toEqual(times(r).map((t) => t + 3));
  });
});
