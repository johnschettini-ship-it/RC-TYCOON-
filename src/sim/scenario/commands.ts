/**
 * Scenario and sandbox commands (Phase 5 §6). Owner: W3-H.
 *
 * Contract:
 * - `scenarioContinue`: valid when `scenario.kind === 'scenario'` and status `won` or `lost`. Sets `continued: true`;
 *   objectives freeze, lose checks stop, awards continue.
 * - `setSandboxOption { key, value }`: sandbox only, and only the keys changeable in game (`SandboxLiveOption`).
 *   Applies the option at once (for example `breakdowns: false` → `modifiers.breakdownChance = 0`).
 * Stub: both return "Not implemented yet" and change nothing.
 */
import { notImplemented, type HandlerMap, type ScenarioCommand } from '../commands/types';

export const scenarioHandlers: HandlerMap<ScenarioCommand> = {
  scenarioContinue: notImplemented,
  setSandboxOption: notImplemented,
};
