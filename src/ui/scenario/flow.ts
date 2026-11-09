/**
 * Title screen flow for Build 2 (Phase 5 §4.13). Owner: W3-I, who wires it into `../title.ts`.
 * Title: Continue, New game, Load, Settings, Credits. New game: Tutorial, Scenarios, Sandbox; the free-play New Park
 * form gets the 5 map sizes (default 96, warning at 192 and 256). New games come from the sim factories
 * (`createScenarioWorld`, `createSandboxWorld` — W3-H; `createTutorialWorld` — W3-I; `createWorld` with
 * `layout: 'freePlay'` — W3-G) and go in with `game.setWorld`. Stubs: every step does nothing.
 */
import type { Difficulty } from '../../data/scenarios/types';
import type { SandboxOptions } from '../../sim/scenario/types';
import type { SimEvent } from '../../sim/types';
import type { UiContext } from '../context';

export interface ScenarioFlow {
  /** Tutorial, Scenarios, Sandbox (and the free-play New Park form). */
  showNewGame(): void;
  /** Card grid: name, stars, climate and After Dark icons, lock state, best stars per preset. */
  showScenarioSelect(): void;
  /** Description, goals, deadline, start conditions, preset picker, Start (side panel; bottom sheet on phones). */
  showScenarioDetail(id: string): void;
  startScenario(id: string, difficulty: Difficulty): void;
  showSandboxSetup(): void;
  startSandbox(options: SandboxOptions, parkName: string): void;
  startTutorial(): void;
  /** End screen on a `scenarioEnded` event: Keep playing, Scenario select / Try again, Main menu. */
  showEndScreen(event: Extract<SimEvent, { type: 'scenarioEnded' }>): void;
}

export function createScenarioFlow(_ctx: UiContext): ScenarioFlow {
  const nothing = (): void => {};
  return {
    showNewGame: nothing,
    showScenarioSelect: nothing,
    showScenarioDetail: nothing,
    startScenario: nothing,
    showSandboxSetup: nothing,
    startSandbox: nothing,
    startTutorial: nothing,
    showEndScreen: nothing,
  };
}
