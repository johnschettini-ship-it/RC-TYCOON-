/** The audio client on a real `Game` with a fake `AudioContext`: settings, events, commands, shows, music, state hash. W4-A. */
import { describe, expect, it, vi } from 'vitest';
import { connectAudio, volumesFromSettings } from '../../../src/audio/client';
import { createAudioEngine, type WebAudioEngine } from '../../../src/audio/engine';
import type { MusicPlayer, MusicThemeId } from '../../../src/audio/types';
import { MUSIC_THEME_CHECK_MS } from '../../../src/data/tuning/audio';
import { Game } from '../../../src/game';
import type { ShowCue } from '../../../src/render/shows/timeline';
import { defaultShowSchedule } from '../../../src/sim/shows/types';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, placeFootpath, stateHash } from '../../helpers/world';
import { buildCoasterPark } from '../../integration/scenario';
import { asAudioContext, FakeAudioContext } from './fakeAudio';

interface Rig {
  game: Game;
  fake: FakeAudioContext;
  engine: WebAudioEngine;
  clock: { ms: number };
  title: { open: boolean };
  themes: { theme: MusicThemeId | null; night: boolean }[];
  updates: number[];
  frame(ms?: number): void;
}

function rig(world: World = makeTestWorld(), opts: { unlock?: boolean; timeline?: ShowCue[] } = {}): Rig {
  const game = new Game(world);
  const map = world.state.map;
  game.camera.centerX = 0;
  game.camera.centerY = (map.width / 2) * 32;
  const fake = new FakeAudioContext();
  const engine = createAudioEngine({ createContext: () => asAudioContext(fake), seed: 3 });
  const clock = { ms: 1_000 };
  const title = { open: false };
  const themes: { theme: MusicThemeId | null; night: boolean }[] = [];
  const updates: number[] = [];
  const player: MusicPlayer = {
    setTheme: (theme, night) => themes.push({ theme, night }),
    update: (ms) => updates.push(ms),
    stop: () => undefined,
  };
  connectAudio(game, {
    engine,
    viewport: () => ({ width: 1280, height: 720 }),
    titleOpen: () => title.open,
    now: () => clock.ms,
    createPlayer: () => player,
    chooseTheme: () => 'frost_peaks',
    timeline: opts.timeline ? () => opts.timeline as ShowCue[] : undefined,
  });
  if (opts.unlock !== false) engine.unlock();
  return {
    game,
    fake,
    engine,
    clock,
    title,
    themes,
    updates,
    frame(ms = clock.ms + 50) {
      clock.ms = ms;
      fake.currentTime = ms / 1000;
      game.frame(ms);
    },
  };
}

/** Centre the camera on tile (x, y) as the e2e helper does. */
function centre(game: Game, x: number, y: number): void {
  const map = game.world.state.map;
  const h = map.heights[y * map.width + x] ?? 0;
  game.camera.centerX = (x - y) * 32;
  game.camera.centerY = (x + y + 1) * 16 - h * 8;
}

describe('volumes from the settings', () => {
  it('reads the volumes at mount and on every audio setting change', () => {
    const r = rig();
    expect(r.engine.debug().volumes).toEqual(volumesFromSettings(r.game.settings.values));
    expect(r.engine.debug().volumes).toEqual({ master: 80, music: 50, sfx: 80, ambience: 60, ui: 70, muted: false });
    r.game.settings.set('musicVolume', 20);
    expect(r.engine.debug().volumes.music).toBe(20);
    r.game.settings.set('muteAll', true);
    expect(r.engine.debug().volumes.muted).toBe(true);
  });
});

describe('events and commands', () => {
  it('a sale near the camera plays `cash_in` in the frame its event is drained', () => {
    const r = rig();
    centre(r.game, 30, 30);
    const tile = 30 * r.game.world.state.map.width + 31;
    r.game.world.events.push({ type: 'sound', cue: 'sale', tile, entityId: 1, value: 100 });
    r.frame();
    expect(r.engine.debug().played.map((p) => p.id)).toEqual(['cash_in']);
  });

  it('a built path plays `build_path`, a failed command `ui_error`', () => {
    const r = rig();
    r.frame();
    expect(r.game.dispatch({ type: 'buildPath', x: 20, y: 20, kind: 'footpath' }).ok).toBe(true);
    r.frame();
    expect(r.game.dispatch({ type: 'placeRide', defId: 'no_such_ride', x: 20, y: 20, rotation: 0 }).ok).toBe(false);
    expect(r.engine.debug().played.map((p) => p.id)).toEqual(['build_path', 'ui_error']);
  });

  it('nothing plays before the first gesture', () => {
    const r = rig(makeTestWorld(), { unlock: false });
    r.game.dispatch({ type: 'buildPath', x: 20, y: 20, kind: 'footpath' });
    r.frame();
    expect(r.engine.state()).toBe('none');
    expect(r.engine.debug().played).toEqual([]);
    expect(r.fake.nodes).toHaveLength(1);
  });
});

describe('shows', () => {
  it('a show that starts plays its timeline cues at the site', () => {
    const r = rig(makeTestWorld(), { timeline: [{ at: 0, kind: 'launch' }] });
    centre(r.game, 20, 20);
    const s = r.game.world.state;
    s.shows.push({ id: 900, defId: 'fireworks_launcher', x: 20, y: 20, rotation: 0, schedule: defaultShowSchedule(), status: 'running', nextShowTick: -1, startTick: s.tick, lastWatchers: 0, totals: { shows: 0, cost: 0, watchers: 0 }, totalBuildCost: 0, builtTick: 0 });
    r.game.world.events.push({ type: 'show', siteId: 900, phase: 'started', watchers: 0 });
    r.frame();
    expect(r.engine.debug().played.map((p) => p.id)).toEqual(['fw_launch']);
  });
});

describe('music (W4-B player)', () => {
  it('starts after the unlock, plays Title on the title screen, then the theme in view; updates every frame', () => {
    const r = rig(makeTestWorld(), { unlock: false });
    r.title.open = true;
    r.frame();
    expect(r.themes).toEqual([]);
    r.engine.unlock();
    r.frame();
    expect(r.themes).toEqual([{ theme: 'title', night: false }]);
    r.title.open = false;
    r.frame();
    expect(r.themes).toHaveLength(1);
    r.frame(r.clock.ms + MUSIC_THEME_CHECK_MS);
    expect(r.themes.at(-1)).toEqual({ theme: 'frost_peaks', night: false });
    expect(r.updates.length).toBe(3);
  });

  it('the night variant follows After Dark at night', () => {
    const w = makeTestWorld();
    w.state.park.afterDark = true;
    // 22:00 on the first day: tick 0 is 00:00 (master R1), 50 ticks per hour.
    w.state.tick = 22 * 50;
    const r = rig(w);
    r.frame();
    expect(r.themes.at(-1)).toEqual({ theme: 'frost_peaks', night: true });
  });
});

describe('audio never changes the simulation', () => {
  it('a coaster park run with audio gives the same state hash as without', () => {
    const a = buildCoasterPark(77).world;
    const b = buildCoasterPark(77).world;
    const withAudio = rig(a);
    const plain = new Game(b);
    for (const g of [withAudio.game, plain]) {
      g.setSpeed(4);
      g.camera.centerX = (8 - 4) * 32;
      g.camera.centerY = (8 + 4 + 1) * 16 - 64;
    }
    let t = 1_000;
    for (let f = 0; f < 600; f++) {
      t += 50;
      if (f % 100 === 50) {
        for (const g of [withAudio.game, plain]) {
          g.dispatch({ type: 'buildPath', x: 40 + f / 50, y: 40, kind: 'footpath' });
          g.dispatch({ type: 'placeRide', defId: 'no_such_ride', x: 1, y: 1, rotation: 0 });
        }
      }
      withAudio.frame(t);
      plain.frame(t);
    }
    expect(stateHash(a)).toBe(stateHash(b));
    const ids = new Set(withAudio.engine.debug().played.map((p) => p.id));
    expect(ids.has('build_path')).toBe(true);
    expect(ids.has('ui_error')).toBe(true);
    // The coaster was heard: station bell, chain lift, rumble, and tickets.
    for (const id of ['ride_bell', 'coaster_chain', 'coaster_rumble', 'cash_in'] as const) expect(ids.has(id)).toBe(true);
  });

  it('loops and the listener read the state without writing it', () => {
    const w = makeTestWorld();
    for (let y = 20; y < 40; y++) placeFootpath(w, 30, y);
    const r = rig(w);
    centre(r.game, 30, 30);
    const before = stateHash(w);
    for (let i = 0; i < 20; i++) r.frame();
    expect(stateHash(w)).toBe(before);
  });
});

describe('audio failures never stop the game', () => {
  it('an engine that throws everywhere: commands, events, and frames still run', () => {
    const boom = (): never => {
      throw new Error('audio broke');
    };
    const engine = { unlock: boom, state: () => 'running', setVolumes: boom, play: boom, update: boom, setHidden: boom, musicHost: boom, graph: boom, debug: boom } as unknown as WebAudioEngine;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const game = new Game(makeTestWorld());
    connectAudio(game, { engine, viewport: () => ({ width: 800, height: 600 }), now: () => 0 });
    expect(game.dispatch({ type: 'buildPath', x: 20, y: 20, kind: 'footpath' }).ok).toBe(true);
    game.world.events.push({ type: 'guestsChanged' });
    expect(() => game.frame(16)).not.toThrow();
    expect(() => game.settings.set('sfxVolume', 10)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
