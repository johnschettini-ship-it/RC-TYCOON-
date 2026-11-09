/**
 * Tutorial commands (Phase 5 §4.11, §6). Owner: W3-I.
 *
 * Contract (all need `scenario.kind === 'tutorial'` and not `done`):
 * - `tutorialAdvance { stepId }`: the current step has a `ui` check named `stepId` → mark it done, move on, and emit
 *   `{ type: 'tutorialStep' }`. Any other step id fails.
 * - `tutorialSkipStep`: marks the current step done.
 * - `tutorialSkipAll`: ends the tutorial (`skipped: true`); the park continues as free play.
 * Stub: every handler returns "Not implemented yet" and changes nothing.
 */
import type { Command, CommandResult } from '../commands/types';
import { notImplemented, type HandlerMap, type TutorialCommand } from '../commands/types';
import type { World } from '../types';

export const tutorialHandlers: HandlerMap<TutorialCommand> = {
  tutorialAdvance: notImplemented,
  tutorialSkipStep: notImplemented,
  tutorialSkipAll: notImplemented,
};

/**
 * `sim` step checks run after every successful command (Phase 5 §4.11). `executeCommand` calls this after each
 * successful command, setup mode included. Stub: no-op.
 */
export function tutorialAfterCommand(_world: World, _cmd: Command, _result: CommandResult): void {}
