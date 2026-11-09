/**
 * Tutorial commands (Phase 5 §4.11, §6). Owner: W3-I.
 *
 * All need an active tutorial (`scenario.kind === 'tutorial'`, not `done`, not `skipped`):
 * - `tutorialAdvance { stepId }`: the current step has a `ui` check named `stepId` → mark it done, move on, and emit
 *   `{ type: 'tutorialStep' }`. Any other step id fails.
 * - `tutorialSkipStep`: marks the current step done.
 * - `tutorialSkipAll`: ends the tutorial (`skipped: true`); the park continues as free play.
 * Each finished step emits `{ type: 'tutorialStep', stepIndex, done }` with the new step index; finishing step 16
 * sets `done` (the client then records `tutorialDone` in progress storage).
 */
import { englishText } from '../../data/strings/en';
import type { Command, CommandResult } from '../commands/types';
import { fail, ok, type HandlerMap, type TutorialCommand } from '../commands/types';
import { emit } from '../events';
import type { World } from '../types';
import type { TutorialRun } from './types';
import { simStepMet, TUTORIAL_STEP_COUNT, TUTORIAL_STEPS } from './steps';

/** The running tutorial, or null (another park kind, finished, or skipped). */
export function activeTutorial(world: World): TutorialRun | null {
  const s = world.state.scenario;
  return s.kind === 'tutorial' && !s.done && !s.skipped ? s : null;
}

/** Mark the current step done and move on. */
function finishStep(world: World, run: TutorialRun): void {
  run.stepIndex = Math.min(TUTORIAL_STEP_COUNT, run.stepIndex + 1);
  if (run.stepIndex >= TUTORIAL_STEP_COUNT) run.done = true;
  emit(world, { type: 'tutorialStep', stepIndex: run.stepIndex, done: run.done });
}

/** Run the `sim` check of the current step, then of each next step that is already met. */
export function runSimChecks(world: World, cmd: Command | null): void {
  for (;;) {
    const run = activeTutorial(world);
    if (!run) return;
    const step = TUTORIAL_STEPS[run.stepIndex];
    if (!step || step.check !== 'sim' || !simStepMet(world, step.id, cmd)) return;
    finishStep(world, run);
  }
}

const notRunning = (): CommandResult => fail(englishText('prog.tutorial.notRunning'));

export const tutorialHandlers: HandlerMap<TutorialCommand> = {
  tutorialAdvance(world, cmd) {
    const run = activeTutorial(world);
    if (!run) return notRunning();
    const step = TUTORIAL_STEPS[run.stepIndex];
    if (!step || step.check !== 'ui' || step.id !== cmd.stepId) return fail(englishText('prog.tutorial.wrongStep'));
    finishStep(world, run);
    return ok();
  },
  tutorialSkipStep(world) {
    const run = activeTutorial(world);
    if (!run) return notRunning();
    finishStep(world, run);
    return ok();
  },
  tutorialSkipAll(world) {
    const run = activeTutorial(world);
    if (!run) return notRunning();
    run.skipped = true;
    emit(world, { type: 'tutorialStep', stepIndex: run.stepIndex, done: false });
    return ok();
  },
};

/**
 * `sim` step checks run after every successful command (Phase 5 §4.11). `executeCommand` calls this after each
 * successful command, setup mode included.
 */
export function tutorialAfterCommand(world: World, cmd: Command, _result: CommandResult): void {
  if (world.state.scenario.kind !== 'tutorial') return;
  runSimChecks(world, cmd);
}
