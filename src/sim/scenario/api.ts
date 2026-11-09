/**
 * Scenario rules read by other systems (Phase 5 §4.1, §4.5, §4.9). Owner: W3-H. Signatures are a contract.
 * Free play and Build 1 parks get the neutral answer from every function.
 */
import { getSceneryDef, getSceneryTheme, getTrackRideDef, type SceneryThemeId } from '../../data/catalog';
import { getResearchItem } from '../../data/research';
import { getScenarioDef, type Climate, type ScenarioDef } from '../../data/scenarios';
import { SCENARIO_ERR } from '../../data/strings/scenario';
import { LOAN_STEP, SEASON_WEATHER_WEIGHTS, WEATHER_STATES, type WeatherState } from '../../data/tuning/management';
import { CLIMATE_WEIGHT_PER_DEGREE, CLIMATES, DIFFICULTY, STAR_TIME_LEFT } from '../../data/tuning/scenario';
import { monthProfit } from '../finance/ledger';
import type { Season } from '../time';
import type { GameState, World } from '../types';
import type { ScenarioRun } from './types';

/** The definition of a scenario run, or null for other kinds and unknown ids. */
export function scenarioDefOf(state: GameState): ScenarioDef | null {
  const sc = state.scenario;
  return sc.kind === 'scenario' ? (getScenarioDef(sc.id) ?? null) : null;
}

/** Sandbox "Unlimited money": affordability checks pass and cash does not fall (the ledger still records). */
export function unlimitedMoney(state: GameState): boolean {
  const sc = state.scenario;
  return sc.kind === 'sandbox' && sc.options.unlimitedMoney;
}

/** Climate of the park: the scenario's, the sandbox option, else temperate. */
export function climateOf(state: GameState): Climate {
  const sc = state.scenario;
  if (sc.kind === 'sandbox') return sc.options.climate;
  return scenarioDefOf(state)?.climate ?? 'temperate';
}

const SEASON_INDEX: Readonly<Record<Season, number>> = { winter: 0, spring: 1, summer: 2, autumn: 3 };
const SEASONS: readonly Season[] = ['winter', 'spring', 'summer', 'autumn'];

/**
 * Phase 3 season weights after a climate (Phase 5 §4.9): the season's °C offset moves
 * `CLIMATE_WEIGHT_PER_DEGREE` points per °C between `cold` and `hot`; then the rain weight multiplies `rain` and
 * `storm`, the sun weight `sunny` and `hot`, rounded to integers. Temperate gives the Phase 3 table itself.
 */
function computeClimateWeights(climate: Climate, season: Season): Readonly<Record<WeatherState, number>> {
  const base = SEASON_WEATHER_WEIGHTS[season];
  if (climate === 'temperate') return base;
  const c = CLIMATES[climate];
  const shift = (c.tempOffset[SEASON_INDEX[season]] as number) * CLIMATE_WEIGHT_PER_DEGREE;
  let hot = base.hot;
  let cold = base.cold;
  if (shift > 0) {
    hot += shift;
    cold = Math.max(0, cold - shift);
  } else if (shift < 0) {
    cold -= shift;
    hot = Math.max(0, hot + shift);
  }
  return Object.freeze({
    sunny: Math.round(base.sunny * c.sunWeight),
    cloudy: base.cloudy,
    rain: Math.round(base.rain * c.rainWeight),
    storm: Math.round(base.storm * c.rainWeight),
    hot: Math.round(hot * c.sunWeight),
    cold,
  });
}

const CLIMATE_TABLE: Readonly<Record<Climate, Readonly<Record<Season, Readonly<Record<WeatherState, number>>>>>> = (() => {
  const out = {} as Record<Climate, Record<Season, Readonly<Record<WeatherState, number>>>>;
  for (const climate of Object.keys(CLIMATES) as Climate[]) {
    out[climate] = {} as Record<Season, Readonly<Record<WeatherState, number>>>;
    for (const season of SEASONS) out[climate][season] = computeClimateWeights(climate, season);
  }
  return out;
})();

/** Draw weights of a climate and season (Phase 5 §4.9 table applied to the Phase 3 weights). */
export function climateWeights(climate: Climate, season: Season): Readonly<Record<WeatherState, number>> {
  return CLIMATE_TABLE[climate][season];
}

/** "Always sunny": only sunny can be drawn. */
export const ALWAYS_SUNNY_WEIGHTS: Readonly<Record<WeatherState, number>> = Object.freeze(
  Object.fromEntries(WEATHER_STATES.map((k) => [k, k === 'sunny' ? 1 : 0])) as Record<WeatherState, number>,
);

/**
 * Weather draw weights for `season` after the climate rain and sun weights (Phase 5 §4.9) and the sandbox
 * "always sunny" option. Integer weights, like the Phase 3 table.
 */
export function weatherWeights(world: World, season: Season): Readonly<Record<WeatherState, number>> {
  const sc = world.state.scenario;
  if (sc.kind === 'sandbox' && sc.options.weather === 'alwaysSunny') return ALWAYS_SUNNY_WEIGHTS;
  return climateWeights(climateOf(world.state), season);
}

/** Arrival multiplier from the scenario kind (sandbox "Guests arrive: off" → 0). */
export function scenarioArrivalFactor(world: World): number {
  const sc = world.state.scenario;
  return sc.kind === 'sandbox' && !sc.options.guestsArrive ? 0 : 1;
}

/** The item id and, for a scenery item, its theme id (research lists may name either). */
function idsOf(itemId: string): string[] {
  const theme = getSceneryDef(itemId)?.theme;
  return theme ? [itemId, theme] : [itemId];
}

/** Content that research unlocks (a research item, or a scenery theme or item that does not start open). */
function isResearchContent(itemId: string): boolean {
  if (getResearchItem(itemId)) return true;
  const theme = getSceneryTheme(getSceneryDef(itemId)?.theme ?? (itemId as SceneryThemeId));
  return theme !== undefined && theme.unlock !== 'start';
}

/**
 * Content availability from the scenario `research` rules (Phase 5 §4.1) and sandbox "All items unlocked":
 * `unlocked` = available now, `hidden` = never appears, `normal` = the research rules decide.
 * `allowed` only limits research content; start content always appears.
 */
export function scenarioContentRule(world: World, itemId: string): 'normal' | 'unlocked' | 'hidden' {
  const sc = world.state.scenario;
  if (sc.kind === 'sandbox') return sc.options.allUnlocked ? 'unlocked' : 'normal';
  const def = scenarioDefOf(world.state);
  if (!def) return 'normal';
  const ids = idsOf(itemId);
  const { unlocked, allowed } = def.research;
  if (unlocked === 'all' || ids.some((id) => unlocked.includes(id))) return 'unlocked';
  if (allowed !== 'all' && isResearchContent(itemId) && !ids.some((id) => allowed.includes(id))) return 'hidden';
  return 'normal';
}

/**
 * Null when the player may switch After Dark, else the reason (scenario `afterDark: 'forced'` or `'off'`).
 * `setAfterDark` (W3-F) and the park panel ask it.
 */
export function afterDarkLocked(state: GameState): string | null {
  const def = scenarioDefOf(state);
  if (!def || def.afterDark === 'on') return null;
  return def.afterDark === 'forced' ? SCENARIO_ERR.afterDarkForced : SCENARIO_ERR.afterDarkOff;
}

/**
 * The fixed loan limit of a scenario run: the definition's max loan × the preset factor, in whole loan steps, never
 * below the start loan. Null for other kinds (the Phase 3 formula applies). `finance/loans.ts maxLoan` should use it.
 */
export function scenarioMaxLoan(state: GameState): number | null {
  const sc = state.scenario;
  const def = scenarioDefOf(state);
  if (sc.kind !== 'scenario' || !def) return null;
  const scaled = Math.floor((def.start.maxLoan * DIFFICULTY[sc.difficulty].maxLoan) / LOAN_STEP) * LOAN_STEP;
  return Math.max(def.start.loan, scaled);
}

/**
 * Stars for a win at the end of month `endMonthIndex` (Phase 5 §4.4): 3 with ≥ 50% of the time limit left, 2 with
 * ≥ 25%, else 1; a late win (Relaxed) gives 1; no time limit gives 3.
 */
export function winStars(endMonthIndex: number, deadlineMonthIndex: number | null): number {
  if (deadlineMonthIndex === null) return 3;
  if (endMonthIndex > deadlineMonthIndex) return 1;
  const limit = deadlineMonthIndex + 1;
  const left = deadlineMonthIndex - endMonthIndex;
  if (left >= STAR_TIME_LEFT[1] * limit) return 3;
  if (left >= STAR_TIME_LEFT[0] * limit) return 2;
  return 1;
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

/** Best tested excitement (hundredths) of the park's gravity coasters, or null without one. */
export function bestCoasterExcitement(world: World): number | null {
  const s = world.state;
  let best: number | null = null;
  for (const r of s.rides) {
    if (r.kind !== 'track') continue;
    const data = s.track.rides[String(r.id)];
    if (!data?.test?.passed || getTrackRideDef(data.typeId)?.drive !== 'gravity') continue;
    if (best === null || data.test.excitement > best) best = data.test.excitement;
  }
  return best;
}

/** The result of a finished scenario run, or null while it is active or for other kinds. */
export function scenarioResult(world: World): ScenarioResult | null {
  const s = world.state;
  const sc = s.scenario;
  if (sc.kind !== 'scenario' || sc.status === 'active' || sc.endMonthIndex === null) return null;
  let totalProfit = 0;
  for (const m of s.economy.ledger) totalProfit += monthProfit(m);
  return {
    status: sc.status,
    endReason: sc.endReason,
    endMonthIndex: sc.endMonthIndex,
    guests: s.guests.length,
    rating: s.park.rating,
    parkValue: s.management.parkValue,
    totalProfit,
    bestCoasterExcitement: bestCoasterExcitement(world),
    stars: sc.status === 'won' ? winStars(sc.endMonthIndex, sc.deadlineMonthIndex) : 0,
  };
}

/** The scenario run of `state`, or null for other kinds. */
export function scenarioRunOf(state: GameState): ScenarioRun | null {
  return state.scenario.kind === 'scenario' ? state.scenario : null;
}
