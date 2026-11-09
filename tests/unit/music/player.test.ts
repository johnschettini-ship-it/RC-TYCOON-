/**
 * The music player on a fake `AudioContext` and a fake 25 ms timer (Phase 6 §4.3, §8: lookahead 100 ms, timer 25 ms,
 * crossfade 4 s; night variant). Owner: W4-B.
 */
import { describe, expect, it } from 'vitest';
import { createMusicPlayer, deckParams, type MusicPlayerOptions } from '../../../src/audio/music';
import { themeSeed } from '../../../src/audio/music/player';
import { createSequencer, type ScheduledNote } from '../../../src/audio/music/sequencer';
import { MUSIC_THEMES, type MusicHost, type MusicThemeId } from '../../../src/audio/types';
import {
  MUSIC_CROSSFADE_MS,
  MUSIC_LOOKAHEAD_MS,
  MUSIC_NIGHT_LOWPASS_HZ,
  MUSIC_NIGHT_REVERB_S,
  MUSIC_NIGHT_TEMPO,
  MUSIC_START_DELAY_S,
  MUSIC_TIMER_MS,
} from '../../../src/data/tuning/music';
import {
  FakeBiquad,
  FakeBufferSource,
  FakeContext,
  FakeConvolver,
  FakeGain,
  FakeOscillator,
  FakeSource,
  FakeTimer,
  reaches,
} from './fakeAudio';

const LOOK = MUSIC_LOOKAHEAD_MS / 1000;
const FADE = MUSIC_CROSSFADE_MS / 1000;

interface Rig {
  ctx: FakeContext;
  bus: FakeGain;
  timer: FakeTimer;
  notes: { note: ScheduledNote; theme: MusicThemeId; night: boolean }[];
  player: ReturnType<typeof createMusicPlayer>;
}

function rig(opts: Partial<MusicPlayerOptions> = {}): Rig {
  const ctx = new FakeContext();
  const bus = ctx.createGain();
  bus.connect(ctx.destination);
  const timer = new FakeTimer();
  const notes: Rig['notes'] = [];
  const host: MusicHost = { ctx: ctx.asAudio(), output: bus as unknown as AudioNode };
  const player = createMusicPlayer(host, {
    seed: 7,
    timer: { set: timer.set, clear: timer.clear },
    onNote: (note, theme, night) => notes.push({ note, theme, night }),
    ...opts,
  });
  return { ctx, bus, timer, notes, player };
}

/** Deck gains: the gains ever connected straight to the music bus, in creation order. */
function decks(r: Rig): FakeGain[] {
  return r.ctx.of(FakeGain).filter((g) => g.history.includes(r.bus));
}

/** Run the clock from `from` to `to` firing the timer every `step` seconds; the clock ends exactly at `to`. */
function run(r: Rig, from: number, to: number, step = MUSIC_TIMER_MS / 1000, check?: (now: number) => void): void {
  for (let i = 0; ; i++) {
    const t = Math.min(to, from + i * step);
    r.ctx.advance(t);
    r.timer.fire();
    check?.(t);
    if (t >= to) break;
  }
}

describe('deckParams (night variant)', () => {
  it('day: the table tempo and the theme lead filter; night: tempo × 0.85, lead low-pass 1.5 kHz, 2 s reverb', () => {
    expect(MUSIC_NIGHT_TEMPO).toBe(0.85);
    expect(MUSIC_NIGHT_LOWPASS_HZ).toBe(1_500);
    expect(MUSIC_NIGHT_REVERB_S).toBe(2);
    expect(deckParams('classic_fair', false)).toEqual({ tempo: 120, tempoFactor: 1, leadLowpassHz: null, reverbSeconds: null });
    expect(deckParams('classic_fair', true)).toEqual({ tempo: 102, tempoFactor: 0.85, leadLowpassHz: 1_500, reverbSeconds: 2 });
    expect(deckParams('volcano_ridge', false).leadLowpassHz).toBe(2_500);
    expect(deckParams('volcano_ridge', true).leadLowpassHz).toBe(1_500);
    for (const t of MUSIC_THEMES) expect(deckParams(t, true).tempo).toBeCloseTo(deckParams(t, false).tempo * 0.85);
  });
});

describe('createMusicPlayer: graph and scheduling', () => {
  it('is silent until a theme is set; the timer runs at 25 ms', () => {
    const r = rig();
    r.player.update(0);
    expect(r.ctx.of(FakeSource)).toHaveLength(0);
    expect(r.timer.sets).toBe(0);
    r.player.setTheme('title', false);
    expect(r.timer.ms).toBe(MUSIC_TIMER_MS);
    expect(r.timer.sets).toBe(1);
    expect(decks(r)).toHaveLength(1);
  });

  it('every voice reaches the music bus through its deck', () => {
    const r = rig();
    r.player.setTheme('title', false);
    run(r, 0, 3);
    const sources = r.ctx.of(FakeSource).filter((s) => !s.ended);
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) expect(reaches(s, r.bus)).toBe(true);
    const deck = decks(r)[0]!;
    for (const s of sources) expect(reaches(s, deck)).toBe(true);
  });

  it('schedules notes 100 ms ahead on the 25 ms timer, none dropped or doubled across ticks', () => {
    const r = rig();
    r.ctx.advance(1);
    r.player.setTheme('starport', false);
    const want = createSequencer({ theme: 'starport', seed: themeSeed(7, 'starport'), startTime: 1 + MUSIC_START_DELAY_S });
    const expected: ScheduledNote[] = [];
    run(r, 1, 21, MUSIC_TIMER_MS / 1000, (now) => {
      expected.push(...want.pull(now + LOOK));
      // Everything due within the lookahead is scheduled; nothing beyond it.
      expect(r.notes.length).toBe(expected.length);
      for (const n of r.notes) expect(n.note.time).toBeLessThan(now + LOOK + 1e-9);
    });
    expect(r.notes.map((n) => n.note)).toEqual(expected);
    expect(expected.length).toBeGreaterThan(300);
    // Sources start at their note time, inside the window of the tick that scheduled them.
    for (const s of r.ctx.of(FakeSource)) expect(s.startTime).toBeGreaterThanOrEqual(1);
  });

  it('a jittery timer (10–70 ms) still drops nothing', () => {
    const r = rig();
    r.player.setTheme('jungle_lagoon', false);
    const want = createSequencer({ theme: 'jungle_lagoon', seed: themeSeed(7, 'jungle_lagoon'), startTime: MUSIC_START_DELAY_S });
    const gaps = [0.01, 0.07, 0.025, 0.04, 0.06, 0.015];
    let t = 0;
    for (let i = 0; t < 15; i++) {
      t += gaps[i % gaps.length]!;
      r.ctx.advance(t);
      r.timer.fire();
      for (const n of r.notes) expect(n.note.time).toBeGreaterThanOrEqual(0);
    }
    expect(r.notes.map((n) => n.note)).toEqual(want.pull(t + LOOK));
  });

  it('update(nowMs) schedules on its own every 25 ms (frames without the timer)', () => {
    const r = rig({ timer: null });
    r.player.setTheme('title', false);
    const first = r.notes.length;
    // 16 ms frames: the 25 ms gate schedules on every other frame (0, 32, 64 … 2016 ms).
    for (let ms = 0; ms <= 2_016; ms += 16) {
      r.ctx.advance(ms / 1000);
      r.player.update(ms);
    }
    expect(r.notes.length).toBeGreaterThan(first);
    const want = createSequencer({ theme: 'title', seed: themeSeed(7, 'title'), startTime: MUSIC_START_DELAY_S });
    expect(r.notes.map((n) => n.note)).toEqual(want.pull(2_016 / 1000 + LOOK));
  });

  it('after a stall the timeline resyncs instead of playing a burst of late notes', () => {
    const r = rig();
    r.player.setTheme('volcano_ridge', false);
    run(r, 0, 1);
    const before = r.notes.length;
    r.ctx.advance(30);
    r.timer.fire();
    const late = r.notes.slice(before);
    expect(late.length).toBeLessThan(12);
    for (const n of late) expect(n.note.time).toBeGreaterThanOrEqual(30);
    run(r, 30.025, 32);
    expect(r.notes.slice(before).every((n) => n.note.time >= 30)).toBe(true);
  });

  it('every theme plays day and night with finite, positive frequencies and stopped sources that clean up', () => {
    for (const theme of MUSIC_THEMES)
      for (const night of [false, true]) {
        const r = rig();
        r.player.setTheme(theme, night);
        run(r, 0, 12, 0.05);
        r.player.stop();
        expect(r.notes.length, theme).toBeGreaterThan(20);
        expect(new Set(r.notes.map((n) => n.note.voice)).size).toBeGreaterThanOrEqual(5);
        for (const o of r.ctx.of(FakeOscillator)) {
          const set = o.frequency.events.flatMap((e) => ('value' in e ? [e.value] : []));
          for (const x of set.length > 0 ? set : [o.frequency.value]) expect(x).toBeGreaterThan(0);
        }
        for (const s of r.ctx.of(FakeSource)) {
          expect(s.startTime, theme).not.toBeNull();
          expect(s.stopTime, theme).not.toBeNull();
          expect(s.stopTime!).toBeGreaterThan(s.startTime!);
        }
        for (const s of r.ctx.of(FakeBufferSource)) expect(s.buffer).not.toBeNull();
        r.ctx.advance(100);
        for (const s of r.ctx.of(FakeSource)) expect(s.disconnected, `${theme} ${s.kind}`).toBe(true);
      }
  });
});

describe('createMusicPlayer: themes, crossfade, night', () => {
  it('a theme change crossfades over 4 s: the old deck ramps 1 → 0, the new one 0 → 1', () => {
    const r = rig();
    r.player.setTheme('title', false);
    run(r, 0, 5);
    const [a] = decks(r);
    expect(a!.gain.at(0)).toBeCloseTo(0);
    expect(a!.gain.at(FADE)).toBeCloseTo(1);
    r.player.setTheme('starport', false);
    const [, b] = decks(r);
    expect(b).toBeDefined();
    const t0 = 5;
    for (const k of [0, 0.25, 0.5, 0.75, 1]) {
      expect(a!.gain.at(t0 + k * FADE), `old at ${k}`).toBeCloseTo(1 - k);
      expect(b!.gain.at(t0 + k * FADE), `new at ${k}`).toBeCloseTo(k);
    }
    // Both play during the fade; the old deck stops scheduling at its end and is disconnected.
    run(r, 5.025, 12);
    const titleNotes = r.notes.filter((n) => n.theme === 'title');
    expect(titleNotes.some((n) => n.note.time > 6)).toBe(true);
    expect(titleNotes.every((n) => n.note.time < t0 + FADE)).toBe(true);
    expect(r.notes.some((n) => n.theme === 'starport')).toBe(true);
    expect(a!.outputs).toHaveLength(0);
    expect(b!.outputs).toContain(r.bus);
  });

  it('the same theme again changes nothing; null fades out and the timer stops', () => {
    const r = rig();
    r.player.setTheme('frost_peaks', false);
    run(r, 0, 2);
    r.player.setTheme('frost_peaks', false);
    expect(decks(r)).toHaveLength(1);
    r.player.setTheme(null, false);
    const [d] = decks(r);
    expect(d!.gain.at(2 + FADE)).toBeCloseTo(0);
    run(r, 2.025, 8);
    expect(r.notes.every((n) => n.note.time < 2 + FADE)).toBe(true);
    expect(d!.outputs).toHaveLength(0);
    expect(r.timer.fn).toBeNull();
    expect(r.timer.clears).toBe(1);
  });

  it('coming back to a theme that is still fading out brings that deck back up', () => {
    const r = rig();
    r.player.setTheme('spooky_hollow', false);
    run(r, 0, 6);
    r.player.setTheme('starport', false);
    run(r, 6.025, 7);
    r.player.setTheme('spooky_hollow', false);
    const ds = decks(r);
    expect(ds).toHaveLength(2);
    expect(ds[0]!.gain.at(7)).toBeCloseTo(0.75);
    expect(ds[0]!.gain.at(7 + FADE)).toBeCloseTo(1);
    expect(ds[1]!.gain.at(7 + FADE)).toBeCloseTo(0);
    run(r, 7.025, 14);
    expect(r.notes.filter((n) => n.theme === 'spooky_hollow').some((n) => n.note.time > 11)).toBe(true);
  });

  it('fast view changes keep at most 3 decks sounding', () => {
    const r = rig();
    const themes: MusicThemeId[] = ['title', 'classic_fair', 'frost_peaks', 'volcano_ridge', 'spooky_hollow', 'starport'];
    themes.forEach((t, i) => {
      r.ctx.advance(i * 0.3);
      r.player.setTheme(t, false);
      r.timer.fire();
    });
    expect(decks(r).filter((g) => g.outputs.includes(r.bus))).toHaveLength(3);
  });

  it('night: a new deck with the slower tempo, a 1.5 kHz lead low-pass, and a 2 s decaying-noise reverb', () => {
    const r = rig();
    r.player.setTheme('classic_fair', false);
    run(r, 0, 3);
    expect(r.ctx.of(FakeConvolver)).toHaveLength(0);
    r.player.setTheme('classic_fair', true);
    expect(decks(r)).toHaveLength(2);
    const [conv] = r.ctx.of(FakeConvolver);
    expect(conv).toBeDefined();
    const buf = conv!.buffer!;
    expect(buf.duration).toBeCloseTo(2);
    expect(buf.numberOfChannels).toBe(2);
    const rms = (from: number, to: number): number => {
      const d = buf.getChannelData(0).subarray(from, to);
      return Math.sqrt(d.reduce((a, x) => a + x * x, 0) / d.length);
    };
    expect(rms(0, 4_800)).toBeGreaterThan(0.1);
    expect(rms(0, 4_800)).toBeGreaterThan(rms(buf.length - 4_800, buf.length) * 10);
    expect(reaches(conv!, decks(r)[1]!)).toBe(true);
    const lp = r.ctx.of(FakeBiquad).filter((f) => f.type === 'lowpass' && f.frequency.value === MUSIC_NIGHT_LOWPASS_HZ);
    expect(lp.length).toBeGreaterThanOrEqual(1);
    run(r, 3.025, 12);
    const night = r.notes.filter((n) => n.night);
    expect(night.length).toBeGreaterThan(10);
    const seed = themeSeed(7, 'classic_fair');
    const want = createSequencer({ theme: 'classic_fair', seed, startTime: 3 + MUSIC_START_DELAY_S, tempoFactor: 0.85 });
    expect(night.map((n) => n.note)).toEqual(want.pull(12 + LOOK));
    expect(want.beatSeconds).toBeCloseTo(60 / 102);
  });

  it('the day Volcano Ridge lead runs through a 2.5 kHz low-pass; Starport has a lead delay; Spooky Hollow a tremolo', () => {
    const r = rig();
    r.player.setTheme('volcano_ridge', false);
    expect(r.ctx.of(FakeBiquad).some((f) => f.type === 'lowpass' && f.frequency.value === 2_500)).toBe(true);
    const s = rig();
    s.player.setTheme('starport', false);
    expect(s.ctx.nodes.some((n) => n.kind === 'delay')).toBe(true);
    const k = rig();
    k.player.setTheme('spooky_hollow', false);
    const lfo = k.ctx.of(FakeOscillator).find((o) => o.frequency.value < 20);
    expect(lfo).toBeDefined();
    expect(lfo!.startTime).not.toBeNull();
    k.player.stop();
    expect(lfo!.stopTime).not.toBeNull();
  });

  it('stop() silences at once: decks disconnected, timer cleared, update does nothing', () => {
    const r = rig();
    r.player.setTheme('title', false);
    run(r, 0, 1);
    r.player.stop();
    expect(decks(r).every((g) => g.outputs.length === 0)).toBe(true);
    expect(r.timer.fn).toBeNull();
    const n = r.notes.length;
    r.ctx.advance(2);
    r.player.update(2_000);
    expect(r.notes.length).toBe(n);
    r.player.setTheme('starport', false);
    expect(decks(r).filter((g) => g.outputs.includes(r.bus))).toHaveLength(1);
  });

  it('is deterministic: the same seed schedules the same notes', () => {
    const a = rig();
    const b = rig();
    for (const x of [a, b]) {
      x.player.setTheme('jungle_lagoon', true);
      run(x, 0, 5);
    }
    expect(a.notes).toEqual(b.notes);
    expect(themeSeed(7, 'title')).not.toBe(themeSeed(7, 'starport'));
    expect(themeSeed(7, 'title')).not.toBe(themeSeed(8, 'title'));
  });
});
