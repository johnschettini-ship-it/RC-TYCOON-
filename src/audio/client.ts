/**
 * The audio client without the DOM (Phase 6 §4.1–4.3). Owner: W4-A. Wires a `Game` to the engine: volumes and mute
 * from `game.settings` (and on every change), sim events and command results to one-shots, show cues, loops and the
 * music player every frame. `mountAudio` (`./index.ts`) adds the DOM parts (unlock gestures, hidden tab, UI sounds).
 * Reads the game; never changes it (no commands, no state writes).
 */
import { BUILD_PATH_MAX_PER_S, MUSIC_THEME_CHECK_MS } from '../data/tuning/audio';
import type { Game } from '../game';
import type { SettingKey, SettingsValues } from '../settings';
import { nightActive } from '../sim/lighting/api';
import type { SimEvent, World } from '../sim/types';
import { requestsForCommand, requestsForEvents } from './cues';
import type { WebAudioEngine } from './engine';
import { viewTiles, type ScreenListener, type ViewTileRect } from './loops';
import { chooseTheme as defaultChooseTheme, createMusicPlayer } from './music';
import { createShowCueTracker, type ShowCueTracker, type TimelineFn } from './shows';
import type { AudioVolumes, MusicHost, MusicPlayer, MusicThemeId, SfxId } from './types';
import { RateLimiter } from './voices';

/** Settings that change the mix. */
const AUDIO_KEYS: ReadonlySet<SettingKey> = new Set<SettingKey>(['masterVolume', 'musicVolume', 'sfxVolume', 'ambienceVolume', 'uiVolume', 'muteAll']);

export function volumesFromSettings(v: Readonly<SettingsValues>): AudioVolumes {
  return { master: v.masterVolume, music: v.musicVolume, sfx: v.sfxVolume, ambience: v.ambienceVolume, ui: v.uiVolume, muted: v.muteAll };
}

export interface AudioClientDeps {
  engine: WebAudioEngine;
  /** The canvas size in CSS px (falloff, pan, guests on screen, theme in view). */
  viewport: () => { width: number; height: number };
  /** The title screen is open: the music plays the Title theme. */
  titleOpen?: () => boolean;
  /** Frame clock in ms (default `performance.now`). */
  now?: () => number;
  /** W4-B's music player and theme choice (defaults from `./music`). */
  createPlayer?: (host: MusicHost) => MusicPlayer;
  chooseTheme?: (world: World, view: ViewTileRect) => MusicThemeId;
  /** W4-C's show timeline (default `showTimeline`). */
  timeline?: TimelineFn;
}

export interface AudioClient {
  /** The listener of the current frame (camera, viewport, world). */
  listener(): ScreenListener;
  /** A UI sound (button press, panel open). */
  uiSound(id: Extract<SfxId, 'ui_click' | 'ui_open'>): void;
  /** One frame of audio (called from `game.onFrame`). */
  frame(nowMs: number): void;
  /** The music player once the engine is unlocked, else null. */
  player(): MusicPlayer | null;
}

export function connectAudio(game: Game, deps: AudioClientDeps): AudioClient {
  const engine = deps.engine;
  const now = deps.now ?? ((): number => performance.now());
  const titleOpen = deps.titleOpen ?? ((): boolean => false);
  const makePlayer = deps.createPlayer ?? createMusicPlayer;
  const pickTheme = deps.chooseTheme ?? defaultChooseTheme;
  const pathLimiter = new RateLimiter(BUILD_PATH_MAX_PER_S, 1_000);
  let shows: ShowCueTracker = createShowCueTracker(deps.timeline);
  let showEvents: SimEvent[] = [];
  let music: MusicPlayer | null = null;
  let theme: { id: MusicThemeId; night: boolean } | null = null;
  let lastThemeCheck: number | null = null;

  const listener = (): ScreenListener => {
    const vp = deps.viewport();
    return { camera: game.camera, viewportWidth: vp.width, viewportHeight: vp.height, world: game.world };
  };

  // Audio must never stop the game: a listener that throws inside `Game.frame` would end the frame loop.
  let warned = false;
  const guard = (fn: () => void): void => {
    try {
      fn();
    } catch (e) {
      if (!warned) {
        warned = true;
        console.warn('Audio stopped working', e);
      }
    }
  };

  guard(() => engine.setVolumes(volumesFromSettings(game.settings.values)));
  game.settings.onChange((values, changed) => {
    if (changed.some((k) => AUDIO_KEYS.has(k))) guard(() => engine.setVolumes(volumesFromSettings(values)));
  });

  game.onEvents((events) => {
    for (const ev of events) if (ev.type === 'show') showEvents.push(ev);
    guard(() => engine.play(requestsForEvents(events), listener()));
  });

  game.onCommand((cmd, result) => {
    guard(() => engine.play(requestsForCommand(cmd, result, { nowMs: now(), pathLimiter }), listener()));
  });

  game.onWorldChanged(() => {
    shows = createShowCueTracker(deps.timeline);
    showEvents = [];
    lastThemeCheck = null;
  });

  function updateMusic(nowMs: number, l: ScreenListener): void {
    if (!music) {
      const host = engine.musicHost();
      if (!host) return;
      music = makePlayer(host);
    }
    if (lastThemeCheck === null || nowMs - lastThemeCheck >= MUSIC_THEME_CHECK_MS || nowMs < lastThemeCheck) {
      lastThemeCheck = nowMs;
      const onTitle = titleOpen();
      const id: MusicThemeId = onTitle ? 'title' : pickTheme(game.world, viewTiles(l));
      const night = !onTitle && nightActive(game.world);
      if (!theme || theme.id !== id || theme.night !== night) {
        theme = { id, night };
        music.setTheme(id, night);
      }
    }
    music.update(nowMs);
  }

  function frame(nowMs: number): void {
    const l = listener();
    engine.update(l, nowMs);
    const cues = shows.update(game.world, showEvents);
    showEvents = [];
    if (cues.length > 0) engine.play(cues, l);
    updateMusic(nowMs, l);
  }

  game.onFrame(() => guard(() => frame(now())));

  return {
    listener,
    uiSound: (id) => guard(() => engine.play([{ id, place: null }], listener())),
    frame,
    player: () => music,
  };
}
