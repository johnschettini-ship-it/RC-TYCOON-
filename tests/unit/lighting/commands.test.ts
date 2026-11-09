/** Phase 4 §6 `setAfterDark { on }` and the §4.7 warning toast; Phase 5 §4.1 / §4.5 scenario locks and sandbox. */
import { describe, expect, it } from 'vitest';
import { text } from '../../../src/data/strings/en';
import { SCENARIO_ERR } from '../../../src/data/strings/scenario';
import { validateState } from '../../../src/save';
import { executeCommand } from '../../../src/sim/commands';
import { afterDarkLocked } from '../../../src/sim/scenario/api';
import { createSandboxWorld, createScenarioWorld } from '../../../src/sim/scenario/start';
import type { SandboxOptions } from '../../../src/sim/scenario/types';
import { PathItem, tileIndex } from '../../../src/sim/map';
import type { World } from '../../../src/sim/types';
import { makeTestWorld, placeFootpath, stateHash } from '../../helpers/world';

const WARN = 'Guests dislike dark paths. Build lamps';

function scenarioWorld(id: string): World {
  const w = createScenarioWorld(id, 'standard');
  if (!w) throw new Error(`no scenario ${id}`);
  return w;
}

function sandbox(afterDark: boolean): World {
  const options: SandboxOptions = {
    mapSize: 64,
    terrainStyle: 'flat',
    seed: 7,
    climate: 'temperate',
    afterDark,
    unlimitedMoney: true,
    allUnlocked: true,
    guestsArrive: true,
    breakdowns: true,
    weather: 'normal',
    awards: true,
  };
  return createSandboxWorld(options, 'Night Sandbox');
}

const sandboxOptions = (w: World): SandboxOptions => {
  if (w.state.scenario.kind !== 'sandbox') throw new Error('sandbox expected');
  return w.state.scenario.options;
};

describe('setAfterDark', () => {
  it('the warning text is the spec text', () => {
    expect(text('night.warnDarkPaths')).toBe(WARN);
  });

  it('turns After Dark off and on, free and with no ledger line', () => {
    const w = makeTestWorld();
    const cash = w.state.park.cash;
    const ledger = JSON.stringify(w.state.economy);
    expect(executeCommand(w, { type: 'setAfterDark', on: false })).toEqual({ ok: true, cost: 0, warnings: [] });
    expect(w.state.park.afterDark).toBe(false);
    expect(executeCommand(w, { type: 'setAfterDark', on: true })).toEqual({ ok: true, cost: 0, warnings: [] });
    expect(w.state.park.afterDark).toBe(true);
    expect(w.state.park.cash).toBe(cash);
    expect(JSON.stringify(w.state.economy)).toBe(ledger);
  });

  it('turning it on with litShare < 0.5 warns "Guests dislike dark paths. Build lamps"', () => {
    const w = makeTestWorld();
    w.state.park.afterDark = false;
    for (let x = 5; x < 10; x++) placeFootpath(w, x, 10); // 3 lit stub tiles of 8
    const r = executeCommand(w, { type: 'setAfterDark', on: true });
    expect(r).toEqual({ ok: true, cost: 0, warnings: [WARN] });
    expect(w.state.park.afterDark).toBe(true);
  });

  it('no warning at litShare ≥ 0.5, when turning it off, or when it is already on', () => {
    const w = makeTestWorld();
    w.state.park.afterDark = false;
    for (let x = 5; x < 8; x++) placeFootpath(w, x, 10); // 3 lit of 6 = 0.5
    expect(executeCommand(w, { type: 'setAfterDark', on: true })).toEqual({ ok: true, cost: 0, warnings: [] });
    placeFootpath(w, 9, 10);
    expect(executeCommand(w, { type: 'setAfterDark', on: true })).toEqual({ ok: true, cost: 0, warnings: [] });
    expect(executeCommand(w, { type: 'setAfterDark', on: false })).toEqual({ ok: true, cost: 0, warnings: [] });
  });

  it('a lamp placed after a first check is seen by the next one', () => {
    const w = makeTestWorld();
    w.state.park.afterDark = false;
    for (let x = 5; x < 10; x++) placeFootpath(w, x, 10);
    expect(executeCommand(w, { type: 'setAfterDark', on: true })).toMatchObject({ warnings: [WARN] });
    executeCommand(w, { type: 'setAfterDark', on: false });
    w.state.map.pathItem[tileIndex(w.state.map, 7, 10)] = PathItem.Lamp;
    expect(executeCommand(w, { type: 'setAfterDark', on: true })).toMatchObject({ warnings: [] });
  });
});

describe('setAfterDark in scenarios (W3-H afterDarkLocked)', () => {
  it("'forced' (Spooky Hollow): refused with the scenario's reason, nothing changes", () => {
    const w = scenarioWorld('spooky_hollow');
    expect(w.state.park.afterDark).toBe(true);
    expect(afterDarkLocked(w.state)).toBe(SCENARIO_ERR.afterDarkForced);
    const before = stateHash(w);
    expect(executeCommand(w, { type: 'setAfterDark', on: false })).toEqual({ ok: false, reason: SCENARIO_ERR.afterDarkForced });
    expect(stateHash(w)).toBe(before);
    expect(w.state.park.afterDark).toBe(true);
  });

  it("'off' (Meadow Start): refused with the scenario's reason, nothing changes", () => {
    const w = scenarioWorld('meadow_start');
    expect(w.state.park.afterDark).toBe(false);
    const before = stateHash(w);
    expect(executeCommand(w, { type: 'setAfterDark', on: true })).toEqual({ ok: false, reason: SCENARIO_ERR.afterDarkOff });
    expect(stateHash(w)).toBe(before);
  });

  it("'on' (Sandy Shores): the player may switch it", () => {
    const w = scenarioWorld('sandy_shores');
    expect(afterDarkLocked(w.state)).toBeNull();
    expect(executeCommand(w, { type: 'setAfterDark', on: false }).ok).toBe(true);
    expect(w.state.park.afterDark).toBe(false);
    expect(executeCommand(w, { type: 'setAfterDark', on: true }).ok).toBe(true);
    expect(w.state.park.afterDark).toBe(true);
  });
});

describe('setAfterDark in a sandbox (Phase 5 §4.5 live option)', () => {
  it('changes options.afterDark with park.afterDark, like setSandboxOption', () => {
    const w = sandbox(true);
    expect(executeCommand(w, { type: 'setAfterDark', on: false }).ok).toBe(true);
    expect(w.state.park.afterDark).toBe(false);
    expect(sandboxOptions(w).afterDark).toBe(false);
    expect(validateState(w.state)).toBeNull();
    const viaOption = sandbox(true);
    executeCommand(viaOption, { type: 'setSandboxOption', key: 'afterDark', value: false });
    expect(stateHash(viaOption)).toBe(stateHash(w));
  });

  it('turning it on warns about dark paths through either command', () => {
    const a = sandbox(false);
    expect(executeCommand(a, { type: 'setAfterDark', on: true })).toEqual({ ok: true, cost: 0, warnings: [] });
    expect(sandboxOptions(a).afterDark).toBe(true);
    for (const cmd of ['setAfterDark', 'setSandboxOption'] as const) {
      const w = sandbox(false);
      for (let x = 10; x < 20; x++) placeFootpath(w, x, 20);
      const r = cmd === 'setAfterDark' ? executeCommand(w, { type: 'setAfterDark', on: true }) : executeCommand(w, { type: 'setSandboxOption', key: 'afterDark', value: true });
      expect(r, cmd).toEqual({ ok: true, cost: 0, warnings: [WARN] });
      expect([w.state.park.afterDark, sandboxOptions(w).afterDark], cmd).toEqual([true, true]);
    }
  });
});
