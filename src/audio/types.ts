/**
 * Audio contracts (Phase 6 §4.1–4.3). Owner: integrator (contract). Engine and SFX: W4-A; music: W4-B.
 * The audio module reads `GameState` and `SimEvent`s and never writes state. All sounds are synthesized at runtime;
 * the game ships no audio files. Audio randomness uses its own seeded RNG, never the sim RNG.
 */
import type { Camera } from '../render/types';
import type { World } from '../sim/types';

export type Bus = 'ui' | 'sfx' | 'ambience' | 'music';
export const BUSES: readonly Bus[] = ['ui', 'sfx', 'ambience', 'music'];

/** Phase 6 §4.2 table ids. */
export type SfxId =
  | 'ui_click'
  | 'ui_open'
  | 'ui_error'
  | 'build_place'
  | 'build_path'
  | 'demolish'
  | 'cash_in'
  | 'ride_bell'
  | 'coaster_chain'
  | 'coaster_rumble'
  | 'coaster_cheer'
  | 'splash'
  | 'breakdown'
  | 'award'
  | 'rain'
  | 'thunder'
  | 'crowd'
  | 'fw_launch'
  | 'fw_burst'
  | 'light_swoosh';

export interface SfxInfo {
  id: SfxId;
  bus: Bus;
  /** Voice-stealing priority (higher wins); null for loops that never compete for voices (rain, crowd). */
  priority: number | null;
  /** Length in ms; null for loops. */
  lengthMs: number | null;
  loop: boolean;
}

/** Phase 6 §4.2: bus, priority, length, loop (the recipes live with W4-A in `src/audio/sfx/`). */
export const SFX: readonly SfxInfo[] = Object.freeze<SfxInfo[]>([
  { id: 'ui_click', bus: 'ui', priority: 1, lengthMs: 45, loop: false },
  { id: 'ui_open', bus: 'ui', priority: 1, lengthMs: 60, loop: false },
  { id: 'ui_error', bus: 'ui', priority: 2, lengthMs: 240, loop: false },
  { id: 'build_place', bus: 'sfx', priority: 3, lengthMs: 150, loop: false },
  { id: 'build_path', bus: 'sfx', priority: 1, lengthMs: 30, loop: false },
  { id: 'demolish', bus: 'sfx', priority: 3, lengthMs: 400, loop: false },
  { id: 'cash_in', bus: 'sfx', priority: 1, lengthMs: 100, loop: false },
  { id: 'ride_bell', bus: 'sfx', priority: 2, lengthMs: 1_000, loop: false },
  { id: 'coaster_chain', bus: 'sfx', priority: 2, lengthMs: null, loop: true },
  { id: 'coaster_rumble', bus: 'sfx', priority: 2, lengthMs: null, loop: true },
  { id: 'coaster_cheer', bus: 'sfx', priority: 3, lengthMs: 800, loop: false },
  { id: 'splash', bus: 'sfx', priority: 3, lengthMs: 600, loop: false },
  { id: 'breakdown', bus: 'sfx', priority: 4, lengthMs: 500, loop: false },
  { id: 'award', bus: 'ui', priority: 4, lengthMs: 600, loop: false },
  { id: 'rain', bus: 'ambience', priority: null, lengthMs: null, loop: true },
  { id: 'thunder', bus: 'ambience', priority: 3, lengthMs: 2_500, loop: false },
  { id: 'crowd', bus: 'ambience', priority: null, lengthMs: null, loop: true },
  { id: 'fw_launch', bus: 'sfx', priority: 2, lengthMs: 800, loop: false },
  { id: 'fw_burst', bus: 'sfx', priority: 2, lengthMs: 1_300, loop: false },
  { id: 'light_swoosh', bus: 'sfx', priority: 1, lengthMs: 700, loop: false },
]);

export function sfxInfo(id: SfxId): SfxInfo {
  return SFX.find((s) => s.id === id) as SfxInfo;
}

/** Volumes 0–100 per bus plus master, and mute (from the settings store). */
export interface AudioVolumes {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
  ui: number;
  muted: boolean;
}

/** Where a world sound plays: the map tile it comes from (falloff and pan from the camera, Phase 6 §4.1). */
export interface SoundPlace {
  tile: number;
}

/** What the client asks the engine to play this frame. */
export interface SoundRequest {
  id: SfxId;
  /** null = a UI sound (no falloff, centred). */
  place: SoundPlace | null;
  /** Recipe parameter (drop height, award sign, intensity), recipe-specific. */
  param?: number;
}

/** Listener facts for falloff and pan: the camera and the viewport width in CSS px. */
export interface Listener {
  camera: Camera;
  viewportWidth: number;
  /** CSS pixels. Optional: when absent, readers assume 9/16 of the width (W4-A contract request). */
  viewportHeight?: number;
  world: World;
}

/** The engine (W4-A). Silent until `unlock` runs on the first `pointerdown` or `keydown`. */
export interface AudioEngine {
  /** Create or resume the `AudioContext` (user gesture). Safe to call often. */
  unlock(): void;
  /** `AudioContext.state`, or `none` before the first unlock (Playwright reads it). */
  state(): 'none' | 'suspended' | 'running' | 'closed';
  setVolumes(v: AudioVolumes): void;
  /** Play one-shot sounds (voices, cooldown, falloff, pan applied). */
  play(requests: readonly SoundRequest[], listener: Listener): void;
  /** Per frame: loops (chain, rumble, rain, crowd) from the state, music scheduling time. */
  update(listener: Listener, nowMs: number): void;
  /** Hidden tab: ramp to 0 in 100 ms and suspend; visible: resume and ramp back. */
  setHidden(hidden: boolean): void;
  /** The music bus input and the audio clock, for the music player (W4-B); null before unlock. */
  musicHost(): MusicHost | null;
}

/** What the music player (W4-B) gets from the engine. */
export interface MusicHost {
  ctx: BaseAudioContext;
  /** Connect music voices here (the music bus). */
  output: AudioNode;
}

/** Phase 6 §4.3 music themes: the title theme and the 6 scenery themes. */
export type MusicThemeId = 'title' | 'classic_fair' | 'frost_peaks' | 'volcano_ridge' | 'spooky_hollow' | 'jungle_lagoon' | 'starport';
export const MUSIC_THEMES: readonly MusicThemeId[] = ['title', 'classic_fair', 'frost_peaks', 'volcano_ridge', 'spooky_hollow', 'jungle_lagoon', 'starport'];

export type MusicVoice = 'lead' | 'pad' | 'bass' | 'kick' | 'snare' | 'hat';

/** One generated note (Phase 6 §4.3). Times in beats from the phrase start; pitch as a MIDI note number. */
export interface NoteEvent {
  voice: MusicVoice;
  beat: number;
  lengthBeats: number;
  /** MIDI note (60 = middle C); drums use 0. */
  midi: number;
  /** 0–1. */
  velocity: number;
}

/** The music player (W4-B). */
export interface MusicPlayer {
  /** Title screen, in game (theme chosen from the scenery in view), or silent. */
  setTheme(theme: MusicThemeId | null, night: boolean): void;
  /** Called every frame; schedules notes 100 ms ahead on a 25 ms timer. */
  update(nowMs: number): void;
  stop(): void;
}
