/**
 * Save validators for `GameState.scenario` and `GameState.monthMetrics` (Phase 5 §5). Owner: W3-H.
 * The awards and tutorial shapes come from `awards.ts` (W3-I).
 */
import type { Climate, Difficulty, TerrainStyle } from '../../data/scenarios/types';
import type {
  MonthMetrics,
  ObjectiveProgress,
  ParkSample,
  SandboxOptions,
  ScenarioEndReason,
  ScenarioRun,
  ScenarioState,
  ScenarioStatus,
} from '../../sim/scenario/types';
import { arr, bool, check, every, fail, int, isRecord, literal, nullable, num, obj, oneOf, record, str, type V } from '../validate';
import { awardStateShape, tutorialRunShape } from './awards';

const CLIMATES = every<Climate>()(['temperate', 'cold', 'hot', 'coastal']);
const DIFFICULTIES = every<Difficulty>()(['relaxed', 'standard', 'tough']);
const TERRAIN_STYLES = every<TerrainStyle>()(['flat', 'rollingHills', 'mountains', 'islands', 'riverValley']);
const STATUSES = every<ScenarioStatus>()(['active', 'won', 'lost']);
const END_REASONS = every<ScenarioEndReason>()(['timeUp', 'bankrupt', 'ratingCollapse']);

const sandboxOptionsShape = obj<SandboxOptions>({
  mapSize: int,
  terrainStyle: oneOf(TERRAIN_STYLES),
  seed: int,
  climate: oneOf(CLIMATES),
  afterDark: bool,
  unlimitedMoney: bool,
  allUnlocked: bool,
  guestsArrive: bool,
  breakdowns: bool,
  weather: oneOf(['normal', 'alwaysSunny'] as const),
  awards: bool,
});

const scenarioRunShape = obj<ScenarioRun>({
  kind: literal('scenario'),
  id: str,
  defVersion: int,
  difficulty: oneOf(DIFFICULTIES),
  status: oneOf(STATUSES),
  endReason: nullable(oneOf(END_REASONS)),
  endMonthIndex: nullable(int),
  continued: bool,
  progressRecorded: bool,
  deadlineMonthIndex: nullable(int),
  objectives: arr(obj<ObjectiveProgress>({ met: bool, value: num, streak: int })),
  loseCounters: obj<ScenarioRun['loseCounters']>({ bankruptMonths: int, lowRatingDays: int }),
  awards: awardStateShape,
});

type FreePlay = Extract<ScenarioState, { kind: 'freePlay' }>;
type Sandbox = Extract<ScenarioState, { kind: 'sandbox' }>;

const byKind: { [K in ScenarioState['kind']]: V<Extract<ScenarioState, { kind: K }>> } = {
  freePlay: obj<FreePlay>({ kind: literal('freePlay'), awards: awardStateShape }),
  sandbox: obj<Sandbox>({ kind: literal('sandbox'), options: sandboxOptionsShape, awards: awardStateShape }),
  tutorial: tutorialRunShape,
  scenario: scenarioRunShape,
};

/** One of the 4 kinds, chosen by `kind`; a missing or unknown kind is "bad value at scenario.kind". */
export const scenarioShape: V<ScenarioState> = check((v, ctx) => {
  if (!isRecord(v)) return fail('bad');
  const kind = v.kind;
  if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(byKind, kind)) return fail(kind === undefined ? 'missing' : 'bad', 'kind');
  return byKind[kind as ScenarioState['kind']](v, ctx);
});

const sampleShape = obj<ParkSample>({
  tick: int,
  guests: int,
  rating: num,
  meanHappiness: num,
  chill: int,
  family: int,
  thrill: int,
  chillHappiness: num,
  familyHappiness: num,
  thrillHappiness: num,
});

export const monthMetricsShape: V<MonthMetrics> = obj<MonthMetrics>({
  monthIndex: int,
  daySamples: arr(sampleShape),
  nightSamples: arr(sampleShape),
  thoughtGuests: record(arr(int)),
  guestsSeen: arr(int),
  queueWaitTicks: int,
  queueWaits: int,
  brokenRides: arr(int),
});
