/** Phase 5 §4.5: sandbox maps, options, and `setSandboxOption`. */
import { describe, expect, it } from 'vitest';
import { TERRAIN_STYLES } from '../../../src/data/scenarios/sandbox';
import { SANDBOX_MAP_SIZES } from '../../../src/data/tuning/scenario';
import { validateState } from '../../../src/save';
import { executeCommand } from '../../../src/sim/commands';
import { Content, Owned, tileIndex } from '../../../src/sim/map';
import { landReachableFromEntrance } from '../../../src/sim/scenario/generate';
import { checkLoseConditions } from '../../../src/sim/scenario/lose';
import { evaluateObjectives } from '../../../src/sim/scenario/objectives';
import { sandboxEntrance } from '../../../src/sim/scenario/sandbox';
import { createSandboxWorld } from '../../../src/sim/scenario/start';
import type { SandboxOptions } from '../../../src/sim/scenario/types';
import { stateHash } from '../../helpers/world';
import { isWetAt, terrainHash } from './helpers';

const DEFAULTS: SandboxOptions = {
  mapSize: 96,
  terrainStyle: 'rollingHills',
  seed: 2024,
  climate: 'temperate',
  afterDark: true,
  unlimitedMoney: true,
  allUnlocked: true,
  guestsArrive: true,
  breakdowns: true,
  weather: 'normal',
  awards: true,
};

const make = (patch: Partial<SandboxOptions> = {}) => createSandboxWorld({ ...DEFAULTS, ...patch }, 'My Sandbox');

describe('sandbox maps', () => {
  for (const style of TERRAIN_STYLES) {
    for (const mapSize of [64, 128]) {
      it(`${style} ${mapSize}: valid, owned except a 2-tile border, entrance on the south border with a path stub`, () => {
        const w = make({ terrainStyle: style, mapSize, seed: 77 });
        const s = w.state;
        const map = s.map;
        expect(validateState(s)).toBeNull();
        expect([map.width, map.height]).toEqual([mapSize, mapSize]);
        const e = sandboxEntrance(mapSize);
        expect(map.entranceTile).toBe(tileIndex(map, e.x, e.y));
        for (let k = 1; k <= 3; k++) expect(map.content[tileIndex(map, e.x, e.y - k)]).toBe(Content.Footpath);
        let owned = 0;
        for (let y = 0; y < mapSize; y++) {
          for (let x = 0; x < mapSize; x++) {
            const inner = x >= 2 && y >= 2 && x < mapSize - 2 && y < mapSize - 2;
            const o = map.owned[tileIndex(map, x, y)];
            if (o === Owned.Owned) owned++;
            if (!inner && tileIndex(map, x, y) !== map.entranceTile) expect(o).toBe(Owned.NotOwned);
          }
        }
        expect(owned).toBe((mapSize - 4) * (mapSize - 4) + 1);
        expect(landReachableFromEntrance(map).length).toBeGreaterThanOrEqual(200);
        expect(s.scenario).toEqual({ kind: 'sandbox', options: { ...DEFAULTS, terrainStyle: style, mapSize, seed: (s.scenario as { options: SandboxOptions }).options.seed }, awards: { active: [], history: [] } });
        expect(s.tick).toBe(450);
      });
    }
  }

  it('styles look like their names: flat is flat, islands have sea on every edge, a river crosses the valley', () => {
    const flat = make({ terrainStyle: 'flat' }).state.map;
    expect(new Set(flat.heights)).toEqual(new Set([8]));
    const islands = make({ terrainStyle: 'islands' }).state.map;
    for (const [x, y] of [[0, 40], [95, 40], [40, 0], [10, 95]] as const) expect(isWetAt(islands, x, y), `${x},${y}`).toBe(true);
    const valley = make({ terrainStyle: 'riverValley' }).state.map;
    for (const x of [0, 30, 60, 95]) {
      let wet = 0;
      for (let y = 0; y < 96; y++) if (isWetAt(valley, x, y)) wet++;
      expect(wet, `column ${x}`).toBeGreaterThan(0);
    }
    const mountains = make({ terrainStyle: 'mountains' }).state.map;
    expect(Math.max(...mountains.heights) - Math.min(...mountains.heights)).toBeGreaterThan(15);
  });

  it('the same options give the same world; another seed another map', () => {
    expect(stateHash(make())).toBe(stateHash(make()));
    expect(terrainHash(make({ seed: 2025 }).state.map)).not.toBe(terrainHash(make().state.map));
  });

  it('every size from the table generates (Large maps warn in the UI)', () => {
    expect(SANDBOX_MAP_SIZES).toEqual([64, 96, 128, 192, 256]);
    for (const mapSize of SANDBOX_MAP_SIZES) expect(make({ mapSize, terrainStyle: 'flat' }).state.map.width).toBe(mapSize);
  });

  it('generates a 128 × 128 map in under 300 ms (Phase 5 §4.2)', () => {
    let best = Infinity;
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      make({ mapSize: 128, terrainStyle: 'mountains', seed: 900 + k });
      best = Math.min(best, performance.now() - t0);
    }
    expect(best).toBeLessThan(300);
  });

  it('has no objectives and no lose conditions', () => {
    const w = make();
    const before = structuredClone(w.state.scenario);
    w.state.tick = 3600;
    w.state.park.cash = -1_000_000;
    evaluateObjectives(w);
    checkLoseConditions(w);
    expect(w.state.scenario).toEqual(before);
    expect(w.events).toEqual([]);
  });
});

describe('sandbox options', () => {
  it('start values: After Dark, breakdowns off → chance 0, always sunny now, unlimited money keeps cash', () => {
    const w = make({ afterDark: false, breakdowns: false, weather: 'alwaysSunny' });
    expect(w.state.park.afterDark).toBe(false);
    expect(w.state.modifiers.breakdownChance).toBe(0);
    expect(w.state.management.weather).toMatchObject({ current: 'sunny', next: 'sunny' });
    const cash = w.state.park.cash;
    expect(executeCommand(w, { type: 'placeRide', defId: 'flip_arm', x: 40, y: 40, rotation: 0 }).ok).toBe(true);
    expect(w.state.park.cash).toBe(cash);
  });

  it('setSandboxOption changes the live options at once', () => {
    const w = make();
    const opts = (): SandboxOptions => (w.state.scenario as { options: SandboxOptions }).options;
    expect(executeCommand(w, { type: 'setSandboxOption', key: 'breakdowns', value: false })).toEqual({ ok: true, cost: 0, warnings: [] });
    expect(w.state.modifiers.breakdownChance).toBe(0);
    expect(executeCommand(w, { type: 'setSandboxOption', key: 'breakdowns', value: true }).ok).toBe(true);
    expect(w.state.modifiers.breakdownChance).toBe(1);
    expect(executeCommand(w, { type: 'setSandboxOption', key: 'afterDark', value: false }).ok).toBe(true);
    expect(w.state.park.afterDark).toBe(false);
    w.state.management.weather.current = 'storm';
    expect(executeCommand(w, { type: 'setSandboxOption', key: 'weather', value: 'alwaysSunny' }).ok).toBe(true);
    expect(w.state.management.weather.current).toBe('sunny');
    for (const key of ['unlimitedMoney', 'guestsArrive', 'awards'] as const) {
      expect(executeCommand(w, { type: 'setSandboxOption', key, value: false }).ok).toBe(true);
      expect(opts()[key]).toBe(false);
    }
    expect(opts()).toMatchObject({ breakdowns: true, afterDark: false, weather: 'alwaysSunny' });
    expect(validateState(w.state)).toBeNull();
  });

  it('refuses keys fixed at setup, wrong values, and other park kinds, changing nothing', () => {
    const w = make();
    const before = stateHash(w);
    const bad = (cmd: object): string => {
      const r = executeCommand(w, cmd as never);
      if (r.ok) throw new Error('expected a refusal');
      return r.reason;
    };
    expect(bad({ type: 'setSandboxOption', key: 'mapSize', value: true })).toBe('This option cannot change during play');
    expect(bad({ type: 'setSandboxOption', key: 'allUnlocked', value: false })).toBe('This option cannot change during play');
    expect(bad({ type: 'setSandboxOption', key: 'weather', value: true })).toBe('That value is not allowed here');
    expect(bad({ type: 'setSandboxOption', key: 'awards', value: 'normal' })).toBe('That value is not allowed here');
    expect(stateHash(w)).toBe(before);
    const scenario = createSandboxWorld(DEFAULTS, 'x');
    scenario.state.scenario = { kind: 'freePlay', awards: { active: [], history: [] } };
    const r = executeCommand(scenario, { type: 'setSandboxOption', key: 'awards', value: false });
    expect(r).toEqual({ ok: false, reason: 'Only a sandbox has these options' });
  });
});
