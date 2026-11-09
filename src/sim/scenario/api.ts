/**
 * Scenario rules read by other systems (Phase 5 §4.1, §4.5, §4.9). Owner: W3-H. Signatures are a contract.
 * Free play and Build 1 parks get the neutral answer from every function.
 */
import { SEASON_WEATHER_WEIGHTS, type WeatherState } from '../../data/tuning/management';
import type { Climate } from '../../data/scenarios/types';
import type { Season } from '../time';
import type { GameState, World } from '../types';

/** Sandbox "Unlimited money": affordability checks pass and cash does not fall (the ledger still records). Stub: false. */
export function unlimitedMoney(_state: GameState): boolean {
  return false;
}

/** Climate of the park: the scenario's, the sandbox option, else temperate. Stub: temperate. */
export function climateOf(_state: GameState): Climate {
  return 'temperate';
}

/**
 * Weather draw weights for `season` after the climate rain and sun weights (Phase 5 §4.9) and the sandbox
 * "always sunny" option. Integer weights, like the Phase 3 table. Stub: the Phase 3 season table unchanged.
 */
export function weatherWeights(_world: World, season: Season): Readonly<Record<WeatherState, number>> {
  return SEASON_WEATHER_WEIGHTS[season];
}

/** Arrival multiplier from the scenario kind (sandbox "Guests arrive: off" → 0). Stub: 1. */
export function scenarioArrivalFactor(_world: World): number {
  return 1;
}

/**
 * Content availability from the scenario `research` rules (Phase 5 §4.1) and sandbox "All items unlocked":
 * `unlocked` = available now, `hidden` = never appears, `normal` = the research rules decide. Stub: normal.
 */
export function scenarioContentRule(_world: World, _itemId: string): 'normal' | 'unlocked' | 'hidden' {
  return 'normal';
}

/**
 * Null when the player may switch After Dark, else the reason (scenario `afterDark: 'forced'` or `'off'`).
 * `setAfterDark` (W3-F) and the park panel ask it. Stub: null.
 */
export function afterDarkLocked(_state: GameState): string | null {
  return null;
}

/** End-screen facts (Phase 5 §4.4). Money in cents, ratings 0–1000, excitement in hundredths. */
export interface ScenarioResult {
  status: 'won' | 'lost';
  endReason: 'timeUp' | 'bankrupt' | 'ratingCollapse' | null;
  endMonthIndex: number;
  guests: number;
  rating: number;
  parkValue: number;
  totalProfit: number;
  bestCoasterExcitement: number | null;
  /** 1–3 on a win, 0 on a loss. */
  stars: number;
}

/** The result of a finished scenario run, or null while it is active or for other kinds. Stub: null. */
export function scenarioResult(_world: World): ScenarioResult | null {
  return null;
}
