/** Procedural music tuning (Phase 6 §4.3, §8). Owner: W4-B. Starting values for play-testing. */

/** Scheduler: notes 100 ms ahead on a 25 ms timer; a theme change crossfades over 4 s. */
export const MUSIC_LOOKAHEAD_MS = 100;
export const MUSIC_TIMER_MS = 25;
export const MUSIC_CROSSFADE_MS = 4_000;

/** Night variant (After Dark at night): tempo × 0.85, lead low-pass 1.5 kHz, generated reverb (decaying noise) 2 s. */
export const MUSIC_NIGHT_TEMPO = 0.85;
export const MUSIC_NIGHT_LOWPASS_HZ = 1_500;
export const MUSIC_NIGHT_REVERB_S = 2;

/** Form: 8-bar phrases in the order A A B A. */
export const MUSIC_PHRASE_BARS = 8;
export const MUSIC_FORM: readonly ('A' | 'B')[] = ['A', 'A', 'B', 'A'];
/** Melody steps of at most 2 scale degrees (mostly). */
export const MUSIC_MAX_STEP_DEGREES = 2;
