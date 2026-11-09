/**
 * FROZEN: the schema 2 (Build 2, commit 4ab1b43) structure check, used only by the 2 → 3 migration (step 1).
 * Never edit this file: Build 2 saves exist in the wild and must keep loading.
 * Shapes are untyped on purpose (`objLoose`), so changes to the live state types never change this check.
 * Copied from the live schema 2 checks (`schema.ts` and `slices/*.ts` at 4ab1b43).
 */
import {
  arr,
  bool,
  byte,
  check,
  checkStateWith,
  exactRecord,
  fail,
  int,
  isRecord,
  layer,
  literal,
  makeMapCheck,
  nullable,
  num,
  objLoose,
  oneOf,
  optional,
  record,
  str,
  tile,
  tileOrNone,
  typed,
  when,
  type Check,
} from '../validate';

const LEDGER_CATEGORIES_V2 = [
  'construction',
  'demolitionRefunds',
  'rideRunning',
  'stallRunning',
  'stock',
  'entranceTickets',
  'rideTickets',
  'stallSales',
  'wages',
  'staffHiring',
  'research',
  'marketing',
  'loanInterest',
  'loan',
  'repairs',
  'landPurchase',
  'shows',
] as const;

// ---- Enumerations (Build 2 members, frozen) ----

const DIRS = [0, 1, 2, 3] as const;
const RIDE_STATUSES = ['building', 'testing', 'closed', 'open', 'broken', 'inspecting', 'stormHold'] as const;
const CYCLE_PHASES = ['waiting', 'loading', 'running', 'unloading'] as const;
const GUEST_STATES = ['arriving', 'walking', 'queueing', 'riding', 'buying', 'sitting', 'leaving'] as const;
const TRAIN_STATES = ['loading', 'running', 'held', 'unloading', 'waiting'] as const;
const TRACK_DIRS = [0, 1, 2, 3] as const;
const TEST_FAIL_KINDS = ['stop', 'loop'] as const;
const STAFF_TYPES = ['groundskeeper', 'mechanic', 'security', 'performer'] as const;
const STAFF_STATES = ['walking', 'sweeping', 'cleaning', 'emptying', 'inspecting', 'fixing', 'performing', 'watering'] as const;
const STAFF_TASKS = ['none', 'wander', 'toPatrol', 'sweep', 'mess', 'bin', 'water', 'fix', 'inspect', 'roam', 'perform'] as const;
const COSTUMES = ['frost', 'spark', 'boo'] as const;
const RESEARCH_LEVELS = ['none', 'low', 'medium', 'high'] as const;
const RESEARCH_CATEGORIES = ['gentle', 'thrill', 'coasters', 'shops', 'water', 'scenery'] as const;
const MESSAGE_CATEGORIES = ['breakdown', 'research', 'weather', 'finance', 'staff', 'marketing', 'park'] as const;
const WEATHER_KEYS = ['sunny', 'cloudy', 'rain', 'storm', 'hot', 'cold'] as const;
const RAMP_DIRS = [-1, 0, 1, 2, 3] as const;
const EDGES = [-1, 0, 1, 2, 3] as const;
const AWARD_IDS = [
  'spotlessPark',
  'bestValue',
  'thrillSeekersChoice',
  'chillHaven',
  'perfectBalance',
  'nightOwlsFavourite',
  'litterbugPark',
  'ripOffPark',
  'queueNightmare',
  'breakdownCentral',
  'lostAndConfused',
  'darkAndDreary',
] as const;
const CLIMATES = ['temperate', 'cold', 'hot', 'coastal'] as const;
const DIFFICULTIES = ['relaxed', 'standard', 'tough'] as const;
const TERRAIN_STYLES = ['flat', 'rollingHills', 'mountains', 'islands', 'riverValley'] as const;
const SCENARIO_STATUSES = ['active', 'won', 'lost'] as const;
const END_REASONS = ['timeUp', 'bankrupt', 'ratingCollapse'] as const;

const dir = oneOf(DIRS);
const rideStatus = oneOf(RIDE_STATUSES);
const weather = oneOf(WEATHER_KEYS);

const DEST_RE = /^(?:(?:ride|stall):(?:0|[1-9]\d*)|exit)$/;
const destKey: Check = when((v) => typeof v === 'string' && DEST_RE.test(v));

const params = optional(record<string | number>(when((v) => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))));

// ---- Map ----

/** Build 2 content codes: Empty 0, Footpath 1, Queue 2, Building 3, Track 4, ParkEntrance 5, Scenery 6. */
const CONTENT_CODES_V2: ReadonlySet<number> = new Set([0, 1, 2, 3, 4, 5, 6]);

const mapShape = objLoose({
  width: int,
  height: int,
  terrain: layer('Uint8Array'),
  heights: layer('Uint8Array'),
  slope: layer('Uint8Array'),
  water: layer('Uint8Array'),
  content: layer('Uint8Array'),
  contentRef: layer('Int32Array'),
  owned: layer('Uint8Array'),
  pathItem: layer('Uint8Array'),
  pathItemFlags: layer('Uint8Array'),
  binFill: layer('Uint8Array'),
  litter: layer('Uint8Array'),
  mess: layer('Uint8Array'),
  pathItemLevel: layer('Int32Array'),
  entranceTile: tile,
});

const mapCheckV2 = makeMapCheck(mapShape, CONTENT_CODES_V2);

// ---- Slices ----

const parkShape = objLoose({
  name: str,
  cash: int,
  entranceFee: int,
  open: bool,
  rating: num,
  turnedAway: int,
  recentLeavers: arr(num),
  arrivalCarry: num,
  guestsArrivedTotal: int,
  afterDark: bool,
  landPrice: int,
  rightsPrice: int,
});

const modifiersShape = objLoose({
  arrivals: num,
  priceTolerance: num,
  happinessDecay: num,
  researchSpeed: num,
  breakdownChance: num,
  loanInterest: num,
  ratingBonus: num,
});

const gate = objLoose({ gate: tile, outside: tileOrNone });

const rideShape = objLoose({
  id: int,
  kind: oneOf(['flat', 'track'] as const),
  defId: str,
  name: str,
  x: int,
  y: int,
  rotation: dir,
  status: rideStatus,
  price: int,
  entrance: nullable(gate),
  exit: nullable(gate),
  stats: nullable(objLoose({ excitement: num, intensity: num, nausea: num })),
  queue: arr(int),
  riders: arr(int),
  cycle: objLoose({ phase: oneOf(CYCLE_PHASES), ticks: int }),
  totals: objLoose({ riders: int, income: int, ridersThisMonth: int, incomeThisMonth: int }),
  builtTick: int,
  hoursThisMonth: int,
  reliability: num,
  lastInspectionTick: int,
  inspectionIntervalTicks: int,
  breakdownType: nullable(str),
  statusBeforeBreakdown: nullable(rideStatus),
  breakdownsThisMonth: int,
  lastBreakdownTick: int,
  assignedMechanicId: nullable(int),
  totalBuildCost: int,
});

const stallShape = objLoose({
  id: int,
  defId: str,
  name: str,
  x: int,
  y: int,
  rotation: dir,
  serviceTile: tileOrNone,
  price: int,
  open: bool,
  servingGuest: int,
  totals: objLoose({ sales: int, income: int, salesThisMonth: int, incomeThisMonth: int }),
  builtTick: int,
  hoursThisMonth: int,
  totalBuildCost: int,
});

const guestShape = objLoose({
  id: int,
  tile: tileOrNone,
  z: byte,
  nextTile: tileOrNone,
  progress: num,
  dir,
  lane: int,
  state: oneOf(GUEST_STATES),
  stateTicks: int,
  target: nullable(destKey),
  cash: int,
  needs: objLoose({ hunger: num, thirst: num, bladder: num, energy: num, happiness: num, nausea: num }),
  temperament: num,
  thoughts: arr(objLoose({ id: str, tick: int, params })),
  thoughtCooldowns: record(int),
  ridden: record(int),
  spent: int,
  items: objLoose({ map: bool, umbrella: bool, balloon: bool }),
  nextDecisionTick: int,
  lostSinceTick: int,
  noRideStreak: int,
  seat: nullable(objLoose({ rideId: int, trainId: int, car: int, seat: int })),
  activityId: int,
  trashTimer: int,
  withdrawals: int,
  lostSteps: int,
  bestDistance: int,
  lostTarget: nullable(destKey),
  wetUntilTick: int,
});

const economyShape = objLoose({
  ledger: arr(objLoose({ monthIndex: int, lines: exactRecord(LEDGER_CATEGORIES_V2, int) })),
});

// Track rides (Phase 2 §5; Phase 4 §4.4). Positions and speeds are integer mm and mm/s; G values and ratings
// integer hundredths.
const trackPieceShape = objLoose({
  defId: str,
  x: int,
  y: int,
  z: int,
  dir: oneOf(TRACK_DIRS),
  chain: bool,
  brakeSpeed: nullable(int),
  cost: int,
});

const trainShape = objLoose({
  id: int,
  s: int,
  v: int,
  state: oneOf(TRAIN_STATES),
  dwellTicks: int,
  lap: int,
  seats: arr(int),
  dist: int,
  parked: bool,
  release: bool,
  driveMms: int,
  lapStartTick: int,
});

const testResultShape = objLoose({
  passed: bool,
  failPiece: nullable(int),
  failKind: nullable(oneOf(TEST_FAIL_KINDS)),
  ticks: int,
  vMaxMms: int,
  vAvgMms: int,
  rideTimeTicks: int,
  lengthMm: int,
  drops: int,
  dropMaxMm: int,
  posGMax: int,
  vertGMin: int,
  airtimeTicks: int,
  latMax: int,
  inversions: int,
  highestM: int,
  turnPieces: int,
  smallTurns: int,
  spookyTunnels: int,
  laps: int,
  excitement: int,
  intensity: int,
  nausea: int,
  penalty: bool,
  chart: objLoose({ every: int, speedCms: arr(int), gv: arr(int), gl: arr(int) }),
});

const trackRideShape = objLoose({
  rideId: int,
  typeId: str,
  pieces: arr(trackPieceShape),
  circuitClosed: bool,
  trainConfig: objLoose({ trains: int, carsPerTrain: int }),
  operation: objLoose({ minDwellTicks: int, maxDwellTicks: int, laps: int }),
  trains: arr(trainShape),
  test: nullable(testResultShape),
  colours: objLoose({ track: int, supports: int, cars: int }),
  openedOnce: bool,
  testRun: nullable(objLoose({ ticksLeft: int, result: testResultShape })),
  lastDispatchTick: int,
  bestLapTicks: nullable(int),
});

const trackShape = objLoose({ rides: record(trackRideShape) });

const staffShape = objLoose({
  members: arr(
    objLoose({
      id: int,
      type: oneOf(STAFF_TYPES),
      name: str,
      tile: tileOrNone,
      z: byte,
      nextTile: tileOrNone,
      progress: num,
      dir,
      state: oneOf(STAFF_STATES),
      stateTicks: int,
      targetTile: tileOrNone,
      targetRideId: int,
      patrol: nullable(typed('Uint8Array')),
      costume: nullable(oneOf(COSTUMES)),
      hiredTick: int,
      hoursThisMonth: int,
      task: oneOf(STAFF_TASKS),
      route: arr(int),
      prevTile: tileOrNone,
      nextRecheckTick: int,
      fixRideId: int,
      savedRideStatus: nullable(rideStatus),
      walkTicksLeft: int,
    }),
  ),
  pendingBreakdowns: arr(int),
  autoRepair: bool,
  benchSitters: arr(objLoose({ guestId: int, tile: tileOrNone, untilTick: int })),
  recentFixes: arr(objLoose({ rideId: int, tick: int })),
  repairNoticeDay: int,
});

const managementShape = objLoose({
  research: objLoose({
    level: oneOf(RESEARCH_LEVELS),
    focus: exactRecord(RESEARCH_CATEGORIES, bool),
    current: nullable(str),
    progress: num,
    unlocked: arr(str),
    hoursThisMonth: int,
    completeNotified: bool,
  }),
  campaigns: arr(objLoose({ type: str, targetId: int, endTick: int })),
  loan: objLoose({ balance: int }),
  weather: objLoose({ current: weather, next: weather, nextChangeTick: int }),
  parkValue: int,
  messages: arr(
    objLoose({
      id: int,
      tick: int,
      category: oneOf(MESSAGE_CATEGORIES),
      textId: str,
      params,
      tile: tileOrNone,
      entityId: int,
    }),
  ),
  nextMessageId: int,
  messagesReadUpTo: int,
});

// Build 2 slices (Phase 4 §5, Phase 5 §5).
const elevatedPathsShape = arr(
  objLoose({
    id: int,
    x: int,
    y: int,
    z: byte,
    kind: oneOf(['footpath', 'queue'] as const),
    rampDir: oneOf(RAMP_DIRS),
  }),
);

const sceneryListShape = arr(
  objLoose({
    id: int,
    defId: str,
    x: int,
    y: int,
    z: byte,
    rotation: dir,
    edge: oneOf(EDGES),
    waterLevel: byte,
  }),
);

const awardId = oneOf(AWARD_IDS);
const awardStateShape = objLoose({
  active: arr(awardId),
  history: arr(objLoose({ monthIndex: int, id: awardId })),
});

const tutorialRunShape = objLoose({
  kind: literal('tutorial'),
  stepIndex: int,
  skipped: bool,
  done: bool,
});

const sandboxOptionsShape = objLoose({
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

const scenarioRunShape = objLoose({
  kind: literal('scenario'),
  id: str,
  defVersion: int,
  difficulty: oneOf(DIFFICULTIES),
  status: oneOf(SCENARIO_STATUSES),
  endReason: nullable(oneOf(END_REASONS)),
  endMonthIndex: nullable(int),
  continued: bool,
  progressRecorded: bool,
  deadlineMonthIndex: nullable(int),
  objectives: arr(objLoose({ met: bool, value: num, streak: int })),
  loseCounters: objLoose({ bankruptMonths: int, lowRatingDays: int }),
  awards: awardStateShape,
});

const scenarioByKind: Record<string, Check> = {
  freePlay: objLoose({ kind: literal('freePlay'), awards: awardStateShape }),
  sandbox: objLoose({ kind: literal('sandbox'), options: sandboxOptionsShape, awards: awardStateShape }),
  tutorial: tutorialRunShape,
  scenario: scenarioRunShape,
};

const scenarioShape: Check = check((v, ctx) => {
  if (!isRecord(v)) return fail('bad');
  const kind = v.kind;
  if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(scenarioByKind, kind)) return fail(kind === undefined ? 'missing' : 'bad', 'kind');
  return (scenarioByKind[kind] as Check)(v, ctx);
});

const sampleShape = objLoose({
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

const monthMetricsShape = objLoose({
  monthIndex: int,
  daySamples: arr(sampleShape),
  nightSamples: arr(sampleShape),
  thoughtGuests: record(arr(int)),
  guestsSeen: arr(int),
  queueWaitTicks: int,
  queueWaits: int,
  brokenRides: arr(int),
});

const gameStateShapeV2 = objLoose({
  schemaVersion: literal(2),
  seed: int,
  rng: int,
  tick: int,
  nextId: int,
  map: mapCheckV2,
  park: parkShape,
  modifiers: modifiersShape,
  rides: arr(rideShape),
  stalls: arr(stallShape),
  guests: arr(guestShape),
  economy: economyShape,
  track: trackShape,
  staff: staffShape,
  management: managementShape,
  elevatedPaths: elevatedPathsShape,
  scenery: sceneryListShape,
  scenario: scenarioShape,
  monthMetrics: monthMetricsShape,
});

/**
 * Step 1 of the 2 → 3 migration (Phase 6 §5): null when `raw` has the full schema 2 (Build 2) structure, else a
 * short reason. Reference integrity is checked on the migrated state by the live checks.
 */
export function checkStructureV2(raw: unknown): string | null {
  return checkStateWith(raw, mapCheckV2, gameStateShapeV2);
}
