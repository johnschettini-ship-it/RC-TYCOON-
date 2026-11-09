/**
 * Tutorial `sim` checks every game hour (Phase 5 §4.11), run at hour start after the month samples. Owner: W3-I.
 * The same checks also run after every successful command (`tutorialAfterCommand`).
 */
import type { World } from '../types';
import { runSimChecks } from './commands';

export function hourlyTutorial(world: World): void {
  if (world.state.scenario.kind !== 'tutorial') return;
  runSimChecks(world, null);
}
