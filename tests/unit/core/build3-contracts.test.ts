/**
 * Wave 4.0 contracts (Build 3, Phase 6): schema 3 start values, stub neutrality, sound cues, catalog rows, strings,
 * display prefs, and the client registries. Each stub's real behaviour is tested by its owner card (W4-A … W4-G).
 * Named hunks: W4-C replaced the block "W4-C stubs" (its stubs are real now); W4-D replaced the test "all Phase 6
 * content stays locked …" with "Phase 6 content unlocks by research" when it raised `BUILD_MAX_PHASE`.
 */
import { describe, expect, it } from 'vitest';
import { FLAT_RIDES, getFlatRideDef, getShowSiteDef, getStallDef, getTrackRideDef, SHOW_SITES, STALLS, TRACK_RIDES } from '../../../src/data/catalog';
import { BUILD_MAX_PHASE } from '../../../src/data/tuning/management';
import { en, text } from '../../../src/data/strings/en';
import { currentLocale, LOCALES, pluralCategory, setLocale, t } from '../../../src/data/strings/index';
import { setActiveStrings, setMissingStringHandler } from '../../../src/data/strings/resolve';
import { validateState } from '../../../src/save';
import { executeCommand } from '../../../src/sim/commands';
import { NOT_IMPLEMENTED, type Command } from '../../../src/sim/commands/types';
import { allocId } from '../../../src/sim/ids';
import { Content, tileIndex } from '../../../src/sim/map';
import { contentInfo, isUnlocked } from '../../../src/sim/research/api';
import { findShowSite, showArrivalFactor, showSitesAssetValue, showSiteTiles, showTargetValid, viewingTiles } from '../../../src/sim/shows/api';
import { defaultShowSchedule, type ShowSite } from '../../../src/sim/shows/types';
import { emitSound, MAX_PENDING_EVENTS_FOR_SOUND } from '../../../src/sim/sound';
import { sellItem } from '../../../src/sim/stalls/api';
import { THOUGHT } from '../../../src/sim/guests/thoughts';
import type { World } from '../../../src/sim/types';
import { displayPrefs, resetDisplayPrefs, resolveReducedMotion, setDisplayPrefs } from '../../../src/a11y/prefs';
import { SFX } from '../../../src/audio/types';
import { KEY_HANDLERS } from '../../../src/input/keyHandlers';
import { routerOf } from '../../../src/input/toolRouters';
import { pickEntity } from '../../../src/input/tools';
import { createWorldLayers } from '../../../src/render/worldLayers';
import { LAYER_KIND } from '../../../src/render/layers';
import { extensionPanel, UI_EXTENSIONS } from '../../../src/ui/extensions';
import { formatGameDate, localizeReason } from '../../../src/i18n';
import { formatDate } from '../../../src/sim/time';
import { Game } from '../../../src/game';
import { addGuestDirect, makeTestWorld, placeFootpath, placeStallDirect, runTicks, stateHash } from '../../helpers/world';

/** A Lightshow Tower written straight into the state (no checks; W4-C's command does it for real). */
function addShowSiteDirect(w: World, x = 40, y = 40): ShowSite {
  const s = w.state;
  const site: ShowSite = {
    id: allocId(s),
    defId: 'lightshow_tower',
    x,
    y,
    rotation: 0,
    schedule: defaultShowSchedule(),
    status: 'idle',
    nextShowTick: -1,
    startTick: -1,
    lastWatchers: 0,
    totals: { shows: 0, cost: 0, watchers: 0 },
    totalBuildCost: 250_000,
    builtTick: s.tick,
  };
  s.shows.push(site);
  for (const t of showSiteTiles(w, site)) {
    s.map.content[t] = Content.Building;
    s.map.contentRef[t] = site.id;
  }
  return site;
}

describe('new games are schema 3 (Phase 6 §5)', () => {
  it('start with no show sites and pass the save checks', () => {
    const s = makeTestWorld().state;
    expect(s.schemaVersion).toBe(3);
    expect(s.shows).toEqual([]);
    expect(validateState(s)).toBeNull();
  });

  it('a new show site schedule is disabled at 21:00, every day (Phase 6 §6)', () => {
    expect(defaultShowSchedule()).toEqual({ hour: 21, minute: 0, everyNDays: 1, enabled: false });
  });

  it('a hand-placed show site validates, is found, covers its 2 × 2 footprint, and Inspect picks it', () => {
    const w = makeTestWorld();
    const site = addShowSiteDirect(w);
    expect(validateState(w.state)).toBeNull();
    expect(findShowSite(w, site.id)).toBe(site);
    expect(findShowSite(w, site.id + 1)).toBeUndefined();
    expect(showSiteTiles(w, site)).toHaveLength(4);
    expect(pickEntity(w, tileIndex(w.state.map, 41, 41))).toEqual({ kind: 'showSite', id: site.id });
  });
});

describe('W4-C show commands and queries are registered and implemented (W4-C replaced the stub block)', () => {
  // Real behaviour is tested in tests/unit/shows/ (W4-C).
  const SHOW_COMMANDS: Command[] = [
    { type: 'placeShowSite', defId: 'lightshow_tower', x: 20, y: 20, rotation: 0 },
    { type: 'setShowSchedule', id: 1, hour: 21, minute: 30, everyNDays: 2 },
    { type: 'setShowEnabled', id: 1, enabled: true },
  ];
  for (const cmd of SHOW_COMMANDS) {
    it(`${cmd.type} is registered and implemented (no stub reply)`, () => {
      const w = makeTestWorld();
      const r = executeCommand(w, cmd);
      if (!r.ok) {
        expect(r.reason).not.toBe(NOT_IMPLEMENTED);
        expect(r.reason.startsWith('Unknown command')).toBe(false);
      }
    });
  }

  it('placeShowSite builds in setup mode (Phase 6 content stays locked until W4-D raises the build phase)', () => {
    const w = makeTestWorld();
    expect(executeCommand(w, SHOW_COMMANDS[0] as Command)).toEqual({ ok: false, reason: 'Not unlocked' });
    const r = executeCommand(w, SHOW_COMMANDS[0] as Command, { setup: true });
    expect(r.ok).toBe(true);
    expect(validateState(w.state)).toBeNull();
  });

  it('demolish on a show site tile removes it for a 50% refund', () => {
    const w = makeTestWorld();
    addShowSiteDirect(w);
    expect(executeCommand(w, { type: 'demolish', x: 40, y: 40 })).toEqual({ ok: true, cost: -125_000, warnings: [] });
    expect(w.state.shows).toEqual([]);
    expect(validateState(w.state)).toBeNull();
  });

  it('show queries answer for a real site: viewing tiles, target validity, asset value; arrivals stay 1 by day', () => {
    const w = makeTestWorld();
    for (let y = 36; y <= 60; y++) placeFootpath(w, 38, y);
    const site = addShowSiteDirect(w);
    expect(viewingTiles(w, site.id).length).toBeGreaterThan(0);
    expect(showTargetValid(w, site.id)).toBe(false);
    site.status = 'announced';
    expect(showTargetValid(w, site.id)).toBe(true);
    expect(showArrivalFactor(w)).toBe(1);
    expect(showSitesAssetValue(w)).toBe(250_000);
  });

  it('a watching guest and a guest heading for a show that is not on go back to deciding (no guest is stuck)', () => {
    const w = makeTestWorld();
    for (let y = 40; y <= 60; y++) placeFootpath(w, 31, y);
    const site = addShowSiteDirect(w);
    const watcher = addGuestDirect(w, tileIndex(w.state.map, 31, 50), { state: 'watchingShow', showTarget: site.id, target: `show:${site.id}` });
    const walker = addGuestDirect(w, tileIndex(w.state.map, 31, 45), { target: `show:${site.id}`, showTarget: site.id });
    runTicks(w, 1);
    expect(watcher.state).toBe('walking');
    expect(watcher.showTarget).toBe(-1);
    expect(walker.target).not.toBe(`show:${site.id}`);
    // The stale show target goes at the next hour start (W4-C's hourly sweep).
    runTicks(w, 50);
    expect(walker.showTarget).toBe(-1);
    expect(validateState(w.state)).toBeNull();
  });
});

describe('sound cues (Phase 6 §2, src/sim/sound.ts)', () => {
  it('a stall sale emits `sale` with the price and the stall', () => {
    const w = makeTestWorld();
    const stall = placeStallDirect(w, 'snack_shack', 30, 30, 2);
    const g = addGuestDirect(w, tileIndex(w.state.map, 30, 31));
    w.events.length = 0;
    sellItem(w, stall, g);
    expect(w.events).toEqual([{ type: 'sound', cue: 'sale', tile: tileIndex(w.state.map, 30, 30), entityId: stall.id, value: stall.price }]);
  });

  it('sound events are dropped while too many events are pending, other events are not', () => {
    const w = makeTestWorld();
    for (let i = 0; i < MAX_PENDING_EVENTS_FOR_SOUND + 5; i++) emitSound(w, 'splash', 1, 2);
    expect(w.events).toHaveLength(MAX_PENDING_EVENTS_FOR_SOUND);
  });

  it('sound events never change the state: a drained and an undrained run give the same hash', () => {
    const a = makeTestWorld(77);
    const b = makeTestWorld(77);
    for (const w of [a, b]) {
      w.state.park.open = true;
      for (let y = 40; y <= 60; y++) placeFootpath(w, 31, y);
      placeStallDirect(w, 'snack_shack', 30, 50, 1);
    }
    for (let i = 0; i < 1200; i++) {
      runTicks(a, 1);
      runTicks(b, 1);
      a.events.length = 0;
    }
    expect(stateHash(a)).toBe(stateHash(b));
  });
});

describe('Phase 6 catalog rows (phase-6-polish.md §4.5)', () => {
  it('copies the final stats in cents, hundredths, and ticks', () => {
    expect(getFlatRideDef('magic_carpet')).toMatchObject({ w: 4, d: 3, excitement: 520, intensity: 600, nausea: 380, capacity: 20, cycleTicks: 500, buildCost: 360_000, runningCostMonthly: 10_000, defaultPrice: 300, tag: 'thrill', unlock: 'thrill' });
    expect(getFlatRideDef('gyro_globe')?.flags).toEqual({ covered: false, spooky: false, tall: true });
    expect(getFlatRideDef('kiddie_cars')).toMatchObject({ tag: 'family', unlock: 'gentle', defaultPrice: 100 });
    expect(getTrackRideDef('monorail')).toMatchObject({ drive: 'powered', driveSpeedMms: 8_000, seatsPerCar: 6, carsMin: 3, carsMax: 6, maxTrains: 4, maxHeightM: 12, defaultPrice: 200 });
    expect(getTrackRideDef('inverted_coaster')).toMatchObject({ carsMin: 3, carsMax: 8, maxHeightM: 45, defaultPrice: 600, unlock: 'coasters' });
    expect(getStallDef('smoothie_bar')?.effects.needs).toEqual({ thirst: -140, energy: 20 });
    expect(getStallDef('noodle_bar')?.weatherFactors).toEqual({ cold: 1.3, hot: 0.8 });
    expect(getStallDef('photo_booth')?.effects.gives).toBe('photo');
    expect(getShowSiteDef('fireworks_launcher')).toMatchObject({ w: 1, d: 1, buildCost: 150_000, runningCostMonthly: 2_000, costPerShow: 40_000, radius: 12, showTicks: 400 });
    expect(getShowSiteDef('lightshow_tower')).toMatchObject({ w: 2, d: 2, costPerShow: 15_000, radius: 8, showTicks: 300 });
  });

  it('Phase 6 content unlocks by research (W4-D raised BUILD_MAX_PHASE to 6)', () => {
    expect(BUILD_MAX_PHASE).toBe(6);
    const w = makeTestWorld();
    const ids = [...FLAT_RIDES, ...TRACK_RIDES, ...STALLS, ...SHOW_SITES].filter((d) => d.phase === 6).map((d) => d.id);
    expect(ids).toHaveLength(12);
    for (const id of ids) expect(isUnlocked(w, id), id).toBe(false);
    w.state.management.research.unlocked.push(...ids);
    for (const id of ids) expect(isUnlocked(w, id), id).toBe(true);
  });

  it('show sites are content of the Scenery research category', () => {
    expect(contentInfo('fireworks_launcher')).toEqual({ id: 'fireworks_launcher', name: 'Fireworks Launcher', kind: 'showSite', phase: 6, unlock: 'scenery' });
  });
});

describe('strings and localization contract (Phase 6 §4.8)', () => {
  it('the spec texts exist', () => {
    expect(text(THOUGHT.greatShow)).toBe('What a great show!');
    expect(text('shows.notEnoughCash')).toBe('Not enough cash for the show');
    expect(text('settings.unreadable')).toBe('Settings could not be read');
    expect(text('settings.reset')).toBe('Reset settings');
    expect(text('offline.updateReady')).toBe('Update ready');
    expect(text('money.format', { amount: '1,200' })).toBe('$1,200');
  });

  it('t() equals text() for string ids; English is the first locale and the fallback', () => {
    expect(LOCALES[0]?.code).toBe('en');
    expect(currentLocale()).toBe('en');
    expect(t('ui.slot.label', { n: 2 })).toBe(text('ui.slot.label', { n: 2 }));
    expect(t('no.such.key')).toBe('no.such.key');
    expect(setLocale('xx')).toBe(false);
    expect(setLocale('en')).toBe(true);
    expect(pluralCategory(1)).toBe('one');
    expect(pluralCategory(2)).toBe('other');
  });

  it('an active table wins in text(); missing ids fall back to English and are reported', () => {
    const missing: string[] = [];
    setMissingStringHandler((id) => missing.push(id));
    setActiveStrings({ 'ui.hud.cash': 'Kasse' });
    try {
      expect(text('ui.hud.cash')).toBe('Kasse');
      expect(text('ui.slot.label', { n: 3 })).toBe('Slot 3');
      expect(missing).toEqual(['ui.slot.label']);
    } finally {
      setActiveStrings(null);
      setMissingStringHandler(null);
    }
    expect(text('ui.hud.cash')).toBe(en['ui.hud.cash']);
  });

  it('in English the client helpers keep the Build 2 output', () => {
    expect(formatGameDate(5_100)).toBe(formatDate(5_100));
    expect(localizeReason('Not enough cash')).toBe('Not enough cash');
  });
});

describe('client contracts (Wave 4.0)', () => {
  it('display prefs default to Build 2 behaviour; reduced motion follows the system unless overridden', () => {
    expect(displayPrefs()).toEqual({ reducedMotion: false, highContrast: false, textScale: 100 });
    setDisplayPrefs({ reducedMotion: true, highContrast: true, textScale: 150 });
    expect(displayPrefs().textScale).toBe(150);
    resetDisplayPrefs();
    expect(resolveReducedMotion('auto', true)).toBe(true);
    expect(resolveReducedMotion('auto', false)).toBe(false);
    expect(resolveReducedMotion('on', false)).toBe(true);
    expect(resolveReducedMotion('off', true)).toBe(false);
  });

  it('the SFX table lists the 20 Phase 6 §4.2 sounds once each', () => {
    expect(SFX).toHaveLength(20);
    expect(new Set(SFX.map((s) => s.id)).size).toBe(20);
    expect(SFX.filter((s) => s.loop).map((s) => s.id)).toEqual(['coaster_chain', 'coaster_rumble', 'rain', 'crowd']);
  });

  it('registries hold the Build 3 entries', () => {
    const game = new Game(makeTestWorld());
    expect(KEY_HANDLERS).toHaveLength(2);
    // Keys no handler uses fall through to the Build 1 key map.
    for (const h of KEY_HANDLERS) expect(h.keyDown(game, 'p', { shift: false, repeat: false })).toBe(false);
    expect(routerOf('placeShowSite')).toBeDefined();
    const names = createWorldLayers().map((l) => l.name);
    expect(names.slice(-2)).toEqual(['shows', 'a11y']);
    expect(createWorldLayers().find((l) => l.name === 'shows')?.kinds).toEqual([LAYER_KIND.showSite]);
    expect(UI_EXTENSIONS.length).toBe(11);
    expect(typeof extensionPanel).toBe('function');
  });

  it('Game has an in-memory settings store with the defaults', () => {
    const game = new Game(makeTestWorld());
    expect(game.settings.get('masterVolume')).toBe(80);
    expect(game.settings.problem).toBeNull();
  });
});
