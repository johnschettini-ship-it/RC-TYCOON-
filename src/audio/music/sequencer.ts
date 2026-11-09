/**
 * The music timeline (Phase 6 §4.3). Owner: W4-B. Pure: no Web Audio, so the scheduler is tested with a fake clock.
 *
 * Sections run A A B A, then the next cycle. Even cycles replay the theme's main tune (its seed); odd cycles play a
 * variation (a derived seed), so the music returns to a recognisable tune without looping one phrase forever.
 * Times are seconds on the audio clock; section k starts at `startTime + k × phrase length` (no drift).
 */
import { MUSIC_FORM } from '../../data/tuning/music';
import type { MusicThemeId, NoteEvent } from '../types';
import { generatePhrase, phraseBeats } from './generate';
import { mixSeed } from './rng';
import { themeDef } from './themes';

export interface ScheduledNote extends NoteEvent {
  /** Start, seconds on the audio clock. */
  time: number;
  /** Length in seconds. */
  duration: number;
}

export interface SequencerOptions {
  theme: MusicThemeId;
  seed: number;
  /** Audio-clock time of the first beat. */
  startTime: number;
  /** Tempo multiplier (night variant 0.85). Default 1. */
  tempoFactor?: number;
}

export interface Sequencer {
  readonly theme: MusicThemeId;
  /** Seconds per beat (a quarter note; an eighth in 6/8). */
  readonly beatSeconds: number;
  /** Every note not yet returned with `time < until`, in time order. */
  pull(until: number): ScheduledNote[];
  /** Start time of the next note not yet returned. */
  peek(): number;
  /** Move the rest of the timeline `dt` seconds later (resync after a stall). */
  shift(dt: number): void;
}

/** Seed of cycle `k` (one A A B A pass): the main tune on even cycles, a variation on odd ones. */
export function cycleSeed(seed: number, cycle: number): number {
  return cycle % 2 === 0 ? seed : mixSeed(seed, cycle);
}

export function createSequencer(opts: SequencerOptions): Sequencer {
  const t = themeDef(opts.theme);
  const beatSeconds = (60 / (t.tempo * (opts.tempoFactor ?? 1))) * t.beatUnit;
  const phraseSeconds = phraseBeats(opts.theme) * beatSeconds;
  const form = MUSIC_FORM.length;
  let start = opts.startTime;
  let section = 0;
  let notes: NoteEvent[] = load(0);
  let i = 0;

  function load(k: number): NoteEvent[] {
    return generatePhrase(opts.theme, cycleSeed(opts.seed, Math.floor(k / form)), k % form);
  }

  /** Skip to the next section that has notes (every phrase has drums, so this is one step). */
  function advance(): void {
    while (i >= notes.length) {
      section++;
      notes = load(section);
      i = 0;
    }
  }

  const timeOf = (n: NoteEvent): number => start + section * phraseSeconds + n.beat * beatSeconds;

  return {
    theme: opts.theme,
    beatSeconds,
    pull(until) {
      const out: ScheduledNote[] = [];
      for (;;) {
        advance();
        const n = notes[i] as NoteEvent;
        const time = timeOf(n);
        if (!(time < until)) break;
        out.push({ ...n, time, duration: n.lengthBeats * beatSeconds });
        i++;
      }
      return out;
    },
    peek() {
      advance();
      return timeOf(notes[i] as NoteEvent);
    },
    shift(dt) {
      start += dt;
    },
  };
}
