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

/** Swing (Jungle Lagoon): an off-beat eighth moves to this share of the beat (2/3 = triplet swing). */
export const MUSIC_SWING_RATIO = 2 / 3;
/** Melody range in scale degrees around the tonic: [−2, scale length + 2]. */
export const MUSIC_MELODY_LOW = -2;
export const MUSIC_MELODY_HIGH_OVER = 2;
/** Chance that a weak-beat melody note leaps 3–4 degrees instead of stepping. */
export const MUSIC_LEAP_CHANCE = 0.06;
/** Chance that the last weak note of bars 4 and 8 rests (a breath at the half phrase). */
export const MUSIC_REST_CHANCE = 0.5;
/** Chance that the bass plays its beat-3 root an octave up. */
export const MUSIC_BASS_OCTAVE_CHANCE = 0.3;

/** Player: a new theme starts this far after the call; notes later than this resync the timeline (a stalled tab). */
export const MUSIC_START_DELAY_S = 0.05;
export const MUSIC_RESYNC_LATE_S = 0.2;
/** At most this many themes sound at once during fast view changes (the oldest fading one is dropped). */
export const MUSIC_MAX_DECKS = 3;

/** Peak gain per voice at velocity 1 (before the music bus volume). */
export const MUSIC_VOICE_GAIN = { lead: 0.2, pad: 0.06, bass: 0.24, kick: 0.5, snare: 0.2, hat: 0.07 } as const;
/** Night reverb send level; Starport lead delay (in beats), feedback and send; Spooky Hollow pad tremolo. */
export const MUSIC_REVERB_WET = 0.35;
export const MUSIC_DELAY_BEATS = 0.75;
export const MUSIC_DELAY_FEEDBACK = 0.35;
export const MUSIC_DELAY_WET = 0.3;
export const MUSIC_TREMOLO_HZ = 5;
export const MUSIC_TREMOLO_DEPTH = 0.45;
/** Bass low-pass (Hz) so saw and square basses stay round. */
export const MUSIC_BASS_LOWPASS_HZ = 900;
