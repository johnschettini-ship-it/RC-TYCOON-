/**
 * Audio tuning (Phase 6 §4.1–4.3, §8). Owner: W4-A (engine and SFX), W4-B (music constants). Starting values for
 * play-testing. Volume defaults are also the settings defaults (`src/settings/schema.ts`).
 */

/** Volume defaults (0–100): master / music / sfx / ambience / ui. */
export const VOLUME_DEFAULTS = { master: 80, music: 50, sfx: 80, ambience: 60, ui: 70 } as const;

/** At most 24 SFX voices; the same SFX id plays at most once per 60 ms. */
export const MAX_SFX_VOICES = 24;
export const SFX_COOLDOWN_MS = 60;

/** World sounds: radius R = 24 / zoom tiles, gain = (max(0, 1 − d / R))²; pan = clamp(dx / (width / 2)) × 0.6. */
export const FALLOFF_TILES_AT_ZOOM_1 = 24;
export const PAN_WIDTH = 0.6;

/** Hidden tab: master gain ramps to 0 in 100 ms, then the context suspends. */
export const HIDE_RAMP_MS = 100;

/** Music scheduler: notes 100 ms ahead on a 25 ms timer; a theme change crossfades over 4 s. */
export const MUSIC_LOOKAHEAD_MS = 100;
export const MUSIC_TIMER_MS = 25;
export const MUSIC_CROSSFADE_MS = 4_000;
/** Night variant (After Dark at night): tempo × 0.85, lead low-pass 1.5 kHz, generated reverb 2 s. */
export const MUSIC_NIGHT_TEMPO = 0.85;
export const MUSIC_NIGHT_LOWPASS_HZ = 1_500;
export const MUSIC_NIGHT_REVERB_S = 2;

/** `build_path` plays at most 8 times per second. */
export const BUILD_PATH_MAX_PER_S = 8;
/** `coaster_rumble` loops: at most 4 at once. */
export const MAX_RUMBLE_LOOPS = 4;
/** `coaster_cheer` needs a drop of more than 10 m with riders (sim cue `trainDrop`). */
export const CHEER_MIN_DROP_M = 10;
