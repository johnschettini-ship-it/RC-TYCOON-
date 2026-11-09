/** Phase 6 §4.6, §7 performance overlay (W4-E): F3 flips the setting; the text lines; hidden by default. */
import { describe, expect, it } from 'vitest';
import { Game } from '../../../src/game';
import { perfKeys } from '../../../src/perf/keys';
import { perfProbe, type PerfSnapshot } from '../../../src/perf/stats';
import { overlayLines } from '../../../src/ui/perf';
import { defaultSettings } from '../../../src/settings';
import { makeTestWorld } from '../../helpers/world';

const NO_MODS = { shift: false, repeat: false };

describe('F3 (Phase 6 §4.6)', () => {
  it('the overlay setting is off by default and the probe is off', () => {
    expect(defaultSettings().perfOverlay).toBe(false);
    expect(perfProbe.enabled).toBe(false);
  });

  it('F3 flips Settings → Performance overlay; held keys repeat nothing; other keys pass', () => {
    const game = new Game(makeTestWorld());
    expect(perfKeys.keyDown(game, 'F3', NO_MODS)).toBe(true);
    expect(game.settings.get('perfOverlay')).toBe(true);
    expect(perfKeys.keyDown(game, 'F3', { shift: false, repeat: true })).toBe(true);
    expect(game.settings.get('perfOverlay')).toBe(true);
    expect(perfKeys.keyDown(game, 'F3', NO_MODS)).toBe(true);
    expect(game.settings.get('perfOverlay')).toBe(false);
    expect(perfKeys.keyDown(game, 'f', NO_MODS)).toBe(false);
    expect(perfKeys.keyDown(game, 'F2', NO_MODS)).toBe(false);
  });
});

describe('overlay text (Phase 6 §4.6 list)', () => {
  it('fps, frame and tick p50 / p95, draw calls, sprite cache MB, and entity counts', () => {
    const world = makeTestWorld();
    const s: PerfSnapshot = {
      fps: 58.6,
      frameP50: 16.68,
      frameP95: 17.04,
      tickP50: 1.234,
      tickP95: 3.456,
      drawCalls: 812,
      spriteCacheMb: 63.94,
      spriteCacheByKind: {},
      frameMax: 33,
      workP50: 5,
      workP95: 8,
      workMax: 9,
      renderP50: 4,
      renderP95: 6,
      longFrames: 0,
      canvasesMade: 0,
      frames: 120,
      ticks: 40,
    };
    expect(overlayLines(s, world)).toEqual([
      '59 fps',
      'Frame 16.7 ms (p95 17.0 ms)',
      'Tick 1.2 ms (p95 3.5 ms)',
      'Draw calls 812',
      'Sprite cache 63.9 MB',
      `Guests 0 · Rides 0 · Stalls 0 · Staff 0`,
    ]);
  });
});
