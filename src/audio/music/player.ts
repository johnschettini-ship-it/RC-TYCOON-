/**
 * The music player (Phase 6 §4.3, §8). Owner: W4-B. W4-A's audio client creates it with the engine's music host and
 * calls `setTheme` (title screen, theme in view, After Dark night) and `update` every frame.
 *
 * - Scheduler: a 25 ms timer (plus `update`, gated to 25 ms) schedules every note due in the next 100 ms on the audio
 *   clock (`host.ctx.currentTime`). A stalled tab resyncs the timeline instead of playing a burst of late notes.
 * - Themes: each (theme, night) pair plays on its own deck. A change crossfades over 4 s: the old deck ramps to 0
 *   and is dropped at the end, the new one ramps up from 0. Returning to a deck that is still fading brings it back.
 * - Night variant: tempo × 0.85, lead low-pass 1.5 kHz, generated 2 s reverb.
 * Randomness (noise, reverb, tunes) comes from the music's own seeded RNG. The player never touches game state.
 */
import {
  MUSIC_CROSSFADE_MS,
  MUSIC_LOOKAHEAD_MS,
  MUSIC_MAX_DECKS,
  MUSIC_NIGHT_LOWPASS_HZ,
  MUSIC_NIGHT_REVERB_S,
  MUSIC_NIGHT_TEMPO,
  MUSIC_RESYNC_LATE_S,
  MUSIC_START_DELAY_S,
  MUSIC_TIMER_MS,
} from '../../data/tuning/music';
import { MUSIC_THEMES, type MusicHost, type MusicPlayer, type MusicThemeId } from '../types';
import { mixSeed, musicRng } from './rng';
import { createSequencer, type ScheduledNote, type Sequencer } from './sequencer';
import { themeDef, type ThemeDef } from './themes';
import { buildDeck, makeImpulse, makeNoise, playNote, type DeckGraph, type VoiceShared } from './voices';

export interface MusicTimer {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface MusicPlayerOptions {
  /** Base seed of the tunes (default 1). Each theme derives its own. */
  seed?: number;
  /** The 25 ms timer (default `setInterval`); null = schedule from `update` only. */
  timer?: MusicTimer | null;
  /** Called for every note scheduled (tests, debugging). */
  onNote?: (note: ScheduledNote, theme: MusicThemeId, night: boolean) => void;
}

export interface DeckParams {
  /** Quarter notes per minute. */
  tempo: number;
  tempoFactor: number;
  /** Lead low-pass in Hz, or null for an open lead. */
  leadLowpassHz: number | null;
  /** Reverb length in seconds, or null for none. */
  reverbSeconds: number | null;
}

/** Day and night parameters of one theme (Phase 6 §4.3 night variant). */
export function deckParams(theme: MusicThemeId, night: boolean): DeckParams {
  const t = themeDef(theme);
  if (!night) return { tempo: t.tempo, tempoFactor: 1, leadLowpassHz: t.leadLowpassHz, reverbSeconds: null };
  return {
    tempo: t.tempo * MUSIC_NIGHT_TEMPO,
    tempoFactor: MUSIC_NIGHT_TEMPO,
    leadLowpassHz: Math.min(MUSIC_NIGHT_LOWPASS_HZ, t.leadLowpassHz ?? Infinity),
    reverbSeconds: MUSIC_NIGHT_REVERB_S,
  };
}

/** The tune seed of one theme for a player seed. */
export function themeSeed(seed: number, theme: MusicThemeId): number {
  return mixSeed(seed, 0x6d75, MUSIC_THEMES.indexOf(theme) + 1);
}

interface Fade {
  from: number;
  to: number;
  t0: number;
  t1: number;
}

interface Deck {
  key: string;
  theme: MusicThemeId;
  night: boolean;
  def: ThemeDef;
  seq: Sequencer;
  graph: DeckGraph;
  fade: Fade;
  dying: boolean;
}

const defaultTimer: MusicTimer = {
  set: (fn, ms) => setInterval(fn, ms),
  clear: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

function fadeValue(f: Fade, t: number): number {
  if (t <= f.t0) return f.from;
  if (t >= f.t1) return f.to;
  return f.from + ((f.to - f.from) * (t - f.t0)) / (f.t1 - f.t0);
}

export function createMusicPlayer(host: MusicHost, opts: MusicPlayerOptions = {}): MusicPlayer {
  const ctx = host.ctx;
  const seed = opts.seed ?? 1;
  const timer = opts.timer === undefined ? defaultTimer : opts.timer;
  const lookahead = MUSIC_LOOKAHEAD_MS / 1000;
  const crossfade = MUSIC_CROSSFADE_MS / 1000;
  const rng = musicRng(mixSeed(seed, 0x6e6f));
  let impulse: AudioBuffer | null = null;
  const shared: VoiceShared = {
    noise: makeNoise(ctx, rng),
    impulse: () => (impulse ??= makeImpulse(ctx, rng, MUSIC_NIGHT_REVERB_S)),
    rng,
  };
  const decks: Deck[] = [];
  let current: string | null = null;
  let handle: unknown = null;
  let lastUpdateMs = -Infinity;
  let stopped = false;

  function fadeTo(deck: Deck, to: number, now: number): void {
    const from = fadeValue(deck.fade, now);
    const p = deck.graph.out.gain;
    p.cancelScheduledValues(now);
    p.setValueAtTime(from, now);
    p.linearRampToValueAtTime(to, now + crossfade);
    deck.fade = { from, to, t0: now, t1: now + crossfade };
  }

  function createDeck(theme: MusicThemeId, night: boolean, key: string, now: number): Deck {
    const def = themeDef(theme);
    const params = deckParams(theme, night);
    const startTime = now + MUSIC_START_DELAY_S;
    const seq = createSequencer({ theme, seed: themeSeed(seed, theme), startTime, tempoFactor: params.tempoFactor });
    const setup = {
      theme: def,
      beatSeconds: seq.beatSeconds,
      leadLowpassHz: params.leadLowpassHz,
      reverb: params.reverbSeconds !== null,
      startTime: now,
    };
    const graph = buildDeck(ctx, host.output, setup, shared);
    const deck: Deck = { key, theme, night, def, seq, graph, fade: { from: 0, to: 0, t0: now, t1: now }, dying: false };
    fadeTo(deck, 1, now);
    return deck;
  }

  function dispose(deck: Deck): void {
    const i = decks.indexOf(deck);
    if (i >= 0) decks.splice(i, 1);
    for (const s of deck.graph.sources) s.stop(ctx.currentTime);
    for (const n of deck.graph.nodes) n.disconnect();
  }

  function startTimer(): void {
    if (handle === null && timer) handle = timer.set(schedule, MUSIC_TIMER_MS);
  }

  function stopTimer(): void {
    if (handle !== null && timer) timer.clear(handle);
    handle = null;
  }

  function schedule(): void {
    const now = ctx.currentTime;
    const until = now + lookahead;
    for (const deck of [...decks]) {
      if (deck.dying && now >= deck.fade.t1) {
        dispose(deck);
        continue;
      }
      const next = deck.seq.peek();
      if (next < now - MUSIC_RESYNC_LATE_S) deck.seq.shift(now + MUSIC_START_DELAY_S - next);
      const limit = deck.dying ? Math.min(until, deck.fade.t1) : until;
      for (const n of deck.seq.pull(limit)) {
        playNote(ctx, deck.graph, deck.def, n, shared);
        opts.onNote?.(n, deck.theme, deck.night);
      }
    }
    if (decks.length === 0 && current === null) stopTimer();
  }

  return {
    setTheme(theme, night) {
      stopped = false;
      const key = theme === null ? null : `${theme}|${night ? 'night' : 'day'}`;
      if (key === current) return;
      current = key;
      const now = ctx.currentTime;
      let found = false;
      for (const deck of decks) {
        if (deck.key === key) {
          found = true;
          if (deck.dying) {
            deck.dying = false;
            fadeTo(deck, 1, now);
          }
        } else if (!deck.dying) {
          deck.dying = true;
          fadeTo(deck, 0, now);
        }
      }
      if (theme !== null && key !== null && !found) decks.push(createDeck(theme, night, key, now));
      // Fast view changes: drop the oldest fading decks beyond the limit.
      while (decks.length > MUSIC_MAX_DECKS) {
        const oldest = decks.find((d) => d.dying);
        if (!oldest) break;
        dispose(oldest);
      }
      if (decks.length > 0) startTimer();
      schedule();
    },
    update(nowMs) {
      if (stopped || decks.length === 0) return;
      if (nowMs - lastUpdateMs < MUSIC_TIMER_MS && nowMs >= lastUpdateMs) return;
      lastUpdateMs = nowMs;
      schedule();
    },
    stop() {
      stopped = true;
      current = null;
      stopTimer();
      for (const deck of [...decks]) dispose(deck);
    },
  };
}
