/**
 * Audio engine and SFX tuning (Phase 6 §4.1–4.2, §8). Owner: W4-A. Music constants: `./music.ts` (W4-B). Starting
 * values for play-testing. Volume defaults are also the settings defaults (`src/settings/schema.ts`).
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

/** `build_path` plays at most 8 times per second. */
export const BUILD_PATH_MAX_PER_S = 8;
/** `coaster_rumble` loops: at most 4 at once. */
export const MAX_RUMBLE_LOOPS = 4;
/** `coaster_cheer` needs a drop of more than 10 m with riders (sim cue `trainDrop`). */
export const CHEER_MIN_DROP_M = 10;

// ---- W4-A additions (not in the Phase 6 §8 table; starting values) ----

/** A settings volume v (0–100) becomes the gain (v / 100)² (closer to perceived loudness than a straight line). */
export const VOLUME_EXPONENT = 2;
/** Volume and mute changes glide with this time constant (s), so a slider never clicks. */
export const VOLUME_GLIDE_S = 0.02;
/** A stolen voice fades out with this time constant (s) and stops after 3 of them. */
export const STEAL_FADE_S = 0.01;

/** Loop targets (chain, rumble, rain, crowd) are refreshed every 100 ms; their gains glide (time constant, s). */
export const LOOP_UPDATE_MS = 100;
export const LOOP_GLIDE_S = 0.15;

/** `coaster_chain`: clicks per metre of lift travel (rate = lift speed × 4 per second), each click 5 ms. */
export const CHAIN_CLICKS_PER_M = 4;
export const CHAIN_CLICK_MS = 5;
/** Chain clicks are scheduled this far ahead on the audio clock (ms). */
export const CHAIN_LOOKAHEAD_MS = 100;
/** At most this many chain lifts click at once (the loudest). */
export const MAX_CHAIN_LOOPS = 2;

/** `coaster_rumble`: silent below 2 m/s; full gain and the top cutoff at 25 m/s; low-pass 150–600 Hz. */
export const RUMBLE_MIN_SPEED_MS = 2;
export const RUMBLE_FULL_SPEED_MS = 25;
export const RUMBLE_CUTOFF_MIN_HZ = 150;
export const RUMBLE_CUTOFF_MAX_HZ = 600;

/** `rain` gain = intensity: rain 0.6, storm 1 (other weather 0). */
export const RAIN_INTENSITY = { rain: 0.6, storm: 1 } as const;
/** `thunder` in storms at random gaps of 6–20 s (audio RNG). */
export const THUNDER_GAP_MIN_MS = 6_000;
export const THUNDER_GAP_MAX_MS = 20_000;

/** `crowd` gain = ln(1 + n) / ln(1 + 400) (capped at 1), n = guests on screen; amplitude modulation 0.3–0.7 Hz. */
export const CROWD_FULL_GUESTS = 400;
export const CROWD_AM_MIN_HZ = 0.3;
export const CROWD_AM_MAX_HZ = 0.7;

/** Peak gain of the SFX recipes (except `ui_click`, which the table sets to 0.3), so a full mix stays under the compressor. */
export const SFX_PEAK = 0.5;

/** Seed of the audio RNG (noise, thunder timing, cheer voices, firework crackle). Never the sim RNG. */
export const AUDIO_SEED = 0x7c3a91;

/** The music theme follows the view: checked once a second (W4-B's player crossfades). */
export const MUSIC_THEME_CHECK_MS = 1_000;

/** Played sounds kept in the debug log (`window.__tcAudio.debug().played`, Playwright and manual checks). */
export const PLAYED_LOG_MAX = 64;
