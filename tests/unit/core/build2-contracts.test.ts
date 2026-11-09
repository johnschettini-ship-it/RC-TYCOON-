/**
 * Wave 3.0 contracts (Build 2): new-game state, the command registry, guest hooks, and the real bodies the
 * contract files carry (catalog, ownership rules, corner helpers, night window, field bands, view rotation table).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { getSceneryDef, SCENERY, SCENERY_THEMES } from '../../../src/data/catalog';
import { executeCommand } from '../../../src/sim/commands';
import { NOT_IMPLEMENTED, type Command } from '../../../src/sim/commands/types';
import { guestHooks } from '../../../src/sim/hooks';
import { addThought } from '../../../src/sim/guests/thoughts';
import { boardRide, finishRide } from '../../../src/sim/guests/api';
import { tileIndex, Owned } from '../../../src/sim/map';
import { groundOwnershipBlock, aboveGroundOwnershipBlock } from '../../../src/sim/land/api';
import { cornerHeightsOf, isWet, maxCorner, minCorner } from '../../../src/sim/terrain/corners';
import { isNight } from '../../../src/sim/lighting/api';
import { fieldBand } from '../../../src/sim/fields/api';
import { contentInfo, isUnlocked } from '../../../src/sim/research/api';
import { costumeMatches } from '../../../src/sim/staff/costumes';
import { createSandboxWorld } from '../../../src/sim/scenario/start';
import { createTutorialWorld } from '../../../src/sim/tutorial/start';
import { validateState } from '../../../src/save';
import { mapRotationFromView, mapToView, mapToViewContinuous, rotateSlopeMask, viewSpriteRotation, viewToMap } from '../../../src/render/view';
import type { Dir } from '../../../src/sim/map';
import { addGuestDirect, makeTestWorld, placeFootpath, placeRideDirect, runTicks, stateHash } from '../../helpers/world';

describe('new games are schema 2 (Phase 4 §5, Phase 5 §5)', () => {
  it('has every Build 2 slice with its start value and passes the save checks', () => {
    const s = makeTestWorld().state;
    expect(s.schemaVersion).toBe(2);
    expect(s.park.afterDark).toBe(true);
    expect(s.park.landPrice).toBe(15_000);
    expect(s.park.rightsPrice).toBe(6_000);
    expect(s.elevatedPaths).toEqual([]);
    expect(s.scenery).toEqual([]);
    expect(s.scenario).toEqual({ kind: 'freePlay', awards: { active: [], history: [] } });
    expect(s.monthMetrics.monthIndex).toBe(0);
    expect(s.map.pathItemLevel).toEqual(new Int32Array(64 * 64));
    expect(validateState(s)).toBeNull();
  });

  it('a spawned guest stands at the ground height of the entrance and is dry', () => {
    const w = makeTestWorld();
    w.state.park.open = true;
    placeRideDirect(w, 'carousel', 30, 50, 0).status = 'open';
    runTicks(w, 600);
    expect(w.state.guests.length).toBeGreaterThan(0);
    for (const g of w.state.guests) {
      expect(g.z).toBe(8);
      expect(g.wetUntilTick).toBe(-1);
    }
    expect(validateState(w.state)).toBeNull();
  });

  it('the sandbox and tutorial factories record their kind and validate', () => {
    const sandbox = createSandboxWorld(
      { mapSize: 96, terrainStyle: 'flat', seed: 7, climate: 'hot', afterDark: false, unlimitedMoney: true, allUnlocked: true, guestsArrive: true, breakdowns: true, weather: 'normal', awards: true },
      'Sandbox',
    );
    expect(sandbox.state.scenario.kind).toBe('sandbox');
    expect(sandbox.state.map.width).toBe(96);
    expect(validateState(sandbox.state)).toBeNull();
    const tutorial = createTutorialWorld(3, 'Tutorial Park');
    expect(tutorial.state.scenario).toEqual({ kind: 'tutorial', stepIndex: 0, skipped: false, done: false });
    expect(tutorial.state.map.width).toBe(48);
    expect(validateState(tutorial.state)).toBeNull();
  });

  it('month starts reset the month metrics to the new month', () => {
    const w = makeTestWorld();
    w.state.monthMetrics.queueWaits = 5;
    runTicks(w, 3600 - 450 + 1);
    expect(w.state.monthMetrics.monthIndex).toBe(1);
    expect(w.state.monthMetrics.queueWaits).toBe(0);
  });
});

describe('Build 2 commands are registered (Phase 4 §6, Phase 5 §6)', () => {
  const cmds: Command[] = [
    { type: 'raiseCorner', x: 10, y: 10, corner: 0 },
    { type: 'lowerCorner', x: 10, y: 10, corner: 2 },
    { type: 'raiseLand', x: 10, y: 10, size: 3 },
    { type: 'lowerLand', x: 10, y: 10, size: 1 },
    { type: 'smoothLand', x: 10, y: 10, size: 5 },
    { type: 'levelLand', x0: 1, y0: 1, x1: 4, y1: 4, targetHeight: 8 },
    { type: 'paintTerrain', x: 10, y: 10, size: 7, terrain: 4 },
    { type: 'raiseWater', x: 10, y: 10, size: 3 },
    { type: 'lowerWater', x: 10, y: 10, size: 3 },
    { type: 'buyLand', x0: 0, y0: 0, x1: 3, y1: 3 },
    { type: 'placeScenery', defId: 'oak_round', x: 10, y: 10, rotation: 0, edge: -1 },
    { type: 'removeScenery', id: 1 },
    { type: 'setAfterDark', on: false },
    { type: 'scenarioContinue' },
    { type: 'setSandboxOption', key: 'awards', value: false },
    { type: 'tutorialAdvance', stepId: 'welcome' },
    { type: 'tutorialSkipStep' },
    { type: 'tutorialSkipAll' },
  ];
  for (const cmd of cmds) {
    it(`${cmd.type} answers "${NOT_IMPLEMENTED}" and changes nothing`, () => {
      const w = makeTestWorld();
      const before = stateHash(w);
      expect(executeCommand(w, cmd)).toEqual({ ok: false, reason: NOT_IMPLEMENTED });
      expect(stateHash(w)).toBe(before);
    });
  }

  it('Build 1 path commands without the Phase 4 fields behave as before', () => {
    const w = makeTestWorld();
    expect(executeCommand(w, { type: 'buildPathLine', x0: 20, y0: 20, x1: 22, y1: 20, kind: 'footpath' }).ok).toBe(true);
  });

  it('setup mode skips unlock checks (Phase 5 §2) but keeps placement checks', () => {
    const w = makeTestWorld();
    expect(isUnlocked(w, 'drop_tower')).toBe(false);
    expect(executeCommand(w, { type: 'placeRide', defId: 'drop_tower', x: 20, y: 20, rotation: 0 }).ok).toBe(false);
    expect(executeCommand(w, { type: 'placeRide', defId: 'drop_tower', x: 20, y: 20, rotation: 0 }, { setup: true }).ok).toBe(true);
  });
});

describe('guest hooks for Build 2 (Wave 3.0 call sites)', () => {
  const pushed: Array<() => void> = [];
  function add<K extends keyof typeof guestHooks>(key: K, fn: (typeof guestHooks)[K][number]): void {
    const list = guestHooks[key] as unknown[];
    list.push(fn);
    pushed.push(() => list.splice(list.indexOf(fn), 1));
  }
  afterEach(() => {
    while (pushed.length) pushed.pop()!();
  });

  it('perHour runs once per guest at each hour start', () => {
    const w = makeTestWorld();
    const tile = placeFootpath(w, 31, 50);
    addGuestDirect(w, tile);
    const calls: number[] = [];
    add('perHour', (world) => void calls.push(world.state.tick));
    runTicks(w, 120);
    expect(calls).toEqual([450, 500, 550]);
  });

  it('walkSpeed multiplies walking progress; energyFactor and nauseaRecoveryFactor scale the need steps', () => {
    const w = makeTestWorld();
    for (let y = 40; y <= 60; y++) placeFootpath(w, 31, y);
    const g = addGuestDirect(w, tileIndex(w.state.map, 31, 50), { nextTile: tileIndex(w.state.map, 31, 49), needs: { hunger: 0, thirst: 0, bladder: 0, energy: 200, happiness: 200, nausea: 100 } });
    add('walkSpeed', () => 2);
    add('energyFactor', () => 0);
    add('nauseaRecoveryFactor', () => 0);
    runTicks(w, 1);
    expect(g.progress).toBe(2);
    runTicks(w, 200);
    expect(g.needs.energy).toBe(200);
    expect(g.needs.nausea).toBe(100);
  });

  it('onThought hears every added thought; onBoard and afterRide frame a ride', () => {
    const w = makeTestWorld();
    const ride = placeRideDirect(w, 'carousel', 30, 30, 0);
    const g = addGuestDirect(w, ride.entrance!.outside, { state: 'queueing', stateTicks: 77, activityId: ride.id, target: `ride:${ride.id}` });
    ride.queue.push(g.id);
    const log: string[] = [];
    add('onThought', (_w, _g, id) => void log.push(`thought ${id}`));
    add('onBoard', (_w, _g, r, wait) => void log.push(`board ${r.id} ${wait}`));
    add('afterRide', (_w, _g, r) => void log.push(`after ${r.id}`));
    expect(addThought(w, g, 'thinking.hungry')).toBe(true);
    expect(addThought(w, g, 'thinking.hungry')).toBe(false);
    expect(boardRide(w, g, ride)).toBe(true);
    finishRide(w, g, ride);
    expect(log[0]).toBe('thought thinking.hungry');
    expect(log).toContain(`board ${ride.id} 77`);
    expect(log[log.length - 1]).toBe(`after ${ride.id}`);
  });
});

describe('contract helpers with real bodies', () => {
  it('scenery catalog: 85 items, base 13, 12 per theme, unique ids, spec rows', () => {
    expect(SCENERY).toHaveLength(85);
    expect(new Set(SCENERY.map((d) => d.id)).size).toBe(85);
    for (const t of SCENERY_THEMES) expect(SCENERY.filter((d) => d.theme === t.id)).toHaveLength(t.id === 'base' ? 13 : 12);
    expect(getSceneryDef('fountain_carved')).toMatchObject({ w: 2, d: 2, heightM: 3, buildCost: 40_000, calm: 6, buzz: 0, light: true, edge: false });
    expect(getSceneryDef('rope_bridge_decor')).toMatchObject({ w: 2, d: 1 });
    expect(getSceneryDef('gate_crooked')).toMatchObject({ overPath: true, spooky: true, light: false });
    expect(getSceneryDef('shrub_flowering')).toMatchObject({ slopeOk: true, needsWater: true });
    expect(getSceneryDef('wall_hull')).toMatchObject({ edge: true, buzz: 1, buildCost: 2_200 });
  });

  it('scenery is research content, locked while the build stops at Phase 3', () => {
    const w = makeTestWorld();
    expect(contentInfo('frost_peaks')).toMatchObject({ kind: 'sceneryTheme', unlock: 'scenery' });
    expect(contentInfo('snow_pine')).toMatchObject({ kind: 'scenery', unlock: 'scenery' });
    expect(contentInfo('oak_round')).toMatchObject({ kind: 'scenery', unlock: 'start' });
    expect(isUnlocked(w, 'oak_round')).toBe(false);
  });

  it('ground and above-ground ownership rules', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const i = tileIndex(map, 5, 5);
    map.owned[i] = Owned.Owned;
    expect(groundOwnershipBlock(map, i)).toBeNull();
    map.owned[i] = Owned.RightsOwned;
    expect(groundOwnershipBlock(map, i)).toBe('You only have construction rights here');
    expect(aboveGroundOwnershipBlock(map, i, true)).toBeNull();
    expect(aboveGroundOwnershipBlock(map, i, false)).toBe('You only have construction rights here');
    for (const o of [Owned.NotOwned, Owned.LandForSale, Owned.RightsForSale]) {
      map.owned[i] = o;
      expect(groundOwnershipBlock(map, i)).toBe('Outside the park');
    }
  });

  it('corner heights and the wet test', () => {
    const w = makeTestWorld();
    const map = w.state.map;
    const i = tileIndex(map, 5, 5);
    map.heights[i] = 9;
    map.slope[i] = 0b0110;
    expect(cornerHeightsOf(map, i)).toEqual([9, 10, 10, 9]);
    expect(minCorner(map, i)).toBe(9);
    expect(maxCorner(map, i)).toBe(10);
    expect(isWet(map, i)).toBe(false);
    map.water[i] = 10;
    expect(isWet(map, i)).toBe(true);
  });

  it('night is the integer clock window 20:00–06:00', () => {
    const at = (h: number): number => h * 50;
    expect(isNight(at(19))).toBe(false);
    expect(isNight(at(20))).toBe(true);
    expect(isNight(at(23))).toBe(true);
    expect(isNight(at(5))).toBe(true);
    expect(isNight(at(6))).toBe(false);
    expect(isNight(1200 + at(12))).toBe(false);
  });

  it('field bands: None < 20, Low 20–59, Medium 60–119, High ≥ 120', () => {
    expect([0, 19, 20, 59, 60, 119, 120, 255].map(fieldBand)).toEqual(['none', 'none', 'low', 'low', 'medium', 'medium', 'high', 'high']);
  });

  it('the Boo costume matches only when its rule is active', () => {
    expect(costumeMatches('boo', 50)).toBe(false);
    expect(costumeMatches('boo', 50, true)).toBe(true);
    expect(costumeMatches('frost', 10, true)).toBe(true);
    expect(costumeMatches('spark', 10, true)).toBe(false);
  });

  it('view rotation table: map → view → map is the identity for every r (Phase 4 §4.8)', () => {
    const W = 7;
    const H = 5;
    for (const r of [0, 1, 2, 3] as Dir[]) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const v = mapToView(x, y, r, W, H);
          expect(viewToMap(v.u, v.v, r, W, H)).toEqual({ x, y });
          // Continuous: the tile's centre maps to the view tile's centre.
          const c = mapToViewContinuous(x + 0.5, y + 0.5, r, W, H);
          expect(c).toEqual({ u: v.u + 0.5, v: v.v + 0.5 });
        }
      }
      expect(mapRotationFromView(viewSpriteRotation(2, r), r)).toBe(2);
    }
    expect(mapToView(0, 0, 1, W, H)).toEqual({ u: H - 1, v: 0 });
    // N → E → S → W: at r = 1 a raised N corner is seen as E.
    expect(rotateSlopeMask(0b0001, 1)).toBe(0b0010);
    expect(rotateSlopeMask(0b1001, 1)).toBe(0b0011);
    expect(rotateSlopeMask(0b0110, 2)).toBe(0b1001);
    expect(rotateSlopeMask(0b0011, 0)).toBe(0b0011);
  });
});
