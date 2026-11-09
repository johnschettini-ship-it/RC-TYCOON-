/**
 * Scenario, sandbox, and month-metric state (Phase 5 §5). Owner: W3-H. Saved as `GameState.scenario` and
 * `GameState.monthMetrics`. Awards (`awards/types.ts`) and the tutorial run (`tutorial/types.ts`) belong to W3-I.
 *
 * Deviation from the spec text: `endReason?` and `endMonthIndex?` are stored as `… | null` (always present), like
 * every other optional value in saves, so a save never has a field that may or may not be there.
 */
import type { Climate, Difficulty, TerrainStyle } from '../../data/scenarios/types';
import { emptyAwards, type AwardId, type AwardState } from '../awards/types';
import type { TutorialRun } from '../tutorial/types';
import type { EntityId } from '../units';

export type { AwardId, AwardState, Climate, Difficulty, TerrainStyle, TutorialRun };

export interface SandboxOptions {
  mapSize: number;
  terrainStyle: TerrainStyle;
  seed: number;
  climate: Climate;
  afterDark: boolean;
  unlimitedMoney: boolean;
  allUnlocked: boolean;
  guestsArrive: boolean;
  breakdowns: boolean;
  weather: 'normal' | 'alwaysSunny';
  awards: boolean;
}

/** Sandbox options a player may change in game (`setSandboxOption`, Phase 5 §4.5 table). */
export type SandboxLiveOption = 'afterDark' | 'unlimitedMoney' | 'guestsArrive' | 'breakdowns' | 'weather' | 'awards';

/** Per-objective progress for the objectives panel (Phase 5 §4.3), in the definition's objective order. */
export interface ObjectiveProgress {
  /** Met at the last evaluated month end. */
  met: boolean;
  /** Current value shown against the target (unit of the goal type). */
  value: number;
  /** Consecutive days (parkRatingHeld) or consecutive months (the "× months" goals) that met the goal. */
  streak: number;
}

export type ScenarioStatus = 'active' | 'won' | 'lost';
export type ScenarioEndReason = 'timeUp' | 'bankrupt' | 'ratingCollapse';

export interface ScenarioRun {
  kind: 'scenario';
  id: string;
  defVersion: number;
  difficulty: Difficulty;
  status: ScenarioStatus;
  endReason: ScenarioEndReason | null;
  endMonthIndex: number | null;
  continued: boolean;
  progressRecorded: boolean;
  deadlineMonthIndex: number | null;
  objectives: ObjectiveProgress[];
  loseCounters: { bankruptMonths: number; lowRatingDays: number };
  awards: AwardState;
}

export type ScenarioState =
  | { kind: 'freePlay'; awards: AwardState }
  | { kind: 'sandbox'; options: SandboxOptions; awards: AwardState }
  | TutorialRun
  | ScenarioRun;

export type ScenarioKind = ScenarioState['kind'];

/** One park sample (Phase 5 §4.3): a day sample at 12:00 or a night sample at 22:00. Happiness 0–255. */
export interface ParkSample {
  tick: number;
  guests: number;
  /** Park rating at the sample (the day sample's rating is the "daily rating"). */
  rating: number;
  meanHappiness: number;
  /** Guests per master R6 group. */
  chill: number;
  family: number;
  thrill: number;
  /** Mean happiness per group, 0 when the group is empty. */
  chillHappiness: number;
  familyHappiness: number;
  thrillHappiness: number;
}

/** Counters of the current month (Phase 5 §5). Reset after the month-end steps (master R13). */
export interface MonthMetrics {
  monthIndex: number;
  daySamples: ParkSample[];
  nightSamples: ParkSample[];
  /** Distinct guests (sorted ids) who had each tracked thought this month, keyed by thought id. */
  thoughtGuests: Record<string, EntityId[]>;
  /** Distinct guests (sorted ids) who were in the park this month. */
  guestsSeen: EntityId[];
  /** Queue waits of guests who boarded this month (ticks). */
  queueWaitTicks: number;
  queueWaits: number;
  /** Rides (sorted ids) that broke down at least once this month. */
  brokenRides: EntityId[];
}

export function freePlayScenario(): ScenarioState {
  return { kind: 'freePlay', awards: emptyAwards() };
}

export function emptyMonthMetrics(monthIndex: number): MonthMetrics {
  return { monthIndex, daySamples: [], nightSamples: [], thoughtGuests: {}, guestsSeen: [], queueWaitTicks: 0, queueWaits: 0, brokenRides: [] };
}

/** The awards record of any scenario kind, or null for the tutorial (no awards). */
export function awardsOf(s: ScenarioState): AwardState | null {
  return s.kind === 'tutorial' ? null : s.awards;
}
