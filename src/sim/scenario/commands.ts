/**
 * Scenario and sandbox commands (Phase 5 §6). Owner: W3-H.
 *
 * Contract:
 * - `scenarioContinue`: valid when `scenario.kind === 'scenario'` and status `won` or `lost`. Sets `continued: true`;
 *   objectives freeze, lose checks stop, awards continue.
 * - `setSandboxOption { key, value }`: sandbox only, and only the keys changeable in game (`SandboxLiveOption`).
 *   Applies the option at once (for example `breakdowns: false` → `modifiers.breakdownChance = 0`). After Dark goes
 *   through the same switch as `setAfterDark` (W3-F), with its dark-path warning.
 * Both are free and book nothing.
 */
import { SCENARIO_ERR } from '../../data/strings/scenario';
import { fail, ok, type HandlerMap, type ScenarioCommand } from '../commands/types';
import { switchAfterDark } from '../lighting/commands';
import { SANDBOX_LIVE_OPTIONS, setSandboxLiveOption } from './options';

export const scenarioHandlers: HandlerMap<ScenarioCommand> = {
  scenarioContinue: (world) => {
    const sc = world.state.scenario;
    if (sc.kind !== 'scenario') return fail(SCENARIO_ERR.notScenario);
    if (sc.status === 'active') return fail(SCENARIO_ERR.stillRunning);
    sc.continued = true;
    return ok();
  },
  setSandboxOption: (world, cmd) => {
    const sc = world.state.scenario;
    if (sc.kind !== 'sandbox') return fail(SCENARIO_ERR.notSandbox);
    if (!SANDBOX_LIVE_OPTIONS.includes(cmd.key)) return fail(SCENARIO_ERR.notLive);
    const valid = cmd.key === 'weather' ? cmd.value === 'normal' || cmd.value === 'alwaysSunny' : typeof cmd.value === 'boolean';
    if (!valid) return fail(SCENARIO_ERR.badValue);
    if (cmd.key === 'afterDark') return ok(0, switchAfterDark(world, cmd.value as boolean));
    setSandboxLiveOption(world, cmd.key, cmd.value as never);
    return ok();
  },
};
