/**
 * New scenario and sandbox games (Phase 5 §4.1–4.2, §4.5, §4.8). Owner: W3-H. Called by the title flow (W3-I).
 * New game, restart, and scenario select build a new GameState; they are not commands (Phase 5 §6).
 */
import { getScenarioDef, type Difficulty } from '../../data/scenarios';
import { emptyAwards } from '../awards/types';
import { createWorld } from '../world';
import type { World } from '../types';
import type { SandboxOptions } from './types';

/**
 * A new run of scenario `id` on `difficulty`: generated map (seeded, golden-hashed), start conditions scaled by the
 * preset, modifiers set (master R7), research rules, climate, After Dark rule, objectives, deadline, start tick 450.
 * Null for an unknown id. Stub: null (no scenarios yet).
 */
export function createScenarioWorld(id: string, _difficulty: Difficulty): World | null {
  if (!getScenarioDef(id)) return null;
  return null;
}

/**
 * A new sandbox (Phase 5 §4.5): map from the size, terrain style, and seed; all land owned except a 2-tile border;
 * options applied. Stub: a free-play world of the chosen size with the sandbox state recorded.
 */
export function createSandboxWorld(options: SandboxOptions, parkName: string): World {
  const world = createWorld({ seed: options.seed, parkName, mapSize: options.mapSize, layout: 'freePlay' });
  world.state.scenario = { kind: 'sandbox', options: { ...options }, awards: emptyAwards() };
  world.state.park.afterDark = options.afterDark;
  return world;
}
