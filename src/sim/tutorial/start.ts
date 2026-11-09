/**
 * New tutorial game (Phase 5 §4.11): 48 × 48 flat meadow, all owned, cash $30,000, no time limit, no lose
 * conditions, no awards, After Dark off, start tick 450. Owner: W3-I. Called by the title flow.
 * Stub: a 48 × 48 Build 1 layout with the tutorial state; W3-I sets the start conditions.
 */
import { createWorld } from '../world';
import type { World } from '../types';
import { newTutorialRun } from './types';

export function createTutorialWorld(seed: number, parkName: string): World {
  const world = createWorld({ seed, parkName, mapSize: 48 });
  world.state.scenario = newTutorialRun();
  world.state.park.afterDark = false;
  return world;
}
