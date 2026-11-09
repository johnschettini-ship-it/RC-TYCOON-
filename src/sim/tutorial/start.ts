/**
 * New tutorial game (Phase 5 §4.11): 48 × 48 flat meadow, all owned (inside the border fence), cash $30,000, no time
 * limit, no lose conditions, no awards, After Dark off, start tick 450. The park entrance sits in the middle of the
 * south edge with the usual 3-tile footpath stub. Owner: W3-I. Called by the title flow.
 */
import { ENTRANCE_STUB_LENGTH } from '../../data/tuning/core';
import { Content, Owned, tileIndex } from '../map';
import { createWorld } from '../world';
import type { World } from '../types';
import { newTutorialRun } from './types';

export const TUTORIAL_MAP_SIZE = 48;
/** $30,000. */
export const TUTORIAL_CASH = 3_000_000;

export function createTutorialWorld(seed: number, parkName: string): World {
  const world = createWorld({ seed, parkName, mapSize: TUTORIAL_MAP_SIZE });
  const s = world.state;
  const map = s.map;
  // Move the Build 1 entrance (x = 31) and its stub to the middle of the south edge.
  const y = map.height - 1;
  const oldX = map.entranceTile % map.width;
  const x = Math.floor(map.width / 2);
  for (let k = 0; k <= ENTRANCE_STUB_LENGTH; k++) map.content[tileIndex(map, oldX, y - k)] = Content.Empty;
  map.owned[tileIndex(map, oldX, y)] = Owned.NotOwned;
  const entrance = tileIndex(map, x, y);
  map.entranceTile = entrance;
  map.content[entrance] = Content.ParkEntrance;
  map.owned[entrance] = Owned.Owned;
  for (let k = 1; k <= ENTRANCE_STUB_LENGTH; k++) map.content[tileIndex(map, x, y - k)] = Content.Footpath;
  s.park.cash = TUTORIAL_CASH;
  s.park.afterDark = false;
  s.scenario = newTutorialRun();
  return world;
}
